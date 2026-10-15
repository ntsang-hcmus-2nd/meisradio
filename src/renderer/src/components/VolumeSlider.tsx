import React from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { usePlayerStore } from '../stores/playerStore'
import { sliderToGain } from '../utils/audioUtils'

interface VolumeSliderProps {
  volume?: number
  setVolume?: (val: number) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
  bitPerfectEnabled?: boolean
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({ 
  volume: propVolume, 
  setVolume: propSetVolume, 
  audioRef, 
  bitPerfectEnabled: propBitPerfect 
}) => {
  const storeVolume = usePlayerStore((s) => s.volume)
  const storeSetVolume = usePlayerStore((s) => s.setVolume)
  const storeBitPerfect = usePlayerStore((s) => s.bitPerfectEnabled)

  const volume = propVolume !== undefined ? propVolume : storeVolume
  const setVolume = propSetVolume || storeSetVolume
  const bitPerfectEnabled = propBitPerfect !== undefined ? propBitPerfect : storeBitPerfect
  const setHardwareVolume = (v: number) => {
    if ((window as any).api?.bassSetVolume) {
      (window as any).api.bassSetVolume(v)
    }
  }

  const toggleMute = () => {
    if (volume === 0) {
      const prev = parseFloat(localStorage.getItem('player_volume_prev') || '1')
      setVolume(prev)
      const gain = sliderToGain(prev)
      if (audioRef.current) audioRef.current.volume = gain
      if (bitPerfectEnabled) {
        setHardwareVolume(gain)
      }
    } else {
      localStorage.setItem('player_volume_prev', volume.toString())
      setVolume(0)
      if (audioRef.current) audioRef.current.volume = 0
      if (bitPerfectEnabled) {
        setHardwareVolume(0)
      }
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY < 0 ? 0.05 : -0.05
    const newVol = Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100))
    setVolume(newVol)
    const gain = sliderToGain(newVol)
    if (audioRef.current) audioRef.current.volume = gain
    if (bitPerfectEnabled) {
      setHardwareVolume(gain)
    }
  }

  return (
    <div className="flex items-center gap-2 w-32" onWheel={handleWheel}>
      <button onClick={toggleMute} className="hover:text-white transition cursor-pointer" title={volume === 0 ? "Bật tiếng" : "Tắt tiếng"}>
        {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.01" 
        value={volume} 
        onChange={(e) => {
          const val = parseFloat(e.target.value)
          setVolume(val)
          const gain = sliderToGain(val)
          if (audioRef.current) audioRef.current.volume = gain
          if (bitPerfectEnabled) {
            setHardwareVolume(gain)
          }
        }}
        onWheel={handleWheel}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-theme-10 hover:accent-theme-10" 
        style={{ background: `linear-gradient(to right, var(--theme-10) ${volume * 100}%, var(--theme-30) ${volume * 100}%)` }} 
        title={`${Math.round(volume * 100)}%`}
      />
    </div>
  )
}
