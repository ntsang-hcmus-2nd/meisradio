import React, { useEffect, useRef } from 'react'

const compileShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('WebGL Shader Error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

const createWebGLProgram = (gl: WebGLRenderingContext, vsSource: string, fsSource: string) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vertexShader || !fragmentShader) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  return program
}

interface WebGLSpectrogramProps {
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>
  isPlaying: boolean
  isLite?: boolean
  showSpectrogram?: boolean
  className?: string
}

export const WebGLSpectrogram: React.FC<WebGLSpectrogramProps> = React.memo(({
  analyserNodeRef,
  isPlaying,
  isLite = false,
  showSpectrogram = true,
  className
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (isLite || !showSpectrogram || !canvasRef.current || !analyserNodeRef.current) return

    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true })
    if (!gl) return

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    const fsSource = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_history;
      uniform float u_offset;
      
      // Color map: Maps normalized audio intensity (0.0 to 1.0) to audio analyzer heat palette
      vec3 intensityToColor(float val) {
        if (val <= 0.01) return vec3(0.04, 0.04, 0.08); // Very dark navy background
        
        // Multi-stop heatmap: Dark Blue -> Cyan -> Emerald Green -> Gold -> Crimson -> White
        if (val < 0.2) {
          float t = val / 0.2;
          return mix(vec3(0.05, 0.08, 0.25), vec3(0.0, 0.6, 0.8), t);
        } else if (val < 0.45) {
          float t = (val - 0.2) / 0.25;
          return mix(vec3(0.0, 0.6, 0.8), vec3(0.06, 0.72, 0.5), t);
        } else if (val < 0.7) {
          float t = (val - 0.45) / 0.25;
          return mix(vec3(0.06, 0.72, 0.5), vec3(0.95, 0.8, 0.1), t);
        } else if (val < 0.9) {
          float t = (val - 0.7) / 0.2;
          return mix(vec3(0.95, 0.8, 0.1), vec3(0.95, 0.25, 0.1), t);
        } else {
          float t = (val - 0.9) / 0.1;
          return mix(vec3(0.95, 0.25, 0.1), vec3(1.0, 1.0, 1.0), t);
        }
      }

      void main() {
        // X scrolls with circular offset buffer
        float x = fract(u_offset + v_uv.x);
        // Y represents frequency: 0Hz at bottom, nyquist frequency at top
        float y = v_uv.y;
        
        float val = texture2D(u_history, vec2(x, y)).r;
        gl_FragColor = vec4(intensityToColor(val), 1.0);
      }
    `

    const program = createWebGLProgram(gl, vsSource, fsSource)
    if (!program) return
    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const positionLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const analyser = analyserNodeRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const textureWidth = 1024
    const textureHeight = bufferLength 
    
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, textureWidth, textureHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT) 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const offsetLoc = gl.getUniformLocation(program, 'u_offset')
    
    let lastDrawTime = performance.now()
    const fpsInterval = 1000 / 40 // 40 FPS waterfall
    let currentColumn = 0

    const draw = (now: number) => {
      reqAnimRef.current = requestAnimationFrame(draw)

      const elapsed = now - lastDrawTime
      if (elapsed < fpsInterval) return
      lastDrawTime = now - (elapsed % fpsInterval)

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const targetW = Math.floor(rect.width * dpr)
        const targetH = Math.floor(rect.height * dpr)
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW
          canvas.height = targetH
          gl.viewport(0, 0, targetW, targetH)
        }
      }

      if (isPlaying && analyserNodeRef.current) {
        analyserNodeRef.current.getByteFrequencyData(dataArray)

        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, currentColumn, 0, 1, bufferLength, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArray)

        currentColumn = (currentColumn + 1) % textureWidth
      }

      const offset = currentColumn / textureWidth
      gl.uniform1f(offsetLoc, offset)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    reqAnimRef.current = requestAnimationFrame(draw)

    return () => {
      if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current)
      gl.deleteProgram(program)
      gl.deleteTexture(texture)
      gl.deleteBuffer(positionBuffer)
    }
  }, [isPlaying, isLite, showSpectrogram, analyserNodeRef])

  if (isLite || !showSpectrogram) return null

  return (
    <canvas 
      ref={canvasRef} 
      className={className || "w-full h-full block bg-black"} 
    />
  )
})

