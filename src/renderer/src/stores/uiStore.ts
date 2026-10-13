import { create } from 'zustand'
import { DialogOptions } from '../components/modals/CustomDialogModal'

export type ActiveViewType = 
  | 'home' 
  | 'home-ytm' 
  | 'home-soundcloud' 
  | 'songs' 
  | 'playlists' 
  | 'artists' 
  | 'genres' 
  | 'user-playlists' 
  | 'settings' 
  | 'drive'

export interface UIState {
  activeView: ActiveViewType
  viewMode: 'table' | 'grid' | 'compact'
  themeColor: string
  toast: { message: string; type: 'success' | 'error' | 'info'; visible: boolean }
  customDialog: DialogOptions | null

  // Modals & Panels Visibility
  showQueuePanel: boolean
  showEQ: boolean
  showVisualizer: boolean
  showSpectrogramModal: boolean
  showLyricsPanel: boolean
  isLyricsMaximized: boolean
  isMiniPlayer: boolean

  // User Playlist Modals
  showCreateUserPlaylistModal: boolean
  showAddSongsToUserPlaylistModal: boolean
  editingUserPlaylist: any | null
  showEditUserPlaylistModal: boolean

  // Folder Playlist Modals
  showCreateModal: boolean
  showAddSongsModal: boolean
  playlistRename: { isOpen: boolean; oldName: string; newName: string; id?: string }

  // Actions
  setActiveView: (view: ActiveViewType | ((prev: ActiveViewType) => ActiveViewType)) => void
  setViewMode: (mode: 'table' | 'grid' | 'compact' | ((prev: 'table' | 'grid' | 'compact') => 'table' | 'grid' | 'compact')) => void
  setThemeColor: (color: string | ((prev: string) => string)) => void
  setToast: (toast: { message: string; type: 'success' | 'error' | 'info'; visible: boolean } | ((prev: any) => any)) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  hideToast: () => void
  setCustomDialog: (dialog: DialogOptions | null | ((prev: DialogOptions | null) => DialogOptions | null)) => void

  setShowQueuePanel: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowEQ: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowVisualizer: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowSpectrogramModal: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowLyricsPanel: (show: boolean | ((prev: boolean) => boolean)) => void
  setIsLyricsMaximized: (maximized: boolean | ((prev: boolean) => boolean)) => void
  setIsMiniPlayer: (mini: boolean | ((prev: boolean) => boolean)) => void

  setShowCreateUserPlaylistModal: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowAddSongsToUserPlaylistModal: (show: boolean | ((prev: boolean) => boolean)) => void
  setEditingUserPlaylist: (playlist: any | null | ((prev: any) => any)) => void
  setShowEditUserPlaylistModal: (show: boolean | ((prev: boolean) => boolean)) => void

  setShowCreateModal: (show: boolean | ((prev: boolean) => boolean)) => void
  setShowAddSongsModal: (show: boolean | ((prev: boolean) => boolean)) => void
  setPlaylistRename: (rename: { isOpen: boolean; oldName: string; newName: string; id?: string } | ((prev: any) => any)) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

const getInitialViewMode = (): 'table' | 'grid' | 'compact' => {
  try {
    return (localStorage.getItem('meis_view_mode') as any) || 'table'
  } catch {
    return 'table'
  }
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'home',
  viewMode: getInitialViewMode(),
  themeColor: 'rgba(39, 39, 42, 0)',
  toast: { message: '', type: 'info', visible: false },
  customDialog: null,

  showQueuePanel: false,
  showEQ: false,
  showVisualizer: true,
  showSpectrogramModal: false,
  showLyricsPanel: false,
  isLyricsMaximized: false,
  isMiniPlayer: false,

  showCreateUserPlaylistModal: false,
  showAddSongsToUserPlaylistModal: false,
  editingUserPlaylist: null,
  showEditUserPlaylistModal: false,

  showCreateModal: false,
  showAddSongsModal: false,
  playlistRename: { isOpen: false, oldName: '', newName: '', id: undefined },

  setActiveView: (valOrFn) => set((s) => {
    const next = resolveVal(valOrFn, s.activeView)
    // Tự động thu nhỏ lyrics khi chuyển view
    return { activeView: next, isLyricsMaximized: false }
  }),
  setViewMode: (valOrFn) => set((s) => {
    const next = resolveVal(valOrFn, s.viewMode)
    try { localStorage.setItem('meis_view_mode', next) } catch {}
    return { viewMode: next }
  }),
  setThemeColor: (valOrFn) => set((s) => ({ themeColor: resolveVal(valOrFn, s.themeColor) })),
  setToast: (valOrFn) => set((s) => ({ toast: resolveVal(valOrFn, s.toast) })),
  showToast: (message, type = 'info') => set({ toast: { message, type, visible: true } }),
  hideToast: () => set((s) => ({ toast: { ...s.toast, visible: false } })),
  setCustomDialog: (valOrFn) => set((s) => ({ customDialog: resolveVal(valOrFn, s.customDialog) })),

  setShowQueuePanel: (valOrFn) => set((s) => ({ showQueuePanel: resolveVal(valOrFn, s.showQueuePanel) })),
  setShowEQ: (valOrFn) => set((s) => ({ showEQ: resolveVal(valOrFn, s.showEQ) })),
  setShowVisualizer: (valOrFn) => set((s) => ({ showVisualizer: resolveVal(valOrFn, s.showVisualizer) })),
  setShowSpectrogramModal: (valOrFn) => set((s) => ({ showSpectrogramModal: resolveVal(valOrFn, s.showSpectrogramModal) })),
  setShowLyricsPanel: (valOrFn) => set((s) => ({ showLyricsPanel: resolveVal(valOrFn, s.showLyricsPanel) })),
  setIsLyricsMaximized: (valOrFn) => set((s) => ({ isLyricsMaximized: resolveVal(valOrFn, s.isLyricsMaximized) })),
  setIsMiniPlayer: (valOrFn) => set((s) => ({ isMiniPlayer: resolveVal(valOrFn, s.isMiniPlayer) })),

  setShowCreateUserPlaylistModal: (valOrFn) => set((s) => ({ showCreateUserPlaylistModal: resolveVal(valOrFn, s.showCreateUserPlaylistModal) })),
  setShowAddSongsToUserPlaylistModal: (valOrFn) => set((s) => ({ showAddSongsToUserPlaylistModal: resolveVal(valOrFn, s.showAddSongsToUserPlaylistModal) })),
  setEditingUserPlaylist: (valOrFn) => set((s) => ({ editingUserPlaylist: resolveVal(valOrFn, s.editingUserPlaylist) })),
  setShowEditUserPlaylistModal: (valOrFn) => set((s) => ({ showEditUserPlaylistModal: resolveVal(valOrFn, s.showEditUserPlaylistModal) })),

  setShowCreateModal: (valOrFn) => set((s) => ({ showCreateModal: resolveVal(valOrFn, s.showCreateModal) })),
  setShowAddSongsModal: (valOrFn) => set((s) => ({ showAddSongsModal: resolveVal(valOrFn, s.showAddSongsModal) })),
  setPlaylistRename: (valOrFn) => set((s) => ({ playlistRename: resolveVal(valOrFn, s.playlistRename) }))
}))
