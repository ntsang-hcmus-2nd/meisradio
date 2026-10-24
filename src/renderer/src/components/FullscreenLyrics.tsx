import React from 'react'
import { motion } from 'motion/react'
import { Minimize2 } from 'lucide-react'
import { DynamicCoverArt } from './DynamicCoverArt'
import { ArtistLinks } from './TrackListComponents'
import { SyncedLyricsList, LyricLine } from './SyncedLyricsList'
import { WebGLVisualizer } from './visualizers/WebGLVisualizer'
import { usePlayerStore, useUIStore, useSettingsStore } from '../stores'
import { useTranslation } from '../locales'
import { isDsdTrack, getDsdRateLabel, formatAudioSampleRate } from '../utils/formatUtils'
import { lyricsMax, useMotionReduced } from './motion'
import meiSingingPlaceholder from '../../../../resources/Mei singing.webp'

interface FullscreenLyricsProps {
  lyrics: LyricLine[]
  originalCover?: string | null
  audioRef: React.RefObject<HTMLAudioElement | null>
  analyserNodeRef: React.RefObject<AnalyserNode | null>
  navigateToArtist: (artistName: string) => void
  changeLyricOffset: (delta: number) => void
  resetLyricOffset: () => void
}

export const FullscreenLyrics: React.FC<FullscreenLyricsProps> = ({
  lyrics,
  originalCover,
  audioRef,
  analyserNodeRef,
  navigateToArtist,
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
  const streamPort = useSettingsStore((s) => s.streamPort)
  const isLite = appMode === 'lite' || appMode === 'core'
  const reduceMotion = useMotionReduced()

  // Escape key listener to exit fullscreen lyrics
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLyricsMaximized(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setIsLyricsMaximized])

  return (
    <motion.div
      className="flex-1 flex flex-col bg-transparent z-10 relative overflow-hidden"
      style={{ willChange: 'opacity, transform', transformOrigin: '100% 50%' }}
      initial={reduceMotion || isLite ? { opacity: 1, x: 0, scale: 1 } : lyricsMax.initial}
      animate={lyricsMax.animate}
      exit={lyricsMax.exit}
      transition={reduceMotion || isLite ? { duration: 0 } : lyricsMax.transition}
    >
      <div className="absolute top-6 sm:top-8 right-6 sm:right-8 flex items-center gap-3 z-50">
        <div className="flex items-center gap-1.5 text-xs bg-theme-60/80 backdrop-blur-md border border-theme-30/60 p-1.5 px-3 rounded-full shadow-lg">
          <span className="text-zinc-400 text-[11px] mr-1">{t('player.lyricOffset')}:</span>
          <button
            onClick={() => changeLyricOffset(-0.5)}
            title={t('player.lyricOffsetFast')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition cursor-pointer"
          >
            -0.5s
          </button>
          <button
            onClick={resetLyricOffset}
            title={t('player.lyricOffsetReset')}
            className={`px-2 py-0.5 rounded font-mono transition cursor-pointer ${
              lyricOffset !== 0
                ? 'bg-theme-10/20 text-theme-10 border border-theme-10/30'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {lyricOffset > 0 ? `+${lyricOffset}` : lyricOffset}s
          </button>
          <button
            onClick={() => changeLyricOffset(0.5)}
            title={t('player.lyricOffsetSlow')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition cursor-pointer"
          >
            +0.5s
          </button>
        </div>
        <button
          onClick={() => setIsLyricsMaximized(false)}
          title={t('common.minimize') || 'Thu nhỏ (Esc)'}
          className="text-zinc-400 hover:text-white bg-theme-30 p-2.5 sm:p-3 rounded-full hover:scale-110 transition-transform cursor-pointer shadow-lg"
        >
          <Minimize2 size={22} className="sm:w-6 sm:h-6" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 overflow-hidden">
        <div
          key={currentTrack?.id || (currentTrack as any)?.filePath || 'vinyl'}
          className={`w-1/2 flex flex-col items-center justify-center gap-6 ${!isLite ? 'animate-track-crossfade' : ''}`}
        >
          <div className="w-[min(28vw,38vh)] max-w-[420px] min-w-[240px] aspect-square rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden relative border-8 border-theme-30 flex items-center justify-center bg-zinc-900 group">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none z-10 rounded-full mix-blend-overlay"></div>
            <div className="w-12 h-12 bg-zinc-950 rounded-full absolute z-20 border-2 border-zinc-700 shadow-inner"></div>
            <DynamicCoverArt
              track={currentTrack}
              src={originalCover || currentTrack?.coverArt}
              highResSrc={originalCover || currentTrack?.coverArtHighRes}
              streamPort={streamPort}
              tier="xl"
              isLite={isLite}
              animateSpin={true}
              isPlaying={isPlaying}
              fallbackImageSrc={meiSingingPlaceholder}
              className="w-full h-full"
              imageClassName="w-full h-full object-cover rounded-full"
            />
          </div>

          {/* VISUALIZER DƯỚI ĐĨA THAN */}
          <div className="w-[min(28vw,38vh)] max-w-[420px] min-w-[240px] h-14 rounded-xl bg-zinc-950/50 border border-theme-30/50 p-2 overflow-hidden flex items-center justify-center shadow-inner">
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

          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-2">{currentTrack?.title}</h2>
            <ArtistLinks
              artists={currentTrack?.artists}
              fallbackArtist={currentTrack?.artist}
              onArtistClick={navigateToArtist}
              className="text-theme-10 text-lg"
            />
          </div>
        </div>

        <div
          key={`lyrics-${currentTrack?.id || (currentTrack as any)?.filePath || 'none'}`}
          className={`w-1/2 h-[70vh] overflow-y-auto px-8 space-y-8 text-center scrollbar-hide ${!isLite ? 'animate-track-crossfade' : ''}`}
        >
          <SyncedLyricsList
            lyrics={lyrics}
            audioRef={audioRef}
            isVinyl={true}
            noLyricsText={t('lyrics.noLyrics')}
          />
        </div>
      </div>
    </motion.div>
  )
}
