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
import { isDsdTrack, getTrackSeekRange, clampSeekRange } from '../utils/formatUtils'
import { isSameTrack } from '../utils/trackStateUtils'
import { extractRawFilePath } from '../utils/urlUtils'
import {
  seekWebAudioCompatible,
  getReloadSeekOffset,
  getOnlineSeekKey,
  clearOnlineSeekState,
  stripOnlineSeekParam
} from '../utils/onlineSeekUtils'
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

// Throttle đẩy currentTime vào Zustand (500ms): timeupdate/BASS bắn 4-5Hz,
// store chỉ cần 2Hz cho tracker + highlight; seekbar mượt dùng state cục bộ riêng
const shouldPushStoreTime = (ref: { current: number }, minGapMs = 500): boolean => {
  const now = performance.now()
  if (now - ref.current >= minGapMs) {
    ref.current = now
    return true
  }
  return false
}
// Binary search lyric index (O(log n) thay vì findIndex O(n) mỗi tick 5Hz)
const findLyricIndex = (lyrics: Array<{ time: number }>, visualTime: number): number => {
  let lo = 0
  let hi = lyrics.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lyrics[mid].time <= visualTime) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
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
  const crossfeedMergerNodeRef = useRef<GainNode | null>(null)
  const crossfeedNodesRef = useRef<AudioNode[]>([])

  // Internal State & Control Refs
  const [audioRemountCount, setAudioRemountCount] = useState(0)
  const selectedDeviceRef = useRef<string>('auto')
  const pendingSeekTimeRef = useRef<number | null>(null)
  const preloadedRef = useRef<string | null>(null)
  const hasTriggeredCrossfadeRef = useRef(false)
  const isSwitchingTrackRef = useRef(false)
  // "Giấy phép crossfade" cho object track hiện hành: handler timeUpdate từ render
  // cũ (closure còn giữ currentTrack của bài trước) vẫn bắn tiếp trong lúc
  // handlePlayTrack đang resolve stream bài online — so identity để chặn trigger
  // lặp trong cửa sổ đó, tránh tự động nhảy qua 2 bài liên tiếp.
  const crossfadeArmedTrackRef = useRef<any>(null)
  const isGaplessTransitioningRef = useRef(false)
  const prevTrackModeRef = useRef<'bass' | 'webaudio'>('webaudio')
  const handleNextRef = useRef<() => void>(() => {})
  // Gain setup đọc qua ref để effect graph không phải rebuild mỗi lần đổi bài
  const gainTrackRef = useRef<any>(null)
  // Mốc throttle đẩy currentTime vào Zustand (store 2Hz, tick gốc 4-5Hz)
  const lastStoreTimeRef = useRef(0)

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

  const { libraryTracks, setRecentlyPlayed } = useLibraryStore()

  const { showToast, setCustomDialog } = useUIStore()
  const { lyrics, setCurrentLyricIndex } = useLyricsStore()

  const isCore = appMode === 'core'

  const currentSampleRate = currentTrack?.sampleRate || 44100

  // Refs giữ giá trị crossfade mới nhất, tránh đưa crossfadeEnabled/crossfadeDuration
  // vào dependency array của effect bassPlay (gọi lại sẽ restart bài hát từ 0:00
  // khi đang phát Bit-Perfect). Tham số crossfade truyền xuống main bị bỏ qua
  // (_crossfadeDuration), crossfade xử lý hoàn toàn ở listener onBassTime phía renderer.
  const crossfadeEnabledRef = useRef(crossfadeEnabled)
  const crossfadeDurationRef = useRef(crossfadeDuration)

  useEffect(() => {
    crossfadeEnabledRef.current = crossfadeEnabled
    crossfadeDurationRef.current = crossfadeDuration
  }, [crossfadeEnabled, crossfadeDuration])

  useEffect(() => {
    gainTrackRef.current = currentTrack || null
  }, [currentTrack])

  useEffect(() => {
    crossfadeArmedTrackRef.current = currentTrack || null
  }, [currentTrack])

  useEffect(() => {
    selectedDeviceRef.current = selectedDeviceId
  }, [selectedDeviceId])

  const showAlert = useCallback(
    (options: {
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
    },
    [setCustomDialog]
  )

  const resetWebAudioPipeline = useCallback(async () => {
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
      } catch {}
      audioCtxRef.current = null
    }
    sourceNodeRef.current = null
    analyserNodeRef.current = null
    preampNodeRef.current = null
    compressorNodeRef.current = null
    filterNodesRef.current = []
    crossfeedGainNodeRef.current = null
    crossfeedMergerNodeRef.current = null
    crossfeedNodesRef.current = []
    setAudioRemountCount((c) => c + 1)
  }, [])

  // Ngắt toàn bộ node của chuỗi Crossfeed của lần setupAudio trước (splitter,
  // lowpass, delay, crossMerger, crossfeedGain, crossfeedMerger). Nếu không ngắt,
  // mỗi lần setupAudio chạy lại khi đổi bài, chuỗi cũ còn nối vào analyserNode
  // (được tái sử dụng giữa các lần setup) → rò rỉ node và chồng chéo luồng âm
  // thanh khi bật Crossfeed DSP.
  const teardownCrossfeed = useCallback(() => {
    crossfeedNodesRef.current.forEach((node) => {
      try {
        node.disconnect()
      } catch {}
    })
    crossfeedNodesRef.current = []
    if (
      crossfeedGainNodeRef.current &&
      crossfeedGainNodeRef.current !== crossfeedMergerNodeRef.current
    ) {
      try {
        crossfeedGainNodeRef.current.disconnect()
      } catch {}
    }
    if (crossfeedMergerNodeRef.current) {
      try {
        // Ngắt connection crossfeedMerger → analyser của lần setup trước
        crossfeedMergerNodeRef.current.disconnect()
      } catch {}
    }
    crossfeedGainNodeRef.current = null
    crossfeedMergerNodeRef.current = null
  }, [])

  // Audio Output Devices Discovery
  useEffect(() => {
    const getDevices = async () => {
      try {
        if (window.api && (window.api as any).getAudioDevices) {
          const res = await (window.api as any).getAudioDevices()
          const devs = Array.isArray(res) ? res : Array.isArray(res?.devices) ? res.devices : []
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
      (t) => isSameTrack(t, currentTrack) && t.startTime === currentTrack.startTime
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
      window.api?.bassPreloadNext?.(nextTrack.filePath, nextTrack.startTime, nextTrack.endTime)
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
        } catch {}
        if (isCancelled) return
        audioCtxRef.current = null
        sourceNodeRef.current = null
        analyserNodeRef.current = null
        preampNodeRef.current = null
        compressorNodeRef.current = null
        filterNodesRef.current = []
        crossfeedMergerNodeRef.current = null
        crossfeedGainNodeRef.current = null
        crossfeedNodesRef.current = []
      }
      if (isCancelled) return

      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        try {
          audioCtxRef.current = new AudioContextClass({ sampleRate: currentSampleRate })
        } catch {
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
        } catch {
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
      } catch {}
      try {
        preampNodeRef.current?.disconnect()
      } catch {}
      try {
        analyserNodeRef.current?.disconnect()
      } catch {}
      try {
        compressorNodeRef.current?.disconnect()
      } catch {}
      filterNodesRef.current.forEach((node) => {
        try {
          node.disconnect()
          node.frequency.cancelScheduledValues(0)
          node.gain.cancelScheduledValues(0)
        } catch {}
      })
      filterNodesRef.current = []
      teardownCrossfeed()

      // Đọc gain qua ref: effect này không còn phụ thuộc currentTrack nên đổi bài
      // không rebuild graph; giá trị chuẩn do realtime-effect bên dưới chỉnh ngay sau.
      const gainTrack = gainTrackRef.current
      let replayGainMultiplier = 1.0
      if (!bitPerfectEnabled && replayGainMode !== 'off' && gainTrack) {
        let rgDb = 0
        if (replayGainMode === 'track' && typeof (gainTrack as any).replayGainTrack === 'number') {
          rgDb = (gainTrack as any).replayGainTrack
        } else if (replayGainMode === 'album') {
          rgDb = (gainTrack as any)?.replayGainAlbum ?? (gainTrack as any)?.replayGainTrack ?? 0
        }
        if (rgDb) {
          const linearRg = Math.pow(10, rgDb / 20)
          replayGainMultiplier = Math.min(2.0, Math.max(0.1, linearRg))
        }
      }

      const normGainDb = loudnessNormalization ? ((gainTrack as any)?.replayGain ?? -3.0) : 0
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
      // Toàn bộ node phụ trợ của chuỗi crossfeed được lưu vào crossfeedNodesRef
      // để teardownCrossfeed() có thể ngắt sạch khi setupAudio chạy lại (đổi bài,
      // đổi EQ...), tránh chồng chéo luồng âm thanh.
      const crossfeedMerger = ctx.createGain()
      crossfeedMerger.gain.value = 1.0
      crossfeedMergerNodeRef.current = crossfeedMerger
      crossfeedNodesRef.current = [crossfeedMerger]
      prevNode.connect(crossfeedMerger)

      const splitter = ctx.createChannelSplitter(2)
      crossfeedNodesRef.current.push(splitter)
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
      crossfeedNodesRef.current.push(filterL, filterR, delayL, delayR)

      splitter.connect(filterL, 0)
      filterL.connect(delayL)

      splitter.connect(filterR, 1)
      filterR.connect(delayR)

      const crossMerger = ctx.createChannelMerger(2)
      crossfeedNodesRef.current.push(crossMerger)
      delayR.connect(crossMerger, 0, 0)
      delayL.connect(crossMerger, 0, 1)

      const crossfeedGain = ctx.createGain()
      crossfeedGain.gain.value = crossfeedSetting ? 0.28 : 0
      crossfeedGainNodeRef.current = crossfeedGain
      crossfeedNodesRef.current.push(crossfeedGain)

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
    // Deps cố ý thu gọn: rebuild graph nặng chỉ khi thêm/bớt band (length),
    // đổi giá trị gain dùng realtime-effect bên dưới để không rè tiếng.
    // currentSampleRate giữ lại để vẫn rebuild khi đổi tần số lấy mẫu;
    // currentTrack bị loại: đổi bài không chạm graph, gain đọc qua ref + realtime-effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEqEnabled,
    currentSampleRate,
    isCore,
    eqBands.length,
    loudnessNormalization,
    replayGainMode,
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
        if (
          replayGainMode === 'track' &&
          typeof (currentTrack as any).replayGainTrack === 'number'
        ) {
          rgDb = (currentTrack as any).replayGainTrack
        } else if (replayGainMode === 'album') {
          rgDb =
            (currentTrack as any)?.replayGainAlbum ?? (currentTrack as any)?.replayGainTrack ?? 0
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
              const index = findLyricIndex(lyrics, visualTime)
              if (index !== useLyricsStore.getState().currentLyricIndex) setCurrentLyricIndex(index)
            }
            if (shouldPushStoreTime(lastStoreTimeRef)) setCurrentTime(val)
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
            (t) => isSameTrack(t, currentTrack) && t.startTime === currentTrack?.startTime
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

          // nextPath từ main là đường dẫn thô (không có file://, không có #track-N),
          // còn track.filePath trong queue là URL file:// -> chuẩn hóa trước khi so.
          // shortcut: so khớp tuyệt đối, tránh replay đè lên stream gapless vừa chuyển
          // (replay gây giật + mở rộng cửa sổ race stop()/transition -> crash).
          const normGaplessPath = (p: any): string => {
            const raw = extractRawFilePath(typeof p === 'string' ? p : '') || ''
            const noFrag = raw.includes('#track-') ? raw.split('#track-')[0] : raw
            return noFrag.toLowerCase()
          }
          if (
            candidateTrack &&
            normGaplessPath(candidateTrack.filePath) === normGaplessPath(nextPath)
          ) {
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

    const onParamsFn =
      (window.api as any)?.onBassAudioOutParams || (window.api as any)?.onBassAudioParams
    const unParams =
      typeof onParamsFn === 'function'
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
    setCurrentTrack,
    setSleepTimerMode,
    setSleepTimerRemaining,
    showAlert
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
        // Chỉ mở stream & phát khi thực sự đang phát (isPlaying).
        // Khi khôi phục phiên nghe khi mở app, isPlaying = false nên KHÔNG tự phát nhạc.
        if (isPlaying) {
          window.api?.bassPlay?.(
            currentTrack.filePath,
            crossfadeEnabledRef.current ? crossfadeDurationRef.current : 0,
            bitPerfectEnabled,
            currentTrack.startTime,
            currentTrack.endTime
          )
          if (audioRef.current) audioRef.current.pause()
        } else {
          // Khôi phục phiên nghe ở trạng thái tạm dừng:
          // vẫn mở stream trong BASS (mute để kêu lảnh) rồi pause lại ngay,
          // để nút Play sau đó hoạt động bình thường qua bassResume().
          ;(async () => {
            try {
              // Chờ qua vòng flush hiện tại để IPC setVolume từ effect khác chạy trước
              await new Promise((r) => setTimeout(r, 0))
              await window.api?.bassSetVolume?.(0)
              await window.api?.bassPlay?.(
                currentTrack.filePath,
                crossfadeEnabledRef.current ? crossfadeDurationRef.current : 0,
                bitPerfectEnabled,
                currentTrack.startTime,
                currentTrack.endTime
              )
              window.api?.bassPause?.()
            } catch {}
            window.api?.bassSetVolume?.(sliderToGain(volume))
          })()
        }
        if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
          const seekTo = pendingSeekTimeRef.current
          pendingSeekTimeRef.current = null
          setTimeout(() => {
            window.api?.bassSeek?.(seekTo, 'absolute')
          }, 150)
        }
      } else {
        window.api?.bassStop?.().catch(() => {})
        if (audioRef.current) {
          // Chế độ WebAudio (chuẩn): định vị theo startTime của CUE, sau đó
          // khôi phục vị trí phát cũ của phiên nghe nếu có tồn đọng,
          // tránh luôn phát lại từ 0:00 khi mở app.
          const startOffset =
            typeof currentTrack.startTime === 'number' ? currentTrack.startTime : 0
          audioRef.current.currentTime = startOffset
          if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
            audioRef.current.currentTime = startOffset + pendingSeekTimeRef.current
          }
        }
      }
    }
    // Deps cố ý thu gọn: isPlaying bị loại trừ để pause/resume đi qua
    // bassResume/bassPause thay vì mở lại stream BASS từ đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, bitPerfectEnabled, bitPerfectType])

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

    const trackToPlay = { ...track }
    // Đổi bài khác -> xóa offset/?seek= tồn đọng của bài cũ (tránh rò rỉ
    // offset sang bài mới và đánh dấu HLS sai track).
    if (currentTrack && getOnlineSeekKey(currentTrack) !== getOnlineSeekKey(trackToPlay)) {
      clearOnlineSeekState(currentTrack)
    }
    // Cấp phép crossfade cho track mới NGAY LẬP TỨC (trước khi chờ resolve stream
    // online) để handler timeUpdate của bài cũ — closure currentTrack vẫn là object
    // cũ — không thể tự gọi handleNext lần nữa trong cửa sổ chờ. Nếu resolve lỗi
    // và return sớm, giấy phép lệch với bài cũ cũng chấp nhận được (được re-arm
    // ở effect [currentTrack] của lần đổi bài kế tiếp).
    crossfadeArmedTrackRef.current = trackToPlay

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

    // Kiểm tra file nhạc local còn nằm trên đĩa trước khi phát: file bị xóa/di
    // chuyển bên ngoài app khiến /local-audio trả 404, và Chromium quy lỗi đó về
    // MEDIA_ERR_SRC_NOT_SUPPORTED "Format error" khó hiểu. Chặn sớm với thông
    // báo rõ ràng (giống nhánh DSD phía trên: reset isSwitchingTrackRef trước khi thoát).
    if (!isOnlineTrack && trackToPlay.filePath && typeof trackToPlay.filePath === 'string') {
      try {
        // @ts-ignore
        const probe = await window.api?.checkLocalAudioFile?.(trackToPlay.filePath)
        if (probe && !probe.exists) {
          isSwitchingTrackRef.current = false
          console.warn(
            '[Audio] Bỏ qua phát — file nguồn không còn tồn tại:',
            probe.path || trackToPlay.filePath
          )
          showToast(t('player.fileMissingToast'), 'error')
          return
        }
      } catch (_) {
        // IPC kiểm tra lỗi → bỏ qua bước chặn, để luồng phát chính xử lý qua handleAudioError
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
      const isSameFile = !!currentTrack && currentTrack.filePath === trackToPlay.filePath
      let startedCrossfade = false

      // Crossfade HTML5/WebAudio: nhân bản bài cũ sang một Audio riêng để fade out,
      // bài mới vào sau đó trên thẻ chính. Volume của fadeAudio PHẢI map qua
      // sliderToGain (đường cong bậc 2, G = x^2) để khớp độ to của thẻ chính, đồng
      // thời tắt tiếng ngay trên thẻ chính vì nó vẫn đang phát bài cũ cho tới khi
      // src mới được commit, tránh hai luồng cùng phát khiến bài cũ vọt lên gần
      // 2 lần độ to trước khi nhỏ dần.
      if (crossfadeEnabled && isPlaying && currentTrack && !bitPerfectEnabled) {
        try {
          // src có thể kèm ?seek= (HLS reload): tước đi rồi cộng bù offset để
          // fadeAudio tiếp tục đúng vị trí thay vì phát lại từ điểm seek.
          const fadeSrc = stripOnlineSeekParam(audioRef.current.src || '')
          const fadeAudio = new Audio(fadeSrc)
          fadeAudio.currentTime = audioRef.current.currentTime + getReloadSeekOffset(currentTrack)
          const sliderVol = Math.max(0, Math.min(1, volume))
          fadeAudio.volume = sliderToGain(sliderVol)
          audioRef.current.volume = 0
          fadeAudio.play().catch(() => {})
          startedCrossfade = true

          // Nội suy vị trí slider tuyến tính theo thời gian rồi mới map qua
          // sliderToGain: độ to thính giác của bài cũ giảm đều trong crossfadeDuration
          const ticks = Math.max(1, Math.round(crossfadeDuration * 20))
          let tick = 0
          const fadeInterval = setInterval(() => {
            tick++
            const fadeGain = sliderToGain(sliderVol * (1 - tick / ticks))
            if (fadeGain > 0.0001) {
              fadeAudio.volume = fadeGain
            } else {
              clearInterval(fadeInterval)
              fadeAudio.pause()
              fadeAudio.removeAttribute('src')
              fadeAudio.src = ''
              fadeAudio.load()
            }
          }, 50)
        } catch {}
      }

      // Khi crossfade đã bắt đầu và src sắp được thay bằng bài mới: giữ thẻ chính
      // ở mức 0 tiếng để nhường bài cũ cho fadeAudio (Watch Volume effect + onPlay
      // sẽ khôi phục gain đầy đủ ngay sau khi src mới được gán). Còn lại (không
      // crossfade, hoặc replay đúng file đang phát - src không đổi nên không có
      // effect khôi phục): đặt lại gain đầy đủ ngay.
      if (!startedCrossfade || isSameFile) {
        audioRef.current.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
      }
      if (isSameFile) {
        audioRef.current.currentTime = trackToPlay.startTime || 0
        audioRef.current.play().catch(() => {})
      }
    }

    setCurrentTrack(trackToPlay)
    setIsPlaying(true)
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {})
    }

    // Recently Played: hoãn sau khi audio đã start, tránh JSON stringify chặn main thread lúc chuyển bài
    const recentEntry = {
      id: trackToPlay.id || trackToPlay.filePath,
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
    }
    setTimeout(() => {
      setRecentlyPlayed((prev) => {
        const filtered = prev.filter((trk) => (trk.id || trk.filePath) !== recentEntry.id)
        const updated = [recentEntry, ...filtered].slice(0, 50)
        try {
          localStorage.setItem('meis_recent_played', JSON.stringify(updated))
        } catch {}
        return updated
      })
    }, 0)

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

    const currentIndex = playQueue.findIndex((t) => isSameTrack(t, currentTrack))
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
          if (bitPerfectEnabled || isDsdTrack(currentTrack))
            window.api?.bassStop?.().catch(() => {})
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

    const currentIndex = playQueue.findIndex((t) => isSameTrack(t, currentTrack))
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

  const handleRowClick = useCallback(
    async (track: any, contextList?: any[]) => {
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
    },
    [setOriginalQueue, setPlayQueue, setCloudActionTrack]
  )

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
      const otherTracks = playQueue.filter((t) => !isSameTrack(t, current))
      const shuffled = current
        ? [current, ...fisherYatesShuffle(otherTracks)]
        : fisherYatesShuffle(playQueue)
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
      // Kẹp phạm vi theo [startTime, endTime] của track CUE thay vì [0, duration]
      // của cả tệp vật lý (tua qua ranh giới CUE sẽ nhảy sang bài kế tiếp).
      // Stream online HLS (YTM) không tua native được -> helper tự reload ?seek=.
      // Cộng offset reload (?seek=) vì sau reload currentTime đếm lại từ 0.
      const range = getTrackSeekRange(currentTrack, audioRef.current.duration)
      const baseAbs = audioRef.current.currentTime + getReloadSeekOffset(currentTrack)
      const relTarget = clampSeekRange(baseAbs + seconds, range) - range.start
      seekWebAudioCompatible(audioRef.current, currentTrack, relTarget, range.start)
    }
  }

  const handleSeekBackward = (seconds: number = 10) => {
    if (bitPerfectEnabled || isDsdTrack(currentTrack)) {
      window.api?.bassSeek?.(-seconds, 'relative')
    } else if (audioRef.current) {
      const range = getTrackSeekRange(currentTrack, audioRef.current.duration)
      const baseAbs = audioRef.current.currentTime + getReloadSeekOffset(currentTrack)
      const relTarget = clampSeekRange(baseAbs - seconds, range) - range.start
      seekWebAudioCompatible(audioRef.current, currentTrack, relTarget, range.start)
    }
  }

  const handleStartRadio = (seedTrack?: any) => {
    const track = seedTrack || currentTrack
    if (!track) return
    const candidatePool = !bitPerfectEnabled
      ? libraryTracks.filter((t) => !isDsdTrack(t))
      : libraryTracks

    const radioQueue = [track]
    let pool = [
      ...candidatePool.filter((t) => (t.id || t.filePath) !== (track.id || track.filePath))
    ]

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
    // Stream HLS reload (?seek=) đếm lại currentTime từ 0 -> cộng bù offset
    const hlsOffset = getReloadSeekOffset(currentTrack)
    const relTime = Math.max(0, audio.currentTime - trackStart) + hlsOffset
    if (shouldPushStoreTime(lastStoreTimeRef)) setCurrentTime(relTime)

    const trackEnd = currentTrack?.endTime || 0
    // Điểm kết thúc hiệu dụng: ranh giới CUE (endTime) nếu có, ngược lại là chu kỳ
    // phát dài thật của nguồn (bài thường / CUE full file).
    const rawDur = audio.duration
    const trackLen =
      typeof currentTrack?.duration === 'number' && !isNaN(currentTrack.duration)
        ? currentTrack.duration
        : 0
    let effectiveEnd = trackEnd > trackStart ? trackEnd : 0
    if (!effectiveEnd) {
      // Giữ nguyên hành vi cũ khi duration vật lý hợp lệ; chỉ dùng metadata khi
      // duration vô định (NaN/Infinity ở luồng HLS transcode).
      if (typeof rawDur === 'number' && isFinite(rawDur) && rawDur > 0) {
        effectiveEnd = rawDur
      } else if (trackLen > 0) {
        effectiveEnd = trackStart + Math.max(0, trackLen - hlsOffset)
      }
    }
    // Thời gian còn lại theo toạ độ ảo của track (khớp cách BASS tính
    // getDuration/getPosition: đều trừ startTime, cộng dồn ranh giới endTime)
    const remaining = effectiveEnd > 0 ? Math.max(0, effectiveEnd - audio.currentTime) : Infinity

    // Crossfade HTML5/WebAudio — tương tự nhánh onBassTime của BASS: gọi handleNext
    // sớm `crossfadeDuration` giây trước khi bài kết thúc để bridging hai bài trong
    // suốt quá trình fade out, thay vì đợi thẻ phát hết bài rồi mới chuyển (không
    // còn dư thời gian cho fade).
    if (
      !isSwitchingTrackRef.current &&
      !audio.seeking &&
      crossfadeEnabled &&
      !bitPerfectEnabled &&
      crossfadeArmedTrackRef.current === currentTrack &&
      effectiveEnd > crossfadeDuration &&
      remaining <= crossfadeDuration &&
      !hasTriggeredCrossfadeRef.current
    ) {
      hasTriggeredCrossfadeRef.current = true
      handleNext()
      return
    } else if (
      hasTriggeredCrossfadeRef.current &&
      crossfadeEnabled &&
      effectiveEnd > crossfadeDuration &&
      remaining > crossfadeDuration + 2
    ) {
      // Đã bật cờ crossfade nhưng chưa sang bài (ví dụ người dùng tua ngược ra
      // giữa bài): gỡ cờ để có thể phát lại khi tiến sát kết thúc lần nữa.
      hasTriggeredCrossfadeRef.current = false
    }

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
      const index = findLyricIndex(lyrics, visualTime)
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
    // Duration vô định (NaN/Infinity ở luồng HLS transcode) thì dùng metadata
    // trừ offset reload, tránh nhầm "hết bài thật" thành "đứt mạng".
    const hlsOff = getReloadSeekOffset(currentTrack)
    const rawDur = audio?.duration
    const metaLen =
      typeof currentTrack?.duration === 'number' && !isNaN(currentTrack.duration)
        ? currentTrack.duration
        : 0
    const effDur =
      typeof rawDur === 'number' && isFinite(rawDur) && rawDur > 0
        ? rawDur
        : metaLen > 0
          ? Math.max(0, metaLen - hlsOff)
          : 0
    if (audio && effDur > 0 && effDur - audio.currentTime > 2) {
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

  const MEDIA_ERROR_NAMES: Record<number, string> = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
  }

  // async: phần cuối dùng await để xác minh nguyên nhân lỗi nguồn local,
  // handler sự kiện chỉ cần trả Promise — React chấp nhận bình thường.
  const handleAudioError = async (e: any) => {
    // DOM 'error' trên <audio> không mang thông tin trong event — chi tiết thật
    // nằm ở MediaError của chính phần tử (audio.error), nên đọc từ đó thay vì
    // in cả SyntheticEvent của React ra console.
    const audio = (e?.target as HTMLAudioElement) || audioRef.current
    const mediaError = audio?.error

    // Không có MediaError → vỡ mór tầm thường (abort/sự kiện ký sinh khi đổi
    // src, gắn lại thẻ, ...), bỏ qua để tránh gây ồn console.
    if (!mediaError) return

    const code = mediaError.code
    const codeName = MEDIA_ERROR_NAMES[code] || `MEDIA_ERR_UNKNOWN(${code})`

    // Đang load lại luồng đứt mạng (xem handleAudioEnded) hoặc đổi src bình
    // thường gây MEDIA_ERR_ABORTED — không phải lỗi thật, giữ nguyên trạng thái
    // phát để chạy nối lại.
    if (code === 1) {
      console.warn('[Audio] Fetch bị hủy trong quá trình load, bỏ qua (aborted)')
      return
    }

    const src = audio?.currentSrc || audio?.src || ''
    console.error(
      `[Audio Error] ${codeName} code=${code}`,
      mediaError.message || '(không có message từ trình duyệt)',
      'src=',
      src ? src.slice(0, 300) : '(trống)'
    )

    setIsPlaying(false)

    // Với luồng local (/local-audio): cả HTTP 404 (file bị xóa/di chuyển) lẫn 403
    // (đường dẫn không trong whitelist) đều bị Chromium quy đồng thành
    // MEDIA_ERR_SRC_NOT_SUPPORTED "Format error" — xác minh lại với main process
    // để báo đúng nguyên nhân thay vì thông báo chung chung.
    if (code === 4 && src.includes('/local-audio?path=')) {
      try {
        // @ts-ignore
        const probe = await window.api?.checkLocalAudioFile?.(src)
        if (probe && !probe.exists) {
          console.error('[Audio Error] File nguồn không còn trên đĩa (HTTP 404):', probe.path)
          showToast(t('player.fileMissingToast'), 'error')
          return
        }
        if (probe && !probe.serving) {
          console.error(
            '[Audio Error] File nguồn tồn tại nhưng bị từ chối stream (HTTP 403):',
            probe.path
          )
        }
      } catch (_) {
        // Không xác minh được nguyên nhân → giữ thông báo chung chung phía dưới
      }
    }

    // Thẻ <audio> đã dừng phát sau lỗi thật → đồng bộ lại trạng thái UI,
    // tránh trường hợp nút Pause/mở khóa trạng thái đang "phát" ma.
    showToast(t('player.audioErrorToast'), 'error')
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
