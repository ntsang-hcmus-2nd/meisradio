import React, { useEffect, useRef } from 'react'

const compileShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('WebGL Shader Error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createWebGLProgram = (gl: WebGLRenderingContext, vsSource: string, fsSource: string) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
};

interface WebGLSpectrogramProps {
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>
  isPlaying: boolean
  activeView: string
}

export const WebGLSpectrogram = React.memo(({
  analyserNodeRef, isPlaying, activeView
}: WebGLSpectrogramProps) => {
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimSpectrogramRef = useRef<number>()

  useEffect(() => {
    if (activeView !== 'settings' || !spectrogramCanvasRef.current || !analyserNodeRef.current) return

    const canvas = spectrogramCanvasRef.current
    const gl = canvas.getContext('webgl', { alpha: false })
    if (!gl) return

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_history;
      uniform float u_offset;
      
      vec3 hsl2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
          return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
      }

      void main() {
          float x = fract(u_offset + v_uv.x);
          float y = v_uv.y * 0.6; 
          
          float val = texture2D(u_history, vec2(x, y)).r;
          
          if (val == 0.0) {
             gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          } else {
             float hue = (1.0 - val) * 240.0 / 360.0;
             gl_FragColor = vec4(hsl2rgb(vec3(hue, 1.0, 0.5)), 1.0);
          }
      }
    `;

    const program = createWebGLProgram(gl, vsSource, fsSource);
    if (!program) return;
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const analyser = analyserNodeRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const textureWidth = 1024;
    const textureHeight = bufferLength; 
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, textureWidth, textureHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const offsetLoc = gl.getUniformLocation(program, 'u_offset');
    
    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 30; // 30 FPS
    let currentColumn = 0;

    const draw = (now: number) => {
      reqAnimSpectrogramRef.current = requestAnimationFrame(draw);
      if (!isPlaying) return;

      const elapsed = now - lastDrawTime;
      if (elapsed < fpsInterval) return;
      lastDrawTime = now - (elapsed % fpsInterval);

      analyser.getByteFrequencyData(dataArray);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, currentColumn, 0, 1, bufferLength, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArray);

      currentColumn = (currentColumn + 1) % textureWidth;
      const offset = currentColumn / textureWidth;

      gl.uniform1f(offsetLoc, offset);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    reqAnimSpectrogramRef.current = requestAnimationFrame(draw);

    return () => {
      if (reqAnimSpectrogramRef.current) cancelAnimationFrame(reqAnimSpectrogramRef.current);
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
    }
  }, [isPlaying, activeView, analyserNodeRef])

  if (activeView !== 'settings') return null;

  return (
    <canvas ref={spectrogramCanvasRef} width={1024} height={276} className="w-full h-full" />
  )
})
