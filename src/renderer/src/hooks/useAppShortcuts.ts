import { useState, useRef, useEffect } from 'react'
import { usePlayerStore, useUIStore } from '../stores'
import { isDsdTrack, getTrackSeekRange, clampSeekRange } from '../utils/formatUtils'
import { seekWebAudioCompatible, getReloadSeekOffset } from '../utils/onlineSeekUtils'

/**
 * Tua bằng thao tác chu vi / phím tắt trên thẻ audio (WebAudio chuẩn):
 * kẹp phạm vi theo [startTime, endTime] của track CUE thay vì [0, duration]
 * của cả tệp vật lý. Stream online HLS qua helper để reload ?seek= khi cần.
 */
const seekAudioBy = (audio: HTMLAudioElement, track: any, delta: number) => {
  const range = getTrackSeekRange(track, audio.duration)
  const relTarget =
    clampSeekRange(audio.currentTime + getReloadSeekOffset(track) + delta, range) - range.start
  seekWebAudioCompatible(audio, track, relTarget, range.start)
}

interface UseAppShortcutsProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
  handlePlayPause: () => void
  handleNext: () => void
  handlePrev: () => void
  handleVolumeUp: () => void
  handleVolumeDown: () => void
  toggleMute: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  onFilesDropped?: (files: any[]) => void
}

export function useAppShortcuts({
  audioRef,
  handlePlayPause,
  handleNext,
  handlePrev,
  handleVolumeUp,
  handleVolumeDown,
  toggleMute,
  toggleShuffle,
  toggleRepeat,
  onFilesDropped
}: UseAppShortcutsProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const volume = usePlayerStore((s) => s.volume)
  const prevVolume = usePlayerStore((s) => s.prevVolume)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const originalQueue = usePlayerStore((s) => s.originalQueue)
  const setShowCommandPalette = useUIStore((s) => s.setShowCommandPalette)

  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounterRef = useRef(0)

  // In-App Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K -> Spotlight Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette((prev) => !prev)
        return
      }

      const target = e.target as HTMLElement
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return

      // Space / K -> Play / Pause
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault()
        handlePlayPause()
        return
      }

      // ArrowRight -> Seek +5s
      if (e.code === 'ArrowRight' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
          window.api?.bassSeek?.(5, 'relative')
        } else if (audioRef.current && currentTrack) {
          seekAudioBy(audioRef.current, currentTrack, 5)
        }
        return
      }

      // ArrowLeft -> Seek -5s
      if (e.code === 'ArrowLeft' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
          window.api?.bassSeek?.(-5, 'relative')
        } else if (audioRef.current && currentTrack) {
          seekAudioBy(audioRef.current, currentTrack, -5)
        }
        return
      }

      // Ctrl+Right / Shift+N / KeyN -> Next track
      if (
        (e.ctrlKey && e.code === 'ArrowRight') ||
        (e.shiftKey && e.code === 'KeyN') ||
        (e.code === 'KeyN' && !e.ctrlKey && !e.altKey)
      ) {
        e.preventDefault()
        handleNext()
        return
      }

      // Ctrl+Left / Shift+P / KeyP -> Previous track
      if (
        (e.ctrlKey && e.code === 'ArrowLeft') ||
        (e.shiftKey && e.code === 'KeyP') ||
        (e.code === 'KeyP' && !e.ctrlKey && !e.altKey)
      ) {
        e.preventDefault()
        handlePrev()
        return
      }

      // ArrowUp / Ctrl+Up -> Volume Up
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        handleVolumeUp()
        return
      }

      // ArrowDown / Ctrl+Down -> Volume Down
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        handleVolumeDown()
        return
      }

      // M -> Mute toggle
      if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleMute()
        return
      }

      // S -> Shuffle toggle
      if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleShuffle()
        return
      }

      // R -> Repeat toggle
      if (e.code === 'KeyR' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleRepeat()
        return
      }

      // / or Ctrl+F -> Focus Search
      if ((e.code === 'Slash' && !e.ctrlKey && !e.shiftKey) || (e.ctrlKey && e.code === 'KeyF')) {
        e.preventDefault()
        const searchEl = document.querySelector(
          '#global-search-input, header input[type="text"]'
        ) as HTMLInputElement
        if (searchEl) {
          searchEl.focus()
          searchEl.select()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    currentTrack,
    isPlaying,
    bitPerfectEnabled,
    playQueue,
    repeatMode,
    volume,
    prevVolume,
    isShuffle,
    originalQueue,
    handlePlayPause,
    handleNext,
    handlePrev,
    handleVolumeUp,
    handleVolumeDown,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    audioRef,
    setShowCommandPalette
  ])

  const shortcutStateRef = useRef({
    handlePlayPause,
    handleNext,
    handlePrev,
    handleVolumeUp,
    handleVolumeDown,
    bitPerfectEnabled,
    currentTrack,
    audioRef
  })

  useEffect(() => {
    shortcutStateRef.current = {
      handlePlayPause,
      handleNext,
      handlePrev,
      handleVolumeUp,
      handleVolumeDown,
      bitPerfectEnabled,
      currentTrack,
      audioRef
    }
  })

  // Global Shortcuts from Electron Main Process
  useEffect(() => {
    if (!window.api?.onGlobalShortcut) return

    const unsubscribe = window.api.onGlobalShortcut((action: string) => {
      const {
        handlePlayPause: onPlayPause,
        handleNext: onNext,
        handlePrev: onPrev,
        handleVolumeUp: onVolUp,
        handleVolumeDown: onVolDown,
        bitPerfectEnabled: isBp,
        currentTrack: curTrack,
        audioRef: audio
      } = shortcutStateRef.current

      switch (action) {
        case 'play-pause':
          onPlayPause()
          break
        case 'next':
          onNext()
          break
        case 'prev':
          onPrev()
          break
        case 'vol-up':
          onVolUp()
          break
        case 'vol-down':
          onVolDown()
          break
        case 'seek-forward':
          if (isBp || isDsdTrack(curTrack)) {
            window.api?.bassSeek?.(5, 'relative')
          } else if (audio.current && curTrack) {
            seekAudioBy(audio.current, curTrack, 5)
          }
          break
        case 'seek-backward':
          if (isBp || isDsdTrack(curTrack)) {
            window.api?.bassSeek?.(-5, 'relative')
          } else if (audio.current && curTrack) {
            seekAudioBy(audio.current, curTrack, -5)
          }
          break
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // Global Drag & Drop File Handler
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current++
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDraggingFile(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current--
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false)
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDraggingFile(false)

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files)
        onFilesDropped?.(files)
      }
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [onFilesDropped])

  return {
    isDraggingFile
  }
}
