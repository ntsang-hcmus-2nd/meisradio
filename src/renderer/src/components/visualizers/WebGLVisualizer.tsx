import React, { useEffect, useRef } from 'react'

interface WebGLVisualizerProps {
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>
  isPlaying: boolean
  isLite?: boolean
  showVisualizer?: boolean
  className?: string
  barCount?: number
}

export const WebGLVisualizer: React.FC<WebGLVisualizerProps> = React.memo(({
  analyserNodeRef,
  isPlaying,
  isLite = false,
  showVisualizer = true,
  className,
  barCount = 48
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (isLite || !showVisualizer || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const numBands = barCount
    const minFreq = 25
    const maxFreq = 20000
    const smoothedValues = new Float32Array(numBands).fill(0)
    const peakValues = new Float32Array(numBands).fill(0)

    let lastDrawTime = performance.now()
    const fpsInterval = 1000 / 60 // 60 FPS

    let rawDataArray = new Uint8Array(1024)

    // Cache layout dimensions and color to avoid layout thrashing
    let cachedWidth = canvas.clientWidth || 300
    let cachedHeight = canvas.clientHeight || 80
    let cachedDpr = window.devicePixelRatio || 1
    let cachedThemeColor = '#10b981'

    const updateThemeColor = () => {
      try {
        const rawTheme = getComputedStyle(document.documentElement).getPropertyValue('--theme-10').trim()
        if (rawTheme && (rawTheme.startsWith('#') || rawTheme.startsWith('rgb') || rawTheme.startsWith('hsl'))) {
          cachedThemeColor = rawTheme
        }
      } catch (e) {}
    }
    updateThemeColor()

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          cachedWidth = Math.floor(entry.contentRect.width)
          cachedHeight = Math.floor(entry.contentRect.height)
          cachedDpr = window.devicePixelRatio || 1
          if (cachedWidth > 0 && cachedHeight > 0) {
            canvas.width = Math.floor(cachedWidth * cachedDpr)
            canvas.height = Math.floor(cachedHeight * cachedDpr)
          }
        }
      }
      updateThemeColor()
    })

    resizeObserver.observe(canvas)

    // Initial setup of canvas dimensions
    if (cachedWidth > 0 && cachedHeight > 0) {
      canvas.width = Math.floor(cachedWidth * cachedDpr)
      canvas.height = Math.floor(cachedHeight * cachedDpr)
    }

    const draw = (now: number) => {
      reqAnimRef.current = requestAnimationFrame(draw)

      const elapsed = now - lastDrawTime
      if (elapsed < fpsInterval) return
      lastDrawTime = now - (elapsed % fpsInterval)

      const width = cachedWidth
      const height = cachedHeight
      const dpr = cachedDpr

      if (width === 0 || height === 0) return

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const analyser = analyserNodeRef.current
      if (analyser && isPlaying) {
        if (analyser.context && (analyser.context as any).state === 'suspended') {
          try { (analyser.context as any).resume?.().catch(() => {}) } catch (e) {}
        }

        const binCount = analyser.frequencyBinCount
        if (rawDataArray.length !== binCount) {
          rawDataArray = new Uint8Array(binCount)
        }
        analyser.getByteFrequencyData(rawDataArray)

        const sampleRate = analyser.context?.sampleRate || 44100
        const nyquist = sampleRate / 2

        for (let i = 0; i < numBands; i++) {
          const fStart = minFreq * Math.pow(maxFreq / minFreq, i / numBands)
          const fEnd = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / numBands)

          const binStart = Math.max(0, Math.min(binCount - 1, Math.floor((fStart / nyquist) * binCount)))
          const binEnd = Math.max(binStart, Math.min(binCount - 1, Math.ceil((fEnd / nyquist) * binCount)))

          let sum = 0
          let count = 0
          for (let b = binStart; b <= binEnd; b++) {
            sum += rawDataArray[b]
            count++
          }
          const rawVal = count > 0 ? (sum / count) / 255 : 0

          if (rawVal > smoothedValues[i]) {
            smoothedValues[i] = rawVal
          } else {
            smoothedValues[i] = Math.max(0, smoothedValues[i] - 0.04)
          }

          if (smoothedValues[i] > peakValues[i]) {
            peakValues[i] = smoothedValues[i]
          } else {
            peakValues[i] = Math.max(0, peakValues[i] - 0.015)
          }
        }
      } else {
        for (let i = 0; i < numBands; i++) {
          smoothedValues[i] = Math.max(0, smoothedValues[i] - 0.05)
          peakValues[i] = Math.max(0, peakValues[i] - 0.02)
        }
      }

      const gap = 2
      const totalGap = (numBands - 1) * gap
      const barWidth = Math.max(2, (width - totalGap) / numBands)

      const gradient = ctx.createLinearGradient(0, height, 0, 0)
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)')
      gradient.addColorStop(0.65, cachedThemeColor)
      gradient.addColorStop(1, '#ffffff')

      for (let i = 0; i < numBands; i++) {
        const val = smoothedValues[i]
        const peak = peakValues[i]
        const barHeight = Math.max(2, val * (height - 6))
        const x = i * (barWidth + gap)
        const y = height - barHeight - 2

        ctx.fillStyle = gradient
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0])
        } else {
          ctx.rect(x, y, barWidth, barHeight)
        }
        ctx.fill()

        if (peak > 0.05) {
          const peakY = Math.max(0, height - (peak * (height - 6)) - 4)
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, peakY, barWidth, 1.5, 1)
          } else {
            ctx.rect(x, peakY, barWidth, 1.5)
          }
          ctx.fill()
        }
      }

      ctx.restore()
    }

    reqAnimRef.current = requestAnimationFrame(draw)

    return () => {
      resizeObserver.disconnect()
      if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current)
    }
  }, [isPlaying, isLite, showVisualizer, analyserNodeRef, barCount])

  if (isLite || !showVisualizer) return null

  return (
    <canvas 
      ref={canvasRef} 
      className={className || "w-full h-full block bg-transparent"}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
})

