import React from 'react'
import { Music, UploadCloud } from 'lucide-react'
import { useTranslation } from '../locales'

interface DragDropOverlayProps {
  isDragging: boolean
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ isDragging }) => {
  const { t } = useTranslation()
  if (!isDragging) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-xl h-72 border-2 border-dashed border-emerald-500/80 rounded-3xl bg-emerald-500/10 flex flex-col items-center justify-center gap-4 text-center p-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
          <UploadCloud size={36} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{t('dragDrop.title')}</h3>
          <p className="text-xs text-zinc-400 max-w-sm">{t('dragDrop.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-medium bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30">
          <Music size={13} /> {t('dragDrop.ready')}
        </div>
      </div>
    </div>
  )
}
