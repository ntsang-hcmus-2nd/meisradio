import React, { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
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

  if (!isOpen) return null

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const handleConfirm = () => {
    const tracksToAdd = tracks.filter(t => selectedIds.includes(t.id))
    onAddTracks(tracksToAdd)
    setSelectedIds([])
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
          <h2 className="text-xl font-bold text-white">{t('modals.addSongs.title', { name: playlistName })}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-6">
          {tracks.map((track) => {
            const isSelected = selectedIds.includes(track.id)
            return (
              <div 
                key={track.id}
                onClick={() => toggleSelect(track.id)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer border transition ${isSelected ? 'bg-theme-10/10 border-theme-10/40 text-white' : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-300 hover:bg-zinc-800/40'}`}
              >
                <div className="truncate flex-1 pr-4">
                  <p className="font-semibold truncate text-sm">{track.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition ${isSelected ? 'bg-theme-10 border-theme-10 text-black' : 'border-zinc-700'}`}>
                  {isSelected && <Check size={14} className="stroke-[3]" />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">{t('common.cancel')}</button>
          <button onClick={handleConfirm} className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2">
            <Plus size={16} /> {t('modals.addSongs.addCount', { count: selectedIds.length })}
          </button>
        </div>
      </div>
    </div>
  )
}