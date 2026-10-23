import React from 'react'
import { ArrowLeft, Disc, Play, Shuffle, Activity, Cloud, RefreshCw, Download } from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { useTranslation } from '../locales'
import { useSettingsStore, useUIStore, usePlayerStore } from '../stores'

const SC_GENRES = [
  { id: 'all-music', key: 'all' },
  { id: 'electronic', key: 'electronic' },
  { id: 'hiphoprap', key: 'hiphoprap' },
  { id: 'pop', key: 'pop' },
  { id: 'chill', key: 'chill' },
  { id: 'rock', key: 'rock' },
  { id: 'ambient', key: 'ambient' },
  { id: 'danceedm', key: 'danceedm' }
]

/**
 * Chuẩn hóa 1 raw item trên dashboard SoundCloud thành track format nội bộ
 * (giống khối normalize trong App.handleScItemClick) trước khi vào playQueue:
 * đảm bảo có isOnline / platform / id sc-... để engine phát online đúng luồng.
 */
function normalizeScQueueItem(item: any): any | null {
  if (!item || item.isPlaylist || item.playlistId) return null
  const originalId = String(item.originalId ?? item.videoId ?? '')
  if (!originalId && !item.id) return null
  const id = item.id || `sc-${originalId}`
  return {
    id,
    originalId,
    title: item.title,
    artist: item.artist || item.subtitle,
    album: item.album || 'SoundCloud Single',
    duration: item.duration || 0,
    format: 'STREAM',
    isCloud: true,
    isOnline: true,
    platform: 'soundcloud',
    permalinkUrl: item.permalinkUrl,
    coverArt: item.coverArt || item.thumbnails?.[0]?.url || null,
    coverArtHighRes: item.coverArtHighRes || null
  }
}

export interface SoundCloudViewProps {
  activeAlbum: any
  setActiveAlbum: (album: any) => void
  handleRowClick: (track: any, playlist?: any[]) => void
  isAlbumLoading: boolean
  searchInput: string
  setSearchInput: (s: string) => void
  searchQuery: string
  setSearchQuery: (s: string) => void
  fetchScDashboard: (genreId?: string) => void
  isScLoading: boolean
  scUser: any
  handleScLogin: () => void
  handleScLogout: () => void
  selectedScGenre: string
  setSelectedScGenre: (genre: string) => void
  scDashboardData: any[]
  handleScItemClick: (item: any) => void
  handleDashboardItemDownload: (item: any) => void
  setContextMenu: (menu: any) => void
  setPlayQueue: (tracks: any[] | ((prev: any[]) => any[])) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const SoundCloudView: React.FC<SoundCloudViewProps> = ({
  activeAlbum,
  setActiveAlbum,
  handleRowClick,
  isAlbumLoading,
  searchInput,
  setSearchInput,
  searchQuery,
  setSearchQuery,
  fetchScDashboard,
  isScLoading,
  scUser,
  handleScLogin,
  handleScLogout,
  selectedScGenre,
  setSelectedScGenre,
  scDashboardData,
  handleScItemClick,
  handleDashboardItemDownload,
  setContextMenu,
  setPlayQueue,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t } = useTranslation()
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')
  const showToast = useUIStore((s) => s.showToast)

  return (
    <div className="flex flex-col h-full">
      {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST SOUNDCLOUD --- */}
      {activeAlbum ? (
        <div className="flex flex-col h-full space-y-6">
          <div>
            <button
              onClick={() => setActiveAlbum(null)}
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
            >
              <ArrowLeft size={16} /> {t('home.backToDashboard')}
            </button>
            <div className="flex items-end justify-between gap-6 mb-6">
              <div className="flex items-end gap-6 min-w-0">
                {(activeAlbum as any).thumbnail && (
                  <div className="w-36 h-36 rounded-2xl overflow-hidden bg-theme-30 border border-theme-30/80 shadow-2xl flex-shrink-0">
                    <DynamicCoverArt
                      src={(activeAlbum as any).thumbnail}
                      tier="lg"
                      isLite={isLite}
                      fallbackIcon={<Disc size={48} className="text-amber-500/50" />}
                      className="w-full h-full"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">
                    {t('home.scPlaylist')}
                  </p>
                  <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-3 truncate">
                    {activeAlbum.title}
                  </h2>
                  <p className="text-sm text-zinc-400 mb-4">
                    {activeAlbum.tracks?.length || 0} {t('common.songs')}
                  </p>
                  {activeAlbum.tracks && activeAlbum.tracks.length > 0 && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleRowClick(activeAlbum.tracks[0], activeAlbum.tracks)}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        <Play size={16} className="fill-current" /> {t('userPlaylistsView.playAll')}
                      </button>
                      <button
                        onClick={() => {
                          const shuffled = fisherYatesShuffle(activeAlbum.tracks)
                          handleRowClick(shuffled[0], shuffled)
                        }}
                        className="flex items-center gap-2 bg-theme-30 hover:bg-theme-30/80 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                      >
                        <Shuffle size={16} /> {t('artistsView.shuffle')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isAlbumLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Activity size={40} className="text-amber-500 mb-4 animate-bounce" />
              <p className="text-amber-400 animate-pulse font-medium">{t('home.extractingSc')}</p>
            </div>
          ) : (
            <TrackTable
              tracks={activeAlbum.tracks}
              handleRowClick={handleRowClick}
              handleTrackContextMenu={handleTrackContextMenu}
              openTagEditor={openTagEditor}
              openTrackInfo={openTrackInfo}
              navigateToArtist={navigateToArtist}
            />
          )}
        </div>
      ) : (
        /* --- NẾU LÀ MÀN HÌNH SOUNDCLOUD DASHBOARD --- */
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {(searchInput.trim() || searchQuery.trim()) && (
                <button
                  onClick={() => {
                    setSearchInput('')
                    setSearchQuery('')
                    fetchScDashboard()
                  }}
                  title={t('home.backToDashboard')}
                  className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition cursor-pointer shrink-0"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                <Cloud size={22} className="fill-current" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {t('home.scTitle')}
                </h2>
                <p className="text-xs text-zinc-400">{t('home.scSubtitle')}</p>
              </div>
            </div>

            {/* THANH THÔNG TIN TÀI KHOẢN & ĐĂNG NHẬP / ĐỔI TÀI KHOẢN SOUNDCLOUD */}
            <div className="flex items-center gap-3">
              {scUser ? (
                <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-1.5">
                  {scUser.avatarUrl ? (
                    <img
                      src={scUser.avatarUrl}
                      alt={scUser.username}
                      className="w-7 h-7 rounded-full object-cover border border-amber-500/50"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                      {scUser.username?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">{scUser.username}</span>
                    <span className="text-[10px] text-amber-400">{t('home.scMember')}</span>
                  </div>
                  <button
                    onClick={handleScLogout}
                    className="text-xs text-amber-400 hover:text-amber-300 hover:underline transition font-medium border-l border-zinc-700 pl-3 ml-1"
                    title={t('home.scLogout')}
                  >
                    {t('home.scLogout')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleScLogin}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-lg shadow-orange-600/20"
                >
                  <Cloud size={16} /> {t('home.scLogin')}
                </button>
              )}

              <button
                onClick={() => fetchScDashboard()}
                disabled={isScLoading}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition"
                title={t('home.refreshSc')}
              >
                <RefreshCw size={16} className={isScLoading ? 'animate-spin text-amber-400' : ''} />
              </button>
            </div>
          </div>

          {/* THANH CHỌN THỂ LOẠI (GENRE FILTER PILLS) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide mb-4 shrink-0">
            {SC_GENRES.map((g) => {
              const isSelected = selectedScGenre === g.id
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedScGenre(g.id)
                    fetchScDashboard(g.id)
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-black font-semibold shadow-md shadow-amber-500/20'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {t(`home.genres.${g.key}` as any)}
                </button>
              )
            })}
          </div>

          {/* NỘI DUNG SOUNDCLOUD SECTIONS */}
          <div className="flex-1 overflow-y-auto pr-4 space-y-10 pb-20">
            {isScLoading && scDashboardData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center mt-20 text-zinc-500">
                <Activity size={40} className="text-amber-500 animate-bounce mb-3" />
                <p className="text-sm font-medium text-amber-400 animate-pulse">
                  {t('home.loadingSc')}
                </p>
              </div>
            ) : scDashboardData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                <Cloud size={56} className="mb-4 opacity-20 text-amber-500" />
                <p className="text-lg">{t('home.noScTracksTitle')}</p>
                <p className="text-sm mt-1">{t('home.noScTracksDesc')}</p>
              </div>
            ) : (
              scDashboardData.map((section, index) => {
                const isListSection = section.contents.some(
                  (t: any) => t.style === 'LIST' || t.format === 'STREAM'
                )

                return (
                  <div key={index}>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span>{section.title}</span>
                    </h3>

                    <div
                      className={`overflow-x-auto pb-4 scrollbar-hide snap-x ${isListSection ? 'grid grid-rows-4 grid-flow-col gap-x-6 gap-y-3' : 'flex gap-4'}`}
                    >
                      {section.contents.map((item: any, i: number) => {
                        if (item.style === 'LIST' || item.format === 'STREAM') {
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-3 w-96 snap-start group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition"
                              onClick={() => handleScItemClick(item)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  items: [
                                    {
                                      id: 'sc-play',
                                      label: t('contextMenu.play'),
                                      onClick: () => handleScItemClick(item)
                                    },
                                    {
                                      id: 'sc-queue',
                                      label: t('contextMenu.addQueue'),
                                      onClick: () => {
                                        const track = normalizeScQueueItem(item)
                                        if (!track) return
                                        const queueKey = track.originalId || track.id
                                        const existingQueue =
                                          usePlayerStore.getState().playQueue || []
                                        if (
                                          existingQueue.some(
                                            (p) => (p.originalId || p.id) === queueKey
                                          )
                                        ) {
                                          showToast(
                                            t('toasts.alreadyInQueue', {
                                              title: track.title
                                            }),
                                            'info'
                                          )
                                          return
                                        }
                                        setPlayQueue((prev: any[]) => [...(prev || []), track])
                                        showToast(
                                          t('toasts.addedToQueue', { title: track.title }),
                                          'success'
                                        )
                                      }
                                    },
                                    {
                                      id: 'sc-dl',
                                      label: t('contextMenu.downloadToLib'),
                                      onClick: () => handleDashboardItemDownload(item)
                                    }
                                  ]
                                })
                              }}
                            >
                              <div className="w-12 h-12 bg-theme-30 rounded-lg flex-shrink-0 relative overflow-hidden shadow-md">
                                {item.coverArt ||
                                (item.thumbnails && item.thumbnails.length > 0) ? (
                                  <img
                                    loading="lazy"
                                    src={item.coverArt || item.thumbnails[0].url}
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                  />
                                ) : (
                                  <Cloud size={20} className="m-auto mt-3 text-amber-500/50" />
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Play size={18} className="text-amber-400 fill-current ml-0.5" />
                                </div>
                              </div>
                              <div className="flex-1 truncate">
                                <p className="font-semibold text-sm text-white truncate group-hover:text-amber-400 transition">
                                  {item.title}
                                </p>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {item.artist || item.subtitle}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDashboardItemDownload(item)
                                }}
                                className="w-8 h-8 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:bg-amber-400/10 rounded-full transition"
                                title={t('home.downloadToLib')}
                              >
                                <Download size={14} />
                              </button>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={i}
                            className="min-w-[160px] max-w-[160px] snap-start group cursor-pointer"
                            onClick={() => handleScItemClick(item)}
                          >
                            <div className="w-40 h-40 bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-lg">
                              {item.coverArt || (item.thumbnails && item.thumbnails.length > 0) ? (
                                <img
                                  loading="lazy"
                                  src={item.coverArt || item.thumbnails[0].url}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                />
                              ) : (
                                <Cloud size={40} className="m-auto mt-16 text-amber-500/40" />
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleScItemClick(item)
                                  }}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 rounded-lg text-xs text-black font-semibold flex items-center gap-1 transition"
                                >
                                  <Play size={14} /> {t('home.playNow')}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDashboardItemDownload(item)
                                  }}
                                  className="w-10 h-10 flex items-center justify-center bg-theme-30/90 text-white rounded-full hover:bg-amber-500 hover:text-black hover:scale-110 transition shadow-2xl"
                                  title={t('home.downloadToLib')}
                                >
                                  <Download size={18} />
                                </button>
                              </div>
                            </div>
                            <p className="font-semibold text-sm text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-zinc-500 truncate mt-1">
                              {item.subtitle || item.artist}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
export default SoundCloudView
