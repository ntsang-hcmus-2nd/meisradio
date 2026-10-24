import React, { useMemo, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { Image as ImageIcon, Music, Disc, Layers, Calendar, Hash, FileText } from 'lucide-react'
import { useTranslation } from '../../locales'
import { splitArtistString } from '../../utils/textUtils'
import { formatImageSource } from '../../utils/urlUtils'
import { overlayFade, useMotionReduced } from '../motion'

export interface TagEditorModalProps {
  track: any
  tags: {
    title: string
    artist: string
    album: string
    albumArtist?: string
    genre?: string
    year?: string | number
    trackNumber?: string | number
    discNumber?: string | number
    lyrics: string
    [key: string]: any
  }
  imagePath: string | null
  setTags: (tags: any) => void
  onSelectImage: () => void
  onSave: () => void
  onClose: () => void
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({
  track,
  tags,
  imagePath,
  setTags,
  onSelectImage,
  onSave,
  onClose
}) => {
  const { t } = useTranslation()
  const reduceMotion = useMotionReduced()

  // AnimatePresence phát exit khi parent gỡ mount, gọi onClose ngay không chờ timer
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  // Call all hooks unconditionally before any early returns (Rules of Hooks)
  const detectedArtists = useMemo(() => {
    return splitArtistString(tags?.artist || '')
  }, [tags?.artist])

  if (!track) return null

  return (
    <motion.div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
      animate={overlayFade.animate}
      exit={overlayFade.exit}
      transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <motion.div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-[700px] max-w-full max-h-[92vh] flex flex-col shadow-2xl"
        initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
        animate={overlayFade.animate}
        exit={overlayFade.exit}
        transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Music className="text-theme-10" size={20} />
            <h2 className="text-lg font-bold text-white">{t('modals.tagEditor.title')}</h2>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Cover Art Preview & Upload */}
            <div className="sm:w-1/3 flex flex-col gap-3 items-center shrink-0">
              <div className="w-40 h-40 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center relative shadow-inner group">
                {imagePath ? (
                  <img
                    src={formatImageSource(imagePath)}
                    className="w-full h-full object-cover"
                    alt="Cover"
                  />
                ) : track.coverArt ? (
                  <img
                    src={formatImageSource(track.coverArt)}
                    className="w-full h-full object-cover"
                    alt="Cover"
                  />
                ) : (
                  <ImageIcon size={44} className="text-zinc-600" />
                )}
              </div>
              <button
                type="button"
                onClick={onSelectImage}
                className="text-xs font-semibold text-theme-10 hover:text-white bg-theme-10/15 hover:bg-theme-10/30 border border-theme-10/30 px-3.5 py-1.5 rounded-lg transition cursor-pointer"
              >
                {t('modals.tagEditor.chooseCover')}
              </button>
            </div>

            {/* Core Metadata Inputs */}
            <div className="sm:w-2/3 space-y-3 text-xs">
              {/* Title */}
              <div>
                <label className="text-zinc-400 font-medium mb-1 block">
                  {t('modals.tagEditor.trackTitle')}
                </label>
                <input
                  type="text"
                  value={tags?.title || ''}
                  onChange={(e) => setTags({ ...tags, title: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                  placeholder={t('modals.tagEditor.placeholderTitle')}
                />
              </div>

              {/* Artist & Multi-Artist Detection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-medium">
                    {t('modals.tagEditor.artist')}
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {t('modals.tagEditor.multiArtistHint')}
                  </span>
                </div>
                <input
                  type="text"
                  value={tags?.artist || ''}
                  onChange={(e) => setTags({ ...tags, artist: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                  placeholder={t('modals.tagEditor.placeholderArtist')}
                />
                {detectedArtists.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                    <span className="text-[10px] text-zinc-500 font-medium shrink-0">
                      {t('modals.tagEditor.detectedArtists')}:
                    </span>
                    {detectedArtists.map((art, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-full bg-theme-10/15 border border-theme-10/30 text-theme-10 text-[10px] font-medium shadow-sm"
                      >
                        {art}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Album & Album Artist Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block flex items-center gap-1">
                    <Disc size={12} className="text-zinc-500" />
                    <span>{t('modals.tagEditor.album')}</span>
                  </label>
                  <input
                    type="text"
                    value={tags?.album || ''}
                    onChange={(e) => setTags({ ...tags, album: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                    placeholder={t('modals.tagEditor.placeholderAlbum')}
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block flex items-center gap-1">
                    <Layers size={12} className="text-zinc-500" />
                    <span>{t('modals.tagEditor.albumArtist') || 'Album Artist'}</span>
                  </label>
                  <input
                    type="text"
                    value={
                      tags?.albumArtist !== undefined ? tags.albumArtist : track?.albumArtist || ''
                    }
                    onChange={(e) => setTags({ ...tags, albumArtist: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                    placeholder="e.g. Various Artists"
                  />
                </div>
              </div>

              {/* Genre & Release Year Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block">
                    {t('modals.tagEditor.genre') || t('genresView.title')}
                  </label>
                  <input
                    type="text"
                    value={tags?.genre || ''}
                    onChange={(e) => setTags({ ...tags, genre: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                    placeholder="Pop, Rock, Classical, Jazz..."
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block flex items-center gap-1">
                    <Calendar size={12} className="text-zinc-500" />
                    <span>{t('modals.tagEditor.releaseYear') || 'Release Year'}</span>
                  </label>
                  <input
                    type="text"
                    value={
                      tags?.year !== undefined
                        ? String(tags.year)
                        : track?.year
                          ? String(track.year)
                          : ''
                    }
                    onChange={(e) => setTags({ ...tags, year: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10"
                    placeholder="YYYY (e.g. 2024)"
                  />
                </div>
              </div>

              {/* Track Number & Disc Number Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block flex items-center gap-1">
                    <Hash size={12} className="text-zinc-500" />
                    <span>{t('modals.tagEditor.trackNumber') || 'Track Number'}</span>
                  </label>
                  <input
                    type="text"
                    value={
                      tags?.trackNumber !== undefined
                        ? String(tags.trackNumber)
                        : (track?.trackNumber ?? track?.trackNo ?? '')
                    }
                    onChange={(e) => setTags({ ...tags, trackNumber: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10 font-mono"
                    placeholder="1, 01, 1/12..."
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-medium mb-1 block flex items-center gap-1">
                    <Disc size={12} className="text-zinc-500" />
                    <span>{t('modals.tagEditor.discNumber') || 'Disc Number'}</span>
                  </label>
                  <input
                    type="text"
                    value={
                      tags?.discNumber !== undefined
                        ? String(tags.discNumber)
                        : (track?.discNumber ?? track?.diskNumber ?? '')
                    }
                    onChange={(e) => setTags({ ...tags, discNumber: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-700/70 rounded-lg p-2 text-white focus:outline-none focus:border-theme-10 font-mono"
                    placeholder="1, 1/2..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Lyrics Editor */}
          <div className="text-xs pt-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-zinc-400 font-medium flex items-center gap-1">
                <FileText size={12} className="text-zinc-500" />
                <span>{t('modals.tagEditor.lyrics')}</span>
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">
                {t('modals.tagEditor.lyricsFormatInfo')}
              </span>
            </div>
            <textarea
              value={tags?.lyrics || ''}
              onChange={(e) => setTags({ ...tags, lyrics: e.target.value })}
              className="w-full h-28 bg-zinc-950 border border-zinc-700/70 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-theme-10 resize-none leading-relaxed"
              placeholder={t('modals.tagEditor.lyricsPlaceholder')}
            />
          </div>
        </div>

        {/* Footer & Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onSave}
              className="bg-theme-10 hover:brightness-110 text-white px-6 py-2 rounded-lg text-xs font-semibold shadow-lg shadow-theme-10/20 transition cursor-pointer"
            >
              {t('modals.tagEditor.saveDirect')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
