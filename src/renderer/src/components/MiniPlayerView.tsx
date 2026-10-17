import React from 'react'
import { Maximize2, SkipBack, Play, Pause, SkipForward } from 'lucide-react'
import { DynamicCoverArt } from './DynamicCoverArt'
import { usePlayerStore, useSettingsStore, useUIStore } from '../stores'
import { useLanguage } from '../locales'

interface MiniPlayerViewProps {
  handleToggleMiniPlayer: () => void
  handlePlayPause: () => void
  handleNext: () => void
  handlePrev: () => void
}

export const MiniPlayerView: React.FC<MiniPlayerViewProps> = ({
  handleToggleMiniPlayer,
  handlePlayPause,
  handleNext,
  handlePrev
}) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const themeColor = useUIStore((s) => s.themeColor)
  const appMode = useSettingsStore((s) => s.appMode)
  const streamPort = useSettingsStore((s) => s.streamPort)
  const { language } = useLanguage()

  const isLite = appMode === 'lite' || appMode === 'core'

  return (
    <div
      className="h-screen w-screen bg-zinc-950/90 backdrop-blur-md overflow-hidden flex items-center p-3 border border-theme-30 select-none cursor-move"
      style={{ backgroundColor: themeColor, WebkitAppRegion: 'drag' } as any}
    >
      {!isLite && (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />
      )}

      <div
        className="w-24 h-24 bg-theme-30 rounded-lg overflow-hidden shadow-xl flex-shrink-0 relative group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <DynamicCoverArt
          track={currentTrack}
          streamPort={streamPort}
          tier="md"
          isLite={isLite}
          smartAspect={true}
          fallbackIconSize={32}
          className="w-full h-full pointer-events-none"
        />
        <button
          onClick={handleToggleMiniPlayer}
          className="absolute top-1 left-1 bg-black/60 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition z-20 cursor-pointer"
          title={language === 'vi' ? 'Trở về chế độ đầy đủ' : 'Return to Standard Mode'}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="flex-1 ml-4 flex flex-col justify-center overflow-hidden pointer-events-none">
        <div className="truncate mb-2 pr-4">
          <h4 className="text-sm font-bold text-white truncate">
            {currentTrack ? currentTrack.title : "Mei's Radio"}
          </h4>
          <p className="text-xs text-zinc-400 truncate">
            {currentTrack
              ? Array.isArray(currentTrack.artists) && currentTrack.artists.length > 0
                ? currentTrack.artists.join(', ')
                : currentTrack.artist || (language === 'vi' ? 'Nghệ sĩ chưa rõ' : 'Unknown Artist')
              : language === 'vi'
                ? 'Sẵn sàng phát nhạc'
                : 'Ready to play'}
          </p>
        </div>

        <div
          className="flex items-center gap-3 pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button
            onClick={handlePrev}
            className="text-zinc-400 hover:text-white transition cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-full bg-theme-10 text-white flex items-center justify-center hover:scale-105 transition cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {isPlaying ? (
              <Pause size={16} className="fill-current" />
            ) : (
              <Play size={16} className="fill-current translate-x-[1px]" />
            )}
          </button>
          <button
            onClick={handleNext}
            className="text-zinc-400 hover:text-white transition cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
