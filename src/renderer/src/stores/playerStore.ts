import { create } from 'zustand'

export interface PlayerState {
  currentTrack: any | null
  isPlaying: boolean
  isShuffle: boolean
  originalQueue: any[]
  playQueue: any[]
  repeatMode: 0 | 1 | 2
  volume: number
  prevVolume: number
  bitPerfectEnabled: boolean
  crossfadeEnabled: boolean
  crossfadeDuration: number
  bassOutParams: {
    samplerate?: number
    format?: string
    channels?: string
    mode?: 'WASAPI' | 'ASIO'
    isDsd?: boolean
  } | null
  smartAutoplay: boolean
  lyricOffset: number
  sleepTimerMode: 'off' | '15' | '30' | '45' | '60' | 'end_of_track'
  sleepTimerRemaining: number | null
  showSleepTimerMenu: boolean

  // A-B Loop States
  loopA: number | null
  loopB: number | null

  // Session Persistence States
  currentTime: number
  queueIndex: number

  // Actions
  setCurrentTrack: (track: any | null | ((prev: any | null) => any | null)) => void
  setIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void
  setIsShuffle: (shuffle: boolean | ((prev: boolean) => boolean)) => void
  setOriginalQueue: (queue: any[] | ((prev: any[]) => any[])) => void
  setPlayQueue: (queue: any[] | ((prev: any[]) => any[])) => void
  addToQueue: (tracks: any | any[]) => number
  setRepeatMode: (mode: 0 | 1 | 2 | ((prev: 0 | 1 | 2) => 0 | 1 | 2)) => void
  setVolume: (volume: number | ((prev: number) => number)) => void
  setPrevVolume: (vol: number | ((prev: number) => number)) => void
  setBitPerfectEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setCrossfadeEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setCrossfadeDuration: (duration: number | ((prev: number) => number)) => void
  setBassOutParams: (
    params:
      | {
          samplerate?: number
          format?: string
          channels?: string
          mode?: 'WASAPI' | 'ASIO'
          isDsd?: boolean
        }
      | null
      | ((prev: any) => any)
  ) => void
  setSmartAutoplay: (autoplay: boolean | ((prev: boolean) => boolean)) => void
  setLyricOffset: (offset: number | ((prev: number) => number)) => void
  setSleepTimerMode: (mode: 'off' | '15' | '30' | '45' | '60' | 'end_of_track') => void
  setSleepTimerRemaining: (
    remaining: number | null | ((prev: number | null) => number | null)
  ) => void
  setShowSleepTimerMenu: (show: boolean | ((prev: boolean) => boolean)) => void

  setLoopA: (loopA: number | null | ((prev: number | null) => number | null)) => void
  setLoopB: (loopB: number | null | ((prev: number | null) => number | null)) => void
  clearABLoop: () => void
  setCurrentTime: (time: number | ((prev: number) => number)) => void
  setQueueIndex: (index: number | ((prev: number) => number)) => void
  savePlaybackSession: () => void
  loadPlaybackSession: () => PlaybackSession | null
}

export interface PlaybackSession {
  currentTrack: any | null
  currentTime: number
  playQueue: any[]
  originalQueue: any[]
  queueIndex: number
  isShuffle: boolean
  repeatMode: 0 | 1 | 2
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

const getInitialLyricOffset = (): number => {
  try {
    const saved = localStorage.getItem('meis_lyric_offset')
    return saved ? parseFloat(saved) || 0 : 0
  } catch {
    return 0
  }
}

const getInitialSmartAutoplay = (): boolean => {
  try {
    return localStorage.getItem('meis_smart_autoplay') === 'true'
  } catch {
    return false
  }
}

const PLAYBACK_SESSION_KEY = 'meis_playback_session'
const PLAYBACK_QUEUES_KEY = 'meis_playback_queues'
let lastSavedPlayQueue: any[] | null = null
let lastSavedOriginalQueue: any[] | null = null

export const savePlaybackSession = (): void => {
  try {
    const state = usePlayerStore.getState()
    const playQueue = state.playQueue || []
    const originalQueue = state.originalQueue || []

    // Persist large queue arrays separately only when their references change so track switches don't re-stringify thousands of tracks.
    if (
      lastSavedPlayQueue !== playQueue ||
      lastSavedOriginalQueue !== originalQueue ||
      !localStorage.getItem(PLAYBACK_QUEUES_KEY)
    ) {
      localStorage.setItem(PLAYBACK_QUEUES_KEY, JSON.stringify({ playQueue, originalQueue }))
      lastSavedPlayQueue = playQueue
      lastSavedOriginalQueue = originalQueue
    }

    const sessionMeta = {
      currentTrack: state.currentTrack,
      currentTime: state.currentTime || 0,
      queueIndex: state.queueIndex || 0,
      isShuffle: state.isShuffle || false,
      repeatMode: state.repeatMode || 0
    }
    localStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify(sessionMeta))
  } catch {
    /* ignore */
  }
}

export const loadPlaybackSession = (): PlaybackSession | null => {
  try {
    const saved = localStorage.getItem(PLAYBACK_SESSION_KEY)
    if (!saved) return null
    const session = JSON.parse(saved)
    if (session && typeof session === 'object') {
      let playQueue: any[] = Array.isArray(session.playQueue) ? session.playQueue : []
      let originalQueue: any[] = Array.isArray(session.originalQueue) ? session.originalQueue : []
      const savedQueues = localStorage.getItem(PLAYBACK_QUEUES_KEY)
      if (savedQueues) {
        try {
          const parsedQueues = JSON.parse(savedQueues)
          if (parsedQueues && typeof parsedQueues === 'object') {
            if (Array.isArray(parsedQueues.playQueue)) playQueue = parsedQueues.playQueue
            if (Array.isArray(parsedQueues.originalQueue))
              originalQueue = parsedQueues.originalQueue
          }
        } catch {
          /* ignore */
        }
      }

      const fullSession: PlaybackSession = {
        currentTrack: session.currentTrack ?? null,
        currentTime: typeof session.currentTime === 'number' ? session.currentTime : 0,
        playQueue,
        originalQueue,
        queueIndex: typeof session.queueIndex === 'number' ? session.queueIndex : 0,
        isShuffle: !!session.isShuffle,
        repeatMode: session.repeatMode === 1 || session.repeatMode === 2 ? session.repeatMode : 0
      }

      usePlayerStore.setState({
        currentTrack: fullSession.currentTrack,
        currentTime: fullSession.currentTime,
        playQueue: fullSession.playQueue,
        originalQueue: fullSession.originalQueue,
        queueIndex: fullSession.queueIndex,
        isShuffle: fullSession.isShuffle,
        repeatMode: fullSession.repeatMode
      })
      return fullSession
    }
  } catch {
    /* ignore */
  }
  return null
}

let saveSessionDebounceTimer: ReturnType<typeof setTimeout> | null = null
export const scheduleSavePlaybackSession = (): void => {
  if (saveSessionDebounceTimer) clearTimeout(saveSessionDebounceTimer)
  saveSessionDebounceTimer = setTimeout(() => {
    savePlaybackSession()
  }, 1000)
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  isShuffle: false,
  originalQueue: [],
  playQueue: [],
  repeatMode: 0,
  volume: 1,
  prevVolume: 1,
  bitPerfectEnabled: false,
  crossfadeEnabled: false,
  crossfadeDuration: 3,
  bassOutParams: null,
  smartAutoplay: getInitialSmartAutoplay(),
  lyricOffset: getInitialLyricOffset(),
  sleepTimerMode: 'off',
  sleepTimerRemaining: null,
  showSleepTimerMenu: false,

  loopA: null,
  loopB: null,

  currentTime: 0,
  queueIndex: 0,

  setCurrentTrack: (valOrFn) =>
    set((s) => ({
      currentTrack: resolveVal(valOrFn, s.currentTrack),
      // Automatically reset A-B Loop points when currentTrack changes
      loopA: null,
      loopB: null
    })),
  setIsPlaying: (valOrFn) => set((s) => ({ isPlaying: resolveVal(valOrFn, s.isPlaying) })),
  setIsShuffle: (valOrFn) => set((s) => ({ isShuffle: resolveVal(valOrFn, s.isShuffle) })),
  setOriginalQueue: (valOrFn) =>
    set((s) => ({ originalQueue: resolveVal(valOrFn, s.originalQueue) })),
  setPlayQueue: (valOrFn) => set((s) => ({ playQueue: resolveVal(valOrFn, s.playQueue) })),
  addToQueue: (tracks) => {
    const items = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean)
    if (items.length === 0) return 0
    set((s) => ({
      playQueue: [...(s.playQueue || []), ...items],
      originalQueue: [...(s.originalQueue || []), ...items]
    }))
    scheduleSavePlaybackSession()
    return items.length
  },
  setRepeatMode: (valOrFn) => set((s) => ({ repeatMode: resolveVal(valOrFn, s.repeatMode) })),
  setVolume: (valOrFn) => set((s) => ({ volume: resolveVal(valOrFn, s.volume) })),
  setPrevVolume: (valOrFn) => set((s) => ({ prevVolume: resolveVal(valOrFn, s.prevVolume) })),
  setBitPerfectEnabled: (valOrFn) =>
    set((s) => ({ bitPerfectEnabled: resolveVal(valOrFn, s.bitPerfectEnabled) })),
  setCrossfadeEnabled: (valOrFn) =>
    set((s) => ({ crossfadeEnabled: resolveVal(valOrFn, s.crossfadeEnabled) })),
  setCrossfadeDuration: (valOrFn) =>
    set((s) => ({ crossfadeDuration: resolveVal(valOrFn, s.crossfadeDuration) })),
  setBassOutParams: (valOrFn) =>
    set((s) => ({ bassOutParams: resolveVal(valOrFn, s.bassOutParams) })),
  setSmartAutoplay: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.smartAutoplay)
      try {
        localStorage.setItem('meis_smart_autoplay', String(next))
      } catch {}
      return { smartAutoplay: next }
    }),
  setLyricOffset: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.lyricOffset)
      try {
        localStorage.setItem('meis_lyric_offset', String(next))
      } catch {}
      return { lyricOffset: next }
    }),
  setSleepTimerMode: (mode) => set({ sleepTimerMode: mode }),
  setSleepTimerRemaining: (valOrFn) =>
    set((s) => ({ sleepTimerRemaining: resolveVal(valOrFn, s.sleepTimerRemaining) })),
  setShowSleepTimerMenu: (valOrFn) =>
    set((s) => ({ showSleepTimerMenu: resolveVal(valOrFn, s.showSleepTimerMenu) })),

  setLoopA: (valOrFn) => set((s) => ({ loopA: resolveVal(valOrFn, s.loopA) })),
  setLoopB: (valOrFn) => set((s) => ({ loopB: resolveVal(valOrFn, s.loopB) })),
  clearABLoop: () => set({ loopA: null, loopB: null }),
  setCurrentTime: (valOrFn) => set((s) => ({ currentTime: resolveVal(valOrFn, s.currentTime) })),
  setQueueIndex: (valOrFn) => set((s) => ({ queueIndex: resolveVal(valOrFn, s.queueIndex) })),
  savePlaybackSession: () => savePlaybackSession(),
  loadPlaybackSession: () => loadPlaybackSession()
}))
