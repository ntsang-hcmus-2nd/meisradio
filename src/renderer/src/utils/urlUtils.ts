let globalStreamPort = (typeof window !== 'undefined' && (window as any).api?.getStreamPortSync?.()) || 0
const portListeners = new Set<(port: number) => void>()

export function setGlobalStreamPort(port: number): void {
  globalStreamPort = port
  portListeners.forEach(fn => {
    try { fn(port) } catch (_) {}
  })
}

export function getGlobalStreamPort(): number {
  if (globalStreamPort <= 0 && typeof window !== 'undefined' && (window as any).api?.getStreamPortSync) {
    try {
      globalStreamPort = (window as any).api.getStreamPortSync() || 0
    } catch (_) {}
  }
  return globalStreamPort
}

export function onStreamPortChange(listener: (port: number) => void): () => void {
  portListeners.add(listener)
  return () => {
    portListeners.delete(listener)
  }
}

/**
 * Trích xuất đường dẫn file vật lý từ bất kỳ dạng nguồn nào:
 * - URL stream nội bộ (http://127.0.0.1:.../local-audio?path=... hoặc local-file?path=... hoặc cover?path=...)
 * - Giao thức file:// hoặc file:///
 * - Đường dẫn Windows/POSIX nguyên bản
 */
export function extractRawFilePath(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return ''
  let clean = input.trim()

  // Xóa các tham số query (?t=123...) nếu là file:// hoặc đường dẫn local
  const queryIndex = clean.indexOf('?')
  if (queryIndex !== -1 && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = clean.slice(0, queryIndex)
  }

  // Nếu là URL local stream của Mei's Radio từ phiên chạy trước hoặc hiện tại
  if (clean.includes('/local-audio?path=') || clean.includes('/local-file?path=') || clean.includes('/cover?path=')) {
    try {
      const u = new URL(clean)
      const p = u.searchParams.get('path')
      if (p) clean = p
    } catch (_) {}
  }

  // Nếu bắt đầu bằng file://
  if (clean.startsWith('file://')) {
    clean = clean.replace(/^file:\/\/\/?/, '')
    try {
      clean = decodeURIComponent(clean)
    } catch (_) {}
  }

  // Xử lý tiền tố ổ đĩa trên Windows (/C:/ -> C:/)
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')) {
    if (/^\/[a-zA-Z]:/.test(clean)) {
      clean = clean.slice(1)
    }
  }

  return clean
}

/**
 * Định dạng URL an toàn cho audio source (cho thẻ <audio src="..."> và new Audio())
 * - Hỗ trợ bảo vệ ký tự đặc biệt (#, ?, %, khoảng trắng, unicode)
 * - Tương thích 100% với webSecurity: true
 * - Hỗ trợ CORS và HTTP 206 Range requests (tua nhạc tức thì)
 */
export function formatAudioSource(filePath: string | undefined | null, streamPort?: number): string {
  if (!filePath || typeof filePath !== 'string') return ''
  const trimmed = filePath.trim()

  // Giữ nguyên các URL streaming trực tuyến (YouTube, SoundCloud, Icecast stream...)
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && 
      !trimmed.includes('/local-audio?path=') &&
      !trimmed.includes('127.0.0.1') &&
      !trimmed.includes('localhost')) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)
  let port = (streamPort && streamPort > 0) ? streamPort : getGlobalStreamPort()

  if (port > 0 && rawPath) {
    return `http://127.0.0.1:${port}/local-audio?path=${encodeURIComponent(rawPath)}`
  }

  return ''
}

/**
 * Định dạng URL an toàn cho hình ảnh tĩnh (Background image, Custom covers)
 * - Khắc phục chặn Same-Origin khi bật webSecurity: true
 * - Không bị cắt đứt khi tên file có dấu #, ?, %
 */
export function formatImageSource(filePath: string | undefined | null, streamPort?: number): string {
  if (!filePath || typeof filePath !== 'string') return ''
  const trimmed = filePath.trim()

  // 1. Giữ nguyên data URL, blob URL
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  let port = (streamPort && streamPort > 0) ? streamPort : getGlobalStreamPort()

  // 2. Nếu đã là URL stream /cover nội bộ, bảo toàn endpoint /cover và các tham số query (size=...)
  if (trimmed.includes('/cover?')) {
    if (port > 0) {
      return trimmed.replace(/http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${port}`)
    }
    return trimmed
  }

  // 3. Nếu đã là URL stream /local-file nội bộ, bảo toàn endpoint /local-file
  if (trimmed.includes('/local-file?')) {
    if (port > 0) {
      return trimmed.replace(/http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${port}`)
    }
    return trimmed
  }

  // 4. Giữ nguyên các URL trực tuyến thật (YouTube, SoundCloud, v.v., KHÔNG phải localhost/127.0.0.1)
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && 
      !trimmed.includes('127.0.0.1') && 
      !trimmed.includes('localhost')) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)
  if (!rawPath) return ''

  if (port > 0) {
    // Nếu là file âm thanh (FLAC, MP3, WAV, DSD, M4A...), chuyển qua /cover để trích xuất ảnh bìa chất lượng cao
    const audioExts = ['.flac', '.mp3', '.wav', '.m4a', '.ogg', '.opus', '.dsf', '.dff', '.dsd', '.aac', '.alac', '.aiff', '.wma']
    const dotIdx = rawPath.lastIndexOf('.')
    const ext = dotIdx !== -1 ? rawPath.slice(dotIdx).toLowerCase() : ''
    if (audioExts.includes(ext)) {
      return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(rawPath)}&size=480`
    }

    return `http://127.0.0.1:${port}/local-file?path=${encodeURIComponent(rawPath)}`
  }

  return ''
}
