import React, { useState, useMemo, useEffect } from 'react'
import { ListMusic } from 'lucide-react'

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
  // true: luôn nền ambient + contain (cho art 16:9 online).
  // 'auto': mặc định fill full-bleed; chỉ chuyển ambient khi ảnh thật bị dẹt/dọc.
  smartAspect?: boolean | 'auto'
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

import { getGlobalStreamPort, onStreamPortChange, resolveCoverUrl } from '../utils/urlUtils'
import type { CoverTier } from '../utils/urlUtils'

export const DynamicCoverArt: React.FC<DynamicCoverArtProps> = React.memo(
  ({
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
    // auto mode: art vuông (≈1:1) thì fill; chỉ art dẹt/dọc mới dùng ambient.
    // Ngưỡng 0.85–1.18 bao phủ cover vuông kể cả sai số crop/resize.
    const [isNonSquareArt, setIsNonSquareArt] = useState(false)
    const [currentPort, setCurrentPort] = useState<number>(() => {
      return streamPort && streamPort > 0 ? streamPort : getGlobalStreamPort()
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
    }, [streamPort, currentPort])

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
    }, [isLite, track, src, highResSrc, trackPath, currentPort, tier, size])

    // Reset error state khi URL thay đổi
    useEffect(() => {
      setHasError(false)
      setIsLoaded(false)
      setIsNonSquareArt(false)
    }, [resolvedUrl])

    // Khi ở chế độ Lite hoặc không có ảnh / bị lỗi tải ảnh
    if (isLite || !resolvedUrl || hasError) {
      if (fallbackImageSrc && !isLite) {
        return (
          <div onClick={onClick} className={`relative overflow-hidden ${className}`} style={style}>
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
                  ? {
                      willChange: 'transform',
                      animationPlayState: isPlaying ? 'running' : 'paused'
                    }
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

    // Trường hợp smartAspect: với ảnh YouTube 16:9, tạo lớp nền mờ + ảnh chính căn giữa giữ tỉ lệ.
    // smartAspect='auto': mặc định fill full-bleed (đa số cover local là vuông);
    // chỉ chuyển sang ambient khi đo được ảnh thật bị dẹt/dọc.
    const useAmbientLayout = smartAspect === true || (smartAspect === 'auto' && isNonSquareArt)
    const detectArtAspect = (el: HTMLImageElement | null) => {
      if (smartAspect !== 'auto' || !el) return
      const w = el.naturalWidth
      const h = el.naturalHeight
      if (w > 0 && h > 0) {
        const ratio = w / h
        if (ratio < 0.85 || ratio > 1.18) setIsNonSquareArt(true)
      }
    }
    if (useAmbientLayout) {
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
          onLoad={(e) => {
            setIsLoaded(true)
            detectArtAspect(e.currentTarget)
          }}
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
  }
)

DynamicCoverArt.displayName = 'DynamicCoverArt'
