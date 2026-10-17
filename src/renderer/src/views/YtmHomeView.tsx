import React from 'react'
import {
  ArrowLeft,
  Disc,
  Play,
  Shuffle,
  Activity,
  Cloud,
  ListMusic,
  Download
} from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { useTranslation } from '../locales'
import { useSettingsStore } from '../stores'

export interface YtmHomeViewProps {
  activeAlbum: any
  setActiveAlbum: (album: any) => void
  handleRowClick: (track: any, playlist?: any[]) => void
  isAlbumLoading: boolean
  searchInput: string
  setSearchInput: (s: string) => void
  searchQuery: string
  setSearchQuery: (s: string) => void
  fetchDashboard: () => void
  isYtmLoggedIn: boolean
  handleYtmLogin: () => void
  handleYtmLogout: () => void
  dashboardData: any[]
  handleDashboardItemClick: (item: any) => void
  handleDashboardItemDownload: (item: any) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const YtmHomeView: React.FC<YtmHomeViewProps> = ({
  activeAlbum,
  setActiveAlbum,
  handleRowClick,
  isAlbumLoading,
  searchInput,
  setSearchInput,
  searchQuery,
  setSearchQuery,
  fetchDashboard,
  isYtmLoggedIn,
  handleYtmLogin,
  handleYtmLogout,
  dashboardData,
  handleDashboardItemClick,
  handleDashboardItemDownload,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t } = useTranslation()
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')

  return (
    <div className="flex flex-col h-full">
      {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST --- */}
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
                      fallbackIcon={<Disc size={48} className="text-zinc-600" />}
                      className="w-full h-full"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">
                    {t('home.ytmPlaylist')}
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
                        onClick={() =>
                          handleRowClick(activeAlbum.tracks[0], activeAlbum.tracks)
                        }
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-red-600/20 cursor-pointer"
                      >
                        <Play size={16} className="fill-current" />{' '}
                        {t('userPlaylistsView.playAll')}
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
              <Activity size={40} className="text-red-500 mb-4 animate-bounce" />
              <p className="text-red-400 animate-pulse font-medium">
                {t('home.extractingYtm')}
              </p>
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
        /* --- NẾU LÀ MÀN HÌNH DASHBOARD GỐC --- */
        <>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              {(searchInput.trim() || searchQuery.trim()) && (
                <button
                  onClick={() => {
                    setSearchInput('')
                    setSearchQuery('')
                    fetchDashboard()
                  }}
                  title={t('home.backToDashboard')}
                  className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition cursor-pointer shrink-0"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <button
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                  fetchDashboard()
                }}
                title={t('home.refreshYtm')}
                className="focus:outline-none flex items-center justify-center cursor-pointer hover:scale-110 transition-all w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500"
              >
                <Play size={20} className="fill-current" />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {t('home.ytmTitle')}
                </h2>
                <p className="text-xs text-zinc-400">{t('home.ytmSubtitle')}</p>
              </div>
            </div>

            {/* NÚT ĐĂNG NHẬP / ĐĂNG XUẤT YOUTUBE */}
            <div className="flex items-center gap-3">
              {isYtmLoggedIn ? (
                <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="text-xs text-zinc-300 font-medium">
                      {t('home.ytmSynced')}
                    </span>
                  </div>
                  <button
                    onClick={handleYtmLogout}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline transition font-medium border-l border-zinc-700 pl-3"
                    title={t('home.ytmLogout')}
                  >
                    {t('home.ytmLogout')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleYtmLogin}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-red-600/20"
                >
                  <Cloud size={18} /> {t('home.ytmLogin')}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-4 space-y-10 pb-20">
            {/* THÔNG BÁO KHI CHƯA ĐĂNG NHẬP (TRỐNG DỮ LIỆU) */}
            {dashboardData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                <ListMusic size={56} className="mb-4 opacity-20" />
                <p className="text-lg">{t('home.noRecommendationsTitle')}</p>
                <p className="text-sm mt-1">{t('home.noRecommendationsDesc')}</p>
              </div>
            ) : (
              dashboardData.map((section, index) => {
                const isListSection = section.contents.some(
                  (t: any) => t.style === 'LIST'
                )

                return (
                  <div key={index}>
                    <h3 className="text-xl font-bold text-white mb-4">
                      {section.title}
                    </h3>

                    <div
                      className={`overflow-x-auto pb-4 scrollbar-hide snap-x ${isListSection ? 'grid grid-rows-4 grid-flow-col gap-x-6 gap-y-3' : 'flex gap-4'}`}
                    >
                      {section.contents.map((item: any, i: number) => {
                        if (item.style === 'LIST') {
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-3 w-96 snap-start group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition"
                              onClick={() => handleDashboardItemClick(item)}
                            >
                              <div className="w-12 h-12 bg-theme-30 rounded flex-shrink-0 relative overflow-hidden shadow-md">
                                {item.thumbnails && item.thumbnails.length > 0 ? (
                                  <img
                                    loading="lazy"
                                    src={
                                      item.thumbnails[item.thumbnails.length - 1]
                                        .url
                                    }
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                  />
                                ) : (
                                  <ListMusic
                                    size={16}
                                    className="m-auto mt-4 text-zinc-600"
                                  />
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Play
                                    size={18}
                                    className="text-white fill-current ml-0.5"
                                  />
                                </div>
                              </div>
                              <div className="flex-1 truncate">
                                <p className="font-semibold text-sm text-white truncate group-hover:text-red-400 transition">
                                  {item.title}
                                </p>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {item.subtitle}
                                </p>
                              </div>
                              {!item.isArtist && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDashboardItemDownload(item)
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 rounded-full transition"
                                  title={t('home.downloadToLib')}
                                >
                                  <Download size={14} />
                                </button>
                              )}
                            </div>
                          )
                        }

                        return (
                          <div
                            key={i}
                            className="min-w-[160px] max-w-[160px] snap-start group cursor-pointer"
                            onClick={() => handleDashboardItemClick(item)}
                          >
                            <div className="w-40 h-40 bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-lg">
                              {item.thumbnails && item.thumbnails.length > 0 ? (
                                <img
                                  loading="lazy"
                                  src={
                                    item.thumbnails[item.thumbnails.length - 1].url
                                  }
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                />
                              ) : (
                                <ListMusic
                                  size={40}
                                  className="m-auto mt-16 text-zinc-600"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDashboardItemClick(item)
                                  }}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-xs text-white font-medium flex items-center gap-1 transition"
                                >
                                  <Play size={14} /> {t('home.playNow')}
                                </button>
                                {!item.isArtist && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDashboardItemDownload(item)
                                    }}
                                    className="w-10 h-10 flex items-center justify-center bg-theme-30/90 text-white rounded-full hover:bg-red-600 hover:scale-110 transition shadow-2xl"
                                    title={t('home.downloadToLib')}
                                  >
                                    <Download size={18} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="font-semibold text-sm text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-zinc-500 truncate mt-1">
                              {item.subtitle}
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
export default YtmHomeView
