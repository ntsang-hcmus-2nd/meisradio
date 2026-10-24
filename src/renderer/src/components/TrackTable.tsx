import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TableVirtuoso } from 'react-virtuoso'
import { CheckSquare, ArrowUp, ArrowDown, ArrowUpDown, Info } from 'lucide-react'
import { TrackGrid, TrackCompactList, TrackRow } from './TrackListComponents'
import { useUIStore, usePlayerStore, useLibraryStore, useSettingsStore } from '../stores'
import { useTranslation } from '../locales'
import { useMotionReduced, viewModeSlideTransition, viewModeSlideVariants } from './motion'

const VirtuosoComponents = {
  Table: ({ style, ...props }: any) => (
    <table
      {...props}
      className="w-full text-left text-sm table-fixed"
      style={{ ...style, borderCollapse: 'collapse' }}
    />
  ),
  TableHead: React.forwardRef((props: any, ref: any) => <thead {...props} ref={ref} />),
  TableRow: (props: any) => (
    <tr
      {...props}
      className="group border-b border-theme-30/20 transition-colors cursor-pointer hover:bg-white/5"
    />
  )
}

interface TrackTableProps {
  tracks: any[]
  handleRowClick: (track: any, playlist?: any[]) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
  className?: string
}

export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  handleRowClick,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist,
  className = ''
}) => {
  const { t } = useTranslation()
  const viewMode = useUIStore((state) => state.viewMode)
  const viewModeDirection = useUIStore((state) => state.viewModeDirection)
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')
  const reduceMotion = useMotionReduced()
  // One stable AnimatePresence (custom carries the live travel direction so the
  // exiting view leaves opposite to the entering one). Branch-local wrappers
  // would unmount with the branch and never play exit/enter.
  const noAnim = reduceMotion || isLite
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)

  const selectedTrackIds = useLibraryStore((state) => state.selectedTrackIds)
  const setSelectedTrackIds = useLibraryStore((state) => state.setSelectedTrackIds)
  const clearSelectedTracks = useLibraryStore((state) => state.clearSelectedTracks)
  const sortField = useLibraryStore((state) => state.sortField)
  const setSortField = useLibraryStore((state) => state.setSortField)
  const sortOrder = useLibraryStore((state) => state.sortOrder)
  const setSortOrder = useLibraryStore((state) => state.setSortOrder)

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else {
        setSortField(null)
        setSortOrder('asc')
      }
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  if (!tracks || tracks.length === 0) return null

  // Table branch keeps its panel chrome; grid/compact share the plain container.
  const containerClass =
    viewMode === 'table'
      ? `flex-1 flex flex-col min-h-[300px] h-full w-full bg-theme-60/20 rounded-lg border border-theme-30/50 overflow-hidden ${className}`
      : 'flex-1 flex flex-col min-h-[300px] h-full w-full overflow-hidden'

  return (
    <AnimatePresence mode="wait" initial={false} custom={viewModeDirection}>
      <motion.div
        key={viewMode}
        className={containerClass}
        custom={viewModeDirection}
        variants={viewModeSlideVariants}
        initial={noAnim ? { opacity: 1, x: 0 } : 'initial'}
        animate={noAnim ? { opacity: 1, x: 0 } : 'animate'}
        exit={noAnim ? { opacity: 1, x: 0 } : 'exit'}
        transition={noAnim ? { duration: 0 } : viewModeSlideTransition}
      >
        {viewMode === 'grid' ? (
          <TrackGrid
            tracks={tracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isLite={isLite}
            handleRowClick={handleRowClick}
            onContextMenu={handleTrackContextMenu}
            openTagEditor={openTagEditor}
            onArtistClick={navigateToArtist}
          />
        ) : viewMode === 'compact' ? (
          <TrackCompactList
            tracks={tracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isLite={isLite}
            handleRowClick={handleRowClick}
            onContextMenu={handleTrackContextMenu}
            openTrackInfo={openTrackInfo}
            onArtistClick={navigateToArtist}
          />
        ) : (
          <TableVirtuoso
            style={{ height: '100%', width: '100%', minHeight: '300px' }}
            data={tracks}
            components={VirtuosoComponents}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            fixedHeaderContent={() => (
              <tr className="text-zinc-500 border-b border-theme-30/50 select-none bg-theme-60 shadow-sm text-xs">
                <th
                  onClick={() => {
                    if (selectedTrackIds.length > 0 && selectedTrackIds.length === tracks.length) {
                      clearSelectedTracks()
                    } else {
                      const allIds = tracks.map((t) => t.id || t.filePath).filter(Boolean)
                      setSelectedTrackIds(allIds)
                    }
                  }}
                  className="pb-3 pt-3.5 font-medium w-10 sm:w-12 text-center cursor-pointer group hover:text-white transition whitespace-nowrap"
                  title={
                    selectedTrackIds.length > 0 && selectedTrackIds.length === tracks.length
                      ? t('common.deselectAll') || 'Deselect All'
                      : t('common.selectAll') || 'Select All'
                  }
                >
                  <div className="inline-flex items-center gap-1 justify-center">
                    {selectedTrackIds.length > 0 && selectedTrackIds.length === tracks.length ? (
                      <CheckSquare size={13} className="text-theme-10" />
                    ) : (
                      <span>{t('trackTable.index')}</span>
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('title')}
                  className="pb-3 pt-3.5 font-medium cursor-pointer group hover:text-white transition min-w-0 pr-4"
                  title={t('trackTable.sortTitle')}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{t('trackTable.title')}</span>
                    {sortField === 'title' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={11} className="text-theme-10" />
                      ) : (
                        <ArrowDown size={11} className="text-theme-10" />
                      )
                    ) : (
                      <ArrowUpDown
                        size={11}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('album')}
                  className="pb-3 pt-3.5 font-medium cursor-pointer group hover:text-white transition hidden md:table-cell md:w-[28%] lg:w-[32%] pr-4"
                  title={t('trackTable.sortAlbum')}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{t('trackTable.album')}</span>
                    {sortField === 'album' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={11} className="text-theme-10" />
                      ) : (
                        <ArrowDown size={11} className="text-theme-10" />
                      )
                    ) : (
                      <ArrowUpDown
                        size={11}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('isCloud')}
                  className="pb-3 pt-3.5 font-medium cursor-pointer group hover:text-white transition w-28 sm:w-32 text-center whitespace-nowrap"
                  title={t('trackTable.sortFormat')}
                >
                  <div className="inline-flex items-center gap-1 justify-center">
                    <span>{t('trackTable.format')}</span>
                    {sortField === 'isCloud' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={11} className="text-theme-10" />
                      ) : (
                        <ArrowDown size={11} className="text-theme-10" />
                      )
                    ) : (
                      <ArrowUpDown
                        size={11}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('duration')}
                  className="pb-3 pt-3.5 font-medium text-right pr-4 cursor-pointer group hover:text-white transition w-16 sm:w-20 whitespace-nowrap"
                  title={t('trackTable.sortDuration')}
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span>{t('trackTable.duration')}</span>
                    {sortField === 'duration' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp size={11} className="text-theme-10" />
                      ) : (
                        <ArrowDown size={11} className="text-theme-10" />
                      )
                    ) : (
                      <ArrowUpDown
                        size={11}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                </th>
                <th
                  className="pb-3 pt-3.5 font-medium text-center w-10 sm:w-11"
                  title={t('trackTable.actions')}
                >
                  <Info size={13} className="mx-auto text-zinc-500" />
                </th>
              </tr>
            )}
            itemContent={(index, track) => (
              <TrackRow
                track={track}
                index={index}
                isThisTrackPlaying={currentTrack?.id === track.id}
                isPlaying={isPlaying}
                isLite={isLite}
                handleRowClick={handleRowClick}
                tracks={tracks}
                openTrackInfo={openTrackInfo}
                onContextMenu={handleTrackContextMenu}
                onArtistClick={navigateToArtist}
              />
            )}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
export default TrackTable
