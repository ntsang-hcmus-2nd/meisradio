import React, { useState } from 'react'

interface CreatePlaylistModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [playlistName, setPlaylistName] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[400px] shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Tạo Playlist Mới</h2>
        <input 
          type="text" 
          value={playlistName} 
          onChange={(e) => setPlaylistName(e.target.value)} 
          className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-white mb-6 focus:outline-none focus:border-emerald-500" 
          placeholder="Nhập tên playlist..." 
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white transition">Hủy</button>
          <button 
            onClick={() => {
              if (playlistName.trim()) {
                onCreate(playlistName.trim())
                setPlaylistName('')
              }
            }} 
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition"
          >
            Tạo mới
          </button>
        </div>
      </div>
    </div>
  )
}