import { create } from 'zustand'

export interface LyricLine {
  time: number
  text: string
  unsynced?: boolean
}

export interface LyricsState {
  lyrics: LyricLine[]
  currentLyricIndex: number
  originalCover: string | null

  // Actions
  setLyrics: (lyrics: LyricLine[] | ((prev: LyricLine[]) => LyricLine[])) => void
  setCurrentLyricIndex: (index: number | ((prev: number) => number)) => void
  setOriginalCover: (cover: string | null | ((prev: string | null) => string | null)) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

export const useLyricsStore = create<LyricsState>((set) => ({
  lyrics: [],
  currentLyricIndex: -1,
  originalCover: null,

  setLyrics: (valOrFn) => set((s) => ({ lyrics: resolveVal(valOrFn, s.lyrics) })),
  setCurrentLyricIndex: (valOrFn) => set((s) => ({ currentLyricIndex: resolveVal(valOrFn, s.currentLyricIndex) })),
  setOriginalCover: (valOrFn) => set((s) => ({ originalCover: resolveVal(valOrFn, s.originalCover) }))
}))
