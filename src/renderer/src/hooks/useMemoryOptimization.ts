import { useEffect } from 'react'
import { usePlayerStore, useUIStore } from '../stores'

export function useMemoryOptimization() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const activeView = useUIStore((s) => s.activeView)

  // 1. Dọn dẹp khi đổi bài hát (trì hoãn 1.5s để UI ổn định trước)
  useEffect(() => {
    if (!currentTrack) return
    const timer = setTimeout(() => {
      window.api?.clearWebFrameCache?.()
      window.api?.clearMemoryCache?.()
    }, 1500)
    return () => clearTimeout(timer)
  }, [currentTrack, currentTrack?.id])

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

  // 4. Giải phóng bộ nhớ đệm ảnh không dùng khi chuyển đổi tab / view
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.api?.clearWebFrameCache?.()
        window.api?.forceRendererGC?.()
        window.api?.forceGC?.()
      } catch (_) {}
    }, 500)
    return () => clearTimeout(timer)
  }, [activeView])
}
