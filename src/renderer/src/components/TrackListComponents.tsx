import React, { useMemo } from 'react'
import {
  Play,
  Pause,
  Cloud,
  Music,
  Info,
  CheckSquare,
  Square,
  FolderPlus,
  Image as ImageIcon,
  Sparkles,
  Edit2,
  MoreVertical,
  ListMusic
} from 'lucide-react'
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import thumbnailHolder from '../../../../resources/HoT_Chibi_Emoji.png'
import { DynamicCoverArt } from './DynamicCoverArt'
import { splitArtistString } from '../utils/textUtils'
import { isDsdTrack, getDsdRateLabel, formatAudioSampleRate, formatDuration } from '../utils/formatUtils'
import { useLibraryStore, useSettingsStore } from '../stores'
import { useTranslation } from '../locales'

export const VirtuosoComponents = {
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

// Thành phần hiển thị danh sách nghệ sĩ có thể nhấp để điều hướng
export const ArtistLinks = React.memo(
  ({
    artists,
    fallbackArtist,
    onArtistClick,
    className = '',
    itemClassName = '',
    separator = ', '
  }: {
    artists?: string[] | null
    fallbackArtist?: string | null
    onArtistClick?: (artistName: string) => void
    className?: string
    itemClassName?: string
    separator?: string
  }) => {
    const list = useMemo(() => {
      if (Array.isArray(artists) && artists.length > 0) {
        return artists.map((a) => a?.trim()).filter(Boolean)
      }
      if (fallbackArtist) {
        return splitArtistString(fallbackArtist)
      }
      return []
    }, [artists, fallbackArtist])

    if (list.length === 0) {
      return <span className={className}>{fallbackArtist || 'Unknown Artist'}</span>
    }

    return (
      <span className={className}>
        {list.map((artist, idx) => {
          const isClickable = !!onArtistClick
          return (
            <React.Fragment key={`${artist}-${idx}`}>
              {isClickable ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onArtistClick(artist)
                  }}
                  className={`hover:text-theme-10 hover:underline transition-colors cursor-pointer ${itemClassName}`}
                  title={artist}
                >
                  {artist}
                </span>
              ) : (
                <span className={itemClassName}>{artist}</span>
              )}
              {idx < list.length - 1 && (
                <span className="text-zinc-500 pointer-events-none select-none">{separator}</span>
              )}
            </React.Fragment>
          )
        })}
      </span>
    )
  }
)
ArtistLinks.displayName = 'ArtistLinks'

// Huy hiệu định dạng âm thanh (DSD / Lossless / Bit depth)
export const AudioFormatBadge = React.memo(
  ({
    track,
    variant = 'table'
  }: {
    track: any
    variant?: 'table' | 'grid' | 'compact'
  }) => {
    const isDsd = isDsdTrack(track)

    if (isDsd) {
      const dsdRate = getDsdRateLabel(track.sampleRate)
      if (variant === 'grid') {
        return (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/80 backdrop-blur-md text-amber-950 uppercase shadow-sm">
            {dsdRate}
          </span>
        )
      }
      if (variant === 'compact') {
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase font-bold whitespace-nowrap">
            {dsdRate}
          </span>
        )
      }
      return (
        <span
          className="px-2.5 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-xs text-amber-300 font-semibold tracking-wide whitespace-nowrap inline-flex items-center gap-1 shadow-sm"
          title={`Direct Stream Digital 1-bit • ${formatAudioSampleRate(track.sampleRate) || '2.82 MHz'}`}
        >
          <span>{dsdRate}</span>
          <span className="text-[10px] text-amber-400/80 font-normal">1-BIT</span>
        </span>
      )
    }

    if (variant === 'grid') {
      return track.format ? (
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 backdrop-blur-md text-zinc-300 uppercase">
          {track.format}
        </span>
      ) : null
    }

    if (variant === 'compact') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-theme-30/80 text-zinc-300 uppercase whitespace-nowrap">
          {track.format || 'MP3'}
        </span>
      )
    }

    return (
      <span className="px-2.5 py-0.5 bg-theme-30 rounded text-xs text-zinc-300 font-medium uppercase tracking-wide whitespace-nowrap inline-flex items-center justify-center">
        {track.format || 'MP3'}
        {track.bitDepth ? ` • ${track.bitDepth}-BIT` : ''}
      </span>
    )
  }
)
AudioFormatBadge.displayName = 'AudioFormatBadge'

// TỐI ƯU HÓA: Ghi nhớ từng dòng bài hát, ngăn React vẽ lại toàn bộ bảng khi thao tác
export const TrackRow = React.memo(
  ({
    track,
    index,
    isThisTrackPlaying,
    isPlaying,
    isLite,
    handleRowClick,
    tracks,
    openTrackInfo,
    onContextMenu,
    onArtistClick
  }: any) => {
    const { t } = useTranslation()
    const selectedTrackIds = useLibraryStore((s) => s.selectedTrackIds)
    const toggleSelectTrackId = useLibraryStore((s) => s.toggleSelectTrackId)
    const trackKey = track.id || track.filePath
    const isSelected = !!trackKey && selectedTrackIds.includes(trackKey)

    const handleRowSelectOrPlay = (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (trackKey) toggleSelectTrackId(trackKey)
        return
      }
      handleRowClick(track, tracks)
    }

    return (
      <>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          onClick={handleRowSelectOrPlay}
          className={`py-3 text-center text-zinc-500 group-hover:text-white w-10 sm:w-12 text-xs font-mono transition-colors select-none ${
            isSelected ? 'bg-theme-10/20 text-theme-10 font-bold' : ''
          }`}
        >
          <div
            className="inline-flex items-center justify-center cursor-pointer w-6 h-6 rounded hover:bg-white/10 mx-auto"
            onClick={(e) => {
              e.stopPropagation()
              if (trackKey) toggleSelectTrackId(trackKey)
            }}
            title={isSelected ? t('common.deselect') || 'Deselect' : t('common.select') || 'Select'}
          >
            {isSelected ? (
              <CheckSquare size={14} className="text-theme-10" />
            ) : isThisTrackPlaying && isPlaying ? (
              <div className="w-2.5 h-2.5 bg-theme-10 rounded-full animate-pulse mx-auto" />
            ) : (
              <>
                <span className={selectedTrackIds.length > 0 ? 'hidden' : 'group-hover:hidden'}>
                  {index + 1}
                </span>
                <Square
                  size={14}
                  className={`${selectedTrackIds.length > 0 ? 'inline' : 'hidden group-hover:inline'} text-zinc-500 hover:text-zinc-300`}
                />
              </>
            )}
          </div>
        </td>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          onClick={handleRowSelectOrPlay}
          className={`py-3 pr-4 min-w-0 transition-colors ${isSelected ? 'bg-theme-10/10' : ''}`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 bg-theme-30 rounded-md overflow-hidden flex-shrink-0 relative flex items-center justify-center shadow-sm">
              <DynamicCoverArt
                track={track}
                tier="sm"
                isLite={isLite}
                fallbackImageSrc={thumbnailHolder}
                className="w-full h-full"
              />
              {track.isCloud && (
                <div className="absolute top-0 right-0 bg-theme-10/80 p-0.5 rounded-bl-md z-10">
                  <Cloud size={10} className="text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold text-sm transition-colors truncate ${isThisTrackPlaying ? 'text-theme-10' : isSelected ? 'text-theme-10 font-bold' : 'text-white group-hover:text-theme-10'}`}
              >
                {track.title}
              </p>
              <ArtistLinks
                artists={track.artists}
                fallbackArtist={track.artist}
                onArtistClick={onArtistClick}
                className="text-xs text-zinc-400 block truncate"
              />
            </div>
          </div>
        </td>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          onClick={handleRowSelectOrPlay}
          className={`py-3 pr-4 text-zinc-400 truncate text-xs hidden md:table-cell transition-colors ${isSelected ? 'bg-theme-10/10' : ''}`}
          title={track.album || 'Unknown'}
        >
          {track.album || 'Unknown'}
        </td>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          onClick={handleRowSelectOrPlay}
          className={`py-3 w-28 sm:w-32 text-center whitespace-nowrap transition-colors ${isSelected ? 'bg-theme-10/10' : ''}`}
        >
          <AudioFormatBadge track={track} variant="table" />
        </td>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          onClick={handleRowSelectOrPlay}
          className={`py-3 text-right pr-4 text-zinc-400 font-mono text-xs w-16 sm:w-20 whitespace-nowrap transition-colors ${isSelected ? 'bg-theme-10/10' : ''}`}
        >
          {formatDuration(track.duration)}
        </td>
        <td
          onContextMenu={(e) => onContextMenu?.(track, e)}
          className={`py-3 text-center w-10 sm:w-11 transition-colors ${isSelected ? 'bg-theme-10/10' : ''}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              openTrackInfo?.(track, e)
            }}
            title={t('trackTable.viewInfo')}
            className="text-zinc-500 hover:text-theme-10 opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer mx-auto flex items-center justify-center"
          >
            <Info size={15} />
          </button>
        </td>
      </>
    )
  }
)
TrackRow.displayName = 'TrackRow'

// Thẻ bài hát dạng Lưới (Grid Item)
export const TrackGridItem = React.memo(
  ({
    track,
    index,
    isThisTrackPlaying,
    isPlaying,
    isLite,
    handleRowClick,
    tracks,
    onContextMenu,
    onArtistClick
  }: any) => {
    return (
      <div
        key={track.id || index}
        onClick={() => handleRowClick(track, tracks)}
        onContextMenu={(e) => onContextMenu?.(track, e)}
        className="bg-theme-60/40 p-3 rounded-xl border border-theme-30/40 hover:bg-theme-30/50 hover:border-theme-10/40 transition group cursor-pointer flex flex-col justify-between track-card-optimized h-full"
      >
        <div className="aspect-square bg-theme-30/80 rounded-lg mb-3 overflow-hidden relative shadow-md">
          <DynamicCoverArt
            track={track}
            tier="md"
            isLite={isLite}
            smartAspect={true}
            fallbackIcon={<Music size={32} />}
            className="w-full h-full group-hover:scale-105 transition duration-300"
          />
          <div
            className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-200 ${isThisTrackPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <div className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition">
              {isThisTrackPlaying && isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} className="ml-0.5" />
              )}
            </div>
          </div>
          <AudioFormatBadge track={track} variant="grid" />
        </div>
        <div className="min-w-0">
          <h4
            className={`font-semibold text-sm truncate ${isThisTrackPlaying ? 'text-theme-10' : 'text-white group-hover:text-theme-10'} transition-colors`}
          >
            {track.title}
          </h4>
          <ArtistLinks
            artists={track.artists}
            fallbackArtist={track.artist}
            onArtistClick={onArtistClick}
            className="text-xs text-zinc-400 block truncate mt-0.5"
          />
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 pt-2 border-t border-theme-30/30">
            <span className="truncate max-w-[90px]">{track.album || 'Unknown'}</span>
            <span>{formatDuration(track.duration)}</span>
          </div>
        </div>
      </div>
    )
  }
)
TrackGridItem.displayName = 'TrackGridItem'

// Chế độ xem Lưới thẻ bìa (Grid View - Ảo hóa với VirtuosoGrid)
export const TrackGrid = React.memo(
  ({
    tracks,
    currentTrack,
    isPlaying,
    isLite,
    handleRowClick,
    onContextMenu,
    openTagEditor: _openTagEditor,
    onArtistClick
  }: any) => {
    return (
      <div className="flex-1 min-h-[300px] h-full w-full overflow-hidden">
        <VirtuosoGrid
          style={{ height: '100%', width: '100%' }}
          data={tracks}
          listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1"
          itemClassName="h-full"
          increaseViewportBy={{ top: 60, bottom: 60 }}
          itemContent={(index, track) => (
            <TrackGridItem
              track={track}
              index={index}
              isThisTrackPlaying={currentTrack?.id === track.id}
              isPlaying={isPlaying}
              isLite={isLite}
              handleRowClick={handleRowClick}
              tracks={tracks}
              onContextMenu={onContextMenu}
              onArtistClick={onArtistClick}
            />
          )}
        />
      </div>
    )
  }
)
TrackGrid.displayName = 'TrackGrid'

// Hàng bài hát dạng Thu gọn (Compact Row Item)
export const TrackCompactItem = React.memo(
  ({
    track,
    index,
    isThisTrackPlaying,
    isPlaying,
    isLite,
    handleRowClick,
    tracks,
    onContextMenu,
    openTrackInfo,
    onArtistClick
  }: any) => {
    const { t } = useTranslation()
    return (
      <div
        onClick={() => handleRowClick(track, tracks)}
        onContextMenu={(e) => onContextMenu?.(track, e)}
        className={`flex items-center gap-3 px-3 py-2 text-xs transition cursor-pointer group track-row-optimized ${isThisTrackPlaying ? 'bg-theme-10/15' : 'hover:bg-white/5'}`}
      >
        <span className="w-6 text-center text-zinc-500 font-mono text-[11px] group-hover:text-white">
          {isThisTrackPlaying && isPlaying ? (
            <div className="w-2.5 h-2.5 bg-theme-10 rounded-full animate-pulse mx-auto" />
          ) : (
            index + 1
          )}
        </span>
        <div className="w-7 h-7 bg-theme-30 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
          <DynamicCoverArt
            track={track}
            tier="sm"
            isLite={isLite}
            fallbackIcon={<Music size={12} className="text-zinc-500" />}
            className="w-full h-full"
          />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={`font-medium truncate ${isThisTrackPlaying ? 'text-theme-10' : 'text-white group-hover:text-theme-10'}`}
          >
            {track.title}
          </span>
          <span className="text-zinc-500 text-[11px] shrink-0">•</span>
          <ArtistLinks
            artists={track.artists}
            fallbackArtist={track.artist}
            onArtistClick={onArtistClick}
            className="text-zinc-400 truncate text-[11px]"
          />
        </div>
        <span className="text-zinc-500 truncate max-w-[160px] lg:max-w-[220px] hidden md:block">
          {track.album || ''}
        </span>
        <AudioFormatBadge track={track} variant="compact" />
        <span className="w-12 text-right text-zinc-400 font-mono text-[11px]">
          {formatDuration(track.duration)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            openTrackInfo?.(track, e)
          }}
          title={t('trackTable.viewInfo')}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-theme-10 p-1 transition cursor-pointer"
        >
          <Info size={13} />
        </button>
      </div>
    )
  }
)
TrackCompactItem.displayName = 'TrackCompactItem'

// Chế độ xem Danh sách thu gọn (Compact View - Ảo hóa với Virtuoso)
export const TrackCompactList = React.memo(
  ({
    tracks,
    currentTrack,
    isPlaying,
    isLite,
    handleRowClick,
    onContextMenu,
    openTrackInfo,
    onArtistClick
  }: any) => {
    return (
      <div className="flex-1 min-h-[300px] h-full w-full bg-theme-60/20 rounded-lg border border-theme-30/50 overflow-hidden">
        <Virtuoso
          style={{ height: '100%', width: '100%' }}
          data={tracks}
          increaseViewportBy={{ top: 200, bottom: 200 }}
          itemContent={(index, track) => (
            <TrackCompactItem
              track={track}
              index={index}
              isThisTrackPlaying={currentTrack?.id === track.id}
              isPlaying={isPlaying}
              isLite={isLite}
              handleRowClick={handleRowClick}
              tracks={tracks}
              onContextMenu={onContextMenu}
              openTrackInfo={openTrackInfo}
              onArtistClick={onArtistClick}
            />
          )}
        />
      </div>
    )
  }
)
TrackCompactList.displayName = 'TrackCompactList'

// Item Playlist dạng Thẻ Lưới (Grid Card)
export const PlaylistItemCard = React.memo(
  ({ pl, isLite, onOpen, onContextMenu, onChangeImage, onExtractImage, onRename, t }: any) => {
    return (
      <div
        className="bg-theme-60/40 p-4 rounded-xl border border-theme-30/50 hover:bg-theme-30/50 transition group cursor-pointer track-card-optimized"
        onClick={() => onOpen(pl)}
        onContextMenu={(e) => onContextMenu(pl, e)}
      >
        <div className="aspect-square bg-theme-30 rounded-lg mb-4 overflow-hidden relative shadow-md">
          <DynamicCoverArt
            src={pl.thumbnail}
            trackPath={pl.path}
            tier="md"
            isLite={isLite}
            fallbackIcon={<FolderPlus size={40} className="text-zinc-600" />}
            className="w-full h-full"
            imageClassName="group-hover:scale-105 transition duration-300"
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onChangeImage(pl.name)
            }}
            className="absolute bottom-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition cursor-pointer"
            title={t('playlistsView.chooseCover')}
          >
            <ImageIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onExtractImage(pl.name)
            }}
            className="absolute bottom-2 right-10 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition cursor-pointer"
            title={t('playlistsView.extractCover')}
          >
            <Sparkles size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-bold text-white truncate text-sm group-hover:text-theme-10 transition">
              {pl.name}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {pl.tracks?.length || 0} {t('common.songs')}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRename(pl.name)
            }}
            className="text-zinc-500 hover:text-theme-10 opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer"
            title={t('modals.playlistRename.title')}
          >
            <Edit2 size={14} />
          </button>
        </div>
      </div>
    )
  }
)
PlaylistItemCard.displayName = 'PlaylistItemCard'

// Item Playlist dạng Bảng Hàng (Table Row)
export const PlaylistItemRow = React.memo(
  ({ pl, idx, isLite, onOpen, onPlay, onContextMenu, onChangeImage: _onChangeImage, onRename: _onRename, t }: any) => {
    return (
      <div
        onClick={() => onOpen(pl)}
        onContextMenu={(e) => onContextMenu(pl, e)}
        className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized"
      >
        <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
          {idx + 1}
        </div>
        <div className="col-span-7 flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow-md">
            <DynamicCoverArt
              src={pl.thumbnail}
              trackPath={pl.path}
              tier="sm"
              isLite={isLite}
              fallbackIcon={<FolderPlus size={20} className="text-zinc-600" />}
              className="w-full h-full"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (pl.tracks && pl.tracks.length > 0) onPlay(pl.tracks)
                }}
                className="text-white hover:scale-110 transition cursor-pointer"
              >
                <Play size={16} className="fill-current" />
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">
              {pl.name}
            </h4>
            <p className="text-xs text-zinc-500 truncate mt-0.5">{t('sidebar.myPlaylists')}</p>
          </div>
        </div>
        <div className="col-span-2 text-center">
          <span className="px-2.5 py-1 rounded-full bg-theme-30/60 text-xs font-semibold text-zinc-300">
            {pl.tracks?.length || 0} {t('common.songs')}
          </span>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              _onChangeImage(pl.name)
            }}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100 cursor-pointer"
            title={t('playlistsView.chooseCover')}
          >
            <ImageIcon size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              _onRename(pl.name)
            }}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100 cursor-pointer"
            title={t('modals.playlistRename.title')}
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onContextMenu(pl, e)
            }}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition cursor-pointer"
          >
            <MoreVertical size={15} />
          </button>
        </div>
      </div>
    )
  }
)
PlaylistItemRow.displayName = 'PlaylistItemRow'

// Item Playlist dạng Thu gọn (Compact Item)
export const PlaylistItemCompact = React.memo(
  ({ pl, idx, isLite, onOpen, onPlay, onContextMenu, t }: any) => {
    return (
      <div
        onClick={() => onOpen(pl)}
        onContextMenu={(e) => onContextMenu(pl, e)}
        className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">
            {idx + 1}
          </span>
          <div className="w-9 h-9 rounded-lg bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow">
            <DynamicCoverArt
              src={pl.thumbnail}
              trackPath={pl.path}
              tier="sm"
              isLite={isLite}
              fallbackIcon={<FolderPlus size={16} className="text-zinc-600" />}
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
            {pl.tracks?.length || 0} {t('common.songs')}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (pl.tracks && pl.tracks.length > 0) onPlay(pl.tracks)
            }}
            className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100 cursor-pointer"
            title={t('artistsView.playAll')}
          >
            <Play size={13} className="ml-0.5 fill-current" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onContextMenu(pl, e)
            }}
            className="text-zinc-500 hover:text-white p-1 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>
    )
  }
)
PlaylistItemCompact.displayName = 'PlaylistItemCompact'

// Sortable Queue Item cho danh sách phát chờ
export const SortableQueueItem = React.memo(
  ({ id, track, isActive, isPlaying, isLite, onPlay, onContextMenu, onArtistClick }: any) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => onPlay(track)}
        onContextMenu={(e) => onContextMenu?.(track, e)}
        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${isActive ? 'bg-theme-10/20 border border-theme-10/30' : 'hover:bg-theme-30/50 border border-transparent'}`}
      >
        <div className="w-10 h-10 bg-theme-30 rounded flex-shrink-0 overflow-hidden relative flex items-center justify-center">
          <DynamicCoverArt
            track={track}
            tier="sm"
            isLite={isLite}
            fallbackIcon={<ListMusic size={16} className="text-zinc-500" />}
            className="w-full h-full pointer-events-none"
          />
          {isActive && isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
              <div className="w-3 h-3 bg-theme-10 rounded-full animate-pulse" />
            </div>
          )}
        </div>
        <div className="truncate flex-1">
          <p
            className={`text-sm font-semibold truncate ${isActive ? 'text-theme-10' : 'text-white'}`}
          >
            {track.title}
          </p>
          <ArtistLinks
            artists={track.artists}
            fallbackArtist={track.artist}
            onArtistClick={onArtistClick}
            className="text-xs text-zinc-500 block truncate"
          />
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.isActive === next.isActive &&
    prev.isPlaying === next.isPlaying &&
    prev.isLite === next.isLite &&
    prev.track.id === next.track.id
)
SortableQueueItem.displayName = 'SortableQueueItem'

export const SC_GENRES = [
  { id: 'all-music', key: 'all' },
  { id: 'electronic', key: 'electronic' },
  { id: 'hiphoprap', key: 'hiphoprap' },
  { id: 'pop', key: 'pop' },
  { id: 'chill', key: 'chill' },
  { id: 'rock', key: 'rock' },
  { id: 'ambient', key: 'ambient' },
  { id: 'danceedm', key: 'danceedm' }
]

export const DownloadProgressToast: React.FC<{ t: (key: string, params?: any) => string }> = React.memo(
  ({ t }) => {
    const isDownloading = useSettingsStore((s) => s.isDownloading)
    const downloadProgress = useSettingsStore((s) => s.downloadProgress)

    if (!isDownloading || !downloadProgress) return null

    return (
      <div className="fixed bottom-28 right-8 z-[90] bg-theme-60/95 backdrop-blur-md border border-zinc-700/80 rounded-xl p-5 w-80 shadow-2xl flex flex-col animate-fade-in pointer-events-none">
        <div className="flex items-center gap-3 mb-2">
          <Cloud size={20} className="text-theme-10 animate-pulse" />
          <h3 className="text-sm font-bold text-white">{t('toasts.downloadProgress')}</h3>
        </div>

        <p className="text-xs text-zinc-400 mb-4 truncate w-full" title={downloadProgress.fileName}>
          {downloadProgress.fileName}
        </p>

        <div className="w-full bg-zinc-950 rounded-full h-1.5 mb-2 overflow-hidden border border-theme-30">
          <div
            className="bg-theme-10 h-full transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between w-full text-[10px] font-medium">
          <span className="text-theme-10">
            {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
          </span>
          <span className="text-zinc-500">
            {downloadProgress.current} / {downloadProgress.total} {t('common.files')}
          </span>
        </div>
      </div>
    )
  }
)
DownloadProgressToast.displayName = 'DownloadProgressToast'
