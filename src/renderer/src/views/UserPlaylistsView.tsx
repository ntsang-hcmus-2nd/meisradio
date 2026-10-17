import React from 'react'
import {
  Plus,
  ListPlus,
  Play,
  Image as ImageIcon,
  MoreVertical,
  ArrowLeft,
  Shuffle,
  Edit2,
  Trash2
} from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { removeAccents, matchesQuery } from '../utils/textUtils'
import { useTranslation } from '../locales'
import { useUIStore, useSettingsStore } from '../stores'

export interface UserPlaylistsViewProps {
  searchQuery: string
  deferredSearchQuery?: string
  userPlaylists: any[]
  activeUserPlaylist: any
  setActiveUserPlaylist: (pl: any) => void
  activeUserPlaylistTracks: any[]
  getResolvedUserPlaylistTracks: (pl: any) => any[]
  handleRowClick: (track: any, playlist?: any[]) => void
  handleUserPlaylistContextMenu: (pl: any, e: React.MouseEvent) => void
  handleChangeUserPlaylistCover: (playlistId: string) => void
  setShowCreateUserPlaylistModal: (show: boolean) => void
  setShowAddSongsToUserPlaylistModal: (show: boolean) => void
  setShowEditUserPlaylistModal: (show: boolean) => void
  setEditingUserPlaylist: (pl: any) => void
  handleDeleteUserPlaylist: (pl: any) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const UserPlaylistsView: React.FC<UserPlaylistsViewProps> = ({
  searchQuery,
  deferredSearchQuery,
  userPlaylists,
  activeUserPlaylist,
  setActiveUserPlaylist,
  activeUserPlaylistTracks,
  getResolvedUserPlaylistTracks,
  handleRowClick,
  handleUserPlaylistContextMenu,
  handleChangeUserPlaylistCover,
  setShowCreateUserPlaylistModal,
  setShowAddSongsToUserPlaylistModal,
  setShowEditUserPlaylistModal,
  setEditingUserPlaylist,
  handleDeleteUserPlaylist,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t } = useTranslation()
  const viewMode = useUIStore((state) => state.viewMode)
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')

  if (activeUserPlaylist) {
    return (
      <div className="flex flex-col h-full space-y-6">
        <div>
          <button
            onClick={() => setActiveUserPlaylist(null)}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft size={16} /> {t('userPlaylistsView.title')}
          </button>

          <div className="flex items-end justify-between gap-6 mb-6">
            <div className="flex items-end gap-6 min-w-0">
              <div
                onClick={() => {
                  setEditingUserPlaylist(activeUserPlaylist)
                  setShowEditUserPlaylistModal(true)
                }}
                className="w-36 h-36 rounded-2xl overflow-hidden bg-theme-30 border border-theme-30/80 shadow-2xl relative group cursor-pointer flex-shrink-0"
                title={t('modals.editPlaylist.title')}
              >
                <DynamicCoverArt
                  src={
                    activeUserPlaylist.thumbnail ||
                    activeUserPlaylist.coverArt ||
                    activeUserPlaylistTracks.find((t) => t.coverArt)?.coverArt
                  }
                  trackPath={
                    activeUserPlaylist.thumbnail || activeUserPlaylist.coverArt
                      ? undefined
                      : activeUserPlaylistTracks[0]?.filePath
                  }
                  tier="lg"
                  isLite={isLite}
                  fallbackIcon={<ListPlus size={44} className="text-zinc-600" />}
                  className="w-full h-full"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1.5 p-3 text-center">
                  <ImageIcon size={20} className="shrink-0" />
                  <span className="text-center font-medium leading-tight select-none">
                    {t('modals.editPlaylist.title')}
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">
                  {t('userPlaylistsView.title')}
                </p>
                <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-2 truncate">
                  {activeUserPlaylist.name}
                </h2>
                {activeUserPlaylist.description && (
                  <p className="text-sm text-zinc-300 line-clamp-2 max-w-xl mb-3">
                    {activeUserPlaylist.description}
                  </p>
                )}
                <p className="text-sm text-zinc-400 mb-4">
                  {activeUserPlaylistTracks.length} {t('common.songs')}
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (activeUserPlaylistTracks.length > 0) {
                        handleRowClick(activeUserPlaylistTracks[0], activeUserPlaylistTracks)
                      }
                    }}
                    className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
                  >
                    <Play size={16} className="fill-current" /> {t('userPlaylistsView.playAll')}
                  </button>
                  <button
                    onClick={() => {
                      if (activeUserPlaylistTracks.length > 0) {
                        const shuffled = fisherYatesShuffle(activeUserPlaylistTracks)
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

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setShowAddSongsToUserPlaylistModal(true)}
                className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
              >
                <Plus size={16} /> {t('userPlaylistsView.addSongs')}
              </button>
              <button
                onClick={() => {
                  setEditingUserPlaylist(activeUserPlaylist)
                  setShowEditUserPlaylistModal(true)
                }}
                className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
                title={t('modals.editPlaylist.title')}
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleDeleteUserPlaylist(activeUserPlaylist)}
                className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition cursor-pointer"
                title={t('userPlaylistsView.deletePlaylist')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {activeUserPlaylistTracks.length > 0 ? (
            <TrackTable
              tracks={activeUserPlaylistTracks}
              handleRowClick={handleRowClick}
              handleTrackContextMenu={handleTrackContextMenu}
              openTagEditor={openTagEditor}
              openTrackInfo={openTrackInfo}
              navigateToArtist={navigateToArtist}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-10">
              <ListPlus size={48} className="mb-3 opacity-20" />
              <p className="text-base">{t('userPlaylistsView.empty')}</p>
              <button
                onClick={() => setShowAddSongsToUserPlaylistModal(true)}
                className="mt-4 px-4 py-2 bg-theme-10 text-white rounded-lg text-sm font-medium transition"
              >
                {t('userPlaylistsView.addSongs')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {searchQuery ? t('userPlaylistsView.searchResults') : t('userPlaylistsView.title')}
          </h2>
          <span className="text-zinc-500 text-xs sm:text-sm mb-1 whitespace-nowrap hidden sm:inline">
            {userPlaylists.length} {t('userPlaylistsView.playlistCount')}
          </span>
        </div>
        <button
          onClick={() => setShowCreateUserPlaylistModal(true)}
          className="sys-btn flex items-center gap-1.5 sm:gap-2 bg-theme-10 hover:bg-theme-10 text-white px-2.5 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-theme-10/20 shrink-0 cursor-pointer"
          title={t('userPlaylistsView.createPlaylist')}
        >
          <Plus size={16} />{' '}
          <span className="btn-text">{t('userPlaylistsView.createPlaylist')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {(() => {
          const rawQuery = (deferredSearchQuery || searchQuery || '').trim()
          const normQuery = removeAccents(rawQuery)
          const matchedUserPlaylists = rawQuery
            ? userPlaylists.filter((pl) => matchesQuery(pl.name, normQuery))
            : userPlaylists

          if (matchedUserPlaylists.length === 0) {
            return (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                <ListPlus size={56} className="mb-4 opacity-20" />
                <p className="text-lg">{t('userPlaylistsView.noPlaylists')}</p>
                <button
                  onClick={() => setShowCreateUserPlaylistModal(true)}
                  className="mt-4 px-4 py-2 bg-theme-10 text-white rounded-lg text-sm font-medium transition"
                >
                  {t('userPlaylistsView.createPlaylist')}
                </button>
              </div>
            )
          }

          if (viewMode === 'table') {
            return (
              <div className="w-full bg-theme-60/20 rounded-2xl border border-theme-30/40 overflow-hidden shadow-xl">
                <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-theme-30/40 border-b border-theme-30/50 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-6">{t('userPlaylistsView.title')}</div>
                  <div className="col-span-3 text-center">{t('common.songs')}</div>
                  <div className="col-span-2 text-right">{t('trackTable.actions')}</div>
                </div>
                <div className="divide-y divide-theme-30/20">
                  {matchedUserPlaylists.map((pl, idx) => {
                    const resolved = getResolvedUserPlaylistTracks(pl)
                    const coverImg =
                      pl.thumbnail || pl.coverArt || resolved.find((t) => t.coverArt)?.coverArt

                    return (
                      <div
                        key={pl.id}
                        onClick={() => setActiveUserPlaylist(pl)}
                        onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                        className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized"
                      >
                        <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
                          {idx + 1}
                        </div>
                        <div className="col-span-6 flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow-md">
                            <DynamicCoverArt
                              src={coverImg}
                              trackPath={
                                pl.thumbnail || pl.coverArt ? undefined : resolved[0]?.filePath
                              }
                              tier="sm"
                              isLite={isLite}
                              fallbackIcon={<ListPlus size={20} className="text-zinc-600" />}
                              className="w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (resolved.length > 0) handleRowClick(resolved[0], resolved)
                                }}
                                className="text-white hover:scale-110 transition"
                              >
                                <Play size={16} className="fill-current" />
                              </button>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">
                              {pl.name}
                            </h4>
                            <p className="text-xs text-zinc-500 truncate mt-0.5">
                              {t('userPlaylistsView.title')}
                            </p>
                          </div>
                        </div>
                        <div className="col-span-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-theme-30/60 text-xs font-semibold text-zinc-300">
                            {pl.trackIds?.length || 0} {t('common.songs')}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleChangeUserPlaylistCover(pl.id)
                            }}
                            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100"
                            title={t('userPlaylistsView.chooseCover')}
                          >
                            <ImageIcon size={15} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUserPlaylistContextMenu(pl, e)
                            }}
                            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition"
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          if (viewMode === 'compact') {
            return (
              <div className="w-full space-y-1.5">
                {matchedUserPlaylists.map((pl, idx) => {
                  const resolved = getResolvedUserPlaylistTracks(pl)
                  const coverImg =
                    pl.thumbnail || pl.coverArt || resolved.find((t) => t.coverArt)?.coverArt

                  return (
                    <div
                      key={pl.id}
                      onClick={() => setActiveUserPlaylist(pl)}
                      onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                      className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">
                          {idx + 1}
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow">
                          <DynamicCoverArt
                            src={coverImg}
                            trackPath={
                              pl.thumbnail || pl.coverArt ? undefined : resolved[0]?.filePath
                            }
                            tier="sm"
                            isLite={isLite}
                            fallbackIcon={<ListPlus size={16} className="text-zinc-600" />}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-white text-sm group-hover:text-theme-10 transition truncate">
                            {pl.name}
                          </h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs text-zinc-400 font-mono">
                          {pl.trackIds?.length || 0} {t('common.songs')}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (resolved.length > 0) handleRowClick(resolved[0], resolved)
                          }}
                          className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100"
                          title={t('artistsView.playAll')}
                        >
                          <Play size={13} className="ml-0.5 fill-current" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUserPlaylistContextMenu(pl, e)
                          }}
                          className="text-zinc-500 hover:text-white p-1 rounded transition opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {matchedUserPlaylists.map((pl) => {
                const resolved = getResolvedUserPlaylistTracks(pl)
                const coverImg =
                  pl.thumbnail || pl.coverArt || resolved.find((t) => t.coverArt)?.coverArt

                return (
                  <div
                    key={pl.id}
                    onClick={() => setActiveUserPlaylist(pl)}
                    onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                    className="bg-theme-60/40 hover:bg-theme-30/50 p-4 rounded-2xl border border-theme-30/50 hover:border-theme-10/40 transition group cursor-pointer flex flex-col justify-between shadow-lg track-card-optimized"
                  >
                    <div className="aspect-square bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-md">
                      <DynamicCoverArt
                        src={coverImg}
                        trackPath={pl.thumbnail || pl.coverArt ? undefined : resolved[0]?.filePath}
                        tier="md"
                        isLite={isLite}
                        fallbackIcon={<ListPlus size={36} className="text-zinc-600" />}
                        className="w-full h-full"
                        imageClassName="group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (resolved.length > 0) handleRowClick(resolved[0], resolved)
                          }}
                          className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg"
                        >
                          <Play size={18} className="ml-0.5 fill-current" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleChangeUserPlaylistCover(pl.id)
                          }}
                          className="w-8 h-8 rounded-full bg-black/70 text-white hover:bg-theme-10 flex items-center justify-center transition"
                          title={t('userPlaylistsView.chooseCover')}
                        >
                          <ImageIcon size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-2">
                        <h3 className="font-bold text-white truncate text-sm group-hover:text-theme-10 transition">
                          {pl.name}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {pl.trackIds?.length || 0} {t('common.songs')}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUserPlaylistContextMenu(pl, e)
                        }}
                        className="text-zinc-500 hover:text-white p-1 rounded transition opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
export default UserPlaylistsView
