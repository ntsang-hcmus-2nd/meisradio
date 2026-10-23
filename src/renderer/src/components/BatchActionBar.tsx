import React from 'react'
import { Play, ListPlus, Heart, Trash2, X, CheckSquare } from 'lucide-react'
import { useTranslation } from '../locales'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { trackMatchesKeys, removeTrackKeysFromStores } from '../utils/trackStateUtils'

export interface BatchActionBarProps {
  selectedTrackIds?: string[]
  onPlaySelected?: (selectedIds: string[]) => void
  onAddToQueue?: (selectedIds: string[]) => void
  onAddToFavorites?: (selectedIds: string[]) => void
  onDeleteSelected?: (selectedIds: string[]) => void
  onClearSelection?: () => void
  className?: string
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedTrackIds: propSelectedIds,
  onPlaySelected,
  onAddToQueue,
  onAddToFavorites,
  onDeleteSelected,
  onClearSelection,
  className = ''
}) => {
  const { t } = useTranslation()
  const showToast = useUIStore((s) => s.showToast)

  const storeSelectedIds = useLibraryStore((s) => s.selectedTrackIds)
  const clearSelectedTracks = useLibraryStore((s) => s.clearSelectedTracks)
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const setFavoriteTrackIds = useLibraryStore((s) => s.setFavoriteTrackIds)

  const selectedIds = propSelectedIds !== undefined ? propSelectedIds : storeSelectedIds
  const count = selectedIds.length

  if (count === 0) {
    return null
  }

  const handleClear = () => {
    if (onClearSelection) {
      onClearSelection()
    } else {
      clearSelectedTracks()
    }
  }

  const getMatchedTracks = () => {
    const idSet = new Set(selectedIds)
    return libraryTracks.filter((t) => idSet.has(t.id) || (t.filePath && idSet.has(t.filePath)))
  }

  const handlePlaySelected = () => {
    if (onPlaySelected) {
      onPlaySelected(selectedIds)
      return
    }

    const matched = getMatchedTracks()
    if (matched.length > 0) {
      usePlayerStore.getState().setPlayQueue(matched)
      usePlayerStore.getState().setCurrentTrack(matched[0])
      usePlayerStore.getState().setIsPlaying(true)
      showToast(
        `${t('batchActions.playSelected')}: ${matched.length} ${t('common.tracks')}`,
        'success'
      )
    }
  }

  const handleAddToQueue = () => {
    if (onAddToQueue) {
      onAddToQueue(selectedIds)
      return
    }

    const matched = getMatchedTracks()
    if (matched.length > 0) {
      const currentQueue = usePlayerStore.getState().playQueue || []
      usePlayerStore.getState().setPlayQueue([...currentQueue, ...matched])
      showToast(
        t('toasts.addedToQueue', { title: `${matched.length} ${t('common.tracks')}` }),
        'success'
      )
    }
  }

  const handleAddToFavorites = () => {
    if (onAddToFavorites) {
      onAddToFavorites(selectedIds)
      return
    }

    setFavoriteTrackIds((prev) => {
      const set = new Set(prev)
      selectedIds.forEach((id) => set.add(id))
      return Array.from(set)
    })
    showToast(`${t('favorites.addToFavorites') || 'Added to favorites'}: +${count}`, 'success')
  }

  const handleDeleteSelected = async () => {
    if (onDeleteSelected) {
      onDeleteSelected(selectedIds)
      return
    }

    const matched = getMatchedTracks()
    // Ưu tiên id (giữ hậu tố #track-N của CUE Sheet) để không xóa nhầm file album vật lý
    const paths = matched.map((t) => t.id || t.filePath).filter(Boolean) as string[]

    if (paths.length === 0) return

    const confirmed = window.confirm(
      `${t('batchActions.deleteSelected')} (${paths.length} ${t('common.tracks')})?`
    )
    if (!confirmed) return

    if (window.api?.deleteTrack) {
      for (const p of paths) {
        try {
          await window.api.deleteTrack(p, false)
        } catch {
          /* ignore */
        }
      }
      // Đồng bộ state renderer: xóa khỏi libraryTracks + hàng đợi + playlists + recentlyPlayed
      const keySet = new Set(paths)
      useLibraryStore
        .getState()
        .setLibraryTracks((prev) => prev.filter((trk) => !trackMatchesKeys(trk, keySet)))
      await removeTrackKeysFromStores(paths)
      showToast(
        t('toasts.movedToTrash', { title: `${paths.length} ${t('common.tracks')}` }),
        'info'
      )
      handleClear()
    }
  }

  return (
    <div
      className={`fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/80 shadow-2xl rounded-2xl px-4 py-2.5 flex items-center gap-2 sm:gap-3 max-w-[95vw] animate-slide-up text-xs select-none ${className}`}
    >
      {/* Selected Count Indicator */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-zinc-700/60 shrink-0">
        <CheckSquare size={15} className="text-theme-10" />
        <span className="font-semibold text-white">
          {count}{' '}
          <span className="text-zinc-400 font-normal">
            {t('batchActions.selectedCount') || 'selected'}
          </span>
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Play Selected */}
        <button
          onClick={handlePlaySelected}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-theme-10 hover:brightness-110 text-white shadow-md shadow-theme-10/20 transition cursor-pointer"
        >
          <Play size={13} className="fill-white" />
          <span className="hidden sm:inline">{t('batchActions.playSelected') || 'Play'}</span>
        </button>

        {/* Add to Queue */}
        <button
          onClick={handleAddToQueue}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-200 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 transition cursor-pointer"
        >
          <ListPlus size={14} className="text-theme-10" />
          <span className="hidden sm:inline">
            {t('batchActions.addSelectedToQueue') || 'Queue'}
          </span>
        </button>

        {/* Add to Favorites */}
        <button
          onClick={handleAddToFavorites}
          title={t('favorites.addToFavorites') || 'Add to Favorites'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-200 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 transition cursor-pointer"
        >
          <Heart size={14} className="text-rose-500 fill-rose-500/20" />
          <span className="hidden md:inline">{t('favorites.favorites') || 'Favorite'}</span>
        </button>

        {/* Move to Trash */}
        <button
          onClick={handleDeleteSelected}
          title={t('batchActions.deleteSelected') || 'Move to Trash'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition cursor-pointer"
        >
          <Trash2 size={13} />
          <span className="hidden sm:inline">{t('batchActions.deleteSelected') || 'Trash'}</span>
        </button>
      </div>

      {/* Clear Selection Button */}
      <button
        onClick={handleClear}
        title={t('batchActions.clearSelection') || 'Clear Selection'}
        className="ml-1 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  )
}
