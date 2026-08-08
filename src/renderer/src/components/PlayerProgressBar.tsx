import React, { useState, useEffect } from 'react'

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

interface PlayerProgressBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
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
  const [isDragging, setIsDragging] = useState(false) // Trạng thái kéo chuột

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      // TỐI ƯU HÓA: Ngưng cập nhật UI từ Audio nếu người dùng đang dùng tay kéo thanh trượt
      if (isDragging) return; 

      const cTime = audio.currentTime
      setCurrentTime(cTime)
      
      if (crossfadeEnabled && currentTrack && currentTrack.duration > 0 && repeatMode !== 2) {
        if (currentTrack.duration - cTime <= crossfadeDuration && currentTrack.duration - cTime > crossfadeDuration - 0.5) {
          onNext()
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [audioRef, currentTrack, crossfadeEnabled, crossfadeDuration, repeatMode, onNext, isDragging])

  // Chỉ cập nhật giao diện thanh trượt (Không gọi API / Tua nhạc)
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value))
  }

  // Áp dụng lệnh Tua nhạc thực tế khi THẢ CHUỘT ra
  const handleSeekCommit = () => {
    if (audioRef.current) {
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
        type="range" min={0} max={duration} 
        value={currentTime} 
        onChange={handleSeekChange} 
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={handleSeekCommit}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={handleSeekCommit}
        disabled={!currentTrack} 
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400" 
        style={{ background: `linear-gradient(to right, #10b981 ${timePercent}%, #27272a ${timePercent}%)` }} 
      />
      <span>{currentTrack ? formatDuration(duration) : '0:00'}</span>
    </div>
  )
}