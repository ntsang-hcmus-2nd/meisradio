import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Heart,
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Repeat1,
  Sparkles,
  Mic2
} from 'lucide-react'
import { DynamicCoverArt } from './DynamicCoverArt'
import { ArtistLinks } from './TrackListComponents'
import { PlayerProgressBar } from './PlayerProgressBar'
import { PlayerToolsMenu } from './PlayerToolsMenu'
import { VolumeSlider } from './VolumeSlider'
import {
  usePlayerStore,
  useUIStore,
  useSettingsStore,
  useAudioStore,
  useLibraryStore
} from '../stores'
import { useTranslation, useLanguage } from '../locales'
import { isDsdTrack, getDsdRateLabel, formatAudioSampleRate } from '../utils/formatUtils'
import { getTrackKey } from '../utils/trackStateUtils'
import { EASE_ENTER, EASE_EXIT } from './motion'

interface PlayerBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
  handlePlayPause: () => void
  handleNext: () => void
  handlePrev: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  handleToggleLyrics: () => void
  handleToggleQueue: () => void
  handleToggleMiniPlayer: () => void
  handleSetSleepTimer: (mode: any) => void
  navigateToArtist: (artistName: string) => void
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  audioRef,
  handlePlayPause,
  handleNext,
  handlePrev,
  toggleShuffle,
  toggleRepeat,
  handleToggleLyrics,
  handleToggleQueue,
  handleToggleMiniPlayer,
  handleSetSleepTimer,
  navigateToArtist
}) => {
  const { t } = useTranslation()
  const { language } = useLanguage()

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const bassOutParams = usePlayerStore((s) => s.bassOutParams)
  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled)
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration)
  const smartAutoplay = usePlayerStore((s) => s.smartAutoplay)
  const setSmartAutoplay = usePlayerStore((s) => s.setSmartAutoplay)
  const playQueue = usePlayerStore((s) => s.playQueue)

  const { favoriteTrackIds, toggleFavoriteId } = useLibraryStore()

  const {
    showLyricsPanel,
    showQueuePanel,
    showEQ,
    setShowEQ,
    showSpectrogramModal,
    setShowSpectrogramModal,
    showToast
  } = useUIStore()

  const appMode = useSettingsStore((s) => s.appMode)
  const streamPort = useSettingsStore((s) => s.streamPort)
  const bitPerfectType = useAudioStore((s) => s.bitPerfectType)

  const isLite = appMode === 'lite' || appMode === 'core'
  const isCore = appMode === 'core'

  const trackKey = currentTrack?.id || (currentTrack as any)?.filePath || 'none'

  return (
    <footer className="h-24 bg-theme-60 border-t border-theme-30 flex items-center justify-between px-3.5 sm:px-6 z-30 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-3 sm:gap-4 w-[28%] max-w-[260px] lg:max-w-[320px] min-w-0 z-10">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={trackKey}
            className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1"
            initial={isLite ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              isLite
                ? { opacity: 1 }
                : {
                    opacity: 0,
                    y: -8,
                    scale: 0.98,
                    transition: { duration: 0.15, ease: EASE_EXIT }
                  }
            }
            transition={isLite ? { duration: 0 } : { duration: 0.28, ease: EASE_ENTER }}
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-theme-30 rounded-md shadow-lg overflow-hidden flex-shrink-0">
              <DynamicCoverArt
                track={currentTrack}
                streamPort={streamPort}
                tier="md"
                isLite={isLite}
                smartAspect="auto"
                fallbackIconSize={24}
                className="w-full h-full"
              />
            </div>
            <div className="truncate min-w-0 flex-1">
              <h4 className="text-sm font-bold text-white leading-tight truncate">
                {currentTrack ? currentTrack.title : t('player.noTrack')}
              </h4>
              <div className="text-xs text-zinc-400 mt-1 truncate">
                {currentTrack ? (
                  <ArtistLinks
                    artists={currentTrack.artists}
                    fallbackArtist={currentTrack.artist || t('player.unknownArtist')}
                    onArtistClick={navigateToArtist}
                    className="text-xs text-zinc-400"
                  />
                ) : (
                  t('player.unknownArtist')
                )}
              </div>
              {currentTrack && (
                <div className="flex items-center gap-2 mt-1 truncate">
                  <div className="inline-flex items-center gap-1 bg-white/5 p-0.5 rounded-md shrink-0">
                    {isDsdTrack(currentTrack) ? (
                      <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        {getDsdRateLabel(currentTrack.sampleRate) || currentTrack.format || 'DSD'}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold text-theme-10 bg-theme-10/10 px-1.5 py-0.5 rounded">
                        {currentTrack.lossless ? 'Lossless' : currentTrack.format || 'MP3'}
                      </span>
                    )}
                    {currentTrack.bitDepth && (
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          isDsdTrack(currentTrack)
                            ? 'text-amber-400 bg-amber-500/10'
                            : 'text-blue-500 bg-blue-500/10'
                        }`}
                      >
                        {currentTrack.bitDepth}-BIT
                      </span>
                    )}
                    {(bitPerfectEnabled || isDsdTrack(currentTrack)) &&
                      (() => {
                        const activeAudioParams = bassOutParams
                        return (
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              activeAudioParams?.isDsd
                                ? 'text-amber-400 bg-amber-500/10'
                                : isDsdTrack(currentTrack)
                                  ? 'text-amber-400/90 bg-amber-500/10'
                                  : bitPerfectType === 'asio'
                                    ? 'text-purple-400 bg-purple-500/10'
                                    : 'text-emerald-400 bg-emerald-500/10'
                            }`}
                            title={
                              activeAudioParams?.samplerate
                                ? `${bitPerfectType === 'asio' ? 'ASIO Direct' : 'WASAPI Exclusive'}: ${activeAudioParams.samplerate}Hz • ${activeAudioParams.format || 'Direct'} (Bit-perfect)`
                                : isDsdTrack(currentTrack)
                                  ? 'BASS DSD Engine'
                                  : 'Direct bit-perfect stream to hardware DAC'
                            }
                          >
                            {activeAudioParams?.isDsd
                              ? bitPerfectType === 'asio'
                                ? 'DSD Native'
                                : 'DSD (DoP)'
                              : isDsdTrack(currentTrack)
                                ? activeAudioParams?.format || 'DSD Engine'
                                : bitPerfectType === 'asio'
                                  ? 'ASIO Direct'
                                  : 'WASAPI Direct'}
                          </span>
                        )
                      })()}
                  </div>
                  <span className="text-[10px] text-zinc-500 hidden md:inline truncate">
                    {bitPerfectEnabled && bassOutParams?.samplerate
                      ? isDsdTrack(currentTrack)
                        ? formatAudioSampleRate(bassOutParams.samplerate)
                        : bassOutParams.samplerate >= 1000
                          ? `${bassOutParams.samplerate / 1000}kHz`
                          : `${bassOutParams.samplerate}Hz`
                      : currentTrack.sampleRate
                        ? isDsdTrack(currentTrack)
                          ? formatAudioSampleRate(currentTrack.sampleRate)
                          : currentTrack.sampleRate >= 1000
                            ? `${currentTrack.sampleRate / 1000}kHz`
                            : `${currentTrack.sampleRate}Hz`
                        : ''}
                    {currentTrack.bitrate
                      ? ` | ${Math.round(currentTrack.bitrate / 1000)} kbps`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {currentTrack && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation()
              const trackKey = getTrackKey(currentTrack)
              if (!trackKey) return
              const isFav = favoriteTrackIds.includes(trackKey)
              toggleFavoriteId(trackKey)
              if (window.api?.toggleFavorite) {
                await window.api.toggleFavorite(trackKey, !isFav).catch(() => {})
              }
              showToast(
                !isFav
                  ? t('favorites.addedToFavorites') || 'Đã thêm vào yêu thích'
                  : t('favorites.removedFromFavorites') || 'Đã xóa khỏi yêu thích',
                'info',
                1500
              )
            }}
            className={`p-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
              getTrackKey(currentTrack) && favoriteTrackIds.includes(getTrackKey(currentTrack)!)
                ? 'text-rose-500 hover:text-rose-400 bg-rose-500/10'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
            title={
              getTrackKey(currentTrack) && favoriteTrackIds.includes(getTrackKey(currentTrack)!)
                ? t('favorites.removeFromFavorites') || 'Bỏ yêu thích'
                : t('favorites.addToFavorites') || 'Yêu thích'
            }
          >
            <Heart
              size={18}
              className={
                getTrackKey(currentTrack) && favoriteTrackIds.includes(getTrackKey(currentTrack)!)
                  ? 'fill-rose-500'
                  : ''
              }
            />
          </button>
        )}
      </div>

      {/* Cụm điều khiển & Thanh tiến trình nằm ở vị trí trung tâm đối xứng tuyệt đối */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44%] max-w-xl min-w-[260px] sm:min-w-[320px] px-2 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="w-full flex flex-col items-center pointer-events-auto">
          <div className="relative w-full flex items-center justify-center mb-1.5">
            <div className="flex items-center gap-3 sm:gap-5 justify-center">
              <button
                onClick={toggleShuffle}
                className={`transition cursor-pointer ${isShuffle ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}
              >
                <Shuffle size={17} />
              </button>
              <button
                onClick={handlePrev}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <SkipBack size={19} />
              </button>
              <button
                onClick={handlePlayPause}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                  currentTrack
                    ? 'bg-theme-10 text-white hover:scale-105'
                    : 'bg-theme-30 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isPlaying ? (
                  <Pause size={19} className="fill-current" />
                ) : (
                  <Play size={19} className="fill-current translate-x-[2px]" />
                )}
              </button>
              <button
                onClick={handleNext}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <SkipForward size={19} />
              </button>
              <button
                onClick={toggleRepeat}
                className={`transition cursor-pointer ${repeatMode > 0 ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}
              >
                {repeatMode === 2 ? <Repeat1 size={17} /> : <Repeat size={17} />}
              </button>
            </div>

            {/* Smart Autoplay Switch */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5"
              title={smartAutoplay ? t('player.smartAutoplay') : t('player.smartAutoplayDesc')}
            >
              <button
                type="button"
                onClick={() => setSmartAutoplay((prev) => !prev)}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  smartAutoplay ? 'bg-theme-10' : 'bg-zinc-700'
                }`}
                role="switch"
                aria-checked={smartAutoplay}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                    smartAutoplay ? 'translate-x-3 text-zinc-950' : 'translate-x-0 text-zinc-500'
                  }`}
                >
                  {smartAutoplay ? (
                    <Sparkles size={7} className="text-zinc-950 fill-current" />
                  ) : (
                    <div className="w-1 h-1 rounded-full bg-zinc-400" />
                  )}
                </span>
              </button>
            </div>
          </div>
          <PlayerProgressBar
            audioRef={audioRef}
            currentTrack={currentTrack}
            crossfadeEnabled={crossfadeEnabled}
            crossfadeDuration={crossfadeDuration}
            repeatMode={repeatMode}
            onNext={handleNext}
            bitPerfectEnabled={bitPerfectEnabled}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-3.5 w-[28%] max-w-[260px] lg:max-w-[320px] min-w-0 text-zinc-400 relative z-20">
        {!isCore && (
          <>
            {!isLite && (
              <button
                onClick={handleToggleLyrics}
                className={`transition p-1.5 rounded-lg cursor-pointer ${
                  showLyricsPanel
                    ? 'text-theme-10 bg-theme-10/10'
                    : 'hover:text-white hover:bg-theme-30/40 text-zinc-400'
                }`}
                title={t('player.lyrics')}
              >
                <Mic2 size={18} />
              </button>
            )}
            <PlayerToolsMenu
              showSpectrogramModal={showSpectrogramModal}
              setShowSpectrogramModal={setShowSpectrogramModal}
              isLite={isLite}
              handleToggleMiniPlayer={handleToggleMiniPlayer}
              showQueuePanel={showQueuePanel}
              handleToggleQueue={handleToggleQueue}
              showEQ={showEQ}
              setShowEQ={setShowEQ}
              onSetTimer={handleSetSleepTimer}
              playQueueLength={playQueue.length}
              t={t}
              language={language}
            />
          </>
        )}

        <VolumeSlider
          volume={volume}
          setVolume={setVolume}
          audioRef={audioRef}
          bitPerfectEnabled={bitPerfectEnabled}
        />
      </div>
    </footer>
  )
}
