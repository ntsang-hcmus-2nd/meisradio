import React from 'react'
import { useTranslation } from '../../locales'
import { AnimatePresence, motion } from 'motion/react'
import { overlayFade, useMotionReduced } from '../motion'

interface PlaylistRenameModalProps {
  isOpen: boolean
  newName: string
  setNewName: (name: string) => void
  onCancel: () => void
  onSubmit: () => void
}

export const PlaylistRenameModal: React.FC<PlaylistRenameModalProps> = ({
  isOpen,
  newName,
  setNewName,
  onCancel,
  onSubmit
}) => {
  const { t } = useTranslation()
  const reduceMotion = useMotionReduced()

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
        >
          <motion.div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[400px] shadow-2xl"
            initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
            animate={overlayFade.animate}
            exit={overlayFade.exit}
            transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
          >
            <h2 className="text-xl font-bold text-white mb-4">
              {t('modals.renamePlaylist.title')}
            </h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-white mb-6 focus:outline-none focus:border-theme-10"
              placeholder={t('modals.renamePlaylist.placeholder')}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-zinc-400 hover:text-white transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onSubmit}
                className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2 rounded-lg font-medium transition"
              >
                {t('modals.renamePlaylist.save')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
