import React, { useState, useEffect } from 'react'
import { Image as ImageIcon, X, Trash2, FolderOpen } from 'lucide-react'
import { useTranslation } from '../../locales'

interface EditPlaylistModalProps {
  isOpen: boolean
  playlist: any | null
  onClose: () => void
  onSave: (playlistId: string, updates: { name: string; description: string; thumbnail?: string | null; customImagePath?: string }) => Promise<void> | void
}

export const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  isOpen,
  playlist,
  onClose,
  onSave
}) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [customImagePath, setCustomImagePath] = useState<string | undefined>(undefined)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (playlist && isOpen) {
      setName(playlist.name || '')
      setDescription(playlist.description || '')
      setThumbnail(playlist.thumbnail || null)
      setCustomImagePath(undefined)
      setPreviewUrl(playlist.thumbnail || undefined)
      setIsSaving(false)
    }
  }, [playlist, isOpen])

  if (!isOpen || !playlist) return null

  const handlePickImage = async () => {
    try {
      // @ts-ignore
      if (window.api?.pickImage) {
        // @ts-ignore
        const res = await window.api.pickImage()
        if (res && res.success && res.filePath) {
          setCustomImagePath(res.filePath)
          setPreviewUrl(res.dataUrl || res.previewUrl)
        }
      }
    } catch (e) {
      console.error('Error picking image:', e)
    }
  }

  const handleRemoveImage = () => {
    setThumbnail(null)
    setCustomImagePath(undefined)
    setPreviewUrl(undefined)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSaving(true)
    try {
      await onSave(playlist.id, {
        name: name.trim(),
        description: description.trim(),
        thumbnail: customImagePath ? undefined : thumbnail,
        customImagePath
      })
      onClose()
    } catch (e) {
      console.error('Failed to update playlist:', e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative animate-fade-in text-white">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-6">
          <h2 className="text-xl font-bold">{t('modals.editPlaylist.title')}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ảnh bìa & Chọn tệp */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              {t('modals.editPlaylist.coverLabel')}
            </label>
            <div className="flex items-center gap-5">
              <div 
                onClick={handlePickImage}
                className="w-28 h-28 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-theme-10 overflow-hidden relative group cursor-pointer flex items-center justify-center shrink-0 shadow-md transition"
                title={t('modals.editPlaylist.chooseImage')}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Cover preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-600 gap-1">
                    <ImageIcon size={32} />
                    <span className="text-[10px] text-zinc-500 font-medium">Chọn ảnh</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1">
                  <FolderOpen size={20} />
                  <span>Đổi ảnh</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handlePickImage}
                  className="flex items-center gap-2 px-3.5 py-2 bg-theme-30 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium rounded-lg transition"
                >
                  <FolderOpen size={15} />
                  {t('modals.editPlaylist.chooseImage')}
                </button>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-lg transition"
                  >
                    <Trash2 size={15} />
                    {t('modals.editPlaylist.removeImage')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tên Playlist */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              {t('modals.editPlaylist.nameLabel')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('modals.editPlaylist.namePlaceholder')}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-theme-10 transition placeholder:text-zinc-600"
              autoFocus
            />
          </div>

          {/* Mô tả Playlist */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              {t('modals.editPlaylist.descLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('modals.editPlaylist.descPlaceholder')}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-theme-10 transition placeholder:text-zinc-600 resize-none"
            />
          </div>

          {/* Nút hành động */}
          <div className="flex justify-end items-center gap-3 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium transition"
            >
              {t('modals.editPlaylist.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="bg-theme-10 hover:bg-theme-10/90 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 flex items-center gap-2"
            >
              {isSaving ? t('common.loading') : t('modals.editPlaylist.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
