import React from 'react'
import { Image as ImageIcon } from 'lucide-react'

interface TagEditorModalProps {
  track: any
  tags: { title: string, artist: string, album: string, lyrics: string }
  imagePath: string | null
  setTags: (tags: any) => void
  onSelectImage: () => void
  onSave: () => void
  onClose: () => void
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({ track, tags, imagePath, setTags, onSelectImage, onSave, onClose }) => {
  if (!track) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[600px] shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-6">Chỉnh sửa thông tin bài hát</h2>
        <div className="flex gap-6">
          <div className="w-1/3 flex flex-col gap-3 items-center">
            <div className="w-32 h-32 bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
              {imagePath ? <img src={`file://${imagePath}`} className="w-full h-full object-cover" /> : 
               track.coverArt ? <img src={track.coverArt} className="w-full h-full object-cover" /> : <ImageIcon size={40} className="text-zinc-600"/>}
            </div>
            <button onClick={onSelectImage} className="text-xs text-theme-10 hover:text-theme-10 bg-theme-10/10 px-3 py-1.5 rounded-md">Đổi ảnh bìa</button>
          </div>
          <div className="w-2/3 space-y-4">
            <div><label className="text-xs text-zinc-400">Tên bài hát</label><input type="text" value={tags.title} onChange={e => setTags({...tags, title: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
            <div><label className="text-xs text-zinc-400">Ca sĩ</label><input type="text" value={tags.artist} onChange={e => setTags({...tags, artist: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
            <div><label className="text-xs text-zinc-400">Album</label><input type="text" value={tags.album} onChange={e => setTags({...tags, album: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs text-zinc-400">Lời bài hát (LRC Format)</label>
          <textarea value={tags.lyrics} onChange={e => setTags({...tags, lyrics: e.target.value})} className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white font-mono" placeholder="[00:00.00] Lyrics..." />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">Hủy</button>
          <button onClick={onSave} className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2 rounded-lg font-medium">Lưu thay đổi</button>
        </div>
      </div>
    </div>
  )
}