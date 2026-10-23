import React from 'react'
import { Shuffle, Plus, HardDrive } from 'lucide-react'
import { QuickFilterChips } from '../components/QuickFilterChips'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { useTranslation } from '../locales'

export interface SongsViewProps {
  searchQuery: string
  libraryPath: string | null
  processedLibraryTracks: any[]
  handleRowClick: (track: any, playlist?: any[]) => void
  handleImportFiles: () => void
  setShowDuplicateFinder: (show: boolean) => void
  setShowSmartPlaylists: (show: boolean) => void
  setIsShuffle: (shuffle: boolean) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const SongsView: React.FC<SongsViewProps> = ({
  searchQuery,
  libraryPath,
  processedLibraryTracks,
  handleRowClick,
  handleImportFiles,
  setShowDuplicateFinder,
  setShowSmartPlaylists,
  setIsShuffle,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {searchQuery ? t('songsView.searchResults') : t('songsView.songList')}
          </h2>
          <span className="text-zinc-500 text-xs sm:text-sm mb-1 whitespace-nowrap hidden sm:inline">
            {processedLibraryTracks.length} {t('common.songs')}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => {
              if (processedLibraryTracks.length > 0) {
                setIsShuffle(true)
                const shuffled = fisherYatesShuffle(processedLibraryTracks)
                handleRowClick(shuffled[0], shuffled)
              }
            }}
            disabled={processedLibraryTracks.length === 0}
            className="sys-btn flex items-center gap-1.5 sm:gap-2 bg-theme-30 hover:bg-zinc-700 disabled:opacity-50 text-white px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer"
            title={t('songsView.randomPlay')}
          >
            <Shuffle size={15} /> <span className="btn-text">{t('songsView.randomPlay')}</span>
          </button>
          <button
            onClick={handleImportFiles}
            className="sys-btn flex items-center gap-1.5 sm:gap-2 bg-theme-10 hover:bg-theme-10 text-white px-2.5 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
            title={t('songsView.addMusic')}
          >
            <Plus size={16} /> <span className="btn-text">{t('songsView.addMusic')}</span>
          </button>
        </div>
      </div>

      {/* Quick Filter Chips (All, Favorites, Lossless, Hi-Res, DSD, CUE) */}
      <div className="mb-4">
        <QuickFilterChips
          onOpenDuplicateFinder={() => setShowDuplicateFinder(true)}
          onOpenSmartPlaylists={() => setShowSmartPlaylists(true)}
        />
      </div>

      {libraryPath ? (
        processedLibraryTracks.length > 0 ? (
          <TrackTable
            tracks={processedLibraryTracks}
            handleRowClick={handleRowClick}
            handleTrackContextMenu={handleTrackContextMenu}
            openTagEditor={openTagEditor}
            openTrackInfo={openTrackInfo}
            navigateToArtist={navigateToArtist}
          />
        ) : (
          <p className="text-zinc-500 mt-10 text-center">
            {t('songsView.noSongsMatched', { query: searchQuery })}
          </p>
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
          <HardDrive size={56} className="mb-4 opacity-20" />
          <p className="text-lg">{t('songsView.libraryNotConfigured')}</p>
          <p className="text-sm mt-1">{t('songsView.libraryNotConfiguredDesc')}</p>
        </div>
      )}
    </>
  )
}
export default SongsView
