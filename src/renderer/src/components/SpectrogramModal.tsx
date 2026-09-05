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

import { toMediaUrl } from '../utils/mediaUrl'

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
  const workerRef = useRef<Worker | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; time: string; freq: string } | null>(null)
  const [detectedSampleRate, setDetectedSampleRate] = useState<number>(currentTrack?.sampleRate || 44100)
  const [detectedBitDepth, setDetectedBitDepth] = useState<number | undefined>(currentTrack?.bitDepth)

  const activeSampleRate = detectedSampleRate || currentTrack?.sampleRate || 44100
  // Dải tần số cực đại theo định lý Nyquist là Sample Rate / 2 (ví dụ 96kHz -> 48kHz, 48kHz -> 24kHz)
  const nyquistFreq = Math.round(activeSampleRate / 2)

  // Cập nhật khi currentTrack thay đổi
  useEffect(() => {
    if (currentTrack?.sampleRate) {
      setDetectedSampleRate(currentTrack.sampleRate)
    }
    if (currentTrack?.bitDepth) {
      setDetectedBitDepth(currentTrack.bitDepth)
    }
  }, [currentTrack?.sampleRate, currentTrack?.bitDepth, currentTrack?.id])

  // Giải phóng tức thì bộ nhớ RAM và Cache khi đóng Spectrogram Modal
  const releaseSpectrogramMemory = () => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
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

    const loadAudioData = async (key: string): Promise<{ buffer: ArrayBuffer; sampleRate?: number; bitDepth?: number }> => {
      // 1. Thử qua IPC electron bridge trước để lấy buffer + metadata gốc
      if (typeof (window as any).api?.readAudioBuffer === 'function') {
        try {
          const res = await (window as any).api.readAudioBuffer(key)
          if (res && res.success && res.buffer) {
            return {
              buffer: res.buffer,
              sampleRate: res.sampleRate,
              bitDepth: res.bitDepth
            }
          }
        } catch (ipcErr) {
          console.warn('[Spectrogram] IPC readAudioBuffer failed:', ipcErr)
        }
      }

      // 2. Fallback: Đọc bằng fetch trực tiếp với media:// URL
      const url = toMediaUrl(key)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Không thể đọc file (${response.status} ${response.statusText})`)
      }
      const buffer = await response.arrayBuffer()
      return { buffer }
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
        // 1. Lấy dữ liệu file âm thanh và sampleRate gốc từ metadata
        const audioData = await loadAudioData(trackKey)
        if (isCancelled || !audioData?.buffer) return

        const fileSampleRate = audioData.sampleRate || currentTrack.sampleRate || 44100
        if (audioData.sampleRate) setDetectedSampleRate(audioData.sampleRate)
        if (audioData.bitDepth) setDetectedBitDepth(audioData.bitDepth)

        // 2. Decode AudioBuffer qua OfflineAudioContext để bảo toàn sample rate gốc (không bị Chromium downsample về 48kHz)
        let audioBuffer: AudioBuffer
        try {
          const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
          const decodeCtx = new OfflineCtxClass(1, 1, fileSampleRate)
          audioBuffer = await decodeCtx.decodeAudioData(audioData.buffer.slice(0))
        } catch (_offlineErr) {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
          const tempCtx = new AudioCtxClass()
          audioBuffer = await tempCtx.decodeAudioData(audioData.buffer.slice(0))
          try { tempCtx.close() } catch (_c) {}
        }

        if (isCancelled) return

        const actualSampleRate = audioBuffer.sampleRate || fileSampleRate
        setDetectedSampleRate(actualSampleRate)

        const trackDuration = audioBuffer.duration
        setDuration(trackDuration)

        // 3. Phân tích phổ STFT bằng Web Worker trên tiến trình nền (0% UI jank)
        if (workerRef.current) {
          workerRef.current.terminate()
          workerRef.current = null
        }

        const worker = new Worker(new URL('../workers/spectrogram.worker.ts', import.meta.url), { type: 'module' })
        workerRef.current = worker

        worker.onmessage = (e) => {
          if (isCancelled) {
            worker.terminate()
            return
          }
          if (e.data.success && e.data.pixels) {
            const pixelsArray = new Uint8ClampedArray(e.data.pixels)
            const imgData = new ImageData(pixelsArray, W, H)
            ctx.putImageData(imgData, 0, 0)
            spectrogramCache.set(trackKey, imgData)
            setLoading(false)
          } else {
            setErrorMsg(e.data.error || 'Lỗi dựng phổ tần số')
            setLoading(false)
          }
          worker.terminate()
          if (workerRef.current === worker) {
            workerRef.current = null
          }
        }

        worker.onerror = (err) => {
          if (!isCancelled) {
            setErrorMsg(err.message || 'Lỗi dựng phổ tần số từ Worker')
            setLoading(false)
          }
          worker.terminate()
          if (workerRef.current === worker) {
            workerRef.current = null
          }
        }

        const rawChannel = audioBuffer.getChannelData(0)
        const channelCopy = new Float32Array(rawChannel)
        worker.postMessage(
          { channelData: channelCopy, width: W, height: H, sampleRate: actualSampleRate, fftSize: 2048 },
          [channelCopy.buffer]
        )
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
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [isOpen, currentTrack?.id, currentTrack?.filePath, currentTrack?.sampleRate])

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
    const freqHz = Math.round((1 - ry) * nyquistFreq)
    setHoverInfo({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      time: formatTime(timeSecs),
      freq: freqHz >= 1000 ? `${(freqHz / 1000).toFixed(1)} kHz` : `${freqHz} Hz`
    })
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // 8 mốc tần số từ Tần số Nyquist về 0 Hz (chuẩn Audacity / Spek)
  const numTicks = 8
  const yTicks = Array.from({ length: numTicks }, (_, i) => {
    const ratio = (numTicks - 1 - i) / (numTicks - 1)
    const freqHz = Math.round(ratio * nyquistFreq)
    if (freqHz === 0) return '0 Hz'
    if (freqHz >= 1000) {
      const khz = freqHz / 1000
      return Number.isInteger(khz) ? `${khz} kHz` : `${khz.toFixed(1)} kHz`
    }
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
                    {(detectedBitDepth || currentTrack.bitDepth) && (
                      <span className="text-blue-400 font-bold">
                        {detectedBitDepth || currentTrack.bitDepth}-BIT
                      </span>
                    )}
                    <span className="text-zinc-400">
                      {activeSampleRate >= 1000 ? `${(activeSampleRate / 1000).toFixed(1).replace('.0', '')}kHz` : `${activeSampleRate}Hz`}
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
