import React, { useMemo } from 'react'
import { Music, Heart, Sparkles, Zap, Disc3, Layers, Copy, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from '../locales'
import { useLibraryStore } from '../stores/libraryStore'
import { isDsdTrack } from '../utils/formatUtils'

export type QuickFilterType = 'all' | 'lossless' | 'hires' | 'dsd' | 'favorites' | 'cue'

export interface QuickFilterChipsProps {
  currentFilter?: QuickFilterType
  onFilterChange?: (filter: QuickFilterType) => void
  onOpenDuplicateFinder?: () => void
  onOpenSmartPlaylists?: () => void
  className?: string
}

export const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  currentFilter: propFilter,
  onFilterChange: propOnChange,
  onOpenDuplicateFinder,
  onOpenSmartPlaylists,
  className = ''
}) => {
  const { t } = useTranslation()

  const storeFilter = useLibraryStore((s) => s.quickFilter)
  const setStoreFilter = useLibraryStore((s) => s.setQuickFilter)
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const favoriteTrackIds = useLibraryStore((s) => s.favoriteTrackIds)

  const activeFilter = propFilter !== undefined ? propFilter : storeFilter
  const handleSelect = (filter: QuickFilterType): void => {
    if (propOnChange) {
      propOnChange(filter)
    } else {
      setStoreFilter(filter)
    }
  }

  // Pre-calculate filter counts for dynamic badge badges
  const counts = useMemo(() => {
    let lossless = 0
    let hires = 0
    let dsd = 0
    let cue = 0
    let favorites = 0

    const favSet = new Set(favoriteTrackIds)

    for (let i = 0; i < libraryTracks.length; i++) {
      const track = libraryTracks[i]
      const isDsd = isDsdTrack(track)
      const fmt = (track.format || '').toUpperCase()

      if (favSet.has(track.id) || (track.filePath && favSet.has(track.filePath))) {
        favorites++
      }

      if (isDsd || track.lossless || ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes(fmt)) {
        lossless++
      }

      if (
        isDsd ||
        (track.sampleRate && track.sampleRate >= 88200) ||
        (track.bitDepth && track.bitDepth >= 24)
      ) {
        hires++
      }

      if (isDsd) {
        dsd++
      }

      if (track.isCueTrack || track.cueFilePath) {
        cue++
      }
    }

    return {
      all: libraryTracks.length,
      favorites,
      lossless,
      hires,
      dsd,
      cue
    }
  }, [libraryTracks, favoriteTrackIds])

  const chips: {
    id: QuickFilterType
    label: string
    icon: React.ReactNode
    count: number
    showBadge?: boolean
  }[] = [
    {
      id: 'all',
      label: t('quickFilter.filterAll') || 'All',
      icon: <Music size={14} className={activeFilter === 'all' ? 'text-white' : 'text-zinc-300'} />,
      count: counts.all,
      showBadge: true
    },
    {
      id: 'favorites',
      label: t('quickFilter.filterFavorites') || 'Favorites',
      icon: (
        <Heart
          size={14}
          className={
            activeFilter === 'favorites' ? 'fill-white text-white' : 'text-rose-500 fill-rose-500'
          }
        />
      ),
      count: counts.favorites,
      showBadge: counts.favorites > 0
    },
    {
      id: 'lossless',
      label: t('quickFilter.filterLossless') || 'Lossless',
      icon: (
        <Sparkles
          size={14}
          className={activeFilter === 'lossless' ? 'text-white' : 'text-emerald-400'}
        />
      ),
      count: counts.lossless,
      showBadge: counts.lossless > 0
    },
    {
      id: 'hires',
      label: t('quickFilter.filterHiRes') || 'Hi-Res',
      icon: (
        <Zap size={14} className={activeFilter === 'hires' ? 'text-white' : 'text-amber-400'} />
      ),
      count: counts.hires,
      showBadge: counts.hires > 0
    },
    {
      id: 'dsd',
      label: t('quickFilter.filterDsd') || 'DSD',
      icon: (
        <Disc3 size={14} className={activeFilter === 'dsd' ? 'text-white' : 'text-purple-400'} />
      ),
      count: counts.dsd,
      showBadge: counts.dsd > 0
    }
  ]

  // Only display CUE chip if there is at least 1 CUE track detected in the library
  if (counts.cue > 0) {
    chips.push({
      id: 'cue',
      label: t('quickFilter.filterCue') || 'CUE Albums',
      icon: (
        <Layers size={14} className={activeFilter === 'cue' ? 'text-white' : 'text-cyan-400'} />
      ),
      count: counts.cue,
      showBadge: true
    })
  }

  return (
    <div
      className={`w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 py-2 select-none ${className}`}
    >
      {/* Horizontal Scrollable Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {chips.map((chip) => {
          const isActive = activeFilter === chip.id
          const tooltip = chip.showBadge
            ? `${chip.label} (${chip.count.toLocaleString()})`
            : chip.label

          return (
            <button
              key={chip.id}
              onClick={() => handleSelect(chip.id)}
              title={tooltip}
              aria-label={tooltip}
              className={`sys-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-theme-10 text-white shadow-md shadow-theme-10/20'
                  : 'bg-zinc-800/60 hover:bg-zinc-700/70 text-zinc-300 hover:text-white border border-zinc-700/50'
              }`}
            >
              <span className="shrink-0 flex items-center justify-center">{chip.icon}</span>
              <span className="btn-text">{chip.label}</span>
              {chip.showBadge && (
                <span
                  className={`btn-badge btn-text text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-black/25 text-white'
                      : 'bg-zinc-900/80 text-zinc-400 group-hover:text-zinc-200'
                  }`}
                >
                  {chip.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Action Buttons: Duplicate Finder & Smart Playlists */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {onOpenDuplicateFinder && (
          <button
            onClick={onOpenDuplicateFinder}
            title={t('duplicateFinder.duplicateFinder') || 'Duplicate Track Finder'}
            aria-label={t('duplicateFinder.duplicateFinder') || 'Duplicate Track Finder'}
            className="sys-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/80 border border-zinc-700/50 transition cursor-pointer shadow-sm"
          >
            <Copy size={14} className="text-amber-400 shrink-0" />
            <span className="btn-text">{t('duplicateFinder.duplicateFinder') || 'Duplicates'}</span>
          </button>
        )}

        {onOpenSmartPlaylists && (
          <button
            onClick={onOpenSmartPlaylists}
            title={t('smartPlaylists.smartPlaylists') || 'Smart Playlists'}
            aria-label={t('smartPlaylists.smartPlaylists') || 'Smart Playlists'}
            className="sys-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-theme-10 hover:text-white bg-theme-10/10 hover:bg-theme-10/25 border border-theme-10/30 transition cursor-pointer shadow-sm"
          >
            <SlidersHorizontal size={14} className="shrink-0" />
            <span className="btn-text">
              {t('smartPlaylists.smartPlaylists') || 'Smart Playlists'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
