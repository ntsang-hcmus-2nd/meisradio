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

interface WebGLVisualizerProps {
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>
  isPlaying: boolean
  isLite: boolean
  showVisualizer: boolean
}

export const WebGLVisualizer = React.memo(({
  analyserNodeRef, isPlaying, isLite, showVisualizer
}: WebGLVisualizerProps) => {
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimRef = useRef<number>()

  useEffect(() => {
    if (isLite || !isPlaying || !visualizerCanvasRef.current || !analyserNodeRef.current || !showVisualizer) return

    const canvas = visualizerCanvasRef.current
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) return

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
      uniform sampler2D u_audioData;
      void main() {
        float bands = 128.0;
        float bandX = floor(v_uv.x * bands) / bands;
        
        if (fract(v_uv.x * bands) > 0.75) {
           gl_FragColor = vec4(0.0);
           return;
        }
        
        float val = texture2D(u_audioData, vec2(bandX, 0.5)).r;
        
        if (v_uv.y < val) {
          gl_FragColor = vec4(16.0/255.0, 185.0/255.0, 129.0/255.0, val);
        } else {
          gl_FragColor = vec4(0.0);
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

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const analyser = analyserNodeRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 30; // 30 FPS

    const draw = (now: number) => {
      reqAnimRef.current = requestAnimationFrame(draw);
      
      const elapsed = now - lastDrawTime;
      if (elapsed < fpsInterval) return;
      lastDrawTime = now - (elapsed % fpsInterval);

      analyser.getByteFrequencyData(dataArray);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, bufferLength, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArray);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    reqAnimRef.current = requestAnimationFrame(draw);

    return () => {
      if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current);
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
    }
  }, [isPlaying, isLite, showVisualizer, analyserNodeRef])

  if (isLite || !showVisualizer) return null;

  return (
    <canvas 
      ref={visualizerCanvasRef} 
      width={1024} 
      height={150} 
      className={`w-full h-24 bg-transparent pointer-events-none absolute bottom-24 left-0 z-10 transition-opacity duration-500 opacity-20`} 
    />
  )
})
