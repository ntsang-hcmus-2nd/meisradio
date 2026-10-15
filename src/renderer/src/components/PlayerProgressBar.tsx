import React, { useState, useEffect } from 'react'

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

import { usePlayerStore } from '../stores/playerStore'
import { isDsdTrack } from '../utils/formatUtils'

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
  const storeTrack = usePlayerStore((s) => s.currentTrack)
  const storeBitPerfect = usePlayerStore((s) => s.bitPerfectEnabled)

  const currentTrack = propTrack !== undefined ? propTrack : storeTrack
  const bitPerfectEnabled = propBitPerfect !== undefined ? propBitPerfect : storeBitPerfect
  const isDsd = isDsdTrack(currentTrack)
  const useBassTime = bitPerfectEnabled || isDsd
  const [currentTime, setCurrentTime] = useState(0)
  const [isDragging, setIsDragging] = useState(false) // Trạng thái kéo chuột

  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // Reset time when track changes
  useEffect(() => {
    setCurrentTime(0)
  }, [currentTrack?.id, currentTrack?.filePath])

  useEffect(() => {
    if (useBassTime) {
      const onTimeListener = window.api?.onBassTime
      if (onTimeListener) {
        const cleanup = onTimeListener((val: number) => {
          if (isDragging) return
          setCurrentTime(val)
        })
        return () => {
          if (typeof cleanup === 'function') cleanup()
        }
      }
      return
    }

    // Standard HTML5 Audio mode (non bit-perfect)
    let intervalId: any = null

    const attachListeners = () => {
      const audio = audioRef.current
      if (!audio) return null

      const update = () => {
        if (!isDragging) setCurrentTime(audio.currentTime || 0)
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

    // Backup polling timer (every 200ms while playing) in case audio element remounts or timeupdate is delayed
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (!isDragging && audioRef.current) {
          setCurrentTime(audioRef.current.currentTime || 0)
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
  }, [audioRef, isDragging, useBassTime, isPlaying, currentTrack?.id, currentTrack?.filePath])

  // Chỉ cập nhật giao diện thanh trượt (Không gọi API / Tua nhạc)
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value))
  }

  // Áp dụng lệnh Tua nhạc thực tế khi THẢ CHUỘT ra
  const handleSeekCommit = () => {
    if (useBassTime) {
      if (window.api?.bassSeek) {
        window.api.bassSeek(currentTime)
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = currentTime
    }
    setIsDragging(false)
  }

  const duration = currentTrack?.duration || 100
  const timePercent = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full flex items-center gap-3 text-[11px] text-zinc-400 font-medium">
      <span>{formatDuration(currentTime)}</span>
      <input 
        type="range" 
        min={0} max={Math.floor(duration || 0)} 
        value={Math.floor(currentTime)} 
        onChange={handleSeekChange}
        onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={handleSeekCommit}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={handleSeekCommit}
        disabled={!currentTrack} 
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-theme-10 hover:accent-theme-10 transition-all" 
        style={{ background: `linear-gradient(to right, var(--theme-10) ${timePercent}%, var(--theme-30) ${timePercent}%)` }} 
      />
      <span>{currentTrack ? formatDuration(duration) : '0:00'}</span>
    </div>
  )
}