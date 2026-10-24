import React from 'react'
import { motion } from 'motion/react'
import { Mic2, Maximize2 } from 'lucide-react'
import { SyncedLyricsList, LyricLine } from './SyncedLyricsList'
import { WebGLVisualizer } from './visualizers/WebGLVisualizer'
import { usePlayerStore, useUIStore, useSettingsStore } from '../stores'
import { useTranslation } from '../locales'
import { isDsdTrack, getDsdRateLabel, formatAudioSampleRate } from '../utils/formatUtils'
import { drawerSlide, useMotionReduced } from './motion'

interface SideLyricsPanelProps {
  lyrics: LyricLine[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  analyserNodeRef: React.RefObject<AnalyserNode | null>
  changeLyricOffset: (delta: number) => void
  resetLyricOffset: () => void
}

export const SideLyricsPanel: React.FC<SideLyricsPanelProps> = ({
  lyrics,
  audioRef,
  analyserNodeRef,
  changeLyricOffset,
  resetLyricOffset
}) => {
  const { t } = useTranslation()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const bassOutParams = usePlayerStore((s) => s.bassOutParams)
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)
  const setIsLyricsMaximized = useUIStore((s) => s.setIsLyricsMaximized)
  const appMode = useSettingsStore((s) => s.appMode)
  const isLite = appMode === 'lite' || appMode === 'core'
  const reduceMotion = useMotionReduced()

  return (
    <motion.div
      layout
      className="w-[30vw] min-w-[320px] max-w-[480px] border-l border-theme-30/50 bg-theme-60/40 backdrop-blur-sm flex flex-col"
      initial={reduceMotion ? { opacity: 1, x: 0 } : drawerSlide.initial}
      animate={drawerSlide.animate}
      exit={drawerSlide.exit}
      transition={reduceMotion ? { duration: 0 } : drawerSlide.transition}
    >
      <div className="p-4 flex items-center justify-between border-b border-theme-30/50">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Mic2 size={16} className="text-theme-10" /> {t('lyrics.title')}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500 text-[10px]">{t('player.lyricOffset')}:</span>
          <button
            onClick={() => changeLyricOffset(-0.5)}
            title={t('player.lyricOffsetFast')}
            className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-mono transition cursor-pointer"
          >
            -0.5s
          </button>
          <button
            onClick={resetLyricOffset}
            title={t('player.lyricOffsetReset')}
            className={`px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
              lyricOffset !== 0
                ? 'bg-theme-10/20 text-theme-10 border border-theme-10/30'
                : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            {lyricOffset > 0 ? `+${lyricOffset}` : lyricOffset}s
          </button>
          <button
            onClick={() => changeLyricOffset(0.5)}
            title={t('player.lyricOffsetSlow')}
            className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-mono transition cursor-pointer"
          >
            +0.5s
          </button>
          <button
            onClick={() => setIsLyricsMaximized(true)}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-theme-30 ml-1 cursor-pointer"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-center">
        <div
          key={currentTrack?.id || (currentTrack as any)?.filePath || 'no-track'}
          className={`${!isLite ? 'animate-track-crossfade' : ''}`}
        >
          <SyncedLyricsList
            lyrics={lyrics}
            audioRef={audioRef}
            noLyricsText={t('lyrics.noLyrics')}
          />
        </div>
      </div>
      <div className="p-3 border-t border-theme-30/50 bg-zinc-950/40 h-16 shrink-0 w-full overflow-hidden flex items-center justify-center">
        {bitPerfectEnabled || isDsdTrack(currentTrack) ? (
          <div
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${
              isDsdTrack(currentTrack)
                ? 'text-amber-400/90 bg-amber-500/10 border-amber-500/20'
                : 'text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isDsdTrack(currentTrack) ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
            />
            <span>
              {isDsdTrack(currentTrack)
                ? `${getDsdRateLabel(currentTrack?.sampleRate) || 'DSD'} Direct Stream`
                : 'Bit-perfect Direct Stream'}{' '}
              {bassOutParams?.samplerate
                ? `(${
                    isDsdTrack(currentTrack)
                      ? formatAudioSampleRate(bassOutParams.samplerate!)
                      : bassOutParams.samplerate! >= 1000
                        ? `${bassOutParams.samplerate! / 1000}kHz`
                        : `${bassOutParams.samplerate!}Hz`
                  })`
                : '(Bypass DSP)'}
            </span>
          </div>
        ) : (
          <WebGLVisualizer
            analyserNodeRef={analyserNodeRef}
            isPlaying={isPlaying}
            isLite={isLite}
            showVisualizer={true}
          />
        )}
      </div>
    </motion.div>
  )
}
