import { useEffect } from 'react'
import { useSettingsStore, useLibraryStore, usePlayerStore } from '../stores'
import { getWaveformPeaksCacheSize } from '../components/PlayerProgressBar'

function collectRendererSample(reason: string): any {
  let heap: any = null
  try {
    const pm: any = (performance as any)?.memory
    if (pm) {
      heap = {
        usedJSHeapSize: pm.usedJSHeapSize,
        totalJSHeapSize: pm.totalJSHeapSize,
        jsHeapSizeLimit: pm.jsHeapSizeLimit
      }
    }
  } catch {}
  let libraryTracks = -1
  try {
    libraryTracks = useLibraryStore.getState()?.libraryTracks?.length ?? -1
  } catch {}
  let isPlaying: any = null
  let trackId: any = null
  try {
    const ps: any = usePlayerStore.getState()
    isPlaying = ps?.isPlaying ?? null
    trackId = ps?.currentTrack?.id ?? ps?.currentTrack?.filePath ?? null
  } catch {}
  let waveformPeaks = -1
  try {
    waveformPeaks = getWaveformPeaksCacheSize()
  } catch {}
  return {
    reason,
    hidden: (typeof document !== 'undefined' ? document.hidden : null) as any,
    visibilityState:
      (typeof document !== 'undefined' ? (document as any).visibilityState : null) as any,
    heap,
    libraryTracks,
    isPlaying,
    trackId,
    waveformPeaks
  }
}

function pushRendererSample(reason: string): void {
  try {
    window.api?.metricsAppendRenderer?.(collectRendererSample(reason))
  } catch {}
}

export function useMemoryOptimization() {
  // 2. Dọn dẹp sâu khi ứng dụng thu nhỏ hoặc nhận sự kiện onDeepClean từ Main Process
  useEffect(() => {
    const triggerGC = () => {
      try {
        if (!useSettingsStore.getState().autoDeepCleanOnHide) return
        window.api?.clearWebFrameCache?.()
      } catch (_) {}
      try {
        window.api?.forceRendererGC?.()
      } catch (_) {}
      try {
        window.api?.forceGC?.()
      } catch (_) {}
      window.api?.clearMemoryCache?.()
    }

    // shortcut: auto-degrade chỉ khi appMode==='default' — Lite/Core đã tự xử lý.
    // Manual override = chuyển sang Lite/Core, auto không can thiệp.
    const setDegraded = (on: boolean) => {
      try {
        if (on && useSettingsStore.getState().appMode === 'default') {
          document.documentElement.setAttribute('data-degraded', 'true')
        } else {
          document.documentElement.removeAttribute('data-degraded')
        }
      } catch {}
    }

    const handleVisibilityChange = () => {
      pushRendererSample('visibilitychange')
      if (document.hidden) {
        triggerGC()
        setDegraded(true)
      } else {
        setDegraded(false)
      }
    }

    pushRendererSample('mount')

    document.addEventListener('visibilitychange', handleVisibilityChange)

    let unlistenDeepClean: (() => void) | undefined
    if (window.api?.onDeepClean) {
      unlistenDeepClean = window.api.onDeepClean(() => {
        pushRendererSample('deepclean')
        triggerGC()
        setDegraded(true)
      })
    }

    // Trace soak-test: đẩy mẫu renderer mỗi 60s (kể cả khi hidden hay không,
    // để kiểm chứng giả thuyết document.hidden khi minimize)
    const metricsInterval = setInterval(() => {
      pushRendererSample('interval')
    }, 60000)

    // 3. Chu kỳ kiểm tra dọn dẹp nhàn rỗi (mỗi 3 phút khi chạy ngầm)
    const idleInterval = setInterval(() => {
      if (document.hidden) {
        triggerGC()
        setDegraded(true)
      }
    }, 180000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      try {
        document.documentElement.removeAttribute('data-degraded')
      } catch {}
      clearInterval(idleInterval)
      clearInterval(metricsInterval)
      if (typeof unlistenDeepClean === 'function') {
        unlistenDeepClean()
      }
    }
  }, [])
}
