import React, { useState } from 'react'
import { List, Trash2, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { SortableQueueItem } from './TrackListComponents'
import { usePlayerStore, useUIStore, useSettingsStore } from '../stores'
import { useTranslation, useLanguage } from '../locales'
import { isSameTrack } from '../utils/trackStateUtils'

interface QueuePanelProps {
  onPlayTrack: (track: any) => void
  onTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  onArtistClick?: (artistName: string) => void
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  onPlayTrack,
  onTrackContextMenu,
  onArtistClick
}) => {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const playQueue = usePlayerStore((s) => s.playQueue)
  const setPlayQueue = usePlayerStore((s) => s.setPlayQueue)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setShowQueuePanel = useUIStore((s) => s.setShowQueuePanel)
  const showToast = useUIStore((s) => s.showToast)
  const appMode = useSettingsStore((s) => s.appMode)
  const isLite = appMode === 'lite' || appMode === 'core'

  const [queueRenderLimit, setQueueRenderLimit] = useState(60)

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const visibleQueue = (playQueue || []).slice(0, queueRenderLimit)

  return (
    <div className="w-[25vw] min-w-[300px] max-w-[400px] border-l border-theme-30/50 bg-theme-60/40 backdrop-blur-sm flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-theme-30/50">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white flex items-center gap-2">
            <List size={16} className="text-theme-10" /> {t('queue.title')}
          </h3>
          <span className="text-xs text-zinc-500 font-mono">({playQueue?.length || 0})</span>
        </div>
        <div className="flex items-center gap-2">
          {(playQueue?.length || 0) > 0 && (
            <button
              onClick={() => {
                setPlayQueue([])
                showToast(t('player.queueCleared'), 'info')
              }}
              className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded hover:bg-theme-30 flex items-center gap-1 transition cursor-pointer"
              title={t('player.clearQueueTitle')}
            >
              <Trash2 size={12} />
              <span>{t('player.clearQueue')}</span>
            </button>
          )}
          <button
            onClick={() => setShowQueuePanel(false)}
            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-theme-30 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {playQueue.length === 0 ? (
          <p className="text-zinc-500 italic mt-10 text-center">{t('queue.empty')}</p>
        ) : (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const { active, over } = event
              if (active.id !== over?.id) {
                setPlayQueue((items) => {
                  const oldIndex = items.findIndex((_, i) => `queue-${i}` === active.id)
                  const newIndex = items.findIndex((_, i) => `queue-${i}` === over?.id)
                  return arrayMove(items, oldIndex, newIndex)
                })
              }
            }}
          >
            <SortableContext
              items={visibleQueue.map((_, i) => `queue-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              {visibleQueue.map((track, index) => {
                // Dùng isSameTrack: id phải có truthy ở CẢ HAI bài — tránh currentTrack?.id
                // === track.id === undefined khớp sai với mọi bài không có id
                const isActive = isSameTrack(currentTrack, track)
                return (
                  <SortableQueueItem
                    key={`queue-${index}`}
                    id={`queue-${index}`}
                    track={track}
                    isActive={isActive}
                    isPlaying={isPlaying}
                    isLite={isLite}
                    onPlay={onPlayTrack}
                    onContextMenu={onTrackContextMenu}
                    onArtistClick={onArtistClick}
                  />
                )
              })}
            </SortableContext>
            {visibleQueue.length < playQueue.length && (
              <button
                type="button"
                onClick={() => setQueueRenderLimit((prev) => Math.min(prev + 60, playQueue.length))}
                className="w-full py-2.5 text-center text-xs text-zinc-400 hover:text-white cursor-pointer bg-theme-30/40 hover:bg-theme-30/80 rounded-lg transition"
              >
                {language === 'vi'
                  ? `Hiển thị ${visibleQueue.length} / ${playQueue.length} bài (Bấm để tải thêm)`
                  : `Showing ${visibleQueue.length} / ${playQueue.length} tracks (Click to load more)`}
              </button>
            )}
          </DndContext>
        )}
      </div>
    </div>
  )
}
