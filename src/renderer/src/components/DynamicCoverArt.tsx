import React, { useState, useMemo, useEffect } from 'react'
import { ListMusic } from 'lucide-react'

export type CoverTier = 'sm' | 'md' | 'lg' | 'xl' | 'original'

export const TIER_SIZES: Record<CoverTier, number> = {
  sm: 96,       // List item (40-48px @ 2x DPR)
  md: 256,      // Player bar (56px), Mini player (96px), small cards (120-140px)
  lg: 512,      // Medium/large grid cards (160-260px @ 2x DPR)
  xl: 800,      // Fullscreen vinyl disc (250-400px @ 2x DPR)
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

let globalStreamPort = (typeof window !== 'undefined' && (window as any).api?.getStreamPortSync?.()) || 0

export function setGlobalStreamPort(port: number): void {
  globalStreamPort = port
}

export function getGlobalStreamPort(): number {
  if (globalStreamPort <= 0 && typeof window !== 'undefined' && (window as any).api?.getStreamPortSync) {
    try {
      globalStreamPort = (window as any).api.getStreamPortSync() || 0
    } catch (_) {}
  }
  return globalStreamPort
}

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
  const isOnline = track?.isOnline || (effectiveSrc ? effectiveSrc.startsWith('http') : false)
  const port = (streamPort && streamPort > 0) ? streamPort : globalStreamPort

  // 1. Nhạc online (YouTube Music, SoundCloud)
  if (isOnline) {
    if (targetSize >= 500 && effectiveHighRes) {
      return effectiveHighRes
    }
    return effectiveSrc || effectiveHighRes || null
  }

  // 2. Nhạc local qua stream server (Dynamic resizing in-memory)
  if (effectivePath && port > 0) {
    let cleanPath = effectivePath.replace(/^file:\/\/\/?/, '')
    if (cleanPath.startsWith('/') && /^\/[a-zA-Z]:/.test(cleanPath)) {
      cleanPath = cleanPath.slice(1)
    }
    const sizeQuery = targetSize > 0 ? `&size=${targetSize}` : ''
    return `http://127.0.0.1:${port}/cover?path=${encodeURIComponent(cleanPath)}${sizeQuery}`
  }

  // 3. Fallback khi không có streamPort hoặc đang dùng thumbnail cache sẵn có
  if (targetSize >= 500 && effectiveHighRes) {
    return effectiveHighRes
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

  const resolvedUrl = useMemo(() => {
    if (isLite) return null
    return resolveCoverUrl({
      track,
      src,
      highResSrc,
      trackPath,
      streamPort,
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
    streamPort,
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
