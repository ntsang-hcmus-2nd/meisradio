import { useState, useEffect, useMemo } from 'react'
import { useSettingsStore, usePlayerStore, useUIStore } from '../stores'
import { formatImageSource } from '../utils/urlUtils'
import { extractThemeColors, generateThemeFromColor } from '../utils/colorUtils'

export function useTheming() {
  const appMode = useSettingsStore((s) => s.appMode)
  const customBgImage = useSettingsStore((s) => s.customBgImage)
  const useTrackCoverAsBg = useSettingsStore((s) => s.useTrackCoverAsBg)
  const accentColorMode = useSettingsStore((s) => s.accentColorMode)
  const customAccentColor = useSettingsStore((s) => s.customAccentColor)
  const customBgOpacity = useSettingsStore((s) => s.customBgOpacity)
  const customBgBlur = useSettingsStore((s) => s.customBgBlur)
  const streamPort = useSettingsStore((s) => s.streamPort)
  const colorScheme = useSettingsStore((s) => s.colorScheme)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setThemeColor = useUIStore((s) => s.setThemeColor)

  const isLite = appMode === 'lite' || appMode === 'core'
  const isCore = appMode === 'core'

  const currentTrackKey = currentTrack?.id || currentTrack?.filePath || ''
  const bgCoverSize = customBgBlur > 0.5 ? 256 : 480
  const [trackCoverState, setTrackCoverState] = useState<{ key: string; url: string | null }>({
    key: '',
    url: null
  })

  // Fetch track cover high-res (chỉ khi nền dùng cover bài hát — mặc định tắt).
  // Giữ URL cũ trong lúc chờ IPC để không decode/crossfade 2 lần (128px -> 480px) mỗi bài.
  useEffect(() => {
    if (isCore || !currentTrack || !useTrackCoverAsBg) {
      setTrackCoverState({ key: '', url: null })
      return
    }

    const key = currentTrack.id || currentTrack.filePath || ''
    if (currentTrack.isOnline) {
      setTrackCoverState({
        key,
        url: currentTrack.coverArtHighRes || currentTrack.coverArt || null
      })
      return
    }

    let cleanup: (() => void) | undefined
    if (!currentTrack.isCloud && key) {
      let isCurrent = true
      // @ts-ignore
      window.api
        ?.getOriginalTrackCover?.(key, bgCoverSize)
        ?.then((cover: string | null) => {
          if (isCurrent) {
            setTrackCoverState({ key, url: cover || currentTrack.coverArt || null })
          }
        })
        ?.catch(() => {
          if (isCurrent) setTrackCoverState({ key, url: currentTrack.coverArt || null })
        })
      cleanup = () => {
        isCurrent = false
      }
    } else {
      setTrackCoverState({ key, url: currentTrack.coverArt || null })
    }
    return cleanup
  }, [
    currentTrack,
    currentTrackKey,
    currentTrack?.coverArt,
    currentTrack?.coverArtHighRes,
    currentTrack?.isOnline,
    currentTrack?.isCloud,
    useTrackCoverAsBg,
    bgCoverSize,
    isCore
  ])

  const trackHighResCover =
    trackCoverState.key === currentTrackKey
      ? trackCoverState.url
      : currentTrack?.coverArtHighRes || currentTrack?.coverArt || null

  // Determine effective background image
  const effectiveBgImage = isCore
    ? null
    : useTrackCoverAsBg
      ? currentTrack
        ? trackHighResCover
        : null
      : customBgImage

  // Chuẩn hóa ảnh nền thành URL an toàn
  const resolvedBgImage = useMemo(() => {
    return effectiveBgImage ? formatImageSource(effectiveBgImage, streamPort) : null
  }, [effectiveBgImage, streamPort])

  // Theme Colors Cache: trích xuất và lưu LRU on-demand trong extractThemeColors thay vì nạp toàn bảng lúc boot

  const fallbackCover =
    !currentTrack?.coverArtHighRes &&
    !currentTrack?.coverArt &&
    trackCoverState.key === currentTrackKey
      ? trackCoverState.url
      : null

  // Apply Background & Extract Theme Colors (60/30/10)
  useEffect(() => {
    let isCancelled = false
    document.documentElement.setAttribute('data-theme', colorScheme)
    const lightFallback = colorScheme === 'light'
    const fallback60 = lightFallback ? '#f8fafc' : '#18181b'
    const fallback30 = lightFallback ? '#e2e8f0' : '#27272a'
    const fallback10 = lightFallback ? '#059669' : '#10b981'
    if (isCore) {
      document.documentElement.style.setProperty('--theme-60', fallback60)
      document.documentElement.style.setProperty('--theme-30', fallback30)
      document.documentElement.style.setProperty('--theme-10', fallback10)
      return
    }

    if (accentColorMode === 'custom') {
      const theme = generateThemeFromColor(customAccentColor, colorScheme)
      document.documentElement.style.setProperty('--theme-60', theme.primary60)
      document.documentElement.style.setProperty('--theme-30', theme.secondary30)
      document.documentElement.style.setProperty('--theme-10', theme.accent10)
      return
    }

    if (accentColorMode === 'background') {
      if (!useTrackCoverAsBg && customBgImage) {
        const safeBg = formatImageSource(customBgImage, streamPort) || customBgImage
        extractThemeColors(safeBg, customBgImage, colorScheme).then((colors) => {
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
      // shortcut: theme có sẵn từ scanner thì khỏi decode + K-means mỗi bài
      return () => {
        isCancelled = true
      }
    }

    const trackCover = currentTrack?.coverArtHighRes || currentTrack?.coverArt || fallbackCover

    // Trích màu lúc rảnh: canvas + K-means chạy sau khi audio đã start, khỏi tranh main thread
    const runThemeExtract = () => {
      if (!trackCover) {
        if (!currentTrack?.themeColors) {
          document.documentElement.style.setProperty('--theme-60', fallback60)
          document.documentElement.style.setProperty('--theme-30', fallback30)
          document.documentElement.style.setProperty('--theme-10', fallback10)
        }
        return
      }
      const safeTrackCover = formatImageSource(trackCover, streamPort) || trackCover
      extractThemeColors(safeTrackCover, trackKey || safeTrackCover, colorScheme).then((colors) => {
        if (colors && !isCore && !isCancelled) {
          document.documentElement.style.setProperty('--theme-60', colors.primary60)
          document.documentElement.style.setProperty('--theme-30', colors.secondary30)
          document.documentElement.style.setProperty('--theme-10', colors.accent10)
        }
      })
    }

    let idleHandle: number | null = null
    const w = window as any
    if (typeof w.requestIdleCallback === 'function') {
      idleHandle = w.requestIdleCallback(runThemeExtract, { timeout: 1500 })
    } else {
      idleHandle = w.setTimeout(runThemeExtract, 0)
    }
    return () => {
      isCancelled = true
      if (idleHandle !== null) {
        if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleHandle)
        else w.clearTimeout(idleHandle)
      }
    }
  }, [
    accentColorMode,
    customAccentColor,
    customBgImage,
    useTrackCoverAsBg,
    fallbackCover,
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.themeColors,
    currentTrack?.coverArt,
    currentTrack?.coverArtHighRes,
    streamPort,
    colorScheme,
    isCore
  ])

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-opacity', customBgOpacity.toString())
  }, [customBgOpacity])

  useEffect(() => {
    const blurPx = Math.max(0, customBgBlur)
    document.documentElement.style.setProperty('--bg-blur', `${blurPx}px`)
    document.documentElement.style.setProperty(
      '--bg-filter',
      blurPx > 0 ? `blur(${blurPx}px)` : 'none'
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
    resolvedBgImage,
    effectiveBgImage,
    trackHighResCover,
    isLite,
    isCore
  }
}
