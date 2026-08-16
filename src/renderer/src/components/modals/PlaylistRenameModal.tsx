import React from 'react'
import { useTranslation } from '../../locales'

interface PlaylistRenameModalProps {
  isOpen: boolean
  newName: string
  setNewName: (name: string) => void
  onCancel: () => void
  onSubmit: () => void
}

export const PlaylistRenameModal: React.FC<PlaylistRenameModalProps> = ({
  isOpen, newName, setNewName, onCancel, onSubmit
}) => {
  const { t } = useTranslation()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[400px] shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">{t('modals.renamePlaylist.title')}</h2>
        <input 
          type="text" 
          value={newName} 
          onChange={e => setNewName(e.target.value)} 
          className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-white mb-6 focus:outline-none focus:border-theme-10" 
          placeholder={t('modals.renamePlaylist.placeholder')} 
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition">{t('common.cancel')}</button>
          <button onClick={onSubmit} className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2 rounded-lg font-medium transition">{t('modals.renamePlaylist.save')}</button>
        </div>
      </div>
    </div>
  )
}