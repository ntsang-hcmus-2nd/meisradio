import { useEffect } from 'react'
import { useSettingsStore } from '../stores'

export function useMemoryOptimization() {
  // 2. Dọn dẹp sâu khi ứng dụng thu nhỏ hoặc nhận sự kiện onDeepClean từ Main Process
  useEffect(() => {
    const triggerGC = () => {
      try {
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
      if (document.hidden) {
        triggerGC()
        setDegraded(true)
      } else {
        setDegraded(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    let unlistenDeepClean: (() => void) | undefined
    if (window.api?.onDeepClean) {
      unlistenDeepClean = window.api.onDeepClean(() => {
        triggerGC()
        setDegraded(true)
      })
    }

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
      if (typeof unlistenDeepClean === 'function') {
        unlistenDeepClean()
      }
    }
  }, [])
}
