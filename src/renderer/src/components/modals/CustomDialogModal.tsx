import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, HelpCircle, Info, Trash2, X } from 'lucide-react'
import { useTranslation } from '../../locales'
import { dialogScale, overlayFade, useMotionReduced } from '../motion'

export interface DialogOptions {
  isOpen: boolean
  title?: string
  message: string | React.ReactNode
  type?: 'confirm' | 'alert' | 'danger' | 'info'
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
}

interface CustomDialogModalProps {
  dialog: DialogOptions | null
  onClose: () => void
}

export const CustomDialogModal: React.FC<CustomDialogModalProps> = ({ dialog, onClose }) => {
  const { t } = useTranslation()
  const reduceMotion = useMotionReduced()
  const isOpen = Boolean(dialog?.isOpen)
  const [retainedDialog, setRetainedDialog] = useState<DialogOptions | null>(dialog)
  useEffect(() => {
    if (dialog) setRetainedDialog(dialog)
  }, [dialog])
  const activeDialog = dialog || retainedDialog

  useEffect(() => {
    if (!activeDialog?.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        activeDialog.onCancel ? activeDialog.onCancel() : onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        activeDialog.onConfirm ? activeDialog.onConfirm() : onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeDialog, onClose])

  if (!activeDialog) return null

  const isAlert = activeDialog.type === 'alert'
  const isDanger = activeDialog.type === 'danger'
  const isInfo = activeDialog.type === 'info'

  const title =
    activeDialog.title ||
    (isDanger ? t('common.warning') : isAlert ? t('common.notice') : t('common.confirm'))
  const confirmText =
    activeDialog.confirmText ||
    (isDanger ? t('common.delete') : isAlert ? 'OK' : t('common.confirm'))
  const cancelText = activeDialog.cancelText || t('common.cancel')

  const renderIcon = () => {
    if (isDanger) {
      return (
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/10">
          <Trash2 size={24} />
        </div>
      )
    }
    if (isAlert) {
      return (
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
          <AlertCircle size={24} />
        </div>
      )
    }
    if (isInfo) {
      return (
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
          <Info size={24} />
        </div>
      )
    }
    return (
      <div className="w-12 h-12 rounded-2xl bg-theme-10/10 border border-theme-10/20 text-theme-10 flex items-center justify-center shrink-0 shadow-lg shadow-theme-10/10">
        <HelpCircle size={24} />
      </div>
    )
  }

  const handleConfirm = () => {
    if (activeDialog.onConfirm) {
      activeDialog.onConfirm()
    } else {
      onClose()
    }
  }

  const handleCancel = () => {
    if (activeDialog.onCancel) {
      activeDialog.onCancel()
    } else {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 select-none"
          initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
        >
          <motion.div
            className="bg-zinc-900/95 border border-zinc-800/90 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/80 flex flex-col"
            initial={reduceMotion ? { opacity: 1, scale: 1 } : dialogScale.initial}
            animate={dialogScale.animate}
            exit={dialogScale.exit}
            transition={reduceMotion ? { duration: 0 } : dialogScale.transition}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with icon & close button */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3.5">
                {renderIcon()}
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Message body */}
            <div className="py-2 mb-6">
              {typeof activeDialog.message === 'string' ? (
                <p className="text-sm text-zinc-300 leading-relaxed break-words">
                  {activeDialog.message}
                </p>
              ) : (
                activeDialog.message
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/70">
              {!isAlert && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-xl transition cursor-pointer"
                >
                  {cancelText}
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                autoFocus
                className={`px-6 py-2 text-sm font-semibold text-white rounded-xl transition shadow-lg cursor-pointer flex items-center justify-center ${
                  isDanger
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20 active:scale-95'
                    : 'bg-theme-10 hover:brightness-110 shadow-theme-10/20 active:scale-95'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
