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

  setCurrentTrack: (valOrFn) => set((s) => ({ currentTrack: resolveVal(valOrFn, s.currentTrack) })),
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
  setShowSleepTimerMenu: (valOrFn) => set((s) => ({ showSleepTimerMenu: resolveVal(valOrFn, s.showSleepTimerMenu) }))
}))
