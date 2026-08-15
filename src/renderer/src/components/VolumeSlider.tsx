import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface VolumeSliderProps {
  volume: number;
  setVolume: (val: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({ volume, setVolume, audioRef }) => {
  const toggleMute = () => {
    if (volume === 0) {
      const prev = parseFloat(localStorage.getItem('player_volume_prev') || '1')
      setVolume(prev)
      if (audioRef.current) audioRef.current.volume = prev
    } else {
      localStorage.setItem('player_volume_prev', volume.toString())
      setVolume(0)
      if (audioRef.current) audioRef.current.volume = 0
    }
  }

  return (
    <div className="flex items-center gap-2 w-32">
      <button onClick={toggleMute} className="hover:text-white transition">
        {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.01" 
        value={volume} 
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setVolume(val);
          if (audioRef.current) audioRef.current.volume = val;
        }}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-theme-10 hover:accent-theme-10" 
        style={{ background: `linear-gradient(to right, var(--theme-10) ${volume * 100}%, var(--theme-30) ${volume * 100}%)` }} 
      />
    </div>
  );
};
