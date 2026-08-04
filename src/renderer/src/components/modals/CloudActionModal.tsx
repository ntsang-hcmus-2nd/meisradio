import React from 'react'
import { Wifi, Download } from 'lucide-react'

interface CloudActionModalProps {
  track: any
  isDownloading: boolean
  onClose: () => void
  onAction: (action: 'stream' | 'download') => void
}

export const CloudActionModal: React.FC<CloudActionModalProps> = ({ track, isDownloading, onClose, onAction }) => {
  if (!track) return null

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{track.title}</h3>
        <p className="text-zinc-400 text-sm mb-6">Đây là file lưu trên Cloud. Bạn muốn phát trực tiếp hay tải về máy để nghe Offline?</p>
        <div className="space-y-3">
          <button 
            onClick={() => onAction('stream')}
            className="w-full flex items-center justify-center gap-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 py-3 rounded-lg font-medium transition"
          >
            <Wifi size={18} /> Phát trực tiếp (Stream)
          </button>
          <button 
            onClick={() => onAction('download')}
            disabled={isDownloading}
            className="w-full flex items-center justify-center gap-3 bg-zinc-800 text-white hover:bg-zinc-700 py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {isDownloading ? <span className="animate-pulse">Đang tải...</span> : <><Download size={18} /> Lưu về máy (Download)</>}
          </button>
          <button onClick={onClose} className="w-full text-zinc-500 hover:text-white py-2 mt-2 text-sm transition">Huỷ bỏ</button>
        </div>
      </div>
    </div>
  )
}