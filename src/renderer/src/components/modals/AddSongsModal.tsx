import React, { useState, useMemo, useEffect } from 'react'
import { Plus, X, Check, Search } from 'lucide-react'
import { useTranslation } from '../../locales'

interface AddSongsModalProps {
  isOpen: boolean
  tracks: any[]
  playlistName: string
  onClose: () => void
  onAddTracks: (selectedTracks: any[]) => void
}

export const AddSongsModal: React.FC<AddSongsModalProps> = ({ isOpen, tracks, playlistName, onClose, onAddTracks }) => {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([])
      setSearchQuery('')
    }
  }, [isOpen])

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks
    const q = searchQuery.toLowerCase().trim()
    return tracks.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.artist?.toLowerCase().includes(q) ||
        t.album?.toLowerCase().includes(q)
    )
  }, [tracks, searchQuery])

  if (!isOpen) return null

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleSelectAllVisible = () => {
    const visibleIds = filteredTracks.map((t) => t.id)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
  }

  const handleDeselectAllVisible = () => {
    const visibleIds = new Set(filteredTracks.map((t) => t.id))
    setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)))
  }

  const handleConfirm = () => {
    const tracksToAdd = tracks.filter((t) => selectedIds.includes(t.id))
    onAddTracks(tracksToAdd)
    setSelectedIds([])
    setSearchQuery('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-[640px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{t('modals.addSongs.title', { name: playlistName })}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('modals.addSongs.showingCount', { shown: filteredTracks.length, total: tracks.length })}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar & Quick Selection Actions */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative flex items-center">
            <Search size={16} className="absolute left-3 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('modals.addSongs.searchPlaceholder')}
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl pl-9 pr-8 py-2 text-sm text-white focus:outline-none focus:border-theme-10 transition placeholder:text-zinc-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-0.5 rounded transition"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {filteredTracks.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="px-2.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition"
              >
                {t('modals.addSongs.selectAll')}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAllVisible}
                  className="px-2.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-xl transition"
                >
                  {t('modals.addSongs.clearAll')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Song List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4 min-h-[200px]">
          {filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-sm">
              <Search size={32} className="mb-2 opacity-40" />
              <span>{t('modals.addSongs.noMatches')}</span>
            </div>
          ) : (
            filteredTracks.map((track) => {
              const isSelected = selectedIds.includes(track.id)
              return (
                <div
                  key={track.id}
                  onClick={() => toggleSelect(track.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition ${
                    isSelected
                      ? 'bg-theme-10/10 border-theme-10/40 text-white'
                      : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="truncate flex-1 pr-4">
                    <p className="font-semibold truncate text-sm">{track.title}</p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {track.artist} {track.album ? `• ${track.album}` : ''}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                      isSelected ? 'bg-theme-10 border-theme-10 text-black' : 'border-zinc-700 bg-zinc-900/60'
                    }`}
                  >
                    {isSelected && <Check size={14} className="stroke-[3]" />}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.length === 0}
            className={`px-6 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${
              selectedIds.length > 0 
                ? 'bg-theme-10 hover:brightness-110 text-white shadow-lg shadow-theme-10/20' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Plus size={16} /> {t('modals.addSongs.addCount', { count: selectedIds.length })}
          </button>
        </div>
      </div>
    </div>
  )
}