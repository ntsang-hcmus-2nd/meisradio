import React, { useEffect, useRef, useState } from 'react'
import { colorToGlRgb, computeNextVfxScale, createQuadProgram } from '../../utils/vfxUtils'

export interface WebGLVisualizerProps {
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>
  isPlaying: boolean
  isLite?: boolean
  showVisualizer?: boolean
  className?: string
  barCount?: number
}

const MAX_BARS = 64
const MIN_FREQ = 25
const MAX_FREQ = 20000
const FPS_INTERVAL = 1000 / 30 // 30 FPS cap
const FRAME_SAMPLE_WINDOW = 15

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_bars[64];
uniform float u_peaks[64];
uniform float u_barCount;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_dpr;

void main() {
  float px = gl_FragCoord.x;
  float py = gl_FragCoord.y;

  float gap = 2.0 * u_dpr;
  float totalGap = max(0.0, u_barCount - 1.0) * gap;
  float barW = max(2.0 * u_dpr, (u_resolution.x - totalGap) / max(1.0, u_barCount));
  float stride = barW + gap;

  int idx = int(floor(px / stride));
  float localX = px - float(idx) * stride;

  if (idx < 0 || idx >= int(u_barCount + 0.5) || localX > barW) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float val = 0.0;
  float peak = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i == idx) {
      val = u_bars[i];
      peak = u_peaks[i];
      break;
    }
  }

  float bottomPad = 2.0 * u_dpr;
  float usableH = max(1.0, u_resolution.y - 6.0 * u_dpr);
  float barH = max(2.0 * u_dpr, val * usableH);
  float barTop = bottomPad + barH;

  vec4 outColor = vec4(0.0);

  if (py >= bottomPad && py <= barTop) {
    float t = clamp(py / max(1.0, u_resolution.y), 0.0, 1.0);
    vec3 bottomRgb = vec3(0.063, 0.725, 0.506);
    vec3 rgb;
    float alpha;
    if (t < 0.65) {
      float k = t / 0.65;
      rgb = mix(bottomRgb, u_color, k);
      alpha = mix(0.25, 1.0, k);
    } else {
      float k = (t - 0.65) / 0.35;
      rgb = mix(u_color, vec3(1.0), k);
      alpha = 1.0;
    }
    outColor = vec4(rgb * alpha, alpha);
  }

  if (peak > 0.05) {
    float capH = 1.5 * u_dpr;
    float peakY = min(u_resolution.y - capH, bottomPad + peak * usableH + 2.0 * u_dpr);
    if (py >= peakY && py <= peakY + capH) {
      outColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
  }

  gl_FragColor = outColor;
}
`

interface GlResources {
  gl: WebGLRenderingContext
  program: WebGLProgram
  vbo: WebGLBuffer
  aPosLoc: number
  uBarsLoc: WebGLUniformLocation | null
  uPeaksLoc: WebGLUniformLocation | null
  uBarCountLoc: WebGLUniformLocation | null
  uResolutionLoc: WebGLUniformLocation | null
  uColorLoc: WebGLUniformLocation | null
  uDprLoc: WebGLUniformLocation | null
}

function initWebGL(gl: WebGLRenderingContext): GlResources | null {
  const quad = createQuadProgram(gl, VERT_SRC, FRAG_SRC, 'a_pos')
  if (!quad) return null

  const { program, vbo, aPosLoc } = quad

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  return {
    gl,
    program,
    vbo,
    aPosLoc,
    uBarsLoc:
      gl.getUniformLocation(program, 'u_bars[0]') || gl.getUniformLocation(program, 'u_bars'),
    uPeaksLoc:
      gl.getUniformLocation(program, 'u_peaks[0]') || gl.getUniformLocation(program, 'u_peaks'),
    uBarCountLoc: gl.getUniformLocation(program, 'u_barCount'),
    uResolutionLoc: gl.getUniformLocation(program, 'u_resolution'),
    uColorLoc: gl.getUniformLocation(program, 'u_color'),
    uDprLoc: gl.getUniformLocation(program, 'u_dpr')
  }
}

export const WebGLVisualizer: React.FC<WebGLVisualizerProps> = React.memo(
  ({
    analyserNodeRef,
    isPlaying,
    isLite = false,
    showVisualizer = true,
    className,
    barCount = 48
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const reqAnimRef = useRef<number | undefined>(undefined)
    const [webglFailed, setWebglFailed] = useState(false)

    useEffect(() => {
      if (isLite || !showVisualizer || !canvasRef.current) return

      const canvas = canvasRef.current
      const contextAttrs: WebGLContextAttributes = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power'
      }

      const rawGl = !webglFailed
        ? (canvas.getContext('webgl2', contextAttrs) as WebGLRenderingContext | null) ||
          (canvas.getContext('webgl', contextAttrs) as WebGLRenderingContext | null)
        : null

      let glRes: GlResources | null = null
      if (rawGl) {
        glRes = initWebGL(rawGl)
        if (!glRes) {
          // A WebGL context was already bound to this canvas; remount a fresh canvas for 2D fallback.
          setWebglFailed(true)
          return
        }
      }

      const ctx = !glRes ? canvas.getContext('2d', { alpha: true }) : null
      if (!glRes && !ctx) return

      const numBands = Math.min(Math.max(1, barCount), MAX_BARS)
      const barsUniform = new Float32Array(MAX_BARS)
      const peaksUniform = new Float32Array(MAX_BARS)

      // Precompute logarithmic band boundaries once to avoid Math.pow per band per frame
      const bandStarts = new Float32Array(numBands)
      const bandEnds = new Float32Array(numBands)
      const freqRatio = MAX_FREQ / MIN_FREQ
      for (let i = 0; i < numBands; i++) {
        bandStarts[i] = MIN_FREQ * Math.pow(freqRatio, i / numBands)
        bandEnds[i] = MIN_FREQ * Math.pow(freqRatio, (i + 1) / numBands)
      }

      let rawDataArray = new Uint8Array(1024)
      let destroyed = false

      // Cache layout dimensions and color to avoid layout thrashing
      let cachedWidth = canvas.clientWidth || 300
      let cachedHeight = canvas.clientHeight || 80
      let cachedDpr = Math.min(window.devicePixelRatio || 1, 1.5)
      let vfxScale = 1

      let cachedThemeColor = '#10b981'
      let cachedThemeRgb: [number, number, number] = colorToGlRgb(cachedThemeColor)
      let cachedGradient: CanvasGradient | null = null
      let cachedGradientKey = ''

      const updateThemeColor = (): boolean => {
        try {
          const rawTheme = getComputedStyle(document.documentElement)
            .getPropertyValue('--theme-10')
            .trim()
          if (
            rawTheme &&
            (rawTheme.startsWith('#') || rawTheme.startsWith('rgb') || rawTheme.startsWith('hsl'))
          ) {
            if (rawTheme !== cachedThemeColor) {
              cachedThemeColor = rawTheme
              cachedThemeRgb = colorToGlRgb(rawTheme)
              return true
            }
          }
        } catch {}
        return false
      }
      updateThemeColor()

      const syncCanvasDimensions = () => {
        if (cachedWidth > 0 && cachedHeight > 0) {
          const targetW = Math.max(1, Math.floor(cachedWidth * cachedDpr * vfxScale))
          const targetH = Math.max(1, Math.floor(cachedHeight * cachedDpr * vfxScale))
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW
            canvas.height = targetH
          }
          if (glRes) {
            glRes.gl.viewport(0, 0, canvas.width, canvas.height)
          }
        }
      }
      syncCanvasDimensions()

      let lastDrawTime = performance.now()
      let prevRenderedTime = 0
      let frameTimeSum = 0
      let frameSampleCount = 0

      const resetFrameTiming = () => {
        prevRenderedTime = 0
        frameTimeSum = 0
        frameSampleCount = 0
      }

      const updateBands = (): boolean => {
        const analyser = analyserNodeRef.current
        let hasActivity = false
        if (analyser && isPlaying) {
          hasActivity = true
          if (analyser.context && analyser.context.state === 'suspended') {
            try {
              const audioCtx = analyser.context as Partial<AudioContext>
              audioCtx.resume?.().catch(() => {})
            } catch {}
          }

          const binCount = analyser.frequencyBinCount
          if (rawDataArray.length !== binCount) {
            rawDataArray = new Uint8Array(binCount)
          }
          analyser.getByteFrequencyData(rawDataArray)

          const sampleRate = analyser.context?.sampleRate || 44100
          const nyquist = sampleRate / 2

          for (let i = 0; i < numBands; i++) {
            const binStart = Math.max(
              0,
              Math.min(binCount - 1, Math.floor((bandStarts[i] / nyquist) * binCount))
            )
            const binEnd = Math.max(
              binStart,
              Math.min(binCount - 1, Math.ceil((bandEnds[i] / nyquist) * binCount))
            )

            let sum = 0
            let count = 0
            for (let b = binStart; b <= binEnd; b++) {
              sum += rawDataArray[b]
              count++
            }
            const rawVal = count > 0 ? sum / count / 255 : 0

            if (rawVal > barsUniform[i]) {
              barsUniform[i] = rawVal
            } else {
              barsUniform[i] = Math.max(0, barsUniform[i] - 0.04)
            }

            if (barsUniform[i] > peaksUniform[i]) {
              peaksUniform[i] = barsUniform[i]
            } else {
              peaksUniform[i] = Math.max(0, peaksUniform[i] - 0.015)
            }
          }
        } else {
          for (let i = 0; i < numBands; i++) {
            barsUniform[i] = Math.max(0, barsUniform[i] - 0.05)
            peaksUniform[i] = Math.max(0, peaksUniform[i] - 0.02)
            if (barsUniform[i] > 0.001 || peaksUniform[i] > 0.001) {
              hasActivity = true
            }
          }
        }
        return hasActivity
      }

      const drawWebGL = (effectiveDpr: number) => {
        if (!glRes) return
        const {
          gl,
          program,
          vbo,
          aPosLoc,
          uBarsLoc,
          uPeaksLoc,
          uBarCountLoc,
          uResolutionLoc,
          uColorLoc,
          uDprLoc
        } = glRes

        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.enableVertexAttribArray(aPosLoc)
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

        gl.uniform1fv(uBarsLoc, barsUniform)
        gl.uniform1fv(uPeaksLoc, peaksUniform)
        gl.uniform1f(uBarCountLoc, numBands)
        gl.uniform2f(uResolutionLoc, canvas.width, canvas.height)
        gl.uniform3f(uColorLoc, cachedThemeRgb[0], cachedThemeRgb[1], cachedThemeRgb[2])
        gl.uniform1f(uDprLoc, effectiveDpr)

        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }

      const draw2D = (width: number, height: number, effectiveDpr: number) => {
        if (!ctx) return
        ctx.save()
        ctx.scale(effectiveDpr, effectiveDpr)
        ctx.clearRect(0, 0, width, height)

        const gap = 2
        const totalGap = (numBands - 1) * gap
        const barWidth = Math.max(2, (width - totalGap) / numBands)

        const gradientKey = `${height}|${cachedThemeColor}`
        if (!cachedGradient || cachedGradientKey !== gradientKey) {
          const gradient = ctx.createLinearGradient(0, height, 0, 0)
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)')
          gradient.addColorStop(0.65, cachedThemeColor)
          gradient.addColorStop(1, '#ffffff')
          cachedGradient = gradient
          cachedGradientKey = gradientKey
        }

        for (let i = 0; i < numBands; i++) {
          const val = barsUniform[i]
          const peak = peaksUniform[i]
          const barHeight = Math.max(2, val * (height - 6))
          const x = i * (barWidth + gap)
          const y = height - barHeight - 2

          ctx.fillStyle = cachedGradient
          ctx.fillRect(x, y, barWidth, barHeight)

          if (peak > 0.05) {
            const peakY = Math.max(0, height - peak * (height - 6) - 4)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x, peakY, barWidth, 1.5)
          }
        }

        ctx.restore()
      }

      const draw = (now: number) => {
        if (destroyed) {
          reqAnimRef.current = undefined
          return
        }

        const elapsed = now - lastDrawTime
        if (elapsed < FPS_INTERVAL) {
          reqAnimRef.current = requestAnimationFrame(draw)
          return
        }
        lastDrawTime = now - (elapsed % FPS_INTERVAL)

        if (prevRenderedTime > 0) {
          const frameDelta = now - prevRenderedTime
          if (frameDelta < 500) {
            frameTimeSum += frameDelta
            frameSampleCount++
            if (frameSampleCount >= FRAME_SAMPLE_WINDOW) {
              const avgFrameMs = frameTimeSum / frameSampleCount
              frameTimeSum = 0
              frameSampleCount = 0
              const nextScale = computeNextVfxScale(avgFrameMs, vfxScale)
              if (nextScale !== vfxScale) {
                vfxScale = nextScale
                syncCanvasDimensions()
              }
            }
          }
        }
        prevRenderedTime = now

        const width = cachedWidth
        const height = cachedHeight
        if (width === 0 || height === 0) {
          resetFrameTiming()
          reqAnimRef.current = undefined
          return
        }

        const hasActivity = updateBands()
        const effectiveDpr = cachedDpr * vfxScale

        if (glRes) {
          drawWebGL(effectiveDpr)
        } else {
          draw2D(width, height, effectiveDpr)
        }

        if ((isPlaying || hasActivity) && !document.hidden) {
          reqAnimRef.current = requestAnimationFrame(draw)
        } else {
          resetFrameTiming()
          reqAnimRef.current = undefined
        }
      }

      const startDrawLoop = () => {
        if (!reqAnimRef.current && !document.hidden && (isPlaying || cachedWidth > 0)) {
          lastDrawTime = performance.now() - FPS_INTERVAL
          resetFrameTiming()
          reqAnimRef.current = requestAnimationFrame(draw)
        }
      }

      const resizeObserver = new ResizeObserver((entries) => {
        let becameVisible = false
        for (const entry of entries) {
          if (entry.contentRect) {
            const w = Math.floor(entry.contentRect.width)
            const h = Math.floor(entry.contentRect.height)
            cachedDpr = Math.min(window.devicePixelRatio || 1, 1.5)
            if (w > 0 && h > 0) {
              if (cachedWidth === 0 || cachedHeight === 0 || !reqAnimRef.current) {
                becameVisible = true
              }
              cachedWidth = w
              cachedHeight = h
              syncCanvasDimensions()
            } else {
              cachedWidth = w
              cachedHeight = h
            }
          }
        }
        updateThemeColor()
        if (becameVisible) {
          startDrawLoop()
        }
      })

      resizeObserver.observe(canvas)

      const themeObserver = new MutationObserver(() => {
        if (updateThemeColor() && !reqAnimRef.current && !document.hidden && cachedWidth > 0) {
          startDrawLoop()
        }
      })
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style']
      })

      const handleVisibilityChange = () => {
        if (document.hidden) {
          resetFrameTiming()
          if (reqAnimRef.current) {
            cancelAnimationFrame(reqAnimRef.current)
            reqAnimRef.current = undefined
          }
        } else if (isPlaying) {
          startDrawLoop()
        }
      }

      const handleContextLost = (e: Event) => {
        e.preventDefault()
        if (destroyed) return
        resetFrameTiming()
        if (reqAnimRef.current) {
          cancelAnimationFrame(reqAnimRef.current)
          reqAnimRef.current = undefined
        }
        setWebglFailed(true)
      }

      document.addEventListener('visibilitychange', handleVisibilityChange)
      if (glRes) {
        canvas.addEventListener('webglcontextlost', handleContextLost)
      }
      startDrawLoop()

      return () => {
        destroyed = true
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        if (glRes) {
          canvas.removeEventListener('webglcontextlost', handleContextLost)
        }
        resizeObserver.disconnect()
        themeObserver.disconnect()
        if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current)
        reqAnimRef.current = undefined
        if (glRes) {
          const { gl, program, vbo } = glRes
          try {
            gl.deleteProgram(program)
            gl.deleteBuffer(vbo)
          } catch {}
        }
      }
    }, [isPlaying, isLite, showVisualizer, analyserNodeRef, barCount, webglFailed])

    if (isLite || !showVisualizer) return null

    return (
      <canvas
        key={webglFailed ? '2d' : 'gl'}
        ref={canvasRef}
        className={className || 'w-full h-full block bg-transparent'}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    )
  }
)
