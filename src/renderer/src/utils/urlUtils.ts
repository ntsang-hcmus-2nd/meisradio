let globalStreamPort =
  (typeof window !== 'undefined' && (window as any).api?.getStreamPortSync?.()) || 0
const portListeners = new Set<(port: number) => void>()

export function setGlobalStreamPort(port: number): void {
  globalStreamPort = port
  portListeners.forEach((fn) => {
    try {
      fn(port)
    } catch (_) {}
  })
}

export function getGlobalStreamPort(): number {
  if (
    globalStreamPort <= 0 &&
    typeof window !== 'undefined' &&
    (window as any).api?.getStreamPortSync
  ) {
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

export type CoverTier = 'sm' | 'md' | 'lg' | 'xl' | 'original'

export const TIER_SIZES: Record<CoverTier, number> = {
  sm: 96, // List item (40-48px @ 2x DPR)
  md: 200, // Player bar (56px), Mini player (96px), small cards (120-140px)
  lg: 360, // Medium/large grid cards (160-260px @ 2x DPR)
  xl: 600, // Fullscreen vinyl disc (250-400px @ 2x DPR)
  original: 0 // Full original resolution
}

export interface CoverTrackData {
  id?: string | number | null
  filePath?: string | null
  coverArt?: string | null
  coverArtHighRes?: string | null
  isOnline?: boolean
}

// Thumb 128px do scanner sinh ra (.thumbnails/<md5>.jpg, .image_cache/<md5>.jpg
// hoặc alb_<md5>.jpg). Cover tùy chọn của user (upl_*, pl_*) KHÔNG khớp pattern
// này nên vẫn được phục vụ trực tiếp.
const GENERATED_THUMB_RE =
  /[\\/]\.(thumbnails|image_cache)[\\/](?:.*[\\/])?(?:[0-9a-f]{32}|alb_[0-9a-f]{32})\.jpe?g$/i

/**
 * Trợ thủ tạo URL ảnh bìa đã scale linh hoạt từ backend streamServer hoặc high-res CDN
 */
export function resolveCoverUrl({
  track,
  src,
  highResSrc,
  trackPath,
  streamPort,
  tier = 'md',
  size
}: {
  track?: CoverTrackData | null
  src?: string | null
  highResSrc?: string | null
  trackPath?: string | null
  streamPort?: number
  tier?: CoverTier
  size?: number
}): string | null {
  const targetSize = typeof size === 'number' && size >= 0 ? size : (TIER_SIZES[tier] ?? 256)
  const effectivePath = trackPath || track?.filePath
  const effectiveSrc = src !== undefined ? src : track?.coverArt
  const effectiveHighRes = highResSrc !== undefined ? highResSrc : track?.coverArtHighRes
  const port = streamPort && streamPort > 0 ? streamPort : getGlobalStreamPort()

  // 1. Dạng dữ liệu nhúng trực tiếp (Data URL / Blob URL)
  if (effectiveSrc && (effectiveSrc.startsWith('data:') || effectiveSrc.startsWith('blob:'))) {
    return effectiveSrc
  }

  // 2. Nhạc trực tuyến (YouTube Music, SoundCloud, v.v., không phải localhost/127.0.0.1)
  const isExternalOnline =
    track?.isOnline ||
    (effectiveSrc &&
      (effectiveSrc.startsWith('http://') || effectiveSrc.startsWith('https://')) &&
      !effectiveSrc.includes('127.0.0.1') &&
      !effectiveSrc.includes('localhost'))

  if (isExternalOnline) {
    if (targetSize >= 500 && effectiveHighRes) {
      return effectiveHighRes
    }
    return effectiveSrc || effectiveHighRes || null
  }

  // 3. Ảnh / bài hát cục bộ qua stream server nội bộ (/cover)
  const cleanPath = extractRawFilePath(effectivePath)
  const cleanSrc = extractRawFilePath(effectiveSrc)

  // Trích xuất query parameter từ effectiveSrc (ví dụ ?t=123...) để cache bust
  let tParam = ''
  if (effectiveSrc && effectiveSrc.includes('?')) {
    const rawQuery = effectiveSrc.split('?')[1]
    if (rawQuery) {
      tParam = `&${rawQuery}`
    }
  }

  // Thumb 128px do scanner sinh ra: chỉ phục vụ trực tiếp khi xin <=128.
  // Xin lớn hơn mà trả file này thì phóng to mờ vô ích — phải trích xuất lại
  // từ nguồn gốc (folder art / ảnh nhúng) qua cleanPath ở nhánh 3b.
  const isGeneratedThumb = !!cleanSrc && GENERATED_THUMB_RE.test(cleanSrc)
  const srcNeedsReextract = isGeneratedThumb && !(targetSize > 0 && targetSize <= 128)

  // Ưu tiên cao: Nếu cleanSrc là một tệp hình ảnh trực tiếp (ảnh bìa tùy chỉnh của playlist hoặc ảnh trên đĩa)
  const isDirectImage = cleanSrc && /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(cleanSrc)
  if (isDirectImage && port > 0 && !srcNeedsReextract) {
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanSrc)}${sizeQuery}${tParam}`
  }

  // Ưu tiên 3a: Đối với ảnh nhỏ (targetSize <= 256px), nếu đã có sẵn thumbnail (cleanSrc),
  // tải trực tiếp qua cleanSrc để tránh backend phải mở và phân tích file audio gốc 50MB!
  if (targetSize <= 256 && cleanSrc && port > 0 && !srcNeedsReextract) {
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanSrc)}${sizeQuery}${tParam}`
  }

  // Ưu tiên 3b: Sử dụng effectivePath (file audio hoặc folder playlist) cho kích thước lớn hơn (>256px)
  // hoặc khi chưa có thumbnail có sẵn, để đảm bảo trích xuất ảnh gốc chất lượng cao cho Dynamic Scaling
  if (cleanPath && port > 0) {
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanPath)}${sizeQuery}`
  }

  // Ưu tiên 3c: Fallback sử dụng cleanSrc cho kích thước lớn nếu không có cleanPath
  if (cleanSrc && port > 0) {
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanSrc)}${sizeQuery}${tParam}`
  }

  // 4. Fallback an toàn: Không bao giờ trả về file:// hoặc đường dẫn ổ đĩa Windows trực tiếp
  // để tránh kích hoạt lỗi "Not allowed to load local resource" của Chromium
  if (
    effectiveSrc &&
    (effectiveSrc.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(effectiveSrc))
  ) {
    return null
  }

  return effectiveSrc || null
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
  if (
    clean.includes('/local-audio?path=') ||
    clean.includes('/local-file?path=') ||
    clean.includes('/cover?path=')
  ) {
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
export function formatAudioSource(
  filePath: string | undefined | null,
  streamPort?: number
): string {
  if (!filePath || typeof filePath !== 'string') return ''
  const trimmed = filePath.trim()
  const port = streamPort && streamPort > 0 ? streamPort : getGlobalStreamPort()

  // URL đã là endpoint phát của chính stream server nội bộ (/play?...) -> giữ
  // nguyên (chỉ đổi port nếu stale sau restart). Bọc nó vào /local-audio sẽ
  // khiến server trả 403 và thẻ <audio> báo MEDIA_ERR_SRC_NOT_SUPPORTED.
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(trimmed)) {
    if (port > 0) {
      return trimmed
        .replace(/^http:\/\/127\.0\.0\.1:\d+/i, `http://127.0.0.1:${port}`)
        .replace(/^http:\/\/localhost:\d+/i, `http://127.0.0.1:${port}`)
    }
    return trimmed
  }

  // Giữ nguyên các URL streaming trực tuyến (YouTube, SoundCloud, Icecast stream...)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)

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
export function formatImageSource(
  filePath: string | undefined | null,
  streamPort?: number
): string {
  if (!filePath || typeof filePath !== 'string') return ''
  const trimmed = filePath.trim()

  // 1. Giữ nguyên data URL, blob URL
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  const port = streamPort && streamPort > 0 ? streamPort : getGlobalStreamPort()

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
  if (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.includes('127.0.0.1') &&
    !trimmed.includes('localhost')
  ) {
    return trimmed
  }

  const rawPath = extractRawFilePath(trimmed)
  if (!rawPath) return ''

  if (port > 0) {
    // Nếu là file âm thanh (FLAC, MP3, WAV, DSD, M4A...), chuyển qua /cover để trích xuất ảnh bìa chất lượng cao
    const audioExts = [
      '.flac',
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.opus',
      '.dsf',
      '.dff',
      '.dsd',
      '.aac',
      '.alac',
      '.aiff',
      '.wma'
    ]
    const dotIdx = rawPath.lastIndexOf('.')
    const ext = dotIdx !== -1 ? rawPath.slice(dotIdx).toLowerCase() : ''
    if (audioExts.includes(ext)) {
      return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(rawPath)}&size=480`
    }

    return `http://127.0.0.1:${port}/local-file?path=${encodeURIComponent(rawPath)}`
  }

  return ''
}
