import React, { useEffect, useRef, useState } from 'react'

export interface WebGLBackgroundProps {
  imageUrl: string | null
  opacity: number
  blur: number
  isLite: boolean
  isCore: boolean
}

export const WebGLBackground: React.FC<WebGLBackgroundProps> = React.memo(
  ({ imageUrl, opacity, isLite, isCore }) => {
    const [urls, setUrls] = useState<[string | null, string | null]>([imageUrl, null])
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
    const activeSlotRef = useRef<0 | 1>(0)
    const urlsRef = useRef<[string | null, string | null]>([imageUrl, null])
    activeSlotRef.current = activeSlot
    urlsRef.current = urls

    useEffect(() => {
      if (isCore) return

      if (!imageUrl) {
        setUrls([null, null])
        return
      }

      if (isLite) {
        setUrls([imageUrl, null])
        setActiveSlot(0)
        return
      }

      const curSlot = activeSlotRef.current
      if (urlsRef.current[curSlot] === imageUrl) return

      let cancelled = false
      let raf1: number | null = null
      let raf2: number | null = null

      const commitTransition = () => {
        if (cancelled) return
        const nextSlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0
        setUrls((prev) => {
          const next: [string | null, string | null] = [...prev] as [string | null, string | null]
          next[nextSlot] = imageUrl
          return next
        })
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            if (!cancelled) setActiveSlot(nextSlot)
          })
        })
      }

      const img = new Image()
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        img.crossOrigin = 'anonymous'
      }
      img.src = imageUrl

      if (typeof img.decode === 'function') {
        img.decode().then(commitTransition).catch(commitTransition)
      } else {
        img.onload = commitTransition
        img.onerror = commitTransition
      }

      return () => {
        cancelled = true
        if (raf1 !== null) cancelAnimationFrame(raf1)
        if (raf2 !== null) cancelAnimationFrame(raf2)
      }
    }, [imageUrl, isLite, isCore])

    if (isCore || !imageUrl) {
      return null
    }

    return (
      <div className="custom-bg-container">
        {[0, 1].map((slot) => {
          const url = urls[slot]
          if (!url) return null
          const isActive = activeSlot === slot
          return (
            <div
              key={slot}
              className="custom-bg-layer"
              style={{
                backgroundImage: `url("${url.replace(/"/g, '\\"')}")`,
                opacity: isActive ? opacity : 0,
                transition: isLite ? 'none' : undefined
              }}
            />
          )
        })}
      </div>
    )
  }
)

WebGLBackground.displayName = 'WebGLBackground'
