import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  LayoutGrid,
  Radio,
  PictureInPicture2,
  List,
  Sliders,
  Timer,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { usePlayerStore } from '../stores/playerStore'
import { overlayFade, useMotionReduced } from './motion'

export interface PlayerToolsMenuProps {
  showSpectrogramModal: boolean
  setShowSpectrogramModal: (show: boolean) => void
  isLite: boolean
  handleToggleMiniPlayer: () => void
  showQueuePanel: boolean
  handleToggleQueue: () => void
  showEQ: boolean
  setShowEQ: (val: boolean | ((prev: boolean) => boolean)) => void
  onSetTimer: (mode: 'off' | '15' | '30' | '45' | '60' | 'end_of_track') => void
  playQueueLength?: number
  t: (key: string, params?: any) => string
  language: string
}

export const PlayerToolsMenu: React.FC<PlayerToolsMenuProps> = React.memo(
  ({
    showSpectrogramModal,
    setShowSpectrogramModal,
    isLite,
    handleToggleMiniPlayer,
    showQueuePanel,
    handleToggleQueue,
    showEQ,
    setShowEQ,
    onSetTimer,
    playQueueLength = 0,
    t,
    language
  }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [timerExpanded, setTimerExpanded] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode)
    const sleepTimerRemaining = usePlayerStore((s) => s.sleepTimerRemaining)
    const reduceMotion = useMotionReduced()

    const hasActiveFeature =
      showQueuePanel || showEQ || showSpectrogramModal || sleepTimerMode !== 'off'

    // Click outside listener
    useEffect(() => {
      if (!isOpen) return
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setIsOpen(false)
        }
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }, [isOpen])

    // Timer options definition
    const timerOptions = [
      { mode: 'off' as const, label: t('player.sleepTimerOff') },
      { mode: '15' as const, label: t('player.sleepTimer15') },
      { mode: '30' as const, label: t('player.sleepTimer30') },
      { mode: '45' as const, label: t('player.sleepTimer45') },
      { mode: '60' as const, label: t('player.sleepTimer60') },
      { mode: 'end_of_track' as const, label: t('player.sleepTimerEndTrack') }
    ]

    return (
      <div className="relative" ref={menuRef}>
        {/* Trigger Button */}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className={`transition p-1.5 rounded-lg flex items-center gap-1 cursor-pointer ${
            isOpen || hasActiveFeature
              ? 'text-theme-10 bg-theme-10/10'
              : 'text-zinc-400 hover:text-white hover:bg-theme-30/40'
          }`}
          title={t('player.toolsMenu')}
        >
          <LayoutGrid size={18} />
          {sleepTimerMode !== 'off' && (
            <span className="text-[10px] font-mono font-bold leading-none bg-theme-10/20 text-theme-10 px-1 py-0.5 rounded">
              {sleepTimerMode === 'end_of_track'
                ? language === 'vi'
                  ? 'Bài'
                  : 'Trk'
                : `${Math.ceil((sleepTimerRemaining || 0) / 60)}m`}
            </span>
          )}
        </button>

        {/* Popover Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="absolute bottom-full right-0 mb-3 w-64 max-h-[calc(100vh-7.5rem)] overflow-y-auto no-scrollbar bg-zinc-900/95 border border-theme-30/70 backdrop-blur-xl rounded-2xl p-2 shadow-2xl z-50 text-xs space-y-1 select-none"
              initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
              animate={overlayFade.animate}
              exit={overlayFade.exit}
              transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
            >
              {/* Header */}
              <div className="px-2.5 py-1.5 border-b border-theme-30/50 flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <LayoutGrid size={13} className="text-theme-10" />
                  {t('player.toolsMenu')}
                </span>
                {sleepTimerMode !== 'off' && (
                  <span className="text-[10px] font-mono font-bold text-theme-10 bg-theme-10/10 px-1.5 py-0.5 rounded-full">
                    {sleepTimerRemaining
                      ? `${Math.floor(sleepTimerRemaining / 60)}:${String(sleepTimerRemaining % 60).padStart(2, '0')}`
                      : language === 'vi'
                        ? 'Hết bài'
                        : 'End'}
                  </span>
                )}
              </div>

              {/* Feature: Spectrogram (Hidden in Lite Mode) */}
              {!isLite && (
                <button
                  onClick={() => {
                    setShowSpectrogramModal(true)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
                    showSpectrogramModal
                      ? 'bg-theme-10/20 text-theme-10 font-semibold'
                      : 'text-zinc-300 hover:bg-theme-30/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Radio
                      size={16}
                      className={showSpectrogramModal ? 'text-theme-10' : 'text-zinc-400'}
                    />
                    <span className="text-xs font-medium">{t('player.spectrogram')}</span>
                  </div>
                  {showSpectrogramModal && (
                    <span className="w-1.5 h-1.5 rounded-full bg-theme-10" />
                  )}
                </button>
              )}

              {/* Feature: Mini Player */}
              <button
                onClick={() => {
                  handleToggleMiniPlayer()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:bg-theme-30/60 hover:text-white transition"
              >
                <div className="flex items-center gap-2.5">
                  <PictureInPicture2 size={16} className="text-zinc-400" />
                  <span className="text-xs font-medium">{t('player.miniPlayer')}</span>
                </div>
              </button>

              {/* Feature: Queue */}
              <button
                onClick={() => {
                  handleToggleQueue()
                  setIsOpen(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
                  showQueuePanel
                    ? 'bg-theme-10/20 text-theme-10 font-semibold'
                    : 'text-zinc-300 hover:bg-theme-30/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <List size={16} className={showQueuePanel ? 'text-theme-10' : 'text-zinc-400'} />
                  <span className="text-xs font-medium">{t('player.queue')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {playQueueLength > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-30/80 text-zinc-400">
                      {playQueueLength}
                    </span>
                  )}
                  {showQueuePanel && <span className="w-1.5 h-1.5 rounded-full bg-theme-10" />}
                </div>
              </button>

              {/* Feature: Equalizer */}
              <button
                onClick={() => {
                  setShowEQ((prev) => !prev)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
                  showEQ
                    ? 'bg-theme-10/20 text-theme-10 font-semibold'
                    : 'text-zinc-300 hover:bg-theme-30/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sliders size={16} className={showEQ ? 'text-theme-10' : 'text-zinc-400'} />
                  <span className="text-xs font-medium">{t('player.equalizer')}</span>
                </div>
                {showEQ && <span className="w-1.5 h-1.5 rounded-full bg-theme-10" />}
              </button>

              {/* Feature: Sleep Timer (Collapsible Sub-menu) */}
              <div className="pt-1 border-t border-theme-30/40">
                <button
                  onClick={() => setTimerExpanded((prev) => !prev)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
                    sleepTimerMode !== 'off'
                      ? 'bg-theme-10/10 text-theme-10 font-semibold'
                      : 'text-zinc-300 hover:bg-theme-30/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Timer
                      size={16}
                      className={sleepTimerMode !== 'off' ? 'text-theme-10' : 'text-zinc-400'}
                    />
                    <span className="text-xs font-medium">{t('player.sleepTimer')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    {sleepTimerMode !== 'off' && (
                      <span className="text-[10px] font-mono font-bold text-theme-10">
                        {sleepTimerRemaining
                          ? `${Math.floor(sleepTimerRemaining / 60)}m`
                          : language === 'vi'
                            ? 'Hết bài'
                            : 'End'}
                      </span>
                    )}
                    {timerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${timerExpanded ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0 pointer-events-none mt-0'}`}
                >
                  <div className="overflow-hidden">
                    <div className="pl-2 pr-1 space-y-0.5 bg-black/25 rounded-xl p-1.5 border border-theme-30/30">
                      <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 border-b border-zinc-800/60 mb-1">
                        <Clock size={11} /> {t('player.sleepTimer')}
                      </div>
                      {timerOptions.map((opt) => (
                        <button
                          key={opt.mode}
                          onClick={() => {
                            onSetTimer(opt.mode)
                            if (opt.mode === 'off') {
                              setTimerExpanded(false)
                            }
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                            sleepTimerMode === opt.mode
                              ? 'bg-theme-10/20 text-theme-10 font-semibold'
                              : 'hover:bg-theme-30/70 text-zinc-300'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {sleepTimerMode === opt.mode && (
                            <span className="w-1.5 h-1.5 rounded-full bg-theme-10" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

PlayerToolsMenu.displayName = 'PlayerToolsMenu'
