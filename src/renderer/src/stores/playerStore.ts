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
  bassOutParams: { samplerate?: number; format?: string; channels?: string; mode?: 'WASAPI' | 'ASIO'; isDsd?: boolean } | null
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
  setRepeatMode: (mode: 0 | 1 | 2 | ((prev: 0 | 1 | 2) => 0 | 1 | 2)) => void
  setVolume: (volume: number | ((prev: number) => number)) => void
  setPrevVolume: (vol: number | ((prev: number) => number)) => void
  setBitPerfectEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setCrossfadeEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setCrossfadeDuration: (duration: number | ((prev: number) => number)) => void
  setBassOutParams: (params: { samplerate?: number; format?: string; channels?: string; mode?: 'WASAPI' | 'ASIO'; isDsd?: boolean } | null | ((prev: any) => any)) => void
  setSmartAutoplay: (autoplay: boolean | ((prev: boolean) => boolean)) => void
  setLyricOffset: (offset: number | ((prev: number) => number)) => void
  setSleepTimerMode: (mode: 'off' | '15' | '30' | '45' | '60' | 'end_of_track') => void
  setSleepTimerRemaining: (remaining: number | null | ((prev: number | null) => number | null)) => void
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

export const savePlaybackSession = (): void => {
  try {
    const state = usePlayerStore.getState()
    const session: PlaybackSession = {
      currentTrack: state.currentTrack,
      currentTime: state.currentTime || 0,
      playQueue: state.playQueue || [],
      originalQueue: state.originalQueue || [],
      queueIndex: state.queueIndex || 0,
      isShuffle: state.isShuffle || false,
      repeatMode: state.repeatMode || 0
    }
    localStorage.setItem('meis_playback_session', JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export const loadPlaybackSession = (): PlaybackSession | null => {
  try {
    const saved = localStorage.getItem('meis_playback_session')
    if (!saved) return null
    const session = JSON.parse(saved)
    if (session && typeof session === 'object') {
      usePlayerStore.setState({
        currentTrack: session.currentTrack ?? null,
        currentTime: typeof session.currentTime === 'number' ? session.currentTime : 0,
        playQueue: Array.isArray(session.playQueue) ? session.playQueue : [],
        originalQueue: Array.isArray(session.originalQueue) ? session.originalQueue : [],
        queueIndex: typeof session.queueIndex === 'number' ? session.queueIndex : 0,
        isShuffle: !!session.isShuffle,
        repeatMode: session.repeatMode === 1 || session.repeatMode === 2 ? session.repeatMode : 0
      })
      return session
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
  setOriginalQueue: (valOrFn) => set((s) => ({ originalQueue: resolveVal(valOrFn, s.originalQueue) })),
  setPlayQueue: (valOrFn) => set((s) => ({ playQueue: resolveVal(valOrFn, s.playQueue) })),
  setRepeatMode: (valOrFn) => set((s) => ({ repeatMode: resolveVal(valOrFn, s.repeatMode) })),
  setVolume: (valOrFn) => set((s) => ({ volume: resolveVal(valOrFn, s.volume) })),
  setPrevVolume: (valOrFn) => set((s) => ({ prevVolume: resolveVal(valOrFn, s.prevVolume) })),
  setBitPerfectEnabled: (valOrFn) => set((s) => ({ bitPerfectEnabled: resolveVal(valOrFn, s.bitPerfectEnabled) })),
  setCrossfadeEnabled: (valOrFn) => set((s) => ({ crossfadeEnabled: resolveVal(valOrFn, s.crossfadeEnabled) })),
  setCrossfadeDuration: (valOrFn) => set((s) => ({ crossfadeDuration: resolveVal(valOrFn, s.crossfadeDuration) })),
  setBassOutParams: (valOrFn) => set((s) => ({ bassOutParams: resolveVal(valOrFn, s.bassOutParams) })),
  setSmartAutoplay: (valOrFn) => set((s) => {
    const next = resolveVal(valOrFn, s.smartAutoplay)
    try { localStorage.setItem('meis_smart_autoplay', String(next)) } catch {}
    return { smartAutoplay: next }
  }),
  setLyricOffset: (valOrFn) => set((s) => {
    const next = resolveVal(valOrFn, s.lyricOffset)
    try { localStorage.setItem('meis_lyric_offset', String(next)) } catch {}
    return { lyricOffset: next }
  }),
  setSleepTimerMode: (mode) => set({ sleepTimerMode: mode }),
  setSleepTimerRemaining: (valOrFn) => set((s) => ({ sleepTimerRemaining: resolveVal(valOrFn, s.sleepTimerRemaining) })),
  setShowSleepTimerMenu: (valOrFn) => set((s) => ({ showSleepTimerMenu: resolveVal(valOrFn, s.showSleepTimerMenu) })),

  setLoopA: (valOrFn) => set((s) => ({ loopA: resolveVal(valOrFn, s.loopA) })),
  setLoopB: (valOrFn) => set((s) => ({ loopB: resolveVal(valOrFn, s.loopB) })),
  clearABLoop: () => set({ loopA: null, loopB: null }),
  setCurrentTime: (valOrFn) => set((s) => ({ currentTime: resolveVal(valOrFn, s.currentTime) })),
  setQueueIndex: (valOrFn) => set((s) => ({ queueIndex: resolveVal(valOrFn, s.queueIndex) })),
  savePlaybackSession: () => savePlaybackSession(),
  loadPlaybackSession: () => loadPlaybackSession()
}))
