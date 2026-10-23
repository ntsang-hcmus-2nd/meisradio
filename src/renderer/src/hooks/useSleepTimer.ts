import { useRef, useEffect } from 'react'
import { usePlayerStore, useUIStore } from '../stores'
import { useTranslation } from '../locales'
import { sliderToGain } from '../utils/audioUtils'
import { isDsdTrack } from '../utils/formatUtils'

interface UseSleepTimerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
}

export function useSleepTimer({ audioRef }: UseSleepTimerProps) {
  const { t } = useTranslation()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode)
  const setSleepTimerMode = usePlayerStore((s) => s.setSleepTimerMode)
  const setSleepTimerRemaining = usePlayerStore((s) => s.setSleepTimerRemaining)
  const setShowSleepTimerMenu = usePlayerStore((s) => s.setShowSleepTimerMenu)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)

  const showToast = useUIStore((s) => s.showToast)

  const sleepTimerTargetTimeRef = useRef<number | null>(null)
  const sleepTimerOriginalVolRef = useRef<number | null>(null)
  const sleepTimerModeForRef = useRef<string | null>(null)

  const handleSetSleepTimer = (mode: 'off' | '15' | '30' | '45' | '60' | 'end_of_track') => {
    setSleepTimerMode(mode)
    setShowSleepTimerMenu(false)
    if (mode === 'off') {
      sleepTimerTargetTimeRef.current = null
      sleepTimerModeForRef.current = null
      setSleepTimerRemaining(null)
      if (sleepTimerOriginalVolRef.current !== null) {
        setVolume(sleepTimerOriginalVolRef.current)
        const restoredGain = sliderToGain(sleepTimerOriginalVolRef.current)
        if (audioRef.current) audioRef.current.volume = restoredGain
        if (bitPerfectEnabled || isDsdTrack(currentTrack)) window.api?.bassSetVolume?.(restoredGain)
        sleepTimerOriginalVolRef.current = null
      }
      showToast(t('player.sleepTimerOffToast'), 'info')
      return
    }

    if (mode === 'end_of_track') {
      sleepTimerTargetTimeRef.current = null
      sleepTimerModeForRef.current = null
      setSleepTimerRemaining(null)
      showToast(t('player.sleepTimerEndTrackToast'), 'success')
      return
    }

    const mins = parseInt(mode, 10)
    if (!isNaN(mins) && mins > 0) {
      const targetTime = Date.now() + mins * 60 * 1000
      sleepTimerTargetTimeRef.current = targetTime
      sleepTimerModeForRef.current = mode
      setSleepTimerRemaining(mins * 60)
      sleepTimerOriginalVolRef.current = volume
      showToast(t('player.sleepTimerMinsToast', { mins }), 'success')
    }
  }

  // Đồng bộ khi sleepTimerMode bị đổi trực tiếp từ store (vd. Command Palette),
  // lúc đó sleepTimerTargetTimeRef chưa được gán nên bộ đếm ở dưới không chạy.
  useEffect(() => {
    if (sleepTimerMode === 'off' || sleepTimerMode === 'end_of_track') {
      sleepTimerTargetTimeRef.current = null
      sleepTimerModeForRef.current = null
      return
    }
    const mins = parseInt(sleepTimerMode, 10)
    if (isNaN(mins) || mins <= 0) return
    if (sleepTimerTargetTimeRef.current && sleepTimerModeForRef.current === sleepTimerMode) return
    sleepTimerTargetTimeRef.current = Date.now() + mins * 60 * 1000
    sleepTimerModeForRef.current = sleepTimerMode
    setSleepTimerRemaining(mins * 60)
    if (sleepTimerOriginalVolRef.current === null) {
      sleepTimerOriginalVolRef.current = usePlayerStore.getState().volume
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepTimerMode])

  useEffect(() => {
    if (
      sleepTimerMode === 'off' ||
      sleepTimerMode === 'end_of_track' ||
      !sleepTimerTargetTimeRef.current
    )
      return

    const interval = setInterval(() => {
      if (!sleepTimerTargetTimeRef.current) {
        clearInterval(interval)
        return
      }

      const diffSecs = Math.max(
        0,
        Math.round((sleepTimerTargetTimeRef.current - Date.now()) / 1000)
      )
      setSleepTimerRemaining(diffSecs)

      // 30s cuối cùng: Giảm dần âm lượng để không làm giật mình người nghe
      if (diffSecs <= 30 && sleepTimerOriginalVolRef.current !== null) {
        const factor = diffSecs / 30
        const fadedVol = Math.max(0, sleepTimerOriginalVolRef.current * factor)
        setVolume(fadedVol)
        const effectiveGain = sliderToGain(fadedVol)
        if (audioRef.current) audioRef.current.volume = effectiveGain
        if (bitPerfectEnabled || isDsdTrack(currentTrack))
          window.api?.bassSetVolume?.(effectiveGain)
      }

      if (diffSecs <= 0) {
        clearInterval(interval)
        sleepTimerTargetTimeRef.current = null
        setSleepTimerRemaining(null)
        setSleepTimerMode('off')
        setIsPlaying(false)
        if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
          window.api?.bassPause?.()
        } else if (audioRef.current) {
          audioRef.current.pause()
        }

        // Khôi phục lại âm lượng ban đầu sau khi đã dừng phát nhạc
        if (sleepTimerOriginalVolRef.current !== null) {
          const orig = sleepTimerOriginalVolRef.current
          setVolume(orig)
          const restoredGain = sliderToGain(orig)
          if (audioRef.current) audioRef.current.volume = restoredGain
          if (bitPerfectEnabled || isDsdTrack(currentTrack))
            window.api?.bassSetVolume?.(restoredGain)
          sleepTimerOriginalVolRef.current = null
        }
        showToast(t('player.sleepTimerStoppedToast'), 'info')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [
    sleepTimerMode,
    bitPerfectEnabled,
    currentTrack,
    t,
    showToast,
    setIsPlaying,
    setSleepTimerMode,
    setSleepTimerRemaining,
    setVolume,
    audioRef
  ])

  return {
    handleSetSleepTimer
  }
}
