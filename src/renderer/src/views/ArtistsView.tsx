import React, { useRef, useState, useMemo } from 'react'
import { GroupedVirtuoso, VirtuosoGrid, GroupedVirtuosoHandle } from 'react-virtuoso'
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Mic2,
  MoreVertical,
  Play,
  Shuffle,
  Disc,
  Music
} from 'lucide-react'
import { DynamicCoverArt } from '../components/DynamicCoverArt'
import { TrackTable } from '../components/TrackTable'
import { fisherYatesShuffle } from '../utils/arrayUtils'
import { removeAccents, matchesQuery } from '../utils/textUtils'
import { useTranslation } from '../locales'
import { useSettingsStore, useLibraryStore } from '../stores'

export interface ArtistsViewProps {
  searchQuery: string
  deferredSearchQuery?: string
  artistsData: {
    artistsList: any[]
    alphabetGroups: any[]
  }
  activeArtist: any
  setActiveArtist: (artist: any) => void
  handleRowClick: (track: any, playlist?: any[]) => void
  handleArtistContextMenu: (artist: any, e: React.MouseEvent) => void
  handleTrackContextMenu?: (track: any, e: React.MouseEvent) => void
  openTagEditor?: (track: any) => void
  openTrackInfo?: (track: any) => void
  navigateToArtist?: (artistName: string) => void
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  searchQuery,
  deferredSearchQuery,
  artistsData,
  activeArtist,
  setActiveArtist,
  handleRowClick,
  handleArtistContextMenu,
  handleTrackContextMenu,
  openTagEditor,
  openTrackInfo,
  navigateToArtist
}) => {
  const { t } = useTranslation()
  const isLite = useSettingsStore((state) => state.appMode === 'lite' || state.appMode === 'core')
  const libraryTracks = useLibraryStore((state) => state.libraryTracks)

  const [collapsedArtistLetters, setCollapsedArtistLetters] = useState<Record<string, boolean>>({})
  const artistVirtuosoRef = useRef<GroupedVirtuosoHandle>(null)

  const chunkedAlphabetGroups = useMemo(() => {
    let globalRowIndex = 0
    const result: any[] = []
    for (let grpIdx = 0; grpIdx < artistsData.alphabetGroups.length; grpIdx++) {
      const grp = artistsData.alphabetGroups[grpIdx]
      const isCollapsed = Boolean(collapsedArtistLetters[grp.letter])
      const artists = isCollapsed ? [] : grp.artists || []
      const rows: any[][] = []
      for (let i = 0; i < artists.length; i += 3) {
        rows.push(artists.slice(i, i + 3))
      }
      const startRowIndex = globalRowIndex
      globalRowIndex += rows.length
      result.push({
        ...grp,
        rows,
        startRowIndex,
        groupIndex: grpIdx,
        isCollapsed
      })
    }
    return result
  }, [artistsData.alphabetGroups, collapsedArtistLetters])

  const alphabetGroupCounts = useMemo(() => {
    return chunkedAlphabetGroups.map((grp) => (grp.isCollapsed ? 0 : grp.rows.length))
  }, [chunkedAlphabetGroups])

  if (activeArtist) {
    return (
      <div className="flex flex-col space-y-8 pb-16">
        <div>
          <button
            onClick={() => setActiveArtist(null)}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft size={16} /> {t('artistsView.backToArtists')}
          </button>

          <div className="flex items-end gap-6 mb-6">
            <div className="w-36 h-36 rounded-full overflow-hidden bg-theme-30 border-2 border-theme-10/40 shadow-2xl flex items-center justify-center flex-shrink-0">
              <DynamicCoverArt
                src={activeArtist.coverArt}
                trackPath={activeArtist.tracks?.[0]?.filePath}
                tier="lg"
                isLite={isLite}
                fallbackIcon={<Mic2 size={48} className="text-theme-10" />}
                className="w-full h-full"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">
                {t('artistsView.title')}
              </p>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">
                {activeArtist.name}
              </h2>
              <p className="text-sm text-zinc-400 mb-4">
                {activeArtist.albums.length} {t('artistsView.albumCount')} •{' '}
                {activeArtist.tracks.length} {t('artistsView.trackCount')}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (activeArtist.tracks.length > 0) {
                      handleRowClick(activeArtist.tracks[0], activeArtist.tracks)
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
                    if (activeArtist.tracks.length > 0) {
                      const shuffled = fisherYatesShuffle(activeArtist.tracks)
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
        </div>

        {/* Section: Albums & Danh sách phát của nghệ sĩ */}
        {activeArtist.albums && activeArtist.albums.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Disc size={18} className="text-theme-10" /> {t('artistsView.albums')} (
              {activeArtist.albums.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {activeArtist.albums.map((alb: any) => (
                <div
                  key={alb.title}
                  onClick={() => {
                    if (alb.tracks.length > 0) {
                      handleRowClick(alb.tracks[0], alb.tracks)
                    }
                  }}
                  className="bg-theme-60/40 p-3 rounded-xl border border-theme-30/40 hover:bg-theme-30/50 hover:border-theme-10/40 transition group cursor-pointer flex flex-col justify-between"
                >
                  <div className="aspect-square bg-theme-30 rounded-lg mb-2.5 overflow-hidden relative shadow-md">
                    <DynamicCoverArt
                      src={alb.coverArt}
                      trackPath={alb.tracks?.[0]?.filePath}
                      tier="md"
                      isLite={isLite}
                      fallbackIcon={<Disc size={32} />}
                      className="w-full h-full"
                      imageClassName="group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg">
                        <Play size={18} className="ml-0.5 fill-current" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-white group-hover:text-theme-10 transition truncate">
                      {alb.title}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {alb.year ? `${alb.year} • ` : ''}
                      {alb.tracks.length} {t('artistsView.trackCount')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section: Tất cả bài hát / Singles */}
        <div className="space-y-3 min-h-[500px]">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Music size={18} className="text-theme-10" /> {t('artistsView.singlesAndTracks')} (
            {activeArtist.tracks.length})
          </h3>
          <div className="w-full h-[540px]">
            <TrackTable
              tracks={activeArtist.tracks}
              handleRowClick={handleRowClick}
              handleTrackContextMenu={handleTrackContextMenu}
              openTagEditor={openTagEditor}
              openTrackInfo={openTrackInfo}
              navigateToArtist={navigateToArtist}
            />
          </div>
        </div>
      </div>
    )
  }

  // Danh sách nghệ sĩ (Artists List)
  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-end gap-3 min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
            {searchQuery ? t('artistsView.searchResults') : t('artistsView.title')}
          </h2>
          <span className="text-zinc-500 text-xs sm:text-sm mb-1 whitespace-nowrap hidden sm:inline">
            {artistsData.artistsList.length} {t('artistsView.artistCount')} • {libraryTracks.length}{' '}
            {t('common.songs')}
          </span>
        </div>
      </div>

      {/* Alphabet fast jump bar (tối đa 2 dòng, tự động ẩn dòng thừa) */}
      <div className="flex items-center content-start gap-1.5 flex-wrap max-h-[62px] overflow-hidden pb-1 border-b border-theme-30/40">
        {artistsData.alphabetGroups.map((grp) => (
          <button
            key={grp.letter}
            onClick={() => {
              const grpIdx = artistsData.alphabetGroups.findIndex((g) => g.letter === grp.letter)
              if (grpIdx !== -1) {
                const target = chunkedAlphabetGroups[grpIdx]
                if (target?.isCollapsed) {
                  setCollapsedArtistLetters((prev) => ({
                    ...prev,
                    [grp.letter]: false
                  }))
                }
                setTimeout(
                  () => {
                    artistVirtuosoRef.current?.scrollToIndex({
                      index: target?.startRowIndex || 0,
                      align: 'start',
                      behavior: 'smooth'
                    })
                  },
                  target?.isCollapsed ? 50 : 0
                )
              }
            }}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-theme-60/40 hover:bg-theme-10 hover:text-white text-zinc-400 transition shrink-0"
          >
            {grp.letter} <span className="text-[10px] opacity-60">({grp.count})</span>
          </button>
        ))}
      </div>

      {/* Danh sách nhóm theo Alphabet A-Z (Ảo hóa với GroupedVirtuoso / VirtuosoGrid) */}
      <div className="flex-1 min-h-[300px] h-full w-full overflow-hidden">
        {(() => {
          const rawQuery = (deferredSearchQuery || searchQuery || '').trim()
          const normQuery = removeAccents(rawQuery)
          const filteredArtists = rawQuery
            ? artistsData.artistsList.filter((a) => matchesQuery(a.name, normQuery))
            : null

          if (filteredArtists) {
            if (filteredArtists.length === 0) {
              return <p className="text-zinc-500 text-center mt-10">{t('artistsView.noArtists')}</p>
            }
            return (
              <VirtuosoGrid
                style={{ height: '100%', width: '100%' }}
                data={filteredArtists}
                listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1"
                itemClassName="h-full"
                itemContent={(_idx, artist) => (
                  <div
                    key={artist.name}
                    onClick={() => setActiveArtist(artist)}
                    onContextMenu={(e) => handleArtistContextMenu(artist, e)}
                    className="bg-theme-60/40 hover:bg-theme-30/60 p-3.5 rounded-2xl border border-theme-30/40 hover:border-theme-10/40 transition group cursor-pointer flex items-center justify-between shadow-md track-card-optimized"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-theme-30 border border-theme-30/80 shadow-md flex items-center justify-center flex-shrink-0">
                        <DynamicCoverArt
                          src={artist.coverArt}
                          trackPath={artist.tracks?.[0]?.filePath}
                          tier="sm"
                          isLite={isLite}
                          fallbackIcon={<Mic2 size={24} className="text-theme-10" />}
                          className="w-full h-full"
                          imageClassName="group-hover:scale-105 transition duration-300"
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">
                          {artist.name}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          {artist.albumCount} {t('artistsView.albumCount')} • {artist.trackCount}{' '}
                          {t('artistsView.trackCount')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleArtistContextMenu(artist, e)
                      }}
                      className="text-zinc-500 hover:text-white p-2 rounded-lg transition opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                )}
              />
            )
          }

          if (artistsData.alphabetGroups.length === 0) {
            return <p className="text-zinc-500 text-center mt-10">{t('artistsView.noArtists')}</p>
          }

          return (
            <GroupedVirtuoso
              ref={artistVirtuosoRef}
              style={{ height: '100%', width: '100%' }}
              components={{
                Group: ({ style, children, ...props }: any) => (
                  <div
                    {...props}
                    style={{
                      ...style,
                      position: 'relative'
                    }}
                  >
                    {children}
                  </div>
                )
              }}
              groupCounts={alphabetGroupCounts}
              groupContent={(index) => {
                const grp = chunkedAlphabetGroups[index]
                if (!grp) return null
                return (
                  <div
                    onClick={() =>
                      setCollapsedArtistLetters((prev) => ({
                        ...prev,
                        [grp.letter]: !prev[grp.letter]
                      }))
                    }
                    className="inline-flex items-center gap-2.5 cursor-pointer py-1.5 px-3 select-none group rounded-xl transition hover:bg-white/10 active:scale-95 my-1"
                  >
                    <span className="text-2xl font-bold font-sans text-white group-hover:text-theme-10 tracking-tight leading-none transition-colors">
                      {grp.letter}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/90 group-hover:bg-theme-10 group-hover:text-white transition-colors">
                      {grp.count}
                    </span>
                    {grp.isCollapsed ? (
                      <ChevronRight
                        size={16}
                        className="text-white/60 group-hover:text-white transition-colors"
                      />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-white/60 group-hover:text-white transition-colors"
                      />
                    )}
                  </div>
                )
              }}
              itemContent={(index, groupIndex) => {
                const grp = chunkedAlphabetGroups[groupIndex]
                if (!grp || grp.isCollapsed) return null
                const rowIndexInGroup = index - grp.startRowIndex
                const rowArtists = grp.rows[rowIndexInGroup] || []
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-2">
                    {rowArtists.map((artist) => (
                      <div
                        key={artist.name}
                        onClick={() => setActiveArtist(artist)}
                        onContextMenu={(e) => handleArtistContextMenu(artist, e)}
                        className="bg-theme-60/40 hover:bg-theme-30/60 p-3.5 rounded-2xl border border-theme-30/40 hover:border-theme-10/40 transition group cursor-pointer flex items-center justify-between shadow-md track-card-optimized"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 rounded-full overflow-hidden bg-theme-30 border border-theme-30/80 shadow-md flex items-center justify-center flex-shrink-0">
                            <DynamicCoverArt
                              src={artist.coverArt}
                              trackPath={artist.tracks?.[0]?.filePath}
                              tier="sm"
                              isLite={isLite}
                              fallbackIcon={<Mic2 size={24} className="text-theme-10" />}
                              className="w-full h-full"
                              imageClassName="group-hover:scale-105 transition duration-300"
                            />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">
                              {artist.name}
                            </h3>
                            <p className="text-xs text-zinc-400 mt-1">
                              {artist.albumCount} {t('artistsView.albumCount')} •{' '}
                              {artist.trackCount} {t('artistsView.trackCount')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleArtistContextMenu(artist, e)
                          }}
                          className="text-zinc-500 hover:text-white p-2 rounded-lg transition opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
          )
        })()}
      </div>
    </div>
  )
}
export default ArtistsView
