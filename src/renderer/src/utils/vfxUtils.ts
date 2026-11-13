import { parseColorToRgb } from './colorUtils'

/**
 * Computes UV scale factors so an image of size `imgW x imgH` covers a
 * viewport of size `viewW x viewH` without stretching (`background-size: cover`).
 */
export function computeCoverUvScale(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number
): [number, number] {
  if (
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    !Number.isFinite(viewW) ||
    !Number.isFinite(viewH) ||
    imgW <= 0 ||
    imgH <= 0 ||
    viewW <= 0 ||
    viewH <= 0
  ) {
    return [1, 1]
  }

  const imgAspect = imgW / imgH
  const viewAspect = viewW / viewH

  if (imgAspect > viewAspect) {
    return [viewAspect / imgAspect, 1]
  }
  return [1, imgAspect / viewAspect]
}

/**
 * Converts a CSS `#hex` or `rgb(...)` string into normalized `[r, g, b]` floats in `[0, 1]`.
 */
export function colorToGlRgb(
  cssColor: string,
  fallback: [number, number, number] = [0.063, 0.725, 0.506]
): [number, number, number] {
  const rgb = parseColorToRgb(cssColor)
  if (!rgb) return fallback
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255]
}

/**
 * Steps down VFX resolution scale when average frame time exceeds 38ms (< ~26 FPS).
 */
export function computeNextVfxScale(avgFrameMs: number, currentScale: number): number {
  if (avgFrameMs > 38) {
    return Math.max(0.5, +(currentScale - 0.25).toFixed(2))
  }
  return currentScale
}

/**
 * Compiles a WebGL vertex or fragment shader, returning null on failure.
 */
export function compileWebGLShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export interface QuadProgramResources {
  program: WebGLProgram
  vbo: WebGLBuffer
  aPosLoc: number
}

/**
 * Compiles and links a fullscreen quad shader program, binds its vertex buffer
 * and position attribute, and cleans up all intermediate GL objects on failure.
 */
export function createQuadProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
  posAttribName = 'a_pos'
): QuadProgramResources | null {
  const vertShader = compileWebGLShader(gl, gl.VERTEX_SHADER, vertSrc)
  const fragShader = compileWebGLShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const program = vertShader && fragShader ? gl.createProgram() : null

  if (!vertShader || !fragShader || !program) {
    if (vertShader) gl.deleteShader(vertShader)
    if (fragShader) gl.deleteShader(fragShader)
    if (program) gl.deleteProgram(program)
    return null
  }

  gl.attachShader(program, vertShader)
  gl.attachShader(program, fragShader)
  gl.linkProgram(program)
  gl.detachShader(program, vertShader)
  gl.detachShader(program, fragShader)
  gl.deleteShader(vertShader)
  gl.deleteShader(fragShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  const aPosLoc = gl.getAttribLocation(program, posAttribName)
  if (aPosLoc < 0) {
    gl.deleteProgram(program)
    return null
  }

  const vbo = gl.createBuffer()
  if (!vbo) {
    gl.deleteProgram(program)
    return null
  }

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(aPosLoc)
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

  return { program, vbo, aPosLoc }
}
