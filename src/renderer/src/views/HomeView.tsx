import React, { useMemo } from 'react'
import {
  Sparkles,
  Play,
  Shuffle,
  BarChart3,
  Library,
  ListMusic,
  Mic2,
  History,
  Music,
  Compass
} from 'lucide-react'
import { useLibraryStore, usePlayerStore, useUIStore, useSettingsStore } from '../stores'
import { useTranslation } from '../locales'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { ArtistLinks } from '../components/TrackListComponents'
import { fisherYatesShuffle } from '../utils/arrayUtils'

interface HomeViewProps {
  handleRowClick: (track: any, contextList?: any[]) => void
  handleTrackContextMenu: (track: any, e: React.MouseEvent) => void
  navigateToArtist: (artistName: string) => void
  uniqueArtistsCount: number
  formatDuration: (seconds: number) => string
}

export function HomeView({
  handleRowClick,
  handleTrackContextMenu,
  navigateToArtist,
  uniqueArtistsCount,
  formatDuration
}: HomeViewProps) {
  const { t } = useTranslation()
  const { libraryTracks, playlists, userPlaylists, recentlyPlayed } = useLibraryStore()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { setActiveView } = useUIStore()
  const appMode = useSettingsStore((s) => s.appMode)
  const isLite = appMode === 'lite' || appMode === 'core'

  // Thuật toán gợi ý bài hát cho Dashboard
  const dashboardRecommendations = useMemo(() => {
    if (!libraryTracks || libraryTracks.length === 0) return []

    const recentArtists = new Map<string, number>()
    const recentGenres = new Map<string, number>()

    const recentSample = (recentlyPlayed || []).slice(0, 20)
    recentSample.forEach((trk, idx) => {
      const weight = 20 - idx
      const a = (trk.artist || '').toString().toLowerCase().trim()
      if (a && a !== 'unknown' && a !== 'various artists' && a !== 'không rõ') {
        recentArtists.set(a, (recentArtists.get(a) || 0) + weight)
      }
      const g = (trk.genre || '').toString().toLowerCase().trim()
      if (g && g !== 'unknown' && g !== 'không rõ') {
        recentGenres.set(g, (recentGenres.get(g) || 0) + weight)
      }
    })

    const topArtists = Array.from(recentArtists.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
    const topGenres = Array.from(recentGenres.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0])
    const recentIds = new Set(recentSample.map((trk) => trk.id || trk.filePath))

    if (topArtists.length === 0 && topGenres.length === 0) {
      return [...(libraryTracks || [])].slice(0, 20)
    }

    const scoredTracks = libraryTracks.map((trk) => {
      let score = 0
      const tArtist = (trk.artist || '').toString().toLowerCase().trim()
      const tGenre = (trk.genre || '').toString().toLowerCase().trim()
      const tId = trk.id || trk.filePath

      topArtists.forEach((a, idx) => {
        if (tArtist && (tArtist.includes(a) || a.includes(tArtist))) {
          score += (topArtists.length - idx) * 12
        }
      })

      topGenres.forEach((g, idx) => {
        if (tGenre && (tGenre.includes(g) || g.includes(tGenre))) {
          score += (topGenres.length - idx) * 8
        }
      })

      if (recentIds.has(tId)) {
        score -= 5
      }

      return { track: trk, score }
    })

    scoredTracks.sort((a, b) => b.score - a.score)
    return scoredTracks
      .filter((st) => st.score > 0)
      .slice(0, 24)
      .map((st) => st.track)
  }, [libraryTracks, recentlyPlayed])

  // Tuyển tập ngẫu nhiên "Khám phá từ thư mục nhạc"
  const randomDiscoverTracks = useMemo(() => {
    if (!libraryTracks || libraryTracks.length === 0) return []
    return fisherYatesShuffle(libraryTracks || []).slice(0, 12)
  }, [libraryTracks])

  return (
    <div className="flex flex-col space-y-8 pb-16">
      {/* HERO HEADER */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-2xl bg-theme-10/15 border border-theme-10/30 text-theme-10 flex items-center justify-center shadow-lg shadow-theme-10/10 shrink-0">
            <Sparkles size={24} className="fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl lg:text-3xl font-extrabold text-white truncate">
              {t('home.dashboardTitle')}
            </h2>
            <p className="text-xs text-zinc-400 truncate">{t('home.dashboardSubtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          <button
            onClick={() => {
              if (dashboardRecommendations.length > 0) {
                handleRowClick(dashboardRecommendations[0], dashboardRecommendations)
              } else if (libraryTracks.length > 0) {
                handleRowClick(libraryTracks[0], libraryTracks)
              }
            }}
            disabled={libraryTracks.length === 0}
            className="sys-btn flex items-center gap-2 bg-theme-10 hover:bg-theme-10/90 disabled:opacity-50 text-white px-3.5 py-2 sm:px-4 sm:py-2.5 xl:px-5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
            title={t('home.playAllRecommendations')}
          >
            <Play size={16} className="fill-current shrink-0" />
            <span className="btn-text">{t('home.playAllRecommendations')}</span>
          </button>

          <button
            onClick={() => {
              if (libraryTracks.length > 0) {
                const shuffled = fisherYatesShuffle(libraryTracks)
                handleRowClick(shuffled[0], shuffled)
              }
            }}
            disabled={libraryTracks.length === 0}
            className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 hover:text-white px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
            title={t('home.shuffleAllLibrary')}
          >
            <Shuffle size={16} className="shrink-0" />
            <span className="btn-text">{t('home.shuffleAllLibrary')}</span>
          </button>

          <button
            onClick={() => setActiveView('analytics')}
            className="sys-btn flex items-center gap-2 bg-theme-60/80 hover:bg-theme-10/20 text-zinc-200 hover:text-theme-10 border border-theme-30/60 hover:border-theme-10/40 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
            title={t('analytics.title')}
          >
            <BarChart3 size={16} className="text-theme-10 shrink-0" />
            <span className="btn-text">{t('sidebar.analytics')}</span>
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveView('songs')}
          className="bg-theme-60/40 hover:bg-theme-30/40 border border-theme-30/60 hover:border-theme-10/40 rounded-2xl p-4 flex items-center gap-4 transition cursor-pointer group shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-theme-10 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <Library size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-white group-hover:text-theme-10 transition">
              {libraryTracks.length}
            </p>
            <p className="text-xs text-zinc-400 truncate">{t('home.statsSongs')}</p>
          </div>
        </div>

        <div
          onClick={() => setActiveView('playlists')}
          className="bg-theme-60/40 hover:bg-theme-30/40 border border-theme-30/60 hover:border-theme-10/40 rounded-2xl p-4 flex items-center gap-4 transition cursor-pointer group shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <ListMusic size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-white group-hover:text-blue-400 transition">
              {playlists.length + userPlaylists.length}
            </p>
            <p className="text-xs text-zinc-400 truncate">{t('home.statsPlaylists')}</p>
          </div>
        </div>

        <div
          onClick={() => setActiveView('artists')}
          className="bg-theme-60/40 hover:bg-theme-30/40 border border-theme-30/60 hover:border-theme-10/40 rounded-2xl p-4 flex items-center gap-4 transition cursor-pointer group shadow-sm"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
            <Mic2 size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-white group-hover:text-purple-400 transition">
              {uniqueArtistsCount}
            </p>
            <p className="text-xs text-zinc-400 truncate">{t('home.statsArtists')}</p>
          </div>
        </div>

        <div className="bg-theme-60/40 border border-theme-30/60 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <History size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-black text-white">{recentlyPlayed.length}</p>
            <p className="text-xs text-zinc-400 truncate">{t('home.statsRecent')}</p>
          </div>
        </div>
      </div>

      {/* KHỐI 1: GỢI Ý BÀI HÁT TỪ THƯ MỤC NHẠC */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate">
              <Sparkles size={18} className="text-theme-10 shrink-0" />
              <span className="truncate">{t('home.forYouTitle')}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">{t('home.forYouSubtitle')}</p>
          </div>
          {dashboardRecommendations.length > 0 && (
            <button
              onClick={() => handleRowClick(dashboardRecommendations[0], dashboardRecommendations)}
              className="text-xs font-medium text-theme-10 hover:underline flex items-center gap-1 transition shrink-0 cursor-pointer"
            >
              <Play size={12} className="fill-current" /> {t('userPlaylistsView.playAll')}
            </button>
          )}
        </div>

        {dashboardRecommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {dashboardRecommendations.map((track, idx) => {
              const isCurrent =
                currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
              return (
                <div
                  key={track.id || track.filePath || idx}
                  onClick={() => handleRowClick(track, dashboardRecommendations)}
                  onContextMenu={(e) => handleTrackContextMenu(track, e)}
                  className={`flex items-center gap-3.5 p-2.5 rounded-2xl border transition group cursor-pointer ${
                    isCurrent
                      ? 'bg-theme-10/15 border-theme-10/40 text-theme-10'
                      : 'bg-theme-60/40 hover:bg-theme-30/50 border-theme-30/40 hover:border-theme-30 text-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden relative shrink-0 shadow-md">
                    <DynamicCoverArt
                      track={track}
                      tier="sm"
                      isLite={isLite}
                      fallbackIcon={<Music size={18} className="text-zinc-600" />}
                      className="w-full h-full group-hover:scale-105 transition duration-300"
                    />
                    <div
                      className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      {isCurrent && isPlaying ? (
                        <span className="w-3.5 h-3.5 rounded-full bg-theme-10 animate-pulse"></span>
                      ) : (
                        <Play size={16} className="text-white fill-current ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}
                    >
                      {track.title || t('common.unknown')}
                    </p>
                    <ArtistLinks
                      artists={track.artists}
                      fallbackArtist={track.artist || t('player.unknownArtist')}
                      onArtistClick={navigateToArtist}
                      className="text-xs text-zinc-400 block truncate mt-0.5"
                    />
                  </div>

                  <span className="text-[11px] text-zinc-500 shrink-0 pr-2">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-theme-60/20 border border-theme-30/30 rounded-2xl p-6 text-center text-zinc-500 text-xs">
            {t('home.noRecommendationsDesc')}
          </div>
        )}
      </div>

      {/* KHỐI 2: ĐÃ NGHE GẦN ĐÂY (RECENTLY PLAYED) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate">
              <History size={18} className="text-amber-400 shrink-0" />
              <span className="truncate">{t('home.recentlyPlayedTitle')}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {t('home.recentlyPlayedSubtitle')}
            </p>
          </div>
          {(recentlyPlayed?.length || 0) > 0 && (
            <button
              onClick={() => handleRowClick(recentlyPlayed[0], recentlyPlayed)}
              className="text-xs font-medium text-theme-10 hover:underline flex items-center gap-1 transition shrink-0 cursor-pointer"
            >
              <Play size={12} className="fill-current" /> {t('userPlaylistsView.playAll')}
            </button>
          )}
        </div>

        {(recentlyPlayed?.length || 0) > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(recentlyPlayed || []).slice(0, 12).map((track, idx) => {
              const isCurrent =
                currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
              return (
                <div
                  key={track.id || track.filePath || idx}
                  onClick={() => handleRowClick(track, recentlyPlayed)}
                  onContextMenu={(e) => handleTrackContextMenu(track, e)}
                  className="bg-theme-60/40 hover:bg-theme-30/50 border border-theme-30/40 hover:border-theme-30 p-2.5 rounded-2xl transition group cursor-pointer"
                >
                  <div className="w-full aspect-square bg-theme-30 rounded-xl overflow-hidden relative mb-2 shadow-md">
                    <DynamicCoverArt
                      track={track}
                      tier="md"
                      isLite={isLite}
                      smartAspect={true}
                      fallbackIcon={<Music size={28} className="text-zinc-600" />}
                      className="w-full h-full group-hover:scale-105 transition duration-300"
                    />
                    <div
                      className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      {isCurrent && isPlaying ? (
                        <span className="w-5 h-5 rounded-full bg-theme-10 animate-pulse"></span>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-theme-10 flex items-center justify-center shadow-lg text-white">
                          <Play size={16} className="fill-current ml-0.5" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-xs font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}
                  >
                    {track.title}
                  </p>
                  <ArtistLinks
                    artists={track.artists}
                    fallbackArtist={track.artist}
                    onArtistClick={navigateToArtist}
                    className="text-[11px] text-zinc-500 block truncate mt-0.5"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-theme-60/20 border border-theme-30/30 rounded-2xl p-6 text-center text-zinc-500 text-xs">
            {t('home.noRecentDesc')}
          </div>
        )}
      </div>

      {/* KHỐI 3: KHÁM PHÁ TỪ THƯ MỤC NHẠC */}
      {randomDiscoverTracks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate">
                <Compass size={18} className="text-blue-400 shrink-0" />
                <span className="truncate">{t('home.discoverFolderTitle')}</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                {t('home.discoverFolderSubtitle')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {randomDiscoverTracks.map((track, idx) => {
              const isCurrent =
                currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
              return (
                <div
                  key={track.id || track.filePath || idx}
                  onClick={() => handleRowClick(track, randomDiscoverTracks)}
                  onContextMenu={(e) => handleTrackContextMenu(track, e)}
                  className={`flex items-center gap-3.5 p-2.5 rounded-2xl border transition group cursor-pointer ${
                    isCurrent
                      ? 'bg-theme-10/15 border-theme-10/40 text-theme-10'
                      : 'bg-theme-60/40 hover:bg-theme-30/50 border-theme-30/40 hover:border-theme-30 text-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden relative shrink-0 shadow-md">
                    <DynamicCoverArt
                      track={track}
                      tier="sm"
                      isLite={isLite}
                      fallbackIcon={<Music size={18} className="text-zinc-600" />}
                      className="w-full h-full group-hover:scale-105 transition duration-300"
                    />
                    <div
                      className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      {isCurrent && isPlaying ? (
                        <span className="w-3.5 h-3.5 rounded-full bg-theme-10 animate-pulse"></span>
                      ) : (
                        <Play size={16} className="text-white fill-current ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}
                    >
                      {track.title || t('common.unknown')}
                    </p>
                    <ArtistLinks
                      artists={track.artists}
                      fallbackArtist={track.artist || t('player.unknownArtist')}
                      onArtistClick={navigateToArtist}
                      className="text-xs text-zinc-400 block truncate mt-0.5"
                    />
                  </div>

                  <span className="text-[11px] text-zinc-500 shrink-0 pr-2">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
export default HomeView
