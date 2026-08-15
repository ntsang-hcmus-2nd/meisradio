import React from 'react'
import { Image as ImageIcon, Music } from 'lucide-react'

interface TagEditorModalProps {
  track: any
  tags: { title: string; artist: string; album: string; lyrics: string }
  imagePath: string | null
  setTags: (tags: any) => void
  onSelectImage: () => void
  onSave: () => void
  onClose: () => void
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({ 
  track, tags, imagePath, setTags, onSelectImage, onSave, onClose 
}) => {
  if (!track) return null

  const isFlac = track.filePath?.toLowerCase().endsWith('.flac') || track.format === 'FLAC'
  const isMp3 = track.filePath?.toLowerCase().endsWith('.mp3') || track.format === 'MP3'

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-[640px] max-w-full shadow-2xl animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Music className="text-theme-10" size={20} />
            <h2 className="text-lg font-bold text-white">Chỉnh sửa thông tin bài hát (Metadata)</h2>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-theme-10/10 text-theme-10 border border-theme-10/20">
            {isFlac ? 'FLAC Vorbis Tag' : isMp3 ? 'MP3 ID3v2 Tag' : 'Audio Tag'}
          </span>
        </div>

        <div className="flex gap-6">
          {/* Cover Art */}
          <div className="w-1/3 flex flex-col gap-3 items-center">
            <div className="w-36 h-36 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center relative shadow-inner group">
              {imagePath ? (
                <img src={`file://${imagePath}`} className="w-full h-full object-cover" />
              ) : track.coverArt ? (
                <img src={track.coverArt} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={40} className="text-zinc-600" />
              )}
            </div>
            <button 
              onClick={onSelectImage} 
              className="text-xs font-semibold text-theme-10 hover:text-white bg-theme-10/15 hover:bg-theme-10/30 border border-theme-10/30 px-3 py-1.5 rounded-lg transition"
            >
              Chọn ảnh bìa
            </button>
          </div>

          {/* Metadata inputs */}
          <div className="w-2/3 space-y-3.5 text-xs">
            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Tên bài hát (Title)</label>
              <input 
                type="text" 
                value={tags.title} 
                onChange={e => setTags({ ...tags, title: e.target.value })} 
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2.5 text-white focus:outline-none focus:border-theme-10" 
                placeholder="Nhập tên bài hát..."
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Nghệ sĩ (Artist)</label>
              <input 
                type="text" 
                value={tags.artist} 
                onChange={e => setTags({ ...tags, artist: e.target.value })} 
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2.5 text-white focus:outline-none focus:border-theme-10" 
                placeholder="Nhập tên nghệ sĩ..."
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Album</label>
              <input 
                type="text" 
                value={tags.album} 
                onChange={e => setTags({ ...tags, album: e.target.value })} 
                className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2.5 text-white focus:outline-none focus:border-theme-10" 
                placeholder="Nhập tên album..."
              />
            </div>
          </div>
        </div>

        {/* Lyrics */}
        <div className="mt-4 text-xs">
          <div className="flex justify-between items-center mb-1">
            <label className="text-zinc-400 font-medium">Lời bài hát (Định dạng LRC hoặc văn bản)</label>
            <span className="text-[10px] text-zinc-500 font-mono">[00:00.00] Lyrics</span>
          </div>
          <textarea 
            value={tags.lyrics} 
            onChange={e => setTags({ ...tags, lyrics: e.target.value })} 
            className="w-full h-32 bg-zinc-950 border border-zinc-700/70 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-theme-10 resize-none" 
            placeholder="[00:01.00] Dán lời bài hát có mốc thời gian hoặc lời thô vào đây..." 
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end items-center gap-3 mt-6 pt-4 border-t border-zinc-800">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            Hủy
          </button>
          <button 
            onClick={onSave} 
            className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2 rounded-lg text-xs font-semibold shadow-lg shadow-theme-10/20 transition"
          >
            Lưu thay đổi trực tiếp
          </button>
        </div>

      </div>
    </div>
  )
}