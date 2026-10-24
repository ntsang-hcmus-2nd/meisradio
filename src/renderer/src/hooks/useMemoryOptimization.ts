import { useEffect } from 'react'

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

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerGC()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    let unlistenDeepClean: (() => void) | undefined
    if (window.api?.onDeepClean) {
      unlistenDeepClean = window.api.onDeepClean(() => {
        triggerGC()
      })
    }

    // 3. Chu kỳ kiểm tra dọn dẹp nhàn rỗi (mỗi 3 phút khi chạy ngầm)
    const idleInterval = setInterval(() => {
      if (document.hidden) {
        triggerGC()
      }
    }, 180000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(idleInterval)
      if (typeof unlistenDeepClean === 'function') {
        unlistenDeepClean()
      }
    }
  }, [])
}
