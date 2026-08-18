import React, { useEffect } from 'react'
import { AlertCircle, HelpCircle, Info, Trash2, X } from 'lucide-react'
import { useTranslation } from '../../locales'

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

  useEffect(() => {
    if (!dialog?.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dialog.onCancel ? dialog.onCancel() : onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        dialog.onConfirm ? dialog.onConfirm() : onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog, onClose])

  if (!dialog || !dialog.isOpen) return null

  const isAlert = dialog.type === 'alert'
  const isDanger = dialog.type === 'danger'
  const isInfo = dialog.type === 'info'

  const title = dialog.title || (isDanger ? t('common.warning') : isAlert ? t('common.notice') : t('common.confirm'))
  const confirmText = dialog.confirmText || (isDanger ? t('common.delete') : isAlert ? 'OK' : t('common.confirm'))
  const cancelText = dialog.cancelText || t('common.cancel')

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
    if (dialog.onConfirm) {
      dialog.onConfirm()
    } else {
      onClose()
    }
  }

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel()
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-fade-in select-none">
      <div 
        className="bg-zinc-900/95 border border-zinc-800/90 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/80 flex flex-col transition-all transform scale-100"
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
          {typeof dialog.message === 'string' ? (
            <p className="text-sm text-zinc-300 leading-relaxed break-words">{dialog.message}</p>
          ) : (
            dialog.message
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
      </div>
    </div>
  )
}
