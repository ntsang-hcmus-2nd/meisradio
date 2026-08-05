import React, { useState, useEffect } from 'react'

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

interface PlayerProgressBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null> // Thêm | null vào đây
  currentTrack: any
  crossfadeEnabled: boolean
  crossfadeDuration: number
  repeatMode: number
  onNext: () => void
}

export const PlayerProgressBar: React.FC<PlayerProgressBarProps> = ({
  audioRef, currentTrack, crossfadeEnabled, crossfadeDuration, repeatMode, onNext
}) => {
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      const cTime = audio.currentTime
      setCurrentTime(cTime)
      
      // Xử lý Crossfade ngay bên trong component nhỏ này
      if (crossfadeEnabled && currentTrack && currentTrack.duration > 0 && repeatMode !== 2) {
        if (currentTrack.duration - cTime <= crossfadeDuration && currentTrack.duration - cTime > crossfadeDuration - 0.5) {
          onNext()
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [audioRef, currentTrack, crossfadeEnabled, crossfadeDuration, repeatMode, onNext])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const duration = currentTrack?.duration || 100
  const timePercent = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full flex items-center gap-3 text-[11px] text-zinc-400 font-medium">
      <span>{formatDuration(currentTime)}</span>
      <input 
        type="range" min={0} max={duration} 
        value={currentTime} onChange={handleSeek} disabled={!currentTrack} 
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400" 
        style={{ background: `linear-gradient(to right, #10b981 ${timePercent}%, #27272a ${timePercent}%)` }} 
      />
      <span>{currentTrack ? formatDuration(duration) : '0:00'}</span>
    </div>
  )
}