import { useEffect, useCallback } from 'react'
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
  let audios = -1
  try {
    audios = document.querySelectorAll('audio').length
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
    waveformPeaks,
    audios
  }
}

export function pushRendererSample(reason: string, extra?: Record<string, unknown>): void {
  try {
    if (window.localStorage?.getItem('meis_mem_trace') === '1') {
      window.api?.metricsAppendRenderer?.({ ...collectRendererSample(reason), ...(extra || {}) })
    }
  } catch {}
}

export function useMemoryOptimization() {
  const performLocalClean = useCallback(() => {
    try {
      window.api?.clearWebFrameCache?.()
      window.api?.forceRendererGC?.()
    } catch {}
  }, [])

  // 2. Dọn dẹp sâu khi ứng dụng thu nhỏ hoặc nhận sự kiện onDeepClean từ Main Process
  useEffect(() => {
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
        if (!useSettingsStore.getState().autoDeepCleanOnHide) return
        performLocalClean()
        setDegraded(true)
      } else {
        setDegraded(false)
      }
    }

    if (window.localStorage?.getItem('meis_mem_trace') === '1') {
      pushRendererSample('mount')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    let unlistenDeepClean: (() => void) | undefined
    if (window.api?.onDeepClean) {
      unlistenDeepClean = window.api.onDeepClean(() => {
        pushRendererSample('deepclean')
        performLocalClean()
        setDegraded(true)
      })
    }

    let metricsInterval: any = null
    if (window.localStorage?.getItem('meis_mem_trace') === '1') {
      metricsInterval = setInterval(() => {
        pushRendererSample('interval')
      }, 60000)
    }

    // 3. Chu kỳ kiểm tra dọn dẹp nhàn rỗi (mỗi 3 phút khi chạy ngầm)
    const idleInterval = setInterval(() => {
      if (document.hidden) {
        if (!useSettingsStore.getState().autoDeepCleanOnHide) return
        performLocalClean()
        setDegraded(true)
      }
    }, 180000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      try {
        document.documentElement.removeAttribute('data-degraded')
      } catch {}
      clearInterval(idleInterval)
      if (metricsInterval) clearInterval(metricsInterval)
      if (typeof unlistenDeepClean === 'function') {
        unlistenDeepClean()
      }
    }
  }, [performLocalClean])
}
