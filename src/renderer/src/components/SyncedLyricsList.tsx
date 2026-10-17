import React, { useEffect, useRef } from 'react'
import { useLyricsStore, usePlayerStore } from '../stores'
import { isDsdTrack } from '../utils/formatUtils'

export interface LyricLine {
  time: number // Thời gian tính theo giây
  text: string
  unsynced?: boolean // true: lời thô không có mốc thời gian (không highlight / không tua)
  words?: { time: number; text: string }[]
}

export interface SyncedLyricsListProps {
  lyrics: LyricLine[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  isVinyl?: boolean
  noLyricsText: string
}

export const SyncedLyricsList: React.FC<SyncedLyricsListProps> = React.memo(
  ({ lyrics, audioRef, isVinyl = false, noLyricsText }) => {
    const currentLyricIndex = useLyricsStore((s) => s.currentLyricIndex)
    const setCurrentLyricIndex = useLyricsStore((s) => s.setCurrentLyricIndex)
    const currentTime = usePlayerStore((s) => s.currentTime)
    const lyricOffset = usePlayerStore((s) => s.lyricOffset)
    const activeLyricRef = useRef<HTMLParagraphElement | null>(null)

    useEffect(() => {
      if (activeLyricRef.current) {
        activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, [currentLyricIndex])

    if (lyrics.length === 0) {
      return (
        <p className={`text-zinc-500 italic ${isVinyl ? 'mt-32 text-xl' : 'mt-10'}`}>
          {noLyricsText}
        </p>
      )
    }

    return (
      <>
        {lyrics.map((line, index) => {
          const isActive = index === currentLyricIndex
          return (
            <p
              key={index}
              ref={isActive ? activeLyricRef : null}
              onClick={() => {
                if (line.unsynced) return
                const playerState = usePlayerStore.getState()
                const offset = playerState.lyricOffset || 0
                const targetRelTime = Math.max(0, line.time - offset)
                if (playerState.bitPerfectEnabled || isDsdTrack(playerState.currentTrack)) {
                  window.api?.bassSeek?.(targetRelTime, 'absolute')
                  if (audioRef.current) {
                    ;(audioRef.current as any)._currentTime = targetRelTime
                  }
                } else if (audioRef.current) {
                  const trackStart = playerState.currentTrack?.startTime || 0
                  audioRef.current.currentTime = trackStart + targetRelTime
                }
                playerState.setCurrentTime?.(targetRelTime)
                setCurrentLyricIndex(index)
              }}
              className={`transition-all duration-300 font-bold ${
                line.unsynced
                  ? `text-zinc-300 ${isVinyl ? 'text-xl min-h-[1.75rem]' : 'text-sm min-h-[1.25rem]'}`
                  : `cursor-pointer ${
                      isActive
                        ? `text-theme-10 ${isVinyl ? 'text-3xl scale-105' : 'text-xl'}`
                        : `text-zinc-500 ${isVinyl ? 'text-xl opacity-50' : 'text-sm'} hover:text-zinc-300`
                    }`
              }`}
            >
              {isActive && line.words && line.words.length > 0 ? (
                <span className="inline-flex flex-wrap items-center">
                  {line.words.map((w, wIdx) => {
                    const isWordPassed = w.time <= (currentTime ?? 0) + 0.25 + (lyricOffset || 0)
                    return (
                      <span
                        key={wIdx}
                        className={`transition-all duration-150 mr-1.5 inline-block ${
                          isWordPassed
                            ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]'
                            : 'text-white/40'
                        }`}
                      >
                        {w.text}
                      </span>
                    )
                  })}
                </span>
              ) : (
                line.text
              )}
            </p>
          )
        })}
      </>
    )
  }
)

SyncedLyricsList.displayName = 'SyncedLyricsList'
