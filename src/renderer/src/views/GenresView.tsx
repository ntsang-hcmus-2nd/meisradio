import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso'
import { Tag, Play, ArrowLeft, Shuffle } from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { removeAccents, matchesQuery } from '../utils/textUtils'
import { useTranslation } from '../locales'
import { useUIStore, useSettingsStore, useLibraryStore } from '../stores'
import {
  useMotionReduced,
  viewModeSlideTransition,
  viewModeSlideVariants
} from '../components/motion'

export interface GenresViewProps {
  searchQuery: string
  deferredSearchQuery?: string
  genresData: any[]
  activeGenre: any
  setActiveGenre: (genre: any) => void
  handleRowClick: (track: any, playlist?: any[]) => void
  navigateToArtist: (artistName: string) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
}

export const GenresView: React.FC<GenresViewProps> = ({
  searchQuery,
  deferredSearchQuery,
  genresData,
  activeGenre,
  setActiveGenre,
  handleRowClick,
  navigateToArtist,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo
}) => {
  const { t } = useTranslation()
  const viewMode = useUIStore((state) => state.viewMode)
  const viewModeDirection = useUIStore((state) => state.viewModeDirection)
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')
  const reduceMotion = useMotionReduced()
  const noAnim = reduceMotion || isLite
  const libraryTracks = useLibraryStore((state) => state.libraryTracks)

  if (activeGenre) {
    return (
      <div className="flex flex-col h-full space-y-6">
        <div>
          <button
            onClick={() => setActiveGenre(null)}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft size={16} /> {t('genresView.backToGenres')}
          </button>

          <div className="flex items-end gap-6 mb-6">
            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-theme-10/30 to-theme-30 border border-theme-10/40 shadow-2xl flex items-center justify-center flex-shrink-0">
              <Tag size={48} className="text-theme-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">
                {activeGenre.name}
              </h2>
              <p className="text-sm text-zinc-400 mb-4">
                {activeGenre.tracks.length} {t('common.songs')} • {activeGenre.artistCount}{' '}
                {t('artistsView.artistCount')}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (activeGenre.tracks.length > 0) {
                      handleRowClick(activeGenre.tracks[0], activeGenre.tracks)
                    }
                  }}
                  className="sys-btn flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
                  title={t('artistsView.playAll')}
                >
                  <Play size={16} className="fill-current" />{' '}
                  <span className="btn-text">{t('artistsView.playAll')}</span>
                </button>
                <button
                  onClick={() => {
                    if (activeGenre.tracks.length > 0) {
                      const shuffled = fisherYatesShuffle(activeGenre.tracks)
                      handleRowClick(shuffled[0], shuffled)
                    }
                  }}
                  className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-theme-30/80 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                  title={t('artistsView.shuffle')}
                >
                  <Shuffle size={16} /> <span className="btn-text">{t('artistsView.shuffle')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Top nghệ sĩ trong thể loại */}
          {Array.isArray(activeGenre.artists) && activeGenre.artists.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <span className="text-xs text-zinc-500 shrink-0">{t('genresView.topArtists')}:</span>
              {(activeGenre.artists || []).slice(0, 10).map((art: string) => (
                <span
                  key={art}
                  onClick={() => {
                    navigateToArtist(art)
                  }}
                  className="px-3 py-1 bg-theme-60/60 hover:bg-theme-10/20 hover:text-theme-10 rounded-full text-xs text-zinc-300 font-medium transition border border-theme-30/50 cursor-pointer shrink-0"
                >
                  {art}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <TrackTable
            tracks={activeGenre.tracks}
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
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {searchQuery ? t('genresView.searchResults') : t('genresView.title')}
          </h2>
          <span className="text-zinc-500 text-xs sm:text-sm mb-1 whitespace-nowrap hidden sm:inline">
            {genresData.length} {t('genresView.genreCount')} • {libraryTracks.length}{' '}
            {t('common.songs')}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={viewModeDirection}>
        <motion.div
          key={viewMode}
          className="flex-1 min-h-[300px] h-full w-full overflow-hidden"
          custom={viewModeDirection}
          variants={viewModeSlideVariants}
          initial={noAnim ? { opacity: 1, x: 0 } : 'initial'}
          animate={noAnim ? { opacity: 1, x: 0 } : 'animate'}
          exit={noAnim ? { opacity: 1, x: 0 } : 'exit'}
          transition={noAnim ? { duration: 0 } : viewModeSlideTransition}
        >
          {(() => {
            const rawQuery = (deferredSearchQuery || searchQuery || '').trim()
            const normQuery = removeAccents(rawQuery)
            const filteredGenres = rawQuery
              ? genresData.filter((g) => matchesQuery(g.name, normQuery))
              : genresData

            if (filteredGenres.length === 0) {
              return <p className="text-zinc-500 text-center mt-10">{t('genresView.noGenres')}</p>
            }

            if (viewMode === 'table') {
              return (
                <div className="w-full h-full bg-theme-60/20 rounded-2xl border border-theme-30/40 overflow-hidden shadow-xl flex flex-col">
                  <Virtuoso
                    style={{ height: '100%', width: '100%' }}
                    data={filteredGenres}
                    components={{
                      Header: () => (
                        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-theme-60/95 backdrop-blur-md border-b border-theme-30/50 text-xs font-bold text-zinc-400 uppercase tracking-wider select-none sticky top-0 z-10">
                          <div className="col-span-1 text-center">#</div>
                          <div className="col-span-5">{t('genresView.title')}</div>
                          <div className="col-span-4">{t('genresView.topArtists')}</div>
                          <div className="col-span-1 text-center">{t('common.songs')}</div>
                          <div className="col-span-1 text-right">{t('player.play')}</div>
                        </div>
                      )
                    }}
                    itemContent={(idx, genre) => (
                      <div
                        key={genre.name}
                        onClick={() => setActiveGenre(genre)}
                        className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized border-b border-theme-30/20"
                      >
                        <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
                          {idx + 1}
                        </div>
                        <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-theme-10/30 to-theme-30 border border-theme-10/30 flex items-center justify-center shrink-0 shadow-md">
                            <Tag size={20} className="text-theme-10" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">
                              {genre.name}
                            </h4>
                            <p className="text-xs text-zinc-500 truncate mt-0.5">
                              {genre.artistCount} {t('artistsView.artistCount')}
                            </p>
                          </div>
                        </div>
                        <div className="col-span-4 flex items-center gap-1.5 overflow-hidden">
                          {(genre.artists || []).slice(0, 3).map((art: string) => (
                            <span
                              key={art}
                              className="px-2 py-0.5 bg-theme-30/50 text-[11px] text-zinc-300 rounded-md truncate max-w-[120px]"
                            >
                              {art}
                            </span>
                          ))}
                          {(genre.artists?.length || 0) > 3 && (
                            <span className="text-[10px] text-zinc-500">
                              +{(genre.artists?.length || 0) - 3}
                            </span>
                          )}
                        </div>
                        <div className="col-span-1 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-theme-30/60 text-xs font-semibold text-zinc-300">
                            {genre.trackCount}
                          </span>
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (genre.tracks.length > 0)
                                handleRowClick(genre.tracks[0], genre.tracks)
                            }}
                            className="p-2 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition"
                            title={t('artistsView.playAll')}
                          >
                            <Play size={14} className="ml-0.5 fill-current" />
                          </button>
                        </div>
                      </div>
                    )}
                  />
                </div>
              )
            }

            if (viewMode === 'compact') {
              return (
                <Virtuoso
                  style={{ height: '100%', width: '100%' }}
                  data={filteredGenres}
                  itemContent={(idx, genre) => (
                    <div className="pb-1.5">
                      <div
                        key={genre.name}
                        onClick={() => setActiveGenre(genre)}
                        className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">
                            {idx + 1}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-theme-10/20 border border-theme-10/30 flex items-center justify-center shrink-0">
                            <Tag size={15} className="text-theme-10" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-white text-sm group-hover:text-theme-10 transition truncate">
                              {genre.name}
                            </h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-xs text-zinc-400 font-mono">
                            {genre.trackCount} {t('common.songs')} • {genre.artistCount}{' '}
                            {t('artistsView.artistCount')}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (genre.tracks.length > 0)
                                handleRowClick(genre.tracks[0], genre.tracks)
                            }}
                            className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100"
                            title={t('artistsView.playAll')}
                          >
                            <Play size={13} className="ml-0.5 fill-current" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                />
              )
            }

            return (
              <VirtuosoGrid
                style={{ height: '100%', width: '100%' }}
                data={filteredGenres}
                listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 p-1"
                itemClassName="h-full"
                itemContent={(_idx, genre) => (
                  <div
                    key={genre.name}
                    onClick={() => setActiveGenre(genre)}
                    className="bg-gradient-to-br from-theme-60/80 to-theme-30/40 hover:from-theme-10/20 hover:to-theme-30/70 p-4 rounded-2xl border border-theme-30/50 hover:border-theme-10/50 transition duration-300 group cursor-pointer shadow-lg flex flex-col justify-between h-48 track-card-optimized"
                  >
                    <div className="w-full aspect-video bg-theme-30/60 rounded-xl overflow-hidden relative mb-3 flex items-center justify-center">
                      {!isLite && (genre.coverArts?.length || 0) > 0 ? (
                        <div className="w-full h-full grid grid-cols-2 gap-0.5">
                          {(genre.coverArts || []).slice(0, 4).map((c: string, i: number) => (
                            <DynamicCoverArt
                              key={i}
                              src={c}
                              tier="sm"
                              isLite={isLite}
                              className="w-full h-full"
                            />
                          ))}
                        </div>
                      ) : (
                        <Tag size={32} className="text-theme-10/80" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (genre.tracks.length > 0)
                              handleRowClick(genre.tracks[0], genre.tracks)
                          }}
                          className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition"
                        >
                          <Play size={18} className="ml-0.5 fill-current" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">
                        {genre.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        {genre.trackCount} {t('common.songs')} • {genre.artistCount}{' '}
                        {t('artistsView.artistCount')}
                      </p>
                    </div>
                  </div>
                )}
              />
            )
          })()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
export default GenresView
