import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Repeat } from 'lucide-react'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTranslation } from '../locales'
import { isDsdTrack } from '../utils/formatUtils'

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

// In-memory cache for fetched waveform peaks so switching tracks doesn't re-query
const waveformPeaksCache = new Map<string, number[]>()

// Deterministic aesthetic fallback waveform based on track seed (title, id, or path)
function generateFallbackPeaks(seedStr: string, count = 140): number[] {
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i)
    hash |= 0
  }
  const result: number[] = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    const wave =
      Math.sin(t * Math.PI * 6 + (Math.abs(hash) % 10)) * 0.32 +
      Math.cos(t * Math.PI * 14 + (Math.abs(hash) % 7)) * 0.22 +
      Math.sin(t * Math.PI * 2) * 0.26
    const pseudoRandom = Math.abs(Math.sin((i + 1) * (Math.abs(hash) + 13))) * 0.2
    const val = Math.max(0.15, Math.min(1, Math.abs(wave) + pseudoRandom))
    result.push(val)
  }
  return result
}

interface PlayerProgressBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
  currentTrack?: any
  crossfadeEnabled?: boolean
  crossfadeDuration?: number
  repeatMode?: number
  onNext?: () => void
  bitPerfectEnabled?: boolean
}

export const PlayerProgressBar: React.FC<PlayerProgressBarProps> = ({
  audioRef,
  currentTrack: propTrack,
  bitPerfectEnabled: propBitPerfect
}) => {
  const { t } = useTranslation()

  // Player Store
  const storeTrack = usePlayerStore((s) => s.currentTrack)
  const storeBitPerfect = usePlayerStore((s) => s.bitPerfectEnabled)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const loopA = usePlayerStore((s) => s.loopA)
  const loopB = usePlayerStore((s) => s.loopB)
  const setLoopA = usePlayerStore((s) => s.setLoopA)
  const setLoopB = usePlayerStore((s) => s.setLoopB)
  const clearABLoop = usePlayerStore((s) => s.clearABLoop)

  // Settings Store
  const waveformSeekbarEnabled = useSettingsStore((s) => s.waveformSeekbarEnabled)

  const currentTrack = propTrack !== undefined ? propTrack : storeTrack
  const bitPerfectEnabled = propBitPerfect !== undefined ? propBitPerfect : storeBitPerfect
  const isDsd = isDsdTrack(currentTrack)
  const useBassTime = bitPerfectEnabled || isDsd

  const [currentTime, setCurrentTime] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverPercent, setHoverPercent] = useState<number | null>(null)

  const waveformRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)
  const currentTimeRef = useRef(0)
  const loopARef = useRef<number | null>(loopA)
  const loopBRef = useRef<number | null>(loopB)

  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  useEffect(() => {
    loopARef.current = loopA
    loopBRef.current = loopB
  }, [loopA, loopB])

  const duration = currentTrack?.duration || 0
  const timePercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  // Reset time when track changes
  useEffect(() => {
    setCurrentTime(0)
  }, [currentTrack?.id, currentTrack?.filePath, currentTrack?.startTime])

  // --- Waveform Peaks Management ---
  const [peaks, setPeaks] = useState<number[]>([])

  useEffect(() => {
    if (!currentTrack) {
      setPeaks([])
      return
    }

    const start = currentTrack.startTime || 0
    const end = currentTrack.endTime || 0
    const cacheKey = `${currentTrack.filePath || currentTrack.id || currentTrack.title || 'default'}#${start}-${end}`
    if (waveformPeaksCache.has(cacheKey)) {
      setPeaks(waveformPeaksCache.get(cacheKey)!)
      return
    }

    // Immediately set smooth fallback
    const fallback = generateFallbackPeaks(cacheKey, 140)
    setPeaks(fallback)

    let isMounted = true

    // If local track with filePath, fetch accurate peaks via API
    const isLocal =
      currentTrack.filePath &&
      !currentTrack.filePath.startsWith('http://') &&
      !currentTrack.filePath.startsWith('https://')

    if (waveformSeekbarEnabled && isLocal && window.api?.getWaveformPeaks) {
      window.api
        .getWaveformPeaks(
          currentTrack.filePath,
          140,
          currentTrack.startTime,
          currentTrack.endTime
        )
        .then((fetchedPeaks: number[]) => {
          if (isMounted && Array.isArray(fetchedPeaks) && fetchedPeaks.length > 0) {
            waveformPeaksCache.set(cacheKey, fetchedPeaks)
            setPeaks(fetchedPeaks)
          }
        })
        .catch(() => {
          /* keep fallback */
        })
    }

    return () => {
      isMounted = false
    }
  }, [
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.startTime,
    currentTrack?.endTime,
    waveformSeekbarEnabled
  ])

  // --- A-B Loop Enforcement & Time Sync Effect ---
  useEffect(() => {
    if (useBassTime) {
      const onTimeListener = window.api?.onBassTime
      if (onTimeListener) {
        const cleanup = onTimeListener((val: number) => {
          if (isDraggingRef.current) return

          const la = loopARef.current
          const lb = loopBRef.current
          // Enforce A-B Loop in BASS mode
          if (la !== null && lb !== null && lb > la && val >= lb) {
            if (window.api?.bassSeek) {
              window.api.bassSeek(la)
            }
            setCurrentTime(la)
            return
          }

          setCurrentTime(val)
        })
        return () => {
          if (typeof cleanup === 'function') cleanup()
        }
      }
      return
    }

    // Standard HTML5 Audio mode
    let intervalId: any = null

    const trackStart = currentTrack?.startTime || 0

    const checkAndLoop = (rel: number) => {
      const la = loopARef.current
      const lb = loopBRef.current
      if (la !== null && lb !== null && lb > la && rel >= lb) {
        if (audioRef.current) {
          audioRef.current.currentTime = trackStart + la
        }
        setCurrentTime(la)
        return true
      }
      return false
    }

    const attachListeners = () => {
      const audio = audioRef.current
      if (!audio) return null

      const update = () => {
        if (isDraggingRef.current) return
        const cur = audio.currentTime || 0
        const rel = Math.max(0, cur - trackStart)
        if (!checkAndLoop(rel)) {
          setCurrentTime(rel)
        }
      }

      audio.addEventListener('timeupdate', update)
      audio.addEventListener('seeking', update)
      audio.addEventListener('seeked', update)
      audio.addEventListener('play', update)
      audio.addEventListener('pause', update)

      return () => {
        audio.removeEventListener('timeupdate', update)
        audio.removeEventListener('seeking', update)
        audio.removeEventListener('seeked', update)
        audio.removeEventListener('play', update)
        audio.removeEventListener('pause', update)
      }
    }

    let cleanupListeners = attachListeners()

    // Backup polling timer
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (!isDraggingRef.current && audioRef.current) {
          const cur = audioRef.current.currentTime || 0
          const rel = Math.max(0, cur - trackStart)
          if (!checkAndLoop(rel)) {
            setCurrentTime(rel)
          }
          if (!cleanupListeners && audioRef.current) {
            cleanupListeners = attachListeners()
          }
        }
      }, 200)
    }

    return () => {
      if (cleanupListeners) cleanupListeners()
      if (intervalId) clearInterval(intervalId)
    }
  }, [audioRef, useBassTime, isPlaying, currentTrack?.id, currentTrack?.filePath, currentTrack?.startTime])

  // --- Seek Commit Handler ---
  const commitSeek = useCallback(
    (targetTime: number) => {
      const clamped = Math.max(0, Math.min(duration, targetTime))
      if (useBassTime) {
        if (window.api?.bassSeek) {
          window.api.bassSeek(clamped)
        }
      } else if (audioRef.current) {
        const trackStart = currentTrack?.startTime || 0
        audioRef.current.currentTime = trackStart + clamped
      }
      setCurrentTime(clamped)
      setIsDragging(false)
    },
    [duration, useBassTime, audioRef, currentTrack?.startTime]
  )

  // --- Waveform Mouse / Touch Drag Scrubbing ---
  const getTimeFromEvent = useCallback(
    (clientX: number): number => {
      if (!waveformRef.current || duration <= 0) return 0
      const rect = waveformRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration]
  )

  const handleWaveformMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentTrack || duration <= 0) return
    setIsDragging(true)
    const newTime = getTimeFromEvent(e.clientX)
    setCurrentTime(newTime)

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const scrubTime = getTimeFromEvent(moveEvt.clientX)
      setCurrentTime(scrubTime)
    }

    const handleMouseUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      const finalTime = getTimeFromEvent(upEvt.clientX)
      commitSeek(finalTime)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleWaveformTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!currentTrack || duration <= 0 || !e.touches[0]) return
    setIsDragging(true)
    const newTime = getTimeFromEvent(e.touches[0].clientX)
    setCurrentTime(newTime)

    const handleTouchMove = (moveEvt: TouchEvent) => {
      if (!moveEvt.touches[0]) return
      const scrubTime = getTimeFromEvent(moveEvt.touches[0].clientX)
      setCurrentTime(scrubTime)
    }

    const handleTouchEnd = (endEvt: TouchEvent) => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      const touch = endEvt.changedTouches[0]
      const finalTime = touch ? getTimeFromEvent(touch.clientX) : currentTimeRef.current
      commitSeek(finalTime)
    }

    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
  }

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration <= 0) return
    const rect = waveformRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverPercent(ratio)
  }

  const handleWaveformMouseLeave = () => {
    setHoverPercent(null)
  }

  // --- Classic Range Slider Handlers ---
  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value))
  }

  const handleRangeCommit = () => {
    commitSeek(currentTime)
  }

  // --- A-B Loop Toggle Handler ---
  const handleToggleABLoop = () => {
    if (loopA === null) {
      // Set Point A
      setLoopA(currentTime)
    } else if (loopB === null) {
      // Set Point B
      if (currentTime > loopA) {
        setLoopB(currentTime)
      } else {
        setLoopB(loopA)
        setLoopA(currentTime)
      }
    } else {
      // Clear Loop
      clearABLoop()
    }
  }

  // Calculate Loop Percentages for Visual Indicators
  const loopAPercent = loopA !== null && duration > 0 ? (loopA / duration) * 100 : null
  const loopBPercent = loopB !== null && duration > 0 ? (loopB / duration) * 100 : null
  const hasActiveLoop = loopA !== null && loopB !== null && loopB > loopA

  // A-B Loop Pill Tooltip & Label
  const getABLoopTooltip = () => {
    if (loopA === null) {
      return `${t('abLoop.setPointA') || t('player.setPointA') || 'Set Point A'} (${formatDuration(currentTime)})`
    }
    if (loopB === null) {
      return `${t('abLoop.setPointB') || t('player.setPointB') || 'Set Point B'} (A: ${formatDuration(loopA)})`
    }
    return `${t('abLoop.clearLoop') || t('player.clearLoop') || 'Clear A-B Loop'} (${formatDuration(loopA)} ⇄ ${formatDuration(loopB)})`
  }

  return (
    <div className="w-full flex items-center gap-2.5 text-[11px] text-zinc-400 font-medium select-none">
      {/* Current Time Display */}
      <span className="w-9 sm:w-10 text-left shrink-0 tabular-nums font-sans text-zinc-300">
        {formatDuration(currentTime)}
      </span>

      {/* Main Seekbar Area */}
      <div className="flex-1 relative flex items-center min-w-0">
        {waveformSeekbarEnabled ? (
          /* --- Waveform Seekbar --- */
          <div
            ref={waveformRef}
            onMouseDown={handleWaveformMouseDown}
            onTouchStart={handleWaveformTouchStart}
            onMouseMove={handleWaveformMouseMove}
            onMouseLeave={handleWaveformMouseLeave}
            className={`w-full h-7 flex items-center gap-[2px] cursor-pointer relative py-1 rounded transition-opacity ${
              !currentTrack ? 'opacity-30 pointer-events-none' : 'hover:opacity-100'
            }`}
          >
            {/* Active A-B Loop Highlight Region Underlay */}
            {hasActiveLoop && loopAPercent !== null && loopBPercent !== null && (
              <div
                className="absolute inset-y-1 rounded bg-amber-400/15 border border-amber-400/40 pointer-events-none transition-all z-0"
                style={{
                  left: `${loopAPercent}%`,
                  width: `${Math.max(0, loopBPercent - loopAPercent)}%`
                }}
              />
            )}

            {/* Waveform Bars */}
            {peaks.map((peak, idx) => {
              const barPercent = (idx / peaks.length) * 100
              const barTime = (idx / peaks.length) * duration
              const isPlayed = barPercent <= timePercent
              const isInLoop =
                hasActiveLoop &&
                loopA !== null &&
                loopB !== null &&
                barTime >= loopA &&
                barTime <= loopB
              const isHoveredPreview = hoverPercent !== null && barPercent <= hoverPercent * 100

              // Dynamic Bar Heights: min 15%, max 100%
              const heightPercent = Math.max(15, Math.min(100, Math.round(peak * 100)))

              let barBg = 'rgba(255, 255, 255, 0.22)'
              if (isInLoop) {
                barBg = isPlayed ? '#f59e0b' : 'rgba(245, 158, 11, 0.6)'
              } else if (isPlayed) {
                barBg = 'var(--theme-10)'
              } else if (isHoveredPreview) {
                barBg = 'rgba(255, 255, 255, 0.45)'
              }

              return (
                <div
                  key={idx}
                  className="flex-1 rounded-full transition-all duration-75 pointer-events-none"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: barBg,
                    boxShadow: isInLoop && isPlayed ? '0 0 4px rgba(245, 158, 11, 0.5)' : undefined
                  }}
                />
              )
            })}

            {/* Point A Marker Pin */}
            {loopAPercent !== null && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-amber-400 z-10 pointer-events-none flex flex-col items-center"
                style={{ left: `${loopAPercent}%` }}
              >
                <span className="text-[8px] font-extrabold text-amber-950 bg-amber-400 px-1 rounded-sm -translate-y-3.5 shadow-sm leading-tight">
                  A
                </span>
              </div>
            )}

            {/* Point B Marker Pin */}
            {loopBPercent !== null && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-amber-400 z-10 pointer-events-none flex flex-col items-center"
                style={{ left: `${loopBPercent}%` }}
              >
                <span className="text-[8px] font-extrabold text-amber-950 bg-amber-400 px-1 rounded-sm -translate-y-3.5 shadow-sm leading-tight">
                  B
                </span>
              </div>
            )}

            {/* Hover Timestamp Tooltip */}
            {hoverPercent !== null && duration > 0 && (
              <div
                className="absolute -top-7 -translate-x-1/2 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-[10px] px-1.5 py-0.5 rounded shadow-lg pointer-events-none tabular-nums font-mono z-20"
                style={{ left: `${hoverPercent * 100}%` }}
              >
                {formatDuration(hoverPercent * duration)}
              </div>
            )}
          </div>
        ) : (
          /* --- Classic Range Slider Seekbar --- */
          <div className="relative w-full flex items-center">
            {/* Active A-B Loop Highlight Region */}
            {hasActiveLoop && loopAPercent !== null && loopBPercent !== null && (
              <div
                className="absolute h-1.5 rounded-full bg-amber-400/40 pointer-events-none z-0"
                style={{
                  left: `${loopAPercent}%`,
                  width: `${Math.max(0, loopBPercent - loopAPercent)}%`
                }}
              />
            )}

            {/* Point A Marker */}
            {loopAPercent !== null && (
              <div
                className="absolute w-[2px] h-3 bg-amber-400 z-10 pointer-events-none -translate-x-1/2"
                style={{ left: `${loopAPercent}%` }}
              />
            )}

            {/* Point B Marker */}
            {loopBPercent !== null && (
              <div
                className="absolute w-[2px] h-3 bg-amber-400 z-10 pointer-events-none -translate-x-1/2"
                style={{ left: `${loopBPercent}%` }}
              />
            )}

            <input
              type="range"
              min={0}
              max={Math.floor(duration || 0)}
              value={Math.floor(currentTime)}
              onChange={handleRangeChange}
              onWheel={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={handleRangeCommit}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={handleRangeCommit}
              disabled={!currentTrack}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-theme-10 hover:accent-theme-10 transition-all z-1"
              style={{
                background: `linear-gradient(to right, var(--theme-10) ${timePercent}%, var(--theme-30) ${timePercent}%)`
              }}
            />
          </div>
        )}
      </div>

      {/* Duration Display */}
      <span className="w-9 sm:w-10 text-right shrink-0 tabular-nums font-sans text-zinc-400">
        {currentTrack ? formatDuration(duration) : '0:00'}
      </span>

      {/* Compact A-B Loop Button / Pill */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleToggleABLoop}
          disabled={!currentTrack}
          title={getABLoopTooltip()}
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight border transition flex items-center gap-1 ${
            hasActiveLoop
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
              : loopA !== null
              ? 'bg-theme-10/20 text-theme-10 border-theme-10/40'
              : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700/50'
          }`}
        >
          <Repeat size={10} className={hasActiveLoop ? 'text-amber-400 animate-pulse' : ''} />
          {hasActiveLoop ? (
            <span>A⇄B</span>
          ) : loopA !== null ? (
            <span>A→</span>
          ) : (
            <span className="opacity-80">A-B</span>
          )}
        </button>

        {/* Quick Clear A-B Loop Button */}
        {(loopA !== null || loopB !== null) && (
          <button
            onClick={() => clearABLoop()}
            title={t('abLoop.clearLoop') || t('player.clearLoop') || 'Clear A-B Loop'}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
