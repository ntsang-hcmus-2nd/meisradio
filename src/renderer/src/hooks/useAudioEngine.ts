import { useRef, useEffect, useState, useCallback } from 'react'
import {
  usePlayerStore,
  useAudioStore,
  useSettingsStore,
  useLibraryStore,
  useUIStore,
  useLyricsStore
} from '../stores'
import { useTranslation, useLanguage } from '../locales'
import { sliderToGain } from '../utils/audioUtils'
import { isDsdTrack } from '../utils/formatUtils'
import { fisherYatesShuffle } from '../utils/arrayUtils'

export const getBrowserSinkId = (deviceId: string | null | undefined): string => {
  if (
    !deviceId ||
    deviceId === 'auto' ||
    deviceId === 'default' ||
    deviceId.startsWith('wasapi/') ||
    /^\d+$/.test(deviceId)
  )
    return ''
  return deviceId
}

export function useAudioEngine() {
  const { t } = useTranslation()
  const { language } = useLanguage()

  // Audio References
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const preampNodeRef = useRef<GainNode | null>(null)
  const filterNodesRef = useRef<BiquadFilterNode[]>([])
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null)
  const crossfeedGainNodeRef = useRef<GainNode | null>(null)

  // Internal State & Control Refs
  const [audioRemountCount, setAudioRemountCount] = useState(0)
  const selectedDeviceRef = useRef<string>('auto')
  const pendingSeekTimeRef = useRef<number | null>(null)
  const preloadedRef = useRef<string | null>(null)
  const hasTriggeredCrossfadeRef = useRef(false)
  const isSwitchingTrackRef = useRef(false)
  const isGaplessTransitioningRef = useRef(false)
  const prevTrackModeRef = useRef<'bass' | 'webaudio'>('webaudio')
  const handleNextRef = useRef<() => void>(() => {})

  // Stores
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const setIsShuffle = usePlayerStore((s) => s.setIsShuffle)
  const originalQueue = usePlayerStore((s) => s.originalQueue)
  const setOriginalQueue = usePlayerStore((s) => s.setOriginalQueue)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const setPlayQueue = usePlayerStore((s) => s.setPlayQueue)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode)
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const prevVolume = usePlayerStore((s) => s.prevVolume)
  const setPrevVolume = usePlayerStore((s) => s.setPrevVolume)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled)
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration)
  const setBassOutParams = usePlayerStore((s) => s.setBassOutParams)
  const smartAutoplay = usePlayerStore((s) => s.smartAutoplay)
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode)
  const setSleepTimerMode = usePlayerStore((s) => s.setSleepTimerMode)
  const setSleepTimerRemaining = usePlayerStore((s) => s.setSleepTimerRemaining)
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)

  const {
    isEqEnabled,
    availableAudioDevices,
    setAvailableAudioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    eqBands,
    preampGain,
    bitPerfectType
  } = useAudioStore()

  const {
    appMode,
    loudnessNormalization,
    replayGainMode,
    crossfeedEnabled: crossfeedSetting,
    gaplessEnabled,
    setCloudActionTrack
  } = useSettingsStore()

  const {
    libraryTracks,
    setRecentlyPlayed
  } = useLibraryStore()

  const { showToast, setCustomDialog } = useUIStore()
  const { lyrics, setCurrentLyricIndex } = useLyricsStore()

  const isCore = appMode === 'core'

  const currentSampleRate = currentTrack?.sampleRate || 44100

  useEffect(() => {
    selectedDeviceRef.current = selectedDeviceId
  }, [selectedDeviceId])

  const showAlert = (options: {
    title?: string
    message: string | React.ReactNode
    confirmText?: string
    onConfirm?: () => void
  }) => {
    setCustomDialog({
      isOpen: true,
      type: 'alert',
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'OK',
      onConfirm: () => {
        setCustomDialog(null)
        options.onConfirm?.()
      },
      onCancel: () => {
        setCustomDialog(null)
      }
    })
  }

  const resetWebAudioPipeline = useCallback(async () => {
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
      } catch (e) {}
      audioCtxRef.current = null
    }
    sourceNodeRef.current = null
    analyserNodeRef.current = null
    preampNodeRef.current = null
    compressorNodeRef.current = null
    filterNodesRef.current = []
    crossfeedGainNodeRef.current = null
    setAudioRemountCount((c) => c + 1)
  }, [])

  // Audio Output Devices Discovery
  useEffect(() => {
    const getDevices = async () => {
      try {
        if (window.api && (window.api as any).getAudioDevices) {
          const res = await (window.api as any).getAudioDevices()
          const devs = Array.isArray(res)
            ? res
            : Array.isArray(res?.devices)
              ? res.devices
              : []
          setAvailableAudioDevices(devs)
        }
      } catch (e) {
        console.error('Lỗi lấy danh sách thiết bị âm thanh:', e)
        setAvailableAudioDevices([])
      }
    }
    getDevices()

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = () => {
        getDevices()
      }
    }
    return () => {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices.ondevicechange = null
      }
    }
  }, [setAvailableAudioDevices])

  // Apply device change to HTML5 audio
  useEffect(() => {
    if (selectedDeviceId) {
      const browserSinkId = getBrowserSinkId(selectedDeviceId)
      if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
        ;(audioRef.current as any).setSinkId(browserSinkId).catch(() => {})
      }
      if (window.api && (window.api as any).setAudioDevice) {
        ;(window.api as any).setAudioDevice(selectedDeviceId)
      }
    }
  }, [selectedDeviceId])

  // Preload next track for BASS gapless playback
  useEffect(() => {
    if (!gaplessEnabled || (!bitPerfectEnabled && !isDsdTrack(currentTrack))) {
      return
    }
    if (!currentTrack || !playQueue || playQueue.length === 0) return

    const currentIndex = playQueue.findIndex(
      (t) =>
        (t.filePath === currentTrack.filePath || t.id === currentTrack.id) &&
        t.startTime === currentTrack.startTime
    )
    if (currentIndex === -1) return

    let nextTrack: any = null
    if (repeatMode === 2) {
      nextTrack = currentTrack
    } else {
      const nextIndex = currentIndex + 1
      if (nextIndex < playQueue.length) {
        nextTrack = playQueue[nextIndex]
      } else if (repeatMode === 1) {
        nextTrack = playQueue[0]
      }
    }

    const preloadKey = nextTrack?.filePath
      ? `${nextTrack.filePath}#${nextTrack.startTime || 0}-${nextTrack.endTime || 0}`
      : null
    if (nextTrack && nextTrack.filePath && preloadKey && preloadedRef.current !== preloadKey) {
      preloadedRef.current = preloadKey
      window.api?.bassPreloadNext?.(
        nextTrack.filePath,
        nextTrack.startTime,
        nextTrack.endTime
      )
    }
  }, [currentTrack, playQueue, repeatMode, gaplessEnabled, bitPerfectEnabled])

  // Sync gapless playback setting to BASS
  useEffect(() => {
    window.api?.bassSetGapless?.(gaplessEnabled)
  }, [gaplessEnabled])

  // Setup Web Audio Graph
  useEffect(() => {
    if (!audioRef.current) return
    let isCancelled = false

    const setupAudio = async () => {
      if (
        audioCtxRef.current &&
        (audioCtxRef.current.sampleRate !== currentSampleRate ||
          audioCtxRef.current.state === 'closed' ||
          (audioCtxRef.current.state as string) === 'interrupted')
      ) {
        try {
          await audioCtxRef.current.close()
        } catch (e) {}
        if (isCancelled) return
        audioCtxRef.current = null
        sourceNodeRef.current = null
        analyserNodeRef.current = null
        preampNodeRef.current = null
        compressorNodeRef.current = null
        filterNodesRef.current = []
      }
      if (isCancelled) return

      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        try {
          audioCtxRef.current = new AudioContextClass({ sampleRate: currentSampleRate })
        } catch (e) {
          audioCtxRef.current = new AudioContextClass()
        }

        const targetId = getBrowserSinkId(selectedDeviceRef.current)
        if (typeof (audioCtxRef.current as any).setSinkId === 'function') {
          ;(audioCtxRef.current as any).setSinkId(targetId).catch(() => {})
        }
      }
      const ctx = audioCtxRef.current

      if (!analyserNodeRef.current || analyserNodeRef.current.context !== ctx) {
        analyserNodeRef.current = ctx.createAnalyser()
        analyserNodeRef.current.fftSize = 2048
      }
      if (!sourceNodeRef.current || sourceNodeRef.current.context !== ctx) {
        try {
          if (!audioRef.current || !(audioRef.current instanceof HTMLAudioElement)) return
          sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
        } catch (e) {
          return
        }
      }
      if (!sourceNodeRef.current) return

      if (!preampNodeRef.current || preampNodeRef.current.context !== ctx) {
        preampNodeRef.current = ctx.createGain()
      }
      if (!compressorNodeRef.current || compressorNodeRef.current.context !== ctx) {
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -18
        comp.knee.value = 12
        comp.ratio.value = 4
        comp.attack.value = 0.005
        comp.release.value = 0.15
        compressorNodeRef.current = comp
      }

      try {
        sourceNodeRef.current?.disconnect()
      } catch (e) {}
      try {
        preampNodeRef.current?.disconnect()
      } catch (e) {}
      try {
        analyserNodeRef.current?.disconnect()
      } catch (e) {}
      try {
        compressorNodeRef.current?.disconnect()
      } catch (e) {}
      filterNodesRef.current.forEach((node) => {
        try {
          node.disconnect()
          node.frequency.cancelScheduledValues(0)
          node.gain.cancelScheduledValues(0)
        } catch (e) {}
      })
      filterNodesRef.current = []

      let replayGainMultiplier = 1.0
      if (!bitPerfectEnabled && replayGainMode !== 'off' && currentTrack) {
        let rgDb = 0
        if (replayGainMode === 'track' && typeof (currentTrack as any).replayGainTrack === 'number') {
          rgDb = (currentTrack as any).replayGainTrack
        } else if (replayGainMode === 'album') {
          rgDb = (currentTrack as any)?.replayGainAlbum ?? (currentTrack as any)?.replayGainTrack ?? 0
        }
        if (rgDb) {
          const linearRg = Math.pow(10, rgDb / 20)
          replayGainMultiplier = Math.min(2.0, Math.max(0.1, linearRg))
        }
      }

      const normGainDb = loudnessNormalization ? ((currentTrack as any)?.replayGain ?? -3.0) : 0
      const linearPreamp =
        (isEqEnabled ? Math.pow(10, preampGain / 20) : 1.0) *
        Math.pow(10, normGainDb / 20) *
        replayGainMultiplier
      preampNodeRef.current.gain.value = linearPreamp

      if (isCore) {
        sourceNodeRef.current.connect(ctx.destination)
        return
      }

      let prevNode: AudioNode = sourceNodeRef.current
      prevNode.connect(preampNodeRef.current)
      prevNode = preampNodeRef.current

      if (isEqEnabled) {
        const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
        sortedBands.forEach((band) => {
          const filter = ctx.createBiquadFilter()
          filter.type = band.type || 'peaking'
          filter.frequency.value = band.frequency
          filter.gain.value = band.gain
          filter.Q.value = band.q ?? 1.4
          prevNode.connect(filter)
          prevNode = filter
          filterNodesRef.current.push(filter)
        })
      }

      // Binaural Crossfeed DSP
      const crossfeedMerger = ctx.createGain()
      crossfeedMerger.gain.value = 1.0
      prevNode.connect(crossfeedMerger)

      const splitter = ctx.createChannelSplitter(2)
      prevNode.connect(splitter)

      const filterL = ctx.createBiquadFilter()
      filterL.type = 'lowpass'
      filterL.frequency.value = 700

      const filterR = ctx.createBiquadFilter()
      filterR.type = 'lowpass'
      filterR.frequency.value = 700

      const delayL = ctx.createDelay()
      delayL.delayTime.value = 0.0003

      const delayR = ctx.createDelay()
      delayR.delayTime.value = 0.0003

      splitter.connect(filterL, 0)
      filterL.connect(delayL)

      splitter.connect(filterR, 1)
      filterR.connect(delayR)

      const crossMerger = ctx.createChannelMerger(2)
      delayR.connect(crossMerger, 0, 0)
      delayL.connect(crossMerger, 0, 1)

      const crossfeedGain = ctx.createGain()
      crossfeedGain.gain.value = crossfeedSetting ? 0.28 : 0
      crossfeedGainNodeRef.current = crossfeedGain

      crossMerger.connect(crossfeedGain)
      crossfeedGain.connect(crossfeedMerger)

      prevNode = crossfeedMerger

      prevNode.connect(analyserNodeRef.current)
      analyserNodeRef.current.connect(compressorNodeRef.current)
      compressorNodeRef.current.connect(ctx.destination)

      if (isPlaying && ctx.state === 'suspended') {
        await ctx.resume().catch(() => {})
      }
    }
    setupAudio().catch((e) => console.error('[setupAudio error]', e))

    return () => {
      isCancelled = true
    }
  }, [
    isEqEnabled,
    currentSampleRate,
    isCore,
    eqBands.length,
    loudnessNormalization,
    replayGainMode,
    currentTrack,
    bitPerfectEnabled,
    audioRemountCount
  ])

  // Realtime EQ, Preamp & Crossfeed updates
  useEffect(() => {
    if (crossfeedGainNodeRef.current) {
      crossfeedGainNodeRef.current.gain.value = crossfeedSetting ? 0.28 : 0
    }
    if (preampNodeRef.current) {
      let replayGainMultiplier = 1.0
      if (!bitPerfectEnabled && replayGainMode !== 'off' && currentTrack) {
        let rgDb = 0
        if (replayGainMode === 'track' && typeof (currentTrack as any).replayGainTrack === 'number') {
          rgDb = (currentTrack as any).replayGainTrack
        } else if (replayGainMode === 'album') {
          rgDb = (currentTrack as any)?.replayGainAlbum ?? (currentTrack as any)?.replayGainTrack ?? 0
        }
        if (rgDb) {
          const linearRg = Math.pow(10, rgDb / 20)
          replayGainMultiplier = Math.min(2.0, Math.max(0.1, linearRg))
        }
      }

      const normGainDb = loudnessNormalization ? ((currentTrack as any)?.replayGain ?? -3.0) : 0
      const linearPreamp =
        (isEqEnabled ? Math.pow(10, preampGain / 20) : 1.0) *
        Math.pow(10, normGainDb / 20) *
        replayGainMultiplier
      preampNodeRef.current.gain.value = linearPreamp
    }
    if (!isEqEnabled || filterNodesRef.current.length === 0) return
    const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
    sortedBands.forEach((band, index) => {
      const filter = filterNodesRef.current[index]
      if (filter) {
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        filter.Q.value = band.q ?? 1.4
        filter.type = band.type || 'peaking'
      }
    })
  }, [
    eqBands,
    isEqEnabled,
    preampGain,
    loudnessNormalization,
    currentTrack,
    crossfeedSetting,
    replayGainMode,
    bitPerfectEnabled
  ])

  // BASS Audio Listeners (WASAPI / ASIO / DSD)
  useEffect(() => {
    const unTime = window.api?.onBassTime
      ? window.api.onBassTime((val) => {
          const useBass = bitPerfectEnabled || isDsdTrack(currentTrack)
          if (useBass && audioRef.current) {
            ;(audioRef.current as any)._currentTime = val
            const dur = (audioRef.current as any)._duration || currentTrack?.duration || 0
            if (
              !isSwitchingTrackRef.current &&
              crossfadeEnabled &&
              dur > crossfadeDuration &&
              dur - val <= crossfadeDuration &&
              !hasTriggeredCrossfadeRef.current
            ) {
              hasTriggeredCrossfadeRef.current = true
              handleNextRef.current()
            } else if (
              hasTriggeredCrossfadeRef.current &&
              dur > crossfadeDuration &&
              dur - val > crossfadeDuration + 2
            ) {
              hasTriggeredCrossfadeRef.current = false
            }
            if (!document.hidden && lyrics.length > 0 && !lyrics[0].unsynced) {
              const visualTime = val + 0.3 + (lyricOffset || 0)
              const index = lyrics.findIndex((line, i) => {
                const nextLine = lyrics[i + 1]
                if (nextLine) return visualTime >= line.time && visualTime < nextLine.time
                return visualTime >= line.time
              })
              if (index !== useLyricsStore.getState().currentLyricIndex) setCurrentLyricIndex(index)
            }
            setCurrentTime(val)
          }
        })
      : undefined

    const unDuration = window.api?.onBassDuration
      ? window.api.onBassDuration((val) => {
          const useBass = bitPerfectEnabled || isDsdTrack(currentTrack)
          if (useBass && audioRef.current) {
            ;(audioRef.current as any)._duration = val
          }
        })
      : undefined

    const unPaused = window.api?.onBassPaused
      ? window.api.onBassPaused((val) => {
          const useBass = bitPerfectEnabled || isDsdTrack(currentTrack)
          if (useBass) {
            setIsPlaying(!val)
          }
        })
      : undefined

    const unEnded = window.api?.onBassEnded
      ? window.api.onBassEnded(() => {
          if (sleepTimerMode === 'end_of_track') {
            setSleepTimerMode('off')
            setSleepTimerRemaining(null)
            setIsPlaying(false)
            window.api?.bassPause?.()
            showToast(t('player.sleepTimerStoppedToast'), 'info')
            return
          }
          const useBass = bitPerfectEnabled || isDsdTrack(currentTrack)
          if (useBass) {
            if (!hasTriggeredCrossfadeRef.current) {
              handleNextRef.current()
            }
            hasTriggeredCrossfadeRef.current = false
          }
        })
      : undefined

    const unGapless = window.api?.onBassGaplessTransition
      ? window.api.onBassGaplessTransition(({ nextPath }) => {
          const currentIndex = playQueue.findIndex(
            (t) =>
              (t.filePath === currentTrack?.filePath || t.id === currentTrack?.id) &&
              t.startTime === currentTrack?.startTime
          )
          let candidateTrack: any = null
          if (repeatMode === 2) {
            candidateTrack = currentTrack
          } else if (currentIndex !== -1) {
            let nextIdx = currentIndex + 1
            if (nextIdx >= playQueue.length && repeatMode === 1) nextIdx = 0
            if (nextIdx >= 0 && nextIdx < playQueue.length) {
              candidateTrack = playQueue[nextIdx]
            }
          }

          if (candidateTrack && candidateTrack.filePath === nextPath) {
            isGaplessTransitioningRef.current = true
            hasTriggeredCrossfadeRef.current = false
            setCurrentTrack(candidateTrack)
            setIsPlaying(true)
          } else {
            handleNextRef.current()
          }
        })
      : undefined

    const unError = window.api?.onBassError
      ? window.api.onBassError((msg) => {
          setIsPlaying(false)
          showAlert({
            title: t('common.error'),
            message: msg
          })
        })
      : undefined

    const onParamsFn = (window.api as any)?.onBassAudioOutParams || (window.api as any)?.onBassAudioParams
    const unParams = typeof onParamsFn === 'function'
      ? onParamsFn((params: any) => {
          setBassOutParams(params)
        })
      : undefined

    return () => {
      if (typeof unTime === 'function') unTime()
      if (typeof unDuration === 'function') unDuration()
      if (typeof unPaused === 'function') unPaused()
      if (typeof unEnded === 'function') unEnded()
      if (typeof unGapless === 'function') unGapless()
      if (typeof unError === 'function') unError()
      if (typeof unParams === 'function') unParams()
    }
  }, [
    currentTrack,
    playQueue,
    repeatMode,
    crossfadeEnabled,
    crossfadeDuration,
    lyrics,
    lyricOffset,
    bitPerfectEnabled,
    sleepTimerMode,
    t,
    showToast,
    setCurrentTime,
    setCurrentLyricIndex,
    setIsPlaying,
    setBassOutParams,
    setCurrentTrack
  ])

  // Watch BASS Play / Stop
  useEffect(() => {
    if (isGaplessTransitioningRef.current) {
      isGaplessTransitioningRef.current = false
      return
    }
    if (currentTrack && currentTrack.filePath) {
      if (isDsdTrack(currentTrack) && !bitPerfectEnabled) {
        window.api?.bassStop?.().catch(() => {})
        setIsPlaying(false)
        setBassOutParams(null)
        showToast(
          language === 'vi'
            ? 'Đã dừng phát vì định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO)!'
            : 'Stopped playback because DSD format requires Bit-Perfect mode (WASAPI / ASIO)!',
          'error'
        )
        return
      }
      if (bitPerfectEnabled) {
        window.api?.bassPlay?.(
          currentTrack.filePath,
          crossfadeEnabled ? crossfadeDuration : 0,
          bitPerfectEnabled,
          currentTrack.startTime,
          currentTrack.endTime
        )
        if (audioRef.current) audioRef.current.pause()
        if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
          const seekTo = pendingSeekTimeRef.current
          pendingSeekTimeRef.current = null
          setTimeout(() => {
            window.api?.bassSeek?.(seekTo, 'absolute')
          }, 150)
        }
      } else {
        window.api?.bassStop?.().catch(() => {})
        if (audioRef.current && typeof currentTrack.startTime === 'number') {
          audioRef.current.currentTime = currentTrack.startTime
        }
      }
    }
  }, [currentTrack, bitPerfectEnabled, bitPerfectType, crossfadeEnabled, crossfadeDuration])

  // Watch EQ & Preamp for BASS
  useEffect(() => {
    if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
      window.api?.bassSetEqualizer?.([], 0)
      return
    }
    if (isEqEnabled) {
      window.api?.bassSetEqualizer?.(eqBands, preampGain)
    } else {
      window.api?.bassSetEqualizer?.([], 0)
    }
  }, [eqBands, isEqEnabled, preampGain, bitPerfectEnabled, currentTrack])

  // Watch Volume
  useEffect(() => {
    const effectiveGain = sliderToGain(volume)
    if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
      window.api?.bassSetVolume?.(effectiveGain)
    } else if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, effectiveGain))
    }
  }, [volume, bitPerfectEnabled, currentTrack, audioRemountCount])

  // Smart Autoplay helper
  const findRecommendedTrack = (current: any, queue: any[], allTracks: any[]) => {
    if (!current || !allTracks || allTracks.length === 0) return null
    const queueIds = new Set(queue.map((t) => t.id || t.filePath))
    const available = allTracks.filter((t) => !queueIds.has(t.id || t.filePath))
    if (available.length === 0) return null

    if (current.genre) {
      const currentGenre = current.genre.toLowerCase()
      const genreMatches = available.filter(
        (t) => t.genre && t.genre.toLowerCase().includes(currentGenre)
      )
      if (genreMatches.length > 0) {
        return genreMatches[Math.floor(Math.random() * genreMatches.length)]
      }
    }

    if (current.artist) {
      const currentArtist = current.artist.toLowerCase()
      const artistMatches = available.filter(
        (t) => t.artist && t.artist.toLowerCase().includes(currentArtist)
      )
      if (artistMatches.length > 0) {
        return artistMatches[Math.floor(Math.random() * artistMatches.length)]
      }
    }

    return available[Math.floor(Math.random() * available.length)]
  }

  // Core Play Track Handler
  const handlePlayTrack = async (track: any) => {
    if (!track) return

    if (isDsdTrack(track) && !bitPerfectEnabled) {
      isSwitchingTrackRef.current = false
      showToast(
        language === 'vi'
          ? 'Định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO) để phát!'
          : 'DSD format requires Bit-Perfect mode (WASAPI / ASIO) to play!',
        'error'
      )
      return
    }

    isSwitchingTrackRef.current = true
    hasTriggeredCrossfadeRef.current = false

    if (crossfadeEnabled && isPlaying && audioRef.current && currentTrack && !bitPerfectEnabled) {
      try {
        const fadeAudio = new Audio(audioRef.current.src)
        fadeAudio.currentTime = audioRef.current.currentTime
        const curVol = Math.max(0, Math.min(1, sliderToGain(volume)))
        fadeAudio.volume = curVol
        fadeAudio.play().catch(() => {})

        const steps = Math.max(1, crossfadeDuration * 20)
        const step = curVol / steps
        const fadeInterval = setInterval(() => {
          const nextVol = fadeAudio.volume - step
          if (nextVol > 0.01) {
            fadeAudio.volume = Math.max(0, Math.min(1, nextVol))
          } else {
            clearInterval(fadeInterval)
            fadeAudio.pause()
            fadeAudio.removeAttribute('src')
            fadeAudio.src = ''
            fadeAudio.load()
          }
        }, 50)
      } catch (e) {}
    }

    const trackToPlay = { ...track }

    const isOnlineTrack =
      trackToPlay.isOnline ||
      trackToPlay.isCloud ||
      trackToPlay.platform === 'youtube' ||
      trackToPlay.platform === 'soundcloud' ||
      String(trackToPlay.id).startsWith('sc-') ||
      String(trackToPlay.id).startsWith('yt-')

    if (
      isOnlineTrack &&
      (!trackToPlay.filePath || !trackToPlay.filePath.startsWith('http://127.0.0.1'))
    ) {
      showToast(t('toasts.connectingStream'), 'info')
      // @ts-ignore
      const res = await window.api?.getStreamUrl?.(trackToPlay)
      if (res?.success && res.url) {
        trackToPlay.filePath = res.url
        // @ts-ignore
        if (window.api?.logWatchHistory && trackToPlay.platform === 'youtube')
          window.api.logWatchHistory(trackToPlay.originalId)
      } else {
        showAlert({
          title: t('common.error'),
          message: 'Stream error: ' + (res?.error || 'Unknown')
        })
        return
      }
    }

    const nextMode = bitPerfectEnabled || isDsdTrack(trackToPlay) ? 'bass' : 'webaudio'
    if (prevTrackModeRef.current === 'bass' && nextMode === 'webaudio') {
      await window.api?.bassStop?.().catch(() => {})
      await resetWebAudioPipeline()
    } else if (nextMode === 'webaudio') {
      window.api?.bassStop?.().catch(() => {})
      if (
        !audioCtxRef.current ||
        audioCtxRef.current.state === 'closed' ||
        (audioCtxRef.current.state as string) === 'interrupted'
      ) {
        await resetWebAudioPipeline()
      }
    }
    prevTrackModeRef.current = nextMode

    if (audioRef.current && nextMode === 'webaudio') {
      audioRef.current.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
      if (currentTrack && currentTrack.filePath === trackToPlay.filePath) {
        audioRef.current.currentTime = trackToPlay.startTime || 0
        audioRef.current.play().catch(() => {})
      }
    }

    setCurrentTrack(trackToPlay)
    setIsPlaying(true)
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {})
    }

    // Recently Played
    setRecentlyPlayed((prev) => {
      const trackId = trackToPlay.id || trackToPlay.filePath
      const filtered = prev.filter((trk) => (trk.id || trk.filePath) !== trackId)
      const updated = [
        {
          id: trackId,
          title: trackToPlay.title || 'Unknown Title',
          artist: trackToPlay.artist || 'Unknown Artist',
          album: trackToPlay.album || 'Unknown Album',
          duration: trackToPlay.duration || 0,
          filePath: trackToPlay.filePath,
          coverArt: trackToPlay.coverArt,
          genre: trackToPlay.genre,
          isOnline: trackToPlay.isOnline,
          platform: trackToPlay.platform,
          playedAt: Date.now()
        },
        ...filtered
      ].slice(0, 50)
      try {
        localStorage.setItem('meis_recent_played', JSON.stringify(updated))
      } catch (e) {}
      return updated
    })

    setTimeout(() => {
      isSwitchingTrackRef.current = false
    }, 500)
  }

  const handleNext = () => {
    if (isSwitchingTrackRef.current) return
    isSwitchingTrackRef.current = true
    setTimeout(() => {
      isSwitchingTrackRef.current = false
    }, 500)
    if (audioRef.current && !crossfadeEnabled) audioRef.current.currentTime = 0
    if (!currentTrack) return
    if (!playQueue || playQueue.length === 0) return

    if (repeatMode === 2) {
      if (isDsdTrack(currentTrack) && !bitPerfectEnabled) {
        setIsPlaying(false)
        showToast(
          language === 'vi'
            ? 'Định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO) để phát!'
            : 'DSD format requires Bit-Perfect mode (WASAPI / ASIO) to play!',
          'error'
        )
        return
      }
      handlePlayTrack(currentTrack)
      return
    }

    const currentIndex = playQueue.findIndex((t) => t.id === currentTrack.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= playQueue.length) {
      if (repeatMode === 1) {
        nextIndex = 0
      } else if (smartAutoplay) {
        const candidatePool = !bitPerfectEnabled
          ? libraryTracks.filter((t) => !isDsdTrack(t))
          : libraryTracks
        const candidate = findRecommendedTrack(currentTrack, playQueue, candidatePool)
        if (candidate && (!isDsdTrack(candidate) || bitPerfectEnabled)) {
          const newQueue = [...playQueue, candidate]
          setPlayQueue(newQueue)
          setOriginalQueue((prev) => [...prev, candidate])
          handlePlayTrack(candidate)
          showToast(
            t('player.smartAutoplayPlaying', {
              title: candidate.title,
              artist: candidate.artist || t('player.unknownArtist')
            }),
            'info'
          )
          return
        } else {
          setIsPlaying(false)
          if (bitPerfectEnabled || isDsdTrack(currentTrack)) window.api?.bassStop?.().catch(() => {})
          return
        }
      } else {
        setIsPlaying(false)
        if (bitPerfectEnabled || isDsdTrack(currentTrack)) window.api?.bassStop?.().catch(() => {})
        return
      }
    }

    if (!bitPerfectEnabled && isDsdTrack(playQueue[nextIndex])) {
      let foundIndex = -1
      const queueLen = playQueue.length
      const maxSteps = repeatMode === 1 ? queueLen : queueLen - nextIndex
      for (let offset = 1; offset < maxSteps; offset++) {
        const idx = (nextIndex + offset) % queueLen
        if (!isDsdTrack(playQueue[idx])) {
          foundIndex = idx
          break
        }
      }
      if (foundIndex !== -1) {
        showToast(
          language === 'vi'
            ? 'Đã bỏ qua bài hát DSD vì chế độ Bit-Perfect đang tắt'
            : 'Skipped DSD track because Bit-Perfect mode is off',
          'info'
        )
        handlePlayTrack(playQueue[foundIndex])
        return
      } else {
        setIsPlaying(false)
        showToast(
          language === 'vi'
            ? 'Định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO) để phát!'
            : 'DSD format requires Bit-Perfect mode (WASAPI / ASIO) to play!',
          'error'
        )
        return
      }
    }
    handlePlayTrack(playQueue[nextIndex])
  }

  useEffect(() => {
    handleNextRef.current = handleNext
  })

  const handlePrev = () => {
    if (isSwitchingTrackRef.current) return
    isSwitchingTrackRef.current = true
    setTimeout(() => {
      isSwitchingTrackRef.current = false
    }, 500)
    if (!currentTrack) return
    const isDsd = isDsdTrack(currentTrack)
    const useBass = bitPerfectEnabled || isDsd
    const curTime = useBass
      ? (audioRef.current as any)?._currentTime || 0
      : audioRef.current?.currentTime || 0
    const trackStart = currentTrack.startTime || 0
    const relTime = useBass ? curTime : Math.max(0, curTime - trackStart)

    if (relTime > 3) {
      if (useBass) {
        window.api?.bassSeek?.(0, 'absolute')
      } else if (audioRef.current) {
        audioRef.current.currentTime = trackStart
      }
      return
    }
    if (!playQueue || playQueue.length === 0) return

    const currentIndex = playQueue.findIndex((t) => t.id === currentTrack.id)
    let prevIndex = currentIndex - 1

    if (prevIndex < 0) {
      if (repeatMode === 1 || repeatMode === 2) prevIndex = playQueue.length - 1
      else prevIndex = 0
    }

    if (!bitPerfectEnabled && isDsdTrack(playQueue[prevIndex])) {
      let foundIndex = -1
      const queueLen = playQueue.length
      const maxSteps = repeatMode === 1 || repeatMode === 2 ? queueLen : prevIndex + 1
      for (let offset = 1; offset < maxSteps; offset++) {
        const idx = (prevIndex - offset + queueLen) % queueLen
        if (!isDsdTrack(playQueue[idx])) {
          foundIndex = idx
          break
        }
      }
      if (foundIndex !== -1) {
        showToast(
          language === 'vi'
            ? 'Đã bỏ qua bài hát DSD vì chế độ Bit-Perfect đang tắt'
            : 'Skipped DSD track because Bit-Perfect mode is off',
          'info'
        )
        handlePlayTrack(playQueue[foundIndex])
        return
      } else {
        setIsPlaying(false)
        showToast(
          language === 'vi'
            ? 'Định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO) để phát!'
            : 'DSD format requires Bit-Perfect mode (WASAPI / ASIO) to play!',
          'error'
        )
        return
      }
    }
    handlePlayTrack(playQueue[prevIndex])
  }

  const handlePlayPause = () => {
    if (!currentTrack) {
      if (libraryTracks.length > 0) {
        handleRowClick(libraryTracks[0], libraryTracks)
      }
      return
    }

    if (isDsdTrack(currentTrack) && !bitPerfectEnabled) {
      window.api?.bassStop?.().catch(() => {})
      setIsPlaying(false)
      showToast(
        language === 'vi'
          ? 'Định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO) để phát!'
          : 'DSD format requires Bit-Perfect mode (WASAPI / ASIO) to play!',
        'error'
      )
      return
    }

    const isDsd = isDsdTrack(currentTrack)
    const useBass = bitPerfectEnabled || isDsd
    if (useBass) {
      if (isPlaying) {
        window.api?.bassPause?.()
        setIsPlaying(false)
      } else {
        window.api?.bassResume?.()
        setIsPlaying(true)
      }
    } else if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {})
        }
        audioRef.current.play().catch(console.warn)
        setIsPlaying(true)
      }
    }
  }

  const handlePlayTrackRef = useRef(handlePlayTrack)
  useEffect(() => {
    handlePlayTrackRef.current = handlePlayTrack
  })

  const handleRowClick = useCallback(async (track: any, contextList?: any[]) => {
    if (contextList) {
      setOriginalQueue(contextList)
      const shuffleState = usePlayerStore.getState().isShuffle
      setPlayQueue(shuffleState ? fisherYatesShuffle(contextList) : contextList)
    }
    if (track.isCloud && !track.isOnline) {
      setCloudActionTrack(track)
    } else {
      handlePlayTrackRef.current(track)
    }
  }, [setOriginalQueue, setPlayQueue, setCloudActionTrack])

  const handleVolumeUp = () => {
    const newVol = Math.min(1, volume + 0.05)
    setVolume(newVol)
  }

  const handleVolumeDown = () => {
    const newVol = Math.max(0, volume - 0.05)
    setVolume(newVol)
  }

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume)
      setVolume(0)
    } else {
      setVolume(prevVolume || 0.5)
    }
  }

  const toggleShuffle = () => {
    const newShuffle = !isShuffle
    setIsShuffle(newShuffle)
    if (newShuffle) {
      const current = currentTrack
      const otherTracks = playQueue.filter((t) => t.id !== current?.id)
      const shuffled = current ? [current, ...fisherYatesShuffle(otherTracks)] : fisherYatesShuffle(playQueue)
      setPlayQueue(shuffled)
    } else {
      setPlayQueue(originalQueue)
    }
  }

  const toggleRepeat = () => {
    setRepeatMode(((repeatMode + 1) % 3) as 0 | 1 | 2)
  }

  const handleSeekForward = (seconds: number = 10) => {
    if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
      window.api?.bassSeek?.(seconds, 'relative')
    } else if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.duration || 0,
        audioRef.current.currentTime + seconds
      )
    }
  }

  const handleSeekBackward = (seconds: number = 10) => {
    if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
      window.api?.bassSeek?.(-seconds, 'relative')
    } else if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seconds)
    }
  }

  const handleStartRadio = (seedTrack?: any) => {
    const track = seedTrack || currentTrack
    if (!track) return
    const candidatePool = !bitPerfectEnabled
      ? libraryTracks.filter((t) => !isDsdTrack(t))
      : libraryTracks

    const radioQueue = [track]
    let pool = [...candidatePool.filter((t) => (t.id || t.filePath) !== (track.id || track.filePath))]

    while (radioQueue.length < 30 && pool.length > 0) {
      const last = radioQueue[radioQueue.length - 1]
      const next = findRecommendedTrack(last, radioQueue, pool)
      if (!next) break
      radioQueue.push(next)
      pool = pool.filter((t) => (t.id || t.filePath) !== (next.id || next.filePath))
    }

    setPlayQueue(radioQueue)
    setOriginalQueue(radioQueue)
    if (seedTrack && seedTrack !== currentTrack) {
      handlePlayTrack(seedTrack)
    }
    showToast(t('player.radioStarted', { title: track.title }), 'success')
  }

  // HTML5 Audio TimeUpdate handler
  const handleAudioTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return

    const trackStart = currentTrack?.startTime || 0
    const relTime = Math.max(0, audio.currentTime - trackStart)
    setCurrentTime(relTime)

    const trackEnd = currentTrack?.endTime || 0
    if (
      !isSwitchingTrackRef.current &&
      !audio.seeking &&
      trackEnd > trackStart &&
      audio.currentTime >= trackStart &&
      audio.currentTime >= trackEnd - 0.25
    ) {
      if (!hasTriggeredCrossfadeRef.current) {
        hasTriggeredCrossfadeRef.current = true
        handleNext()
      }
      return
    }

    const activeIdx = useLyricsStore.getState().currentLyricIndex
    if (!document.hidden && lyrics.length > 0 && lyrics[0].unsynced) {
      if (activeIdx !== -1) setCurrentLyricIndex(-1)
    } else if (!document.hidden && lyrics.length > 0) {
      const visualTime = relTime + 0.3 + (lyricOffset || 0)
      const index = lyrics.findIndex((line, i) => {
        const nextLine = lyrics[i + 1]
        if (nextLine) return visualTime >= line.time && visualTime < nextLine.time
        return visualTime >= line.time
      })
      if (index !== activeIdx) setCurrentLyricIndex(index)
    }
  }

  const handleAudioPlay = () => {
    if (audioRef.current && !bitPerfectEnabled && !isDsdTrack(currentTrack)) {
      audioRef.current.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
    }
  }

  const handleAudioEnded = () => {
    const audio = audioRef.current
    if (audio && audio.duration && audio.duration - audio.currentTime > 2) {
      console.warn('[Player] Phát hiện đứt luồng mạng, tự động nối lại...')
      const time = audio.currentTime
      audio.load()
      audio.currentTime = time
      audio.play().catch(() => {})
      return
    }
    if (sleepTimerMode === 'end_of_track') {
      setSleepTimerMode('off')
      setSleepTimerRemaining(null)
      setIsPlaying(false)
      if (audio) audio.pause()
      showToast(t('player.sleepTimerStoppedToast'), 'info')
      return
    }
    if (!hasTriggeredCrossfadeRef.current) {
      handleNext()
    }
    hasTriggeredCrossfadeRef.current = false
  }

  const handleAudioError = (e: any) => {
    console.error('[Audio Error]', e)
  }

  return {
    audioRef,
    audioCtxRef,
    filterNodesRef,
    pendingSeekTimeRef,
    analyserNodeRef,
    audioRemountCount,
    currentSampleRate,
    resetWebAudioPipeline,
    handlePlayTrack,
    handlePlayPause,
    handleNext,
    handlePrev,
    handleRowClick,
    handleVolumeUp,
    handleVolumeDown,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    handleSeekForward,
    handleSeekBackward,
    handleStartRadio,
    handleAudioPlay,
    handleAudioEnded,
    handleAudioError,
    handleAudioTimeUpdate,
    availableAudioDevices,
    selectedDeviceId,
    setSelectedDeviceId
  }
}

