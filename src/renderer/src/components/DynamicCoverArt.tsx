import React, { useState, useMemo, useEffect } from 'react'
import { ListMusic } from 'lucide-react'

export type CoverTier = 'sm' | 'md' | 'lg' | 'xl' | 'original'

export const TIER_SIZES: Record<CoverTier, number> = {
  sm: 96,       // List item (40-48px @ 2x DPR)
  md: 200,      // Player bar (56px), Mini player (96px), small cards (120-140px)
  lg: 360,      // Medium/large grid cards (160-260px @ 2x DPR)
  xl: 600,      // Fullscreen vinyl disc (250-400px @ 2x DPR)
  original: 0   // Original full resolution
}

export interface TrackCoverData {
  id?: string | number
  filePath?: string
  coverArt?: string | null
  coverArtHighRes?: string | null
  isOnline?: boolean
  isCloud?: boolean
  title?: string
}

export interface DynamicCoverArtProps {
  track?: TrackCoverData | null
  src?: string | null
  highResSrc?: string | null
  trackPath?: string | null
  streamPort?: number
  tier?: CoverTier
  size?: number
  alt?: string
  className?: string
  imageClassName?: string
  smartAspect?: boolean
  animateSpin?: boolean
  isPlaying?: boolean
  isLite?: boolean
  fallbackImageSrc?: string | null
  fallbackIcon?: React.ReactNode
  fallbackIconSize?: number
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  style?: React.CSSProperties
}

import { 
  getGlobalStreamPort, 
  setGlobalStreamPort, 
  onStreamPortChange, 
  extractRawFilePath 
} from '../utils/urlUtils'

export { getGlobalStreamPort, setGlobalStreamPort }

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
  track?: TrackCoverData | null
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
  const port = (streamPort && streamPort > 0) ? streamPort : getGlobalStreamPort()

  // 1. Dạng dữ liệu nhúng trực tiếp (Data URL / Blob URL)
  if (effectiveSrc && (effectiveSrc.startsWith('data:') || effectiveSrc.startsWith('blob:'))) {
    return effectiveSrc
  }

  // 2. Nhạc trực tuyến (YouTube Music, SoundCloud, v.v., không phải localhost/127.0.0.1)
  const isExternalOnline = track?.isOnline || (
    effectiveSrc && 
    (effectiveSrc.startsWith('http://') || effectiveSrc.startsWith('https://')) &&
    !effectiveSrc.includes('127.0.0.1') &&
    !effectiveSrc.includes('localhost')
  )

  if (isExternalOnline) {
    if (targetSize >= 500 && effectiveHighRes) {
      return effectiveHighRes
    }
    return effectiveSrc || effectiveHighRes || null
  }

  // 3. Ảnh / bài hát cục bộ qua stream server nội bộ (/cover)
  const cleanPath = extractRawFilePath(effectivePath)
  const cleanSrc = extractRawFilePath(effectiveSrc)

  // Ưu tiên 3a: Đối với ảnh nhỏ và thẻ lưới vừa (tier sm, md hoặc targetSize <= 256px), nếu đã có sẵn thumbnail (cleanSrc),
  // tải trực tiếp qua cleanSrc để tránh backend phải mở và phân tích file audio gốc 50MB!
  if (targetSize <= 256 && cleanSrc && port > 0) {
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanSrc)}${sizeQuery}`
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
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanSrc)}${sizeQuery}`
  }

  // 4. Fallback an toàn: Không bao giờ trả về file:// hoặc đường dẫn ổ đĩa Windows trực tiếp
  // để tránh kích hoạt lỗi "Not allowed to load local resource" của Chromium
  if (effectiveSrc && (effectiveSrc.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(effectiveSrc))) {
    return null
  }

  return effectiveSrc || null
}

export const DynamicCoverArt: React.FC<DynamicCoverArtProps> = React.memo(({
  track,
  src,
  highResSrc,
  trackPath,
  streamPort = 0,
  tier = 'md',
  size,
  alt = 'Cover Art',
  className = '',
  imageClassName = '',
  smartAspect = false,
  animateSpin = false,
  isPlaying = false,
  isLite = false,
  fallbackImageSrc = null,
  fallbackIcon,
  fallbackIconSize = 24,
  loading = 'lazy',
  decoding = 'async',
  onClick,
  style
}) => {
  const [hasError, setHasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [currentPort, setCurrentPort] = useState<number>(() => {
    return (streamPort && streamPort > 0) ? streamPort : getGlobalStreamPort()
  })

  useEffect(() => {
    if (streamPort > 0) {
      setCurrentPort(streamPort)
      return
    }
    const unsub = onStreamPortChange((newPort) => {
      setCurrentPort(newPort)
    })
    const syncPort = getGlobalStreamPort()
    if (syncPort > 0 && syncPort !== currentPort) {
      setCurrentPort(syncPort)
    }
    return unsub
  }, [streamPort])

  const resolvedUrl = useMemo(() => {
    if (isLite) return null
    return resolveCoverUrl({
      track,
      src,
      highResSrc,
      trackPath,
      streamPort: currentPort,
      tier,
      size
    })
  }, [
    isLite,
    track?.id,
    track?.filePath,
    track?.coverArt,
    track?.coverArtHighRes,
    track?.isOnline,
    src,
    highResSrc,
    trackPath,
    currentPort,
    tier,
    size
  ])

  // Reset error state khi URL thay đổi
  useEffect(() => {
    setHasError(false)
    setIsLoaded(false)
  }, [resolvedUrl])

  // Khi ở chế độ Lite hoặc không có ảnh / bị lỗi tải ảnh
  if (isLite || !resolvedUrl || hasError) {
    if (fallbackImageSrc && !isLite) {
      return (
        <div
          onClick={onClick}
          className={`relative overflow-hidden ${className}`}
          style={style}
        >
          <img
            loading={loading}
            decoding={decoding}
            src={fallbackImageSrc}
            alt={alt}
            className={`w-full h-full object-cover select-none pointer-events-none ${
              animateSpin ? 'animate-spin-slow' : ''
            } ${imageClassName}`}
            style={
              animateSpin
                ? { willChange: 'transform', animationPlayState: isPlaying ? 'running' : 'paused' }
                : undefined
            }
          />
        </div>
      )
    }

    return (
      <div
        onClick={onClick}
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-700/60 to-zinc-900/60 text-zinc-500 select-none ${className}`}
        style={style}
      >
        {fallbackIcon || <ListMusic size={fallbackIconSize} />}
      </div>
    )
  }

  // Trường hợp smartAspect: với ảnh YouTube 16:9, tạo lớp nền mờ + ảnh chính căn giữa giữ tỉ lệ
  if (smartAspect) {
    return (
      <div
        onClick={onClick}
        className={`relative overflow-hidden flex items-center justify-center select-none ${className}`}
        style={style}
      >
        {/* Ambient blurred backdrop lấp đầy khung hình */}
        <img
          src={resolvedUrl}
          aria-hidden="true"
          loading={loading}
          decoding={decoding}
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-lg opacity-40 select-none pointer-events-none"
        />
        {/* Ảnh chính trọn vẹn không bị cắt xén hay méo tỉ lệ */}
        <img
          src={resolvedUrl}
          alt={alt}
          loading={loading}
          decoding={decoding}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`relative z-10 max-w-full max-h-full object-contain pointer-events-none drop-shadow-sm transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${animateSpin ? 'animate-spin-slow' : ''} ${imageClassName}`}
          style={
            animateSpin
              ? { willChange: 'transform', animationPlayState: isPlaying ? 'running' : 'paused' }
              : undefined
          }
        />
      </div>
    )
  }

  // Chế độ standard fill
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden select-none ${className}`}
      style={style}
    >
      <img
        src={resolvedUrl}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-40'
        } ${animateSpin ? 'animate-spin-slow' : ''} ${imageClassName}`}
        style={
          animateSpin
            ? { willChange: 'transform', animationPlayState: isPlaying ? 'running' : 'paused' }
            : undefined
        }
      />
    </div>
  )
})

DynamicCoverArt.displayName = 'DynamicCoverArt'
