import React, { useState, useEffect } from 'react'
import { Wifi, Download } from 'lucide-react'
import { useTranslation } from '../../locales'
import { AnimatePresence, motion } from 'motion/react'
import { dialogScale, overlayFade, useMotionReduced } from '../motion'

interface CloudActionModalProps {
  track: any
  isDownloading: boolean
  onClose: () => void
  onAction: (action: 'stream' | 'download') => void
}

export const CloudActionModal: React.FC<CloudActionModalProps> = ({
  track,
  isDownloading,
  onClose,
  onAction
}) => {
  const { t } = useTranslation()
  const reduceMotion = useMotionReduced()
  const [retainedTrack, setRetainedTrack] = useState<any>(track)
  useEffect(() => {
    if (track) setRetainedTrack(track)
  }, [track])
  const activeTrack = track || retainedTrack

  if (!activeTrack) return null

  return (
    <AnimatePresence>
      {Boolean(track) && (
        <motion.div
          className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm"
          initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
        >
          <motion.div
            className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl w-96 shadow-2xl"
            initial={reduceMotion ? { opacity: 1, scale: 1 } : dialogScale.initial}
            animate={dialogScale.animate}
            exit={dialogScale.exit}
            transition={reduceMotion ? { duration: 0 } : dialogScale.transition}
          >
            <h3 className="text-lg font-bold text-white mb-2">{activeTrack.title}</h3>
            <div className="space-y-3">
              <button
                onClick={() => onAction('stream')}
                className="w-full flex items-center justify-center gap-3 bg-theme-10/10 text-theme-10 hover:bg-theme-10/20 py-3 rounded-lg font-medium transition"
              >
                <Wifi size={18} /> {t('modals.cloudAction.streamDirect')}
              </button>
              <button
                onClick={() => onAction('download')}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-3 bg-zinc-800 text-white hover:bg-zinc-700 py-3 rounded-lg font-medium transition disabled:opacity-50"
              >
                {isDownloading ? (
                  <span className="animate-pulse">{t('modals.cloudAction.downloading')}</span>
                ) : (
                  <>
                    <Download size={18} /> {t('modals.cloudAction.downloadDirect')}
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="w-full text-zinc-500 hover:text-white py-2 mt-2 text-sm transition"
              >
                {t('common.cancel')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
