import React, { useEffect, useRef, useState } from 'react'
import { Radio, X, Loader2, Sparkles } from 'lucide-react'
import { useTranslation } from '../locales'

interface SpectrogramModalProps {
  isOpen: boolean
  onClose: () => void
  analyserNodeRef?: React.MutableRefObject<AnalyserNode | null>
  isPlaying?: boolean
  isLite?: boolean
  currentTrack?: any
  audioRef?: React.MutableRefObject<HTMLAudioElement | null>
}

// Fast Radix-2 In-Place Cooley-Tukey FFT
function computeFFT(re: Float32Array, im: Float32Array, n: number) {
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp
      temp = im[i]; im[i] = im[j]; im[j] = temp
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const angle = (-2 * Math.PI) / len
    const wStepRe = Math.cos(angle)
    const wStepIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < half; k++) {
        const pos1 = i + k
        const pos2 = i + k + half
        const uRe = re[pos1]
        const uIm = im[pos1]
        const vRe = re[pos2] * wRe - im[pos2] * wIm
        const vIm = re[pos2] * wIm + im[pos2] * wRe
        re[pos1] = uRe + vRe
        im[pos1] = uIm + vIm
        re[pos2] = uRe - vRe
        im[pos2] = uIm - vIm
        const nextWRe = wRe * wStepRe - wIm * wStepIm
        wIm = wRe * wStepIm + wIm * wStepRe
        wRe = nextWRe
      }
    }
  }
}

// Spek / Audacity style color palette
function getColor(norm: number): [number, number, number] {
  if (norm <= 0.02) return [10, 10, 24] // Black / Navy background
  
  if (norm < 0.2) {
    const t = norm / 0.2
    return [
      Math.floor(10 + t * 40),
      Math.floor(10 + t * 20),
      Math.floor(24 + t * 140)
    ] // Deep Indigo
  } else if (norm < 0.4) {
    const t = (norm - 0.2) / 0.2
    return [
      Math.floor(50 + t * 10),
      Math.floor(30 + t * 160),
      Math.floor(164 - t * 40)
    ] // Cyan / Teal
  } else if (norm < 0.65) {
    const t = (norm - 0.4) / 0.25
    return [
      Math.floor(60 + t * 195),
      Math.floor(190 + t * 50),
      Math.floor(124 - t * 124)
    ] // Green / Lime
  } else if (norm < 0.85) {
    const t = (norm - 0.65) / 0.2
    return [
      255,
      Math.floor(240 - t * 160),
      0
    ] // Yellow / Orange
  } else {
    const t = (norm - 0.85) / 0.15
    return [
      255,
      Math.floor(80 + t * 175),
      Math.floor(t * 255)
    ] // Orange / Red / White
  }
}

// In-memory cache for analyzed spectrograms
const spectrogramCache = new Map<string, ImageData>()

export const SpectrogramModal: React.FC<SpectrogramModalProps> = React.memo(({
  isOpen,
  onClose,
  currentTrack,
  audioRef
}) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; time: string; freq: string } | null>(null)

  const sampleRate = currentTrack?.sampleRate || 44100
  const maxDisplayFreq = sampleRate

  // Giải phóng tức thì bộ nhớ RAM và Cache khi đóng Spectrogram Modal
  const releaseSpectrogramMemory = () => {
    spectrogramCache.clear()
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
      canvasRef.current.width = 1
      canvasRef.current.height = 1
    }
    if (typeof (window as any).api?.clearMemoryCache === 'function') {
      (window as any).api.clearMemoryCache()
    }
    if (typeof (window as any).api?.forceGC === 'function') {
      (window as any).api.forceGC()
    }
  }

  useEffect(() => {
    return () => {
      releaseSpectrogramMemory()
    }
  }, [])

  const handleModalClose = () => {
    releaseSpectrogramMemory()
    onClose()
  }

  // Track playback time for playhead
  useEffect(() => {
    if (!isOpen) return
    const updatePlayhead = () => {
      if (audioRef?.current) {
        setCurrentTime(audioRef.current.currentTime || 0)
        setDuration(audioRef.current.duration || currentTrack?.duration || 0)
      }
    }
    const interval = setInterval(updatePlayhead, 100)
    updatePlayhead()
    return () => clearInterval(interval)
  }, [isOpen, audioRef, currentTrack])

  // Full-track STFT Spectrogram Generator
  useEffect(() => {
    if (!isOpen || !currentTrack) return

    const trackKey = currentTrack.filePath || currentTrack.id
    if (!trackKey) return

    let isCancelled = false

    const loadAudioBuffer = async (key: string): Promise<ArrayBuffer> => {
      // 1. Thử qua IPC electron bridge trước
      if (typeof (window as any).api?.readAudioBuffer === 'function') {
        try {
          const res = await (window as any).api.readAudioBuffer(key)
          if (res && res.success && res.buffer) {
            return res.buffer
          }
        } catch (ipcErr) {
          console.warn('[Spectrogram] IPC readAudioBuffer failed:', ipcErr)
        }
      }

      // 2. Fallback: Đọc bằng fetch trực tiếp với URL được encode chuẩn
      let url = key
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        let normalized = key.replace(/\\/g, '/')
        if (normalized.startsWith('file://')) {
          url = encodeURI(normalized)
        } else {
          if (!normalized.startsWith('/')) normalized = '/' + normalized
          url = encodeURI('file://' + normalized)
        }
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Không thể đọc file (${response.status} ${response.statusText})`)
      }
      return await response.arrayBuffer()
    }

    const generateSpectrogram = async () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const W = 1024
      const H = 400
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (spectrogramCache.has(trackKey)) {
        ctx.putImageData(spectrogramCache.get(trackKey)!, 0, 0)
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMsg(null)

      try {
        // 1. Lấy dữ liệu file âm thanh
        const arrayBuf = await loadAudioBuffer(trackKey)
        if (isCancelled || !arrayBuf) return

        // 2. Decode AudioBuffer qua Web Audio API
        const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuf.slice(0))
        if (isCancelled) {
          tempCtx.close()
          return
        }

        const channelData = audioBuffer.getChannelData(0)
        const totalSamples = channelData.length
        const actualSampleRate = audioBuffer.sampleRate || sampleRate
        const trackDuration = audioBuffer.duration
        setDuration(trackDuration)

        tempCtx.close()

        // 3. Chuẩn bị STFT
        const fftSize = 2048
        const halfFFT = fftSize / 2
        const hanning = new Float32Array(fftSize)
        for (let i = 0; i < fftSize; i++) {
          hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
        }

        // Hiển thị toàn bộ dải tần số cho đến Sample Rate của bài hát
        const targetMaxFreq = actualSampleRate
        const imageData = ctx.createImageData(W, H)
        const pixels = imageData.data

        const re = new Float32Array(fftSize)
        const im = new Float32Array(fftSize)

        // Phân tích từng cột dọc (Column-wise STFT)
        for (let x = 0; x < W; x++) {
          const sampleCenter = Math.floor((x / W) * (totalSamples - fftSize))
          if (sampleCenter < 0 || sampleCenter + fftSize > totalSamples) continue

          // Áp dụng cửa sổ Hanning
          for (let i = 0; i < fftSize; i++) {
            re[i] = channelData[sampleCenter + i] * hanning[i]
            im[i] = 0
          }

          computeFFT(re, im, fftSize)

          // Vẽ các điểm ảnh từ dưới lên (Y = 0 Hz ở đáy, Y = H ở đỉnh = Sample Rate)
          for (let y = 0; y < H; y++) {
            const freq = ((H - 1 - y) / (H - 1)) * targetMaxFreq
            
            let norm = 0
            if (freq <= actualSampleRate / 2) {
              const bin = Math.min(halfFFT - 1, Math.max(0, Math.floor((freq / (actualSampleRate / 2)) * halfFFT)))
              const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]) / halfFFT
              const dB = 20 * Math.log10(mag + 1e-6)
              // Chuẩn hóa dải động từ -85dB đến 0dB
              norm = Math.max(0, Math.min(1, (dB + 85) / 85))
            }

            const [r, g, b] = getColor(norm)
            const pixelIndex = (y * W + x) * 4
            pixels[pixelIndex] = r
            pixels[pixelIndex + 1] = g
            pixels[pixelIndex + 2] = b
            pixels[pixelIndex + 3] = 255
          }
        }

        if (!isCancelled) {
          ctx.putImageData(imageData, 0, 0)
          spectrogramCache.set(trackKey, imageData)
          setLoading(false)
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[Spectrogram] Lỗi phân tích:', err)
          setErrorMsg(err.message || 'Lỗi dựng phổ tần số')
          setLoading(false)
        }
      }
    }

    generateSpectrogram()

    return () => {
      isCancelled = true
    }
  }, [isOpen, currentTrack?.id, currentTrack?.filePath, sampleRate])

  if (!isOpen) return null

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // Xử lý click/tua bài hát trực tiếp trên Spectrogram
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetSeconds = clickRatio * (duration || currentTrack?.duration || 0)
    
    if (audioRef?.current) {
      audioRef.current.currentTime = targetSeconds
    }
    if ((window as any).api?.mpvSeek) {
      (window as any).api.mpvSeek(targetSeconds)
    }
    setCurrentTime(targetSeconds)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    const timeSecs = rx * (duration || currentTrack?.duration || 0)
    const freqHz = Math.round((1 - ry) * maxDisplayFreq)
    setHoverInfo({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      time: formatTime(timeSecs),
      freq: freqHz >= 1000 ? `${(freqHz / 1000).toFixed(1)} kHz` : `${freqHz} Hz`
    })
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // 8 mốc tần số từ Sample Rate bài hát về 0 Hz
  const numTicks = 8
  const yTicks = Array.from({ length: numTicks }, (_, i) => {
    const ratio = (numTicks - 1 - i) / (numTicks - 1)
    const freqHz = Math.round(ratio * maxDisplayFreq)
    if (freqHz === 0) return '0 Hz'
    if (freqHz >= 1000) return `${(freqHz / 1000).toFixed(1)} kHz`
    return `${freqHz} Hz`
  })

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[84vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-theme-10/10 text-theme-10 rounded-xl">
              <Radio size={22} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">{t('modals.spectrogram.title')}</h2>
                {currentTrack && (
                  <div className="inline-flex items-center gap-1.5 bg-white/5 px-2.5 py-0.5 rounded-md text-xs font-mono">
                    <span className="font-bold text-theme-10 uppercase">
                      {currentTrack.lossless ? 'Lossless' : (currentTrack.format || 'MP3')}
                    </span>
                    {currentTrack.bitDepth && (
                      <span className="text-blue-400 font-bold">
                        {currentTrack.bitDepth}-BIT
                      </span>
                    )}
                    <span className="text-zinc-400">
                      {maxDisplayFreq >= 1000 ? `${(maxDisplayFreq / 1000).toFixed(1)}kHz` : `${maxDisplayFreq}Hz`}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xl">
                {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : t('modals.spectrogram.noTrack')}
              </p>
            </div>
          </div>

          <button 
            onClick={handleModalClose} 
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
            title={t('modals.spectrogram.closeWindow')}
          >
            <X size={20} />
          </button>
        </div>

        {/* SPECTROGRAM DISPLAY AREA */}
        <div className="flex-1 relative flex bg-black overflow-hidden select-none">
          
          {/* Y-AXIS FREQUENCY LABELS (0Hz to Sample Rate) */}
          <div className="w-18 bg-zinc-950/90 border-r border-zinc-800 flex flex-col justify-between py-2 text-[11px] text-zinc-400 font-mono text-center z-10 shrink-0">
            {yTicks.map((label, idx) => (
              <span key={idx} className={idx === 0 ? "text-theme-10 font-bold" : ""}>
                {label}
              </span>
            ))}
          </div>

          {/* MAIN INTERACTIVE SPECTROGRAM CANVAS CONTAINER */}
          <div 
            className="flex-1 relative h-full cursor-crosshair overflow-hidden group"
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverInfo(null)}
          >
            <canvas 
              ref={canvasRef} 
              className="w-full h-full block bg-[#0a0a18]" 
            />

            {/* LOADING SPINNER */}
            {loading && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                <Loader2 size={36} className="text-theme-10 animate-spin" />
                <span className="text-zinc-300 text-sm font-medium">{t('modals.spectrogram.generating')}</span>
              </div>
            )}

            {/* ERROR MESSAGE */}
            {errorMsg && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-30 p-6 text-center">
                <span className="text-rose-400 text-sm font-semibold">{t('modals.spectrogram.errorPrefix')}{errorMsg}</span>
                <span className="text-zinc-500 text-xs">{t('modals.spectrogram.ensureLocalFile')}</span>
              </div>
            )}

            {/* REAL-TIME PLAYHEAD LINE */}
            {!loading && !errorMsg && duration > 0 && (
              <div 
                className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_#ffffff] pointer-events-none z-20 transition-all duration-75"
                style={{ left: `${progressPercent}%` }}
              >
                <div className="absolute -top-1 -translate-x-1/2 bg-white text-zinc-950 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                  {formatTime(currentTime)}
                </div>
              </div>
            )}

            {/* HOVER TOOLTIP & CROSSHAIR */}
            {hoverInfo && !loading && (
              <>
                <div 
                  className="absolute top-0 bottom-0 w-[1px] bg-white/30 pointer-events-none z-10"
                  style={{ left: `${hoverInfo.x}px` }}
                />
                <div 
                  className="absolute left-0 right-0 h-[1px] bg-white/30 pointer-events-none z-10"
                  style={{ top: `${hoverInfo.y}px` }}
                />
                <div 
                  className="absolute bg-zinc-900/90 text-white border border-zinc-700 text-[11px] font-mono px-2 py-1 rounded pointer-events-none z-30 shadow-lg"
                  style={{ 
                    left: Math.min(hoverInfo.x + 12, 750), 
                    top: Math.max(hoverInfo.y - 30, 10) 
                  }}
                >
                  ⏱ {hoverInfo.time} | ⚡ {hoverInfo.freq}
                </div>
              </>
            )}
          </div>
        </div>

        {/* X-AXIS TIME SCALE */}
        <div className="h-6 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between px-16 text-[10px] text-zinc-500 font-mono shrink-0">
          <span>0:00</span>
          <span>{formatTime(duration * 0.25)}</span>
          <span>{formatTime(duration * 0.5)}</span>
          <span>{formatTime(duration * 0.75)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* MODAL FOOTER NOTE */}
        <div className="p-3.5 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-theme-10" />
            <span>{t('modals.spectrogram.seekInstruction')}</span>
          </div>
          <p className="text-zinc-500 italic">
            {t('modals.spectrogram.intensityLegend')}
          </p>
        </div>

      </div>
    </div>
  )
})
