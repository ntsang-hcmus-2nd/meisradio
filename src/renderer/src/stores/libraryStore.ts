import { create } from 'zustand'

export interface Track {
  id?: string
  filePath?: string
  path?: string
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: string | number
  trackNumber?: string | number
  discNumber?: string | number
  duration?: number
  format?: string
  sampleRate?: number
  bitDepth?: number
  bitrate?: number
  channels?: number
  picture?: any
  coverUrl?: string
  startTime?: number
  endTime?: number
  isCueTrack?: boolean
  cueFilePath?: string
  [key: string]: any
}

export interface LibraryState {
  libraryPath: string | null
  libraryPaths: string[]
  libraryTracks: any[]
  playlists: any[]
  userPlaylists: any[]
  activeAlbum: { title: string; tracks: any[] } | null
  activeArtist: any | null
  activeGenre: any | null
  activePlaylist: any | null
  activeUserPlaylist: any | null
  playlistsRenderLimit: number
  collapsedArtistLetters: Record<string, boolean>
  sortField: string | null
  sortOrder: 'asc' | 'desc'
  searchQuery: string
  searchInput: string
  recentlyPlayed: any[]
  preAggregatedData: {
    artistsList: any[]
    alphabetGroups: any[]
    genresList: any[]
  } | null

  // Dashboard & SoundCloud States
  dashboardData: any[]
  isAlbumLoading: boolean
  scDashboardData: any[]
  isScLoading: boolean
  scUser: any | null
  selectedScGenre: string
  isYtmLoggedIn: boolean

  // Favorites, Filters & Batch Selection
  favoriteTrackIds: string[]
  quickFilter: 'all' | 'lossless' | 'hires' | 'dsd' | 'favorites' | 'cue'
  selectedTrackIds: string[]
  smartPlaylists: any[]
  trackLyricOffsets: Record<string, number>

  // Actions
  setLibraryPath: (path: string | null | ((prev: string | null) => string | null)) => void
  setLibraryPaths: (paths: string[] | ((prev: string[]) => string[])) => void
  setLibraryTracks: (tracks: any[] | ((prev: any[]) => any[])) => void
  setPlaylists: (playlists: any[] | ((prev: any[]) => any[])) => void
  setUserPlaylists: (playlists: any[] | ((prev: any[]) => any[])) => void
  setActiveAlbum: (album: { title: string; tracks: any[] } | null | ((prev: any) => any)) => void
  setActiveArtist: (artist: any | null | ((prev: any) => any)) => void
  setActiveGenre: (genre: any | null | ((prev: any) => any)) => void
  setActivePlaylist: (playlist: any | null | ((prev: any) => any)) => void
  setActiveUserPlaylist: (playlist: any | null | ((prev: any) => any)) => void
  setPlaylistsRenderLimit: (limit: number | ((prev: number) => number)) => void
  setCollapsedArtistLetters: (
    letters: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void
  setSortField: (field: string | null | ((prev: string | null) => string | null)) => void
  setSortOrder: (order: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void
  setSearchQuery: (query: string | ((prev: string) => string)) => void
  setSearchInput: (input: string | ((prev: string) => string)) => void
  setRecentlyPlayed: (tracks: any[] | ((prev: any[]) => any[])) => void
  setPreAggregatedData: (
    data:
      { artistsList: any[]; alphabetGroups: any[]; genresList: any[] } | null | ((prev: any) => any)
  ) => void

  setDashboardData: (data: any[] | ((prev: any[]) => any[])) => void
  setIsAlbumLoading: (loading: boolean | ((prev: boolean) => boolean)) => void
  setScDashboardData: (data: any[] | ((prev: any[]) => any[])) => void
  setIsScLoading: (loading: boolean | ((prev: boolean) => boolean)) => void
  setScUser: (user: any | null | ((prev: any) => any)) => void
  setSelectedScGenre: (genre: string | ((prev: string) => string)) => void
  setIsYtmLoggedIn: (loggedIn: boolean | ((prev: boolean) => boolean)) => void

  setFavoriteTrackIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleFavoriteId: (id: string) => void
  setQuickFilter: (
    filter:
      | 'all'
      | 'lossless'
      | 'hires'
      | 'dsd'
      | 'favorites'
      | 'cue'
      | ((
          prev: 'all' | 'lossless' | 'hires' | 'dsd' | 'favorites' | 'cue'
        ) => 'all' | 'lossless' | 'hires' | 'dsd' | 'favorites' | 'cue')
  ) => void
  setSelectedTrackIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleSelectTrackId: (id: string) => void
  clearSelectedTracks: () => void
  setSmartPlaylists: (playlists: any[] | ((prev: any[]) => any[])) => void
  setTrackLyricOffsets: (
    offsets: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
  ) => void
  updateTrackLyricOffset: (filePath: string, offsetSec: number) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

const getInitialRecentlyPlayed = (): any[] => {
  try {
    const saved = localStorage.getItem('meis_recent_played')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getInitialFavoriteTrackIds = (): string[] => {
  try {
    const saved = localStorage.getItem('meis_favorite_track_ids')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getInitialSmartPlaylists = (): any[] => {
  try {
    const saved = localStorage.getItem('meis_smart_playlists')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getInitialTrackLyricOffsets = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem('meis_track_lyric_offsets')
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

export const useLibraryStore = create<LibraryState>((set) => ({
  libraryPath: null,
  libraryPaths: [],
  libraryTracks: [],
  playlists: [],
  userPlaylists: [],
  activeAlbum: null,
  activeArtist: null,
  activeGenre: null,
  activePlaylist: null,
  activeUserPlaylist: null,
  playlistsRenderLimit: 36,
  collapsedArtistLetters: {},
  sortField: null,
  sortOrder: 'asc',
  searchQuery: '',
  searchInput: '',
  recentlyPlayed: getInitialRecentlyPlayed(),
  preAggregatedData: null,

  dashboardData: [],
  isAlbumLoading: false,
  scDashboardData: [],
  isScLoading: false,
  scUser: null,
  selectedScGenre: 'all-music',
  isYtmLoggedIn: false,

  favoriteTrackIds: getInitialFavoriteTrackIds(),
  quickFilter: 'all',
  selectedTrackIds: [],
  smartPlaylists: getInitialSmartPlaylists(),
  trackLyricOffsets: getInitialTrackLyricOffsets(),

  setLibraryPath: (valOrFn) => set((s) => ({ libraryPath: resolveVal(valOrFn, s.libraryPath) })),
  setLibraryPaths: (valOrFn) => set((s) => ({ libraryPaths: resolveVal(valOrFn, s.libraryPaths) })),
  setLibraryTracks: (valOrFn) =>
    set((s) => ({ libraryTracks: resolveVal(valOrFn, s.libraryTracks) })),
  setPlaylists: (valOrFn) => set((s) => ({ playlists: resolveVal(valOrFn, s.playlists) })),
  setUserPlaylists: (valOrFn) =>
    set((s) => ({ userPlaylists: resolveVal(valOrFn, s.userPlaylists) })),
  setActiveAlbum: (valOrFn) => set((s) => ({ activeAlbum: resolveVal(valOrFn, s.activeAlbum) })),
  setActiveArtist: (valOrFn) => set((s) => ({ activeArtist: resolveVal(valOrFn, s.activeArtist) })),
  setActiveGenre: (valOrFn) => set((s) => ({ activeGenre: resolveVal(valOrFn, s.activeGenre) })),
  setActivePlaylist: (valOrFn) =>
    set((s) => ({ activePlaylist: resolveVal(valOrFn, s.activePlaylist) })),
  setActiveUserPlaylist: (valOrFn) =>
    set((s) => ({ activeUserPlaylist: resolveVal(valOrFn, s.activeUserPlaylist) })),
  setPlaylistsRenderLimit: (valOrFn) =>
    set((s) => ({ playlistsRenderLimit: resolveVal(valOrFn, s.playlistsRenderLimit) })),
  setCollapsedArtistLetters: (valOrFn) =>
    set((s) => ({ collapsedArtistLetters: resolveVal(valOrFn, s.collapsedArtistLetters) })),
  setSortField: (valOrFn) => set((s) => ({ sortField: resolveVal(valOrFn, s.sortField) })),
  setSortOrder: (valOrFn) => set((s) => ({ sortOrder: resolveVal(valOrFn, s.sortOrder) })),
  setSearchQuery: (valOrFn) => set((s) => ({ searchQuery: resolveVal(valOrFn, s.searchQuery) })),
  setSearchInput: (valOrFn) => set((s) => ({ searchInput: resolveVal(valOrFn, s.searchInput) })),
  setRecentlyPlayed: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.recentlyPlayed)
      const safeNext = Array.isArray(next) ? next : []
      try {
        localStorage.setItem('meis_recent_played', JSON.stringify(safeNext.slice(0, 50)))
      } catch {}
      return { recentlyPlayed: safeNext }
    }),
  setPreAggregatedData: (valOrFn) =>
    set((s) => ({ preAggregatedData: resolveVal(valOrFn, s.preAggregatedData) })),

  setDashboardData: (valOrFn) =>
    set((s) => ({ dashboardData: resolveVal(valOrFn, s.dashboardData) })),
  setIsAlbumLoading: (valOrFn) =>
    set((s) => ({ isAlbumLoading: resolveVal(valOrFn, s.isAlbumLoading) })),
  setScDashboardData: (valOrFn) =>
    set((s) => ({ scDashboardData: resolveVal(valOrFn, s.scDashboardData) })),
  setIsScLoading: (valOrFn) => set((s) => ({ isScLoading: resolveVal(valOrFn, s.isScLoading) })),
  setScUser: (valOrFn) => set((s) => ({ scUser: resolveVal(valOrFn, s.scUser) })),
  setSelectedScGenre: (valOrFn) =>
    set((s) => ({ selectedScGenre: resolveVal(valOrFn, s.selectedScGenre) })),
  setIsYtmLoggedIn: (valOrFn) =>
    set((s) => ({ isYtmLoggedIn: resolveVal(valOrFn, s.isYtmLoggedIn) })),

  setFavoriteTrackIds: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.favoriteTrackIds)
      try {
        localStorage.setItem('meis_favorite_track_ids', JSON.stringify(next))
      } catch {}
      return { favoriteTrackIds: next }
    }),
  toggleFavoriteId: (id: string) =>
    set((s) => {
      const exists = s.favoriteTrackIds.includes(id)
      const next = exists
        ? s.favoriteTrackIds.filter((item) => item !== id)
        : [...s.favoriteTrackIds, id]
      try {
        localStorage.setItem('meis_favorite_track_ids', JSON.stringify(next))
      } catch {}
      return { favoriteTrackIds: next }
    }),
  setQuickFilter: (valOrFn) => set((s) => ({ quickFilter: resolveVal(valOrFn, s.quickFilter) })),
  setSelectedTrackIds: (valOrFn) =>
    set((s) => ({ selectedTrackIds: resolveVal(valOrFn, s.selectedTrackIds) })),
  toggleSelectTrackId: (id: string) =>
    set((s) => {
      const exists = s.selectedTrackIds.includes(id)
      const next = exists
        ? s.selectedTrackIds.filter((item) => item !== id)
        : [...s.selectedTrackIds, id]
      return { selectedTrackIds: next }
    }),
  clearSelectedTracks: () => set({ selectedTrackIds: [] }),
  setSmartPlaylists: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.smartPlaylists)
      try {
        localStorage.setItem('meis_smart_playlists', JSON.stringify(next))
      } catch {}
      return { smartPlaylists: next }
    }),
  setTrackLyricOffsets: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.trackLyricOffsets)
      try {
        localStorage.setItem('meis_track_lyric_offsets', JSON.stringify(next))
      } catch {}
      return { trackLyricOffsets: next }
    }),
  updateTrackLyricOffset: (filePath: string, offsetSec: number) =>
    set((s) => {
      const next = { ...s.trackLyricOffsets, [filePath]: offsetSec }
      try {
        localStorage.setItem('meis_track_lyric_offsets', JSON.stringify(next))
      } catch {}
      return { trackLyricOffsets: next }
    })
}))
