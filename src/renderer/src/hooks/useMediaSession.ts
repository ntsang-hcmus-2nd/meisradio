import { useEffect } from 'react'
import { usePlayerStore, useSettingsStore } from '../stores'
import { formatImageSource } from '../utils/urlUtils'
import { isDsdTrack, getTrackSeekRange, clampSeekRange } from '../utils/formatUtils'

interface UseMediaSessionProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
  handlePlayPause: () => void
  handlePrev: () => void
  handleNext: () => void
}

export function useMediaSession({
  audioRef,
  handlePlayPause,
  handlePrev,
  handleNext
}: UseMediaSessionProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const streamPort = useSettingsStore((s) => s.streamPort)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      return
    }

    const artworkList: { src: string; sizes: string; type: string }[] = []
    if (currentTrack.coverArt && typeof currentTrack.coverArt === 'string') {
      const safeArt = formatImageSource(currentTrack.coverArt, streamPort)
      if (
        safeArt &&
        (safeArt.startsWith('http://') ||
          safeArt.startsWith('https://') ||
          safeArt.startsWith('data:'))
      ) {
        artworkList.push({ src: safeArt, sizes: '512x512', type: 'image/jpeg' })
      }
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Untitled',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Unknown Album',
        artwork: artworkList
      })
    } catch (e) {}

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => handlePlayPause()],
      ['pause', () => handlePlayPause()],
      ['previoustrack', () => handlePrev()],
      ['nexttrack', () => handleNext()],
      [
        'seekto',
        (details) => {
          if (details.seekTime !== undefined && details.seekTime !== null) {
            if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
              window.api?.bassSeek?.(details.seekTime, 'absolute')
            } else if (audioRef.current) {
              // seekTime là toạ độ ảo của track (0..duration); quy đổi sang toạ độ
              // vật lý rồi kẹp vào phạm vi [startTime, endTime] của track CUE.
              const range = getTrackSeekRange(currentTrack, audioRef.current.duration)
              audioRef.current.currentTime = clampSeekRange(range.start + details.seekTime, range)
            }
          }
        }
      ],
      [
        'seekbackward',
        (details) => {
          const offset = details.seekOffset || 5
          if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
            window.api?.bassSeek?.(-offset, 'relative')
          } else if (audioRef.current) {
            const range = getTrackSeekRange(currentTrack, audioRef.current.duration)
            audioRef.current.currentTime = clampSeekRange(
              audioRef.current.currentTime - offset,
              range
            )
          }
        }
      ],
      [
        'seekforward',
        (details) => {
          const offset = details.seekOffset || 5
          if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
            window.api?.bassSeek?.(offset, 'relative')
          } else if (audioRef.current) {
            const range = getTrackSeekRange(currentTrack, audioRef.current.duration)
            audioRef.current.currentTime = clampSeekRange(
              audioRef.current.currentTime + offset,
              range
            )
          }
        }
      ]
    ]

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch (e) {}
    }
  }, [currentTrack, isPlaying, bitPerfectEnabled, streamPort, handlePlayPause, handlePrev, handleNext, audioRef])
}
