import React from 'react'
import {
  Plus,
  Sparkles,
  ArrowLeft,
  Play,
  Shuffle,
  Upload,
  FolderPlus
} from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { QuickFilterChips } from '../components/QuickFilterChips'
import {
  PlaylistItemRow,
  PlaylistItemCompact,
  PlaylistItemCard
} from '../components/TrackListComponents'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { useTranslation } from '../locales'
import { useUIStore, useSettingsStore } from '../stores'

export interface FolderPlaylistsViewProps {
  searchQuery: string
  playlists: any[]
  matchedPlaylists: any[]
  visiblePlaylists: any[]
  activePlaylist: any
  setActivePlaylist: (pl: any) => void
  processedPlaylistTracks: any[]
  processedLibraryTracks: any[]
  handleRowClick: (track: any, playlist?: any[]) => void
  handleOpenPlaylist: (pl: any) => void
  handlePlayPlaylistTracks: (pl: any) => void
  handlePlaylistContextMenu: (pl: any, e: React.MouseEvent) => void
  handleChangePlaylistImage: (pl: any) => void
  handleExtractPlaylistImage: (pl: any) => void
  handleOpenPlaylistRename: (pl: any) => void
  setShowCreateModal: (show: boolean) => void
  handleAutoGeneratePlaylists: () => void
  playlistsLoadMoreRef: React.RefObject<HTMLDivElement | null>
  setPlaylistsRenderLimit: React.Dispatch<React.SetStateAction<number>>
  setShowAddSongsModal: (show: boolean) => void
  handleImportFiles: () => void
  setShowDuplicateFinder: (show: boolean) => void
  setShowSmartPlaylists: (show: boolean) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const FolderPlaylistsView: React.FC<FolderPlaylistsViewProps> = ({
  searchQuery,
  playlists,
  matchedPlaylists,
  visiblePlaylists,
  activePlaylist,
  setActivePlaylist,
  processedPlaylistTracks,
  processedLibraryTracks,
  handleRowClick,
  handleOpenPlaylist,
  handlePlayPlaylistTracks,
  handlePlaylistContextMenu,
  handleChangePlaylistImage,
  handleExtractPlaylistImage,
  handleOpenPlaylistRename,
  setShowCreateModal,
  handleAutoGeneratePlaylists,
  playlistsLoadMoreRef,
  setPlaylistsRenderLimit,
  setShowAddSongsModal,
  handleImportFiles,
  setShowDuplicateFinder,
  setShowSmartPlaylists,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t, language } = useTranslation()
  const viewMode = useUIStore((state) => state.viewMode)
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')

  if (activePlaylist) {
    return (
      <div className="flex flex-col h-full space-y-6">
        <div>
          <button
            onClick={() => setActivePlaylist(null)}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
          >
            <ArrowLeft size={16} /> {t('sidebar.myPlaylists')}
          </button>

          <div
            className="flex items-end justify-between gap-6 mb-6"
            onContextMenu={(e) => handlePlaylistContextMenu(activePlaylist, e)}
          >
            <div className="flex items-end gap-6 min-w-0">
              <div className="w-36 h-36 bg-theme-30 rounded-2xl overflow-hidden shadow-2xl relative group shrink-0 border border-theme-30/80">
                <DynamicCoverArt
                  src={activePlaylist.thumbnail}
                  trackPath={activePlaylist.path}
                  tier="lg"
                  isLite={isLite}
                  fallbackIcon={<FolderPlus size={40} className="text-zinc-600" />}
                  className="w-full h-full"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">
                  Playlist
                </p>
                <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">
                  {activePlaylist.name}
                </h2>
                <p className="text-sm text-zinc-400 mb-4">
                  {processedPlaylistTracks.length} {t('common.songs')}
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (processedPlaylistTracks.length > 0) {
                        handleRowClick(
                          processedPlaylistTracks[0],
                          processedPlaylistTracks
                        )
                      }
                    }}
                    className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
                  >
                    <Play size={16} className="fill-current" />{' '}
                    {t('userPlaylistsView.playAll')}
                  </button>
                  <button
                    onClick={() => {
                      if (processedPlaylistTracks.length > 0) {
                        const shuffled = fisherYatesShuffle(processedPlaylistTracks)
                        handleRowClick(shuffled[0], shuffled)
                      }
                    }}
                    className="flex items-center gap-2 bg-theme-30 hover:bg-theme-30/80 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                  >
                    <Shuffle size={16} /> {t('artistsView.shuffle')}
                  </button>
                </div>
              </div>
            </div>

            {/* Nút thêm nhạc riêng cho Playlist */}
            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => setShowAddSongsModal(true)}
                title={t('playlistsView.addExistingSongs')}
                className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
              >
                <Plus size={16} />{' '}
                <span className="btn-text">
                  {t('playlistsView.addExistingSongs')}
                </span>
              </button>
              <button
                onClick={handleImportFiles}
                title={t('playlistsView.importFromComputer')}
                className="sys-btn flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
              >
                <Upload size={16} />{' '}
                <span className="btn-text">
                  {t('playlistsView.importFromComputer')}
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="mb-3">
          <QuickFilterChips
            onOpenDuplicateFinder={() => setShowDuplicateFinder(true)}
            onOpenSmartPlaylists={() => setShowSmartPlaylists(true)}
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <TrackTable
            tracks={processedPlaylistTracks}
            handleRowClick={handleRowClick}
            handleTrackContextMenu={handleTrackContextMenu}
            openTagEditor={openTagEditor}
            openTrackInfo={openTrackInfo}
            navigateToArtist={navigateToArtist}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {searchQuery
              ? t('playlistsView.searchResults')
              : t('playlistsView.title')}
          </h2>
          <span className="text-zinc-500 text-xs sm:text-sm mb-1 whitespace-nowrap hidden sm:inline">
            {playlists.length} {t('userPlaylistsView.playlistCount')}
          </span>
        </div>
        {!searchQuery && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
            <button
              onClick={() => setShowCreateModal(true)}
              className="sys-btn flex items-center gap-1.5 sm:gap-2 bg-theme-10 hover:bg-theme-10 text-white px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
              title={t('playlistsView.createPlaylist')}
            >
              <Plus size={16} />{' '}
              <span className="btn-text">{t('playlistsView.createPlaylist')}</span>
            </button>
            <button
              onClick={handleAutoGeneratePlaylists}
              className="sys-btn flex items-center gap-1.5 sm:gap-2 bg-theme-30 hover:bg-theme-10/20 hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer"
              title={t('playlistsView.autoCategorize')}
            >
              <Sparkles size={16} />{' '}
              <span className="btn-text">{t('playlistsView.autoCategorize')}</span>
            </button>
          </div>
        )}
      </div>
      {!searchQuery && playlists.length === 0 ? (
        <p className="text-zinc-500">{t('playlistsView.noPlaylists')}</p>
      ) : (
        <div className="space-y-10">
          {(matchedPlaylists.length > 0 || !searchQuery) && (
            <div>
              {searchQuery && (
                <h3 className="text-xl font-bold text-white mb-6">
                  {t('playlistsView.playlistsAndAlbums', {
                    count: matchedPlaylists.length
                  })}
                </h3>
              )}

              {viewMode === 'table' ? (
                <div className="w-full bg-theme-60/20 rounded-2xl border border-theme-30/40 overflow-hidden shadow-xl">
                  <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-theme-30/40 border-b border-theme-30/50 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-7">{t('playlistsView.title')}</div>
                    <div className="col-span-2 text-center">
                      {t('common.songs')}
                    </div>
                    <div className="col-span-2 text-right">
                      {t('trackTable.actions')}
                    </div>
                  </div>
                  <div className="divide-y divide-theme-30/20">
                    {visiblePlaylists.map((pl, idx) => (
                      <PlaylistItemRow
                        key={pl.name}
                        pl={pl}
                        idx={idx}
                        isLite={isLite}
                        onOpen={handleOpenPlaylist}
                        onPlay={handlePlayPlaylistTracks}
                        onContextMenu={handlePlaylistContextMenu}
                        onChangeImage={handleChangePlaylistImage}
                        onRename={handleOpenPlaylistRename}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              ) : viewMode === 'compact' ? (
                <div className="w-full space-y-1.5">
                  {visiblePlaylists.map((pl, idx) => (
                    <PlaylistItemCompact
                      key={pl.name}
                      pl={pl}
                      idx={idx}
                      isLite={isLite}
                      onOpen={handleOpenPlaylist}
                      onPlay={handlePlayPlaylistTracks}
                      onContextMenu={handlePlaylistContextMenu}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                  {visiblePlaylists.map((pl) => (
                    <PlaylistItemCard
                      key={pl.name}
                      pl={pl}
                      isLite={isLite}
                      onOpen={handleOpenPlaylist}
                      onContextMenu={handlePlaylistContextMenu}
                      onChangeImage={handleChangePlaylistImage}
                      onExtractImage={handleExtractPlaylistImage}
                      onRename={handleOpenPlaylistRename}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {/* Sentinel tải lũy tiến (Progressive batching) */}
              {visiblePlaylists.length < matchedPlaylists.length && (
                <div
                  ref={playlistsLoadMoreRef}
                  className="w-full py-6 flex items-center justify-center text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition"
                  onClick={() =>
                    setPlaylistsRenderLimit((prev) =>
                      Math.min(prev + 36, matchedPlaylists.length)
                    )
                  }
                >
                  <span>
                    {language === 'vi'
                      ? `Hiển thị ${visiblePlaylists.length} / ${matchedPlaylists.length} danh sách phát (Cuộn xuống để tải thêm)`
                      : `Showing ${visiblePlaylists.length} / ${matchedPlaylists.length} playlists (Scroll down to load more)`}
                  </span>
                </div>
              )}
            </div>
          )}

          {searchQuery && (
            <div className="flex flex-col h-[520px] w-full shrink-0">
              <h3 className="text-xl font-bold text-white mb-4 shrink-0">
                {t('common.songs')} ({processedLibraryTracks.length})
              </h3>
              <div className="flex-1 min-h-0 flex flex-col h-[460px] w-full">
                {processedLibraryTracks.length > 0 ? (
                  <TrackTable
                    tracks={processedLibraryTracks}
                    handleRowClick={handleRowClick}
                    handleTrackContextMenu={handleTrackContextMenu}
                    openTagEditor={openTagEditor}
                    openTrackInfo={openTrackInfo}
                    navigateToArtist={navigateToArtist}
                  />
                ) : (
                  <p className="text-zinc-500 mt-4">
                    {t('songsView.noSongsMatched', { query: searchQuery })}
                  </p>
                )}
              </div>
            </div>
          )}

          {searchQuery &&
            matchedPlaylists.length === 0 &&
            processedLibraryTracks.length === 0 && (
              <p className="text-zinc-500 mt-8 text-center">
                {t('playlistsView.noResults', { query: searchQuery })}
              </p>
            )}
        </div>
      )}
    </>
  )
}
export default FolderPlaylistsView
