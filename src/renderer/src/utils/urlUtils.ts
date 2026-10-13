import { getGlobalStreamPort } from '../components/DynamicCoverArt'

/**
 * Trích xuất đường dẫn file vật lý từ bất kỳ dạng nguồn nào:
 * - URL stream nội bộ (http://127.0.0.1:.../local-audio?path=... hoặc local-file?path=...)
 * - Giao thức file:// hoặc file:///
 * - Đường dẫn Windows/POSIX nguyên bản
 */
export function extractRawFilePath(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return ''
  let clean = input.trim()

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
  if (navigator.userAgent.includes('Windows')) {
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
      !trimmed.includes('/local-audio?path=')) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)
  let port = streamPort || getGlobalStreamPort()
  if (port <= 0 && typeof window !== 'undefined' && (window as any).api?.getStreamPortSync) {
    try {
      port = (window as any).api.getStreamPortSync() || 0
    } catch (_) {}
  }

  if (port > 0) {
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

  // Giữ nguyên data URL, blob URL hoặc URL trực tuyến (ngoại trừ local-file stream cũ)
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && 
      !trimmed.includes('/local-file?path=')) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)
  let port = streamPort || getGlobalStreamPort()
  if (port <= 0 && typeof window !== 'undefined' && (window as any).api?.getStreamPortSync) {
    try {
      port = (window as any).api.getStreamPortSync() || 0
    } catch (_) {}
  }

  if (port > 0) {
    return `http://127.0.0.1:${port}/local-file?path=${encodeURIComponent(rawPath)}`
  }

  return ''
}
