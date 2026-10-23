import { useState, useEffect, useMemo } from 'react'
import { useSettingsStore, usePlayerStore, useUIStore } from '../stores'
import { formatImageSource } from '../utils/urlUtils'
import {
  extractThemeColors,
  initThemeColorCache,
  generateThemeFromColor
} from '../utils/colorUtils'

export function useTheming() {
  const {
    appMode,
    customBgImage,
    useTrackCoverAsBg,
    accentColorMode,
    customAccentColor,
    customBgOpacity,
    customBgBlur,
    streamPort
  } = useSettingsStore()

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setThemeColor = useUIStore((s) => s.setThemeColor)

  const isLite = appMode === 'lite' || appMode === 'core'
  const isCore = appMode === 'core'

  const [trackHighResCover, setTrackHighResCover] = useState<string | null>(null)

  // Fetch track cover high-res
  useEffect(() => {
    if (isCore || !currentTrack) {
      setTrackHighResCover(null)
      return
    }

    if (currentTrack.isOnline) {
      setTrackHighResCover(currentTrack.coverArtHighRes || currentTrack.coverArt || null)
      return
    }

    let cleanup: (() => void) | undefined
    if (!currentTrack.isCloud && (currentTrack.id || currentTrack.filePath)) {
      let isCurrent = true
      // @ts-ignore
      window.api
        ?.getOriginalTrackCover?.(currentTrack.id || currentTrack.filePath, 480)
        ?.then((cover: string | null) => {
          if (isCurrent) {
            setTrackHighResCover(cover || currentTrack.coverArt || null)
          }
        })
        ?.catch(() => {
          if (isCurrent) setTrackHighResCover(currentTrack.coverArt || null)
        })
      cleanup = () => {
        isCurrent = false
      }
    } else {
      setTrackHighResCover(currentTrack.coverArt || null)
    }
    return cleanup
  }, [
    currentTrack,
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.coverArt,
    currentTrack?.coverArtHighRes,
    currentTrack?.isOnline,
    currentTrack?.isCloud,
    isCore
  ])

  // Determine effective background image
  const effectiveBgImage = isCore
    ? null
    : useTrackCoverAsBg
      ? trackHighResCover || currentTrack?.coverArtHighRes || currentTrack?.coverArt || null
      : customBgImage

  // Chuẩn hóa ảnh nền thành URL an toàn
  const resolvedBgImage = useMemo(() => {
    return effectiveBgImage ? formatImageSource(effectiveBgImage, streamPort) : null
  }, [effectiveBgImage, streamPort])

  // Dual-layer Background Crossfade cho chế độ Standard
  const [bgLayerA, setBgLayerA] = useState<string | null>(null)
  const [bgLayerB, setBgLayerB] = useState<string | null>(null)
  const [activeBgLayer, setActiveBgLayer] = useState<'A' | 'B'>('A')

  useEffect(() => {
    if (isCore) {
      setBgLayerA(null)
      setBgLayerB(null)
      return
    }

    if (!resolvedBgImage) {
      setBgLayerA(null)
      setBgLayerB(null)
      return
    }

    if (isLite) {
      setBgLayerA(resolvedBgImage)
      setActiveBgLayer('A')
      return
    }

    let isCancelled = false
    const targetLayer = activeBgLayer === 'A' ? 'B' : 'A'

    const applyTransition = () => {
      if (isCancelled) return
      if (targetLayer === 'B') {
        setBgLayerB(resolvedBgImage)
        setActiveBgLayer('B')
      } else {
        setBgLayerA(resolvedBgImage)
        setActiveBgLayer('A')
      }
    }

    const img = new Image()
    if (resolvedBgImage.startsWith('http://') || resolvedBgImage.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = applyTransition
    img.onerror = applyTransition
    img.src = resolvedBgImage

    return () => {
      isCancelled = true
    }
    // activeBgLayer cố ý loại trừ: thêm vào sẽ gây ping-pong A→B→A vô hạn
    // vì effect vừa đọc vừa lật layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBgImage, isLite, isCore])

  // Theme Colors Cache
  useEffect(() => {
    if ((window as any).api?.getThemeColorsCache) {
      ;(window as any).api
        .getThemeColorsCache()
        .then((cachedColors: any) => {
          if (cachedColors) {
            initThemeColorCache(cachedColors)
          }
        })
        .catch(() => {})
    }
  }, [])

  // Apply Background & Extract Theme Colors (60/30/10)
  useEffect(() => {
    let isCancelled = false
    if (isCore) {
      document.documentElement.style.setProperty('--bg-image', 'none')
      document.documentElement.style.setProperty('--theme-60', '#18181b')
      document.documentElement.style.setProperty('--theme-30', '#27272a')
      document.documentElement.style.setProperty('--theme-10', '#10b981')
      return
    }

    const bgUrlToUse = resolvedBgImage || effectiveBgImage
    if (bgUrlToUse) {
      const sanitizedUrl = bgUrlToUse.replace(/"/g, '\\"')
      document.documentElement.style.setProperty('--bg-image', `url("${sanitizedUrl}")`)
    } else {
      document.documentElement.style.setProperty('--bg-image', 'none')
    }

    if (accentColorMode === 'custom') {
      const theme = generateThemeFromColor(customAccentColor)
      document.documentElement.style.setProperty('--theme-60', theme.primary60)
      document.documentElement.style.setProperty('--theme-30', theme.secondary30)
      document.documentElement.style.setProperty('--theme-10', theme.accent10)
      return
    }

    if (accentColorMode === 'background') {
      if (!useTrackCoverAsBg && customBgImage) {
        const safeBg = formatImageSource(customBgImage, streamPort) || customBgImage
        extractThemeColors(safeBg, customBgImage).then((colors) => {
          if (colors && !isCore && !isCancelled) {
            document.documentElement.style.setProperty('--theme-60', colors.primary60)
            document.documentElement.style.setProperty('--theme-30', colors.secondary30)
            document.documentElement.style.setProperty('--theme-10', colors.accent10)
          }
        })
        return
      }
    }

    const trackKey = currentTrack?.id || currentTrack?.filePath

    if (currentTrack?.themeColors && !isCore) {
      document.documentElement.style.setProperty('--theme-60', currentTrack.themeColors.primary60)
      document.documentElement.style.setProperty('--theme-30', currentTrack.themeColors.secondary30)
      document.documentElement.style.setProperty('--theme-10', currentTrack.themeColors.accent10)
    }

    const trackCover = trackHighResCover || currentTrack?.coverArtHighRes || currentTrack?.coverArt

    if (trackCover) {
      const safeTrackCover = formatImageSource(trackCover, streamPort) || trackCover
      extractThemeColors(safeTrackCover, trackKey || safeTrackCover).then((colors) => {
        if (colors && !isCore && !isCancelled) {
          document.documentElement.style.setProperty('--theme-60', colors.primary60)
          document.documentElement.style.setProperty('--theme-30', colors.secondary30)
          document.documentElement.style.setProperty('--theme-10', colors.accent10)
        }
      })
    } else if (!currentTrack?.themeColors) {
      document.documentElement.style.setProperty('--theme-60', '#18181b')
      document.documentElement.style.setProperty('--theme-30', '#27272a')
      document.documentElement.style.setProperty('--theme-10', '#10b981')
    }
    return () => {
      isCancelled = true
    }
  }, [
    accentColorMode,
    customAccentColor,
    customBgImage,
    useTrackCoverAsBg,
    effectiveBgImage,
    resolvedBgImage,
    trackHighResCover,
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.themeColors,
    currentTrack?.coverArt,
    currentTrack?.coverArtHighRes,
    streamPort,
    isCore
  ])

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-opacity', customBgOpacity.toString())
  }, [customBgOpacity])

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-blur', `${customBgBlur}px`)
    document.documentElement.style.setProperty(
      '--bg-filter',
      customBgBlur > 0 ? `blur(${customBgBlur}px)` : 'none'
    )
  }, [customBgBlur])

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', appMode)
  }, [appMode])

  useEffect(() => {
    if (isLite || isCore || effectiveBgImage) {
      setThemeColor('transparent')
    }
  }, [isLite, isCore, effectiveBgImage, setThemeColor])

  return {
    bgLayerA,
    bgLayerB,
    activeBgLayer,
    resolvedBgImage,
    effectiveBgImage,
    trackHighResCover,
    isLite,
    isCore
  }
}
