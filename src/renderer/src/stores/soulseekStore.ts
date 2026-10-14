import { create } from 'zustand'

export interface SoulseekDownload {
  id: string
  user: string
  file: string
  filename: string
  destinationPath: string
  size: number
  receivedBytes: number
  progress: number
  speed: number
  status:
    | 'requested'
    | 'queued'
    | 'queued_peer'
    | 'connected'
    | 'downloading'
    | 'interrupted'
    | 'complete'
    | 'failed'
    | 'cancelled'
    | 'error'
  queuePlace?: number
  error?: string
  startedAt: number
  completedAt?: number
}

export interface SoulseekSearchResult {
  id: string
  user: string
  file: string
  filename: string
  ext: string
  size: number
  slots: boolean
  speed: number
  queueLength: number
  bitrate?: number
  duration?: number
  sampleRate?: number
  bitDepth?: number
  isVbr?: boolean
  isLossless: boolean
  folderArtist: string
  folderAlbum: string
}

export interface SoulseekState {
  connected: boolean
  isConnecting: boolean
  username: string | null
  downloadFolder: string

  // Search
  searchQuery: string
  isSearching: boolean
  searchResults: SoulseekSearchResult[]
  searchError: string | null
  filterMode: 'all' | 'lossless' | '320k' | 'free_slots'
  onlyFreeSlots: boolean
  sortBy: 'relevance' | 'speed' | 'bitrate' | 'size'

  // Transfers
  downloads: Record<string, SoulseekDownload>
  activeTab: 'search' | 'transfers'

  // Actions
  setConnected: (connected: boolean) => void
  setIsConnecting: (isConnecting: boolean) => void
  setUsername: (username: string | null) => void
  setDownloadFolder: (folder: string) => void
  setSearchQuery: (query: string) => void
  setIsSearching: (isSearching: boolean) => void
  setSearchResults: (results: SoulseekSearchResult[]) => void
  setSearchError: (err: string | null) => void
  setFilterMode: (mode: 'all' | 'lossless' | '320k' | 'free_slots') => void
  setOnlyFreeSlots: (only: boolean) => void
  setSortBy: (sort: 'relevance' | 'speed' | 'bitrate' | 'size') => void
  setActiveTab: (tab: 'search' | 'transfers') => void
  updateDownload: (item: SoulseekDownload) => void
  setDownloads: (downloads: SoulseekDownload[]) => void
  clearCompletedDownloads: () => void
}

export const useSoulseekStore = create<SoulseekState>((set) => ({
  connected: false,
  isConnecting: false,
  username: null,
  downloadFolder: '',
  searchQuery: '',
  isSearching: false,
  searchResults: [],
  searchError: null,
  filterMode: 'all',
  onlyFreeSlots: false,
  sortBy: 'relevance',
  downloads: {},
  activeTab: 'search',

  setConnected: (connected) => set({ connected }),
  setIsConnecting: (isConnecting) => set({ isConnecting }),
  setUsername: (username) => set({ username }),
  setDownloadFolder: (downloadFolder) => set({ downloadFolder }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchResults: (searchResults) => set({ searchResults, searchError: null }),
  setSearchError: (searchError) => set({ searchError }),
  setFilterMode: (filterMode) => set({ filterMode }),
  setOnlyFreeSlots: (onlyFreeSlots) => set({ onlyFreeSlots }),
  setSortBy: (sortBy) => set({ sortBy }),
  setActiveTab: (activeTab) => set({ activeTab }),
  updateDownload: (item) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [item.id]: {
          ...state.downloads[item.id],
          ...item
        }
      }
    })),
  setDownloads: (downloadsList) => {
    const map: Record<string, SoulseekDownload> = {}
    downloadsList.forEach((d) => {
      map[d.id] = d
    })
    set({ downloads: map })
  },
  clearCompletedDownloads: () =>
    set((state) => {
      const remaining: Record<string, SoulseekDownload> = {}
      Object.entries(state.downloads).forEach(([id, item]) => {
        if (item.status !== 'complete' && item.status !== 'cancelled' && item.status !== 'failed' && item.status !== 'error') {
          remaining[id] = item
        }
      })
      return { downloads: remaining }
    })
}))
