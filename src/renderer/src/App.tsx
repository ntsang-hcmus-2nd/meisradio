// @ts-nocheck
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Sliders, Cloud, HardDrive, Search, Library, 
  ListMusic, Settings, FolderPlus, Download, Wifi, Link, Edit2, Image as ImageIcon,
  Sparkles, Plus, Trash2, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown,
  Mic2, Maximize2, Minimize2, List, X, Activity, RefreshCw, PictureInPicture2,
  Home, ArrowLeft, Radio, BarChart2, LayoutGrid, Rows3, Disc, Tag, Music,
  Folder, FolderOpen, MoreVertical, ChevronRight, ChevronDown, ChevronUp, Layers, ListPlus,
  Leaf, Cpu, Zap, BatteryCharging, History, Compass
} from 'lucide-react'
import { TableVirtuoso } from 'react-virtuoso'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import thumbnailHolder from '../../../resources/HoT_Chibi_Emoji.png'
import meiSingingPlaceholder from '../../../resources/Mei singing.webp'
import { CustomNumberInput } from './components/CustomNumberInput'
import { CustomSelect } from './components/CustomSelect'
import { PlaylistRenameModal } from './components/modals/PlaylistRenameModal'
import { EditPlaylistModal } from './components/modals/EditPlaylistModal'
import { CloudActionModal } from './components/modals/CloudActionModal'
import { TagEditorModal } from './components/modals/TagEditorModal'
import { CreatePlaylistModal } from './components/modals/CreatePlaylistModal'
import { AddSongsModal } from './components/modals/AddSongsModal'
import { CustomDialogModal, DialogOptions } from './components/modals/CustomDialogModal'
import { PlayerProgressBar } from './components/PlayerProgressBar'
import { Sidebar } from './components/Sidebar'
import { EQPanel } from './components/EQPanel'
import { VolumeSlider } from './components/VolumeSlider'
import { SpectrogramModal } from './components/SpectrogramModal'
import { ContextMenu, ContextMenuItem } from './components/ContextMenu'

import { extractThemeColors, initThemeColorCache } from './utils/colorUtils'
import { toMediaUrl } from './utils/mediaUrl'

// --- HELPER FUNCTIONS & INTERFACES (OUTSIDE COMPONENT) ---
const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

import { WebGLVisualizer } from './components/visualizers/WebGLVisualizer'
import { WebGLSpectrogram } from './components/visualizers/WebGLSpectrogram'
import { useTranslation } from './locales'

export interface EQBand {
  id: string
  frequency: number // Tần số (Hz): 20Hz - 20000Hz
  gain: number      // Độ khuếch đại (dB): -20dB đến +20dB
  type: BiquadFilterType // 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass'
  q?: number        // Hệ số Q (Bandwidth)
}

interface LyricLine {
  time: number // Thời gian tính theo giây
  text: string
}

// Chuẩn hóa đường dẫn hình ảnh cho Background
const normalizeImagePath = (input: string): string => {
  if (!input) return ''
  return toMediaUrl(input)
}

// Bộ nhớ đệm màu chủ đạo trong RAM (LRU Cache tối đa 50 bài hát gần nhất)
const MAX_DOMINANT_CACHE = 50
const dominantColorCache = new Map<string, string>()

const saveDominantColorToCache = (key: string, val: string) => {
  if (dominantColorCache.size >= MAX_DOMINANT_CACHE) {
    const oldestKey = dominantColorCache.keys().next().value
    if (oldestKey) dominantColorCache.delete(oldestKey)
  }
  dominantColorCache.set(key, val)
}

// Hàm phân tích màu chủ đạo bằng Canvas (Tối ưu Cache)
const getDominantColor = (imageSrc: string, callback: (color: string) => void) => {
  if (!imageSrc) return
  const mediaSrc = toMediaUrl(imageSrc)
  if (dominantColorCache.has(mediaSrc)) {
    const cached = dominantColorCache.get(mediaSrc)!
    dominantColorCache.delete(mediaSrc)
    dominantColorCache.set(mediaSrc, cached) // Đưa lên đầu danh sách LRU
    callback(cached)
    return
  }
  const img = new Image()
  if (mediaSrc.startsWith('http://') || mediaSrc.startsWith('https://')) {
    img.crossOrigin = 'Anonymous'
  }
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    
    // Tối ưu CPU/RAM: Thu nhỏ ảnh xuống 64x64 để quét siêu tốc
    canvas.width = 64
    canvas.height = 64
    ctx.drawImage(img, 0, 0, 64, 64)
    
    const data = ctx.getImageData(0, 0, 64, 64).data
    let r = 0, g = 0, b = 0, count = 0
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]
      count++
    }
    if (count === 0) count = 1
    r = Math.floor(r / count); g = Math.floor(g / count); b = Math.floor(b / count)
    const colorStr = `rgba(${Math.max(r-30, 0)}, ${Math.max(g-30, 0)}, ${Math.max(b-30, 0)}, 0.4)`
    saveDominantColorToCache(mediaSrc, colorStr)
    callback(colorStr)
  }
  img.src = mediaSrc
}

const VirtuosoComponents = {
  Table: ({ style, ...props }: any) => <table {...props} className="w-full text-left text-sm" style={{ ...style, borderCollapse: 'collapse' }} />,
  TableHead: React.forwardRef((props: any, ref: any) => <thead {...props} ref={ref} />),
  TableRow: (props: any) => <tr {...props} className="group border-b border-theme-30/20 transition-colors cursor-pointer hover:bg-white/5" />
};

// TỐI ƯU HÓA: Ghi nhớ từng dòng bài hát, ngăn React vẽ lại toàn bộ bảng khi thao tác
const TrackRow = React.memo(({ track, index, isThisTrackPlaying, isPlaying, isLite, handleRowClick, tracks, openTagEditor, onContextMenu }: any) => {
  return (
    <>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} onClick={() => handleRowClick(track, tracks)} className="py-4 text-center text-zinc-500 group-hover:text-white">
        {isThisTrackPlaying && isPlaying ? <div className="w-3 h-3 bg-theme-10 rounded-full animate-pulse mx-auto" /> : index + 1}
      </td>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} onClick={() => handleRowClick(track, tracks)} className="py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-theme-30 rounded-md overflow-hidden flex-shrink-0 relative flex items-center justify-center">
            {/* TỐI ƯU HÓA: Xóa bỏ loading="lazy" vì Virtuoso đã tự động Lazy Load, kết hợp cả 2 sẽ gây spike CPU */}
            {(!isLite && track.coverArt) ? <img src={toMediaUrl(track.coverArt)} className="w-full h-full object-cover" /> : <img src={thumbnailHolder} className="w-3/4 h-3/4 object-contain" />}
            {track.isCloud && <div className="absolute top-0 right-0 bg-theme-10/80 p-0.5 rounded-bl-md"><Cloud size={10} className="text-white" /></div>}
          </div>
          <div className="truncate w-48 lg:w-64">
            <p className={`font-semibold transition-colors truncate ${isThisTrackPlaying ? 'text-theme-10' : 'text-white group-hover:text-theme-10'}`}>{track.title}</p>
            <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
          </div>
        </div>
      </td>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} onClick={() => handleRowClick(track, tracks)} className="py-4 text-zinc-400 truncate max-w-[150px]">{track.album || 'Unknown'}</td>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} onClick={() => handleRowClick(track, tracks)} className="py-4"><span className="px-2 py-1 bg-theme-30 rounded text-xs text-zinc-300 font-medium uppercase">{track.format || 'MP3'}{track.bitDepth ? ` • ${track.bitDepth}-BIT` : ''}</span></td>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} onClick={() => handleRowClick(track, tracks)} className="py-4 text-right pr-4 text-zinc-400">{formatDuration(track.duration)}</td>
      <td onContextMenu={(e) => onContextMenu?.(track, e)} className="py-4 text-center">{!track.isCloud && <button onClick={(e) => openTagEditor(track, e)} className="text-zinc-500 hover:text-theme-10 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={16}/></button>}</td>
    </>
  )
});

// Chế độ xem Lưới thẻ bìa (Grid View)
const TrackGrid = React.memo(({ tracks, currentTrack, isPlaying, isLite, handleRowClick, onContextMenu, openTagEditor }: any) => {
  return (
    <div className="flex-1 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
        {tracks.map((track: any, index: number) => {
          const isThisTrackPlaying = currentTrack?.id === track.id
          return (
            <div 
              key={track.id || index}
              onClick={() => handleRowClick(track, tracks)}
              onContextMenu={(e) => onContextMenu?.(track, e)}
              className="bg-theme-60/40 p-3 rounded-xl border border-theme-30/40 hover:bg-theme-30/50 hover:border-theme-10/40 transition group cursor-pointer flex flex-col justify-between track-card-optimized"
            >
              <div className="aspect-square bg-theme-30/80 rounded-lg mb-3 overflow-hidden relative shadow-md">
                {(!isLite && track.coverArt) ? (
                  <img loading="lazy" src={toMediaUrl(track.coverArt)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                    <Music size={32} />
                  </div>
                )}
                <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-200 ${isThisTrackPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <div className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition">
                    {isThisTrackPlaying && isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </div>
                </div>
                {track.format && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 backdrop-blur-md text-zinc-300 uppercase">
                    {track.format}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h4 className={`font-semibold text-sm truncate ${isThisTrackPlaying ? 'text-theme-10' : 'text-white group-hover:text-theme-10'} transition-colors`}>
                  {track.title}
                </h4>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{track.artist}</p>
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 pt-2 border-t border-theme-30/30">
                  <span className="truncate max-w-[90px]">{track.album || 'Unknown'}</span>
                  <span>{formatDuration(track.duration)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
});

// Chế độ xem Danh sách thu gọn (Compact View)
const TrackCompactList = React.memo(({ tracks, currentTrack, isPlaying, isLite, handleRowClick, onContextMenu, openTagEditor }: any) => {
  return (
    <div className="flex-1 overflow-y-auto divide-y divide-theme-30/20 bg-theme-60/20 rounded-lg border border-theme-30/50">
      {tracks.map((track: any, index: number) => {
        const isThisTrackPlaying = currentTrack?.id === track.id
        return (
          <div 
            key={track.id || index}
            onClick={() => handleRowClick(track, tracks)}
            onContextMenu={(e) => onContextMenu?.(track, e)}
            className={`flex items-center gap-3 px-3 py-2 text-xs transition cursor-pointer group track-row-optimized ${isThisTrackPlaying ? 'bg-theme-10/15' : 'hover:bg-white/5'}`}
          >
            <span className="w-6 text-center text-zinc-500 font-mono text-[11px] group-hover:text-white">
              {isThisTrackPlaying && isPlaying ? <div className="w-2.5 h-2.5 bg-theme-10 rounded-full animate-pulse mx-auto" /> : index + 1}
            </span>
            <div className="w-7 h-7 bg-theme-30 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
              {(!isLite && track.coverArt) ? <img loading="lazy" src={toMediaUrl(track.coverArt)} className="w-full h-full object-cover" /> : <Music size={12} className="text-zinc-500" />}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <span className={`font-medium truncate ${isThisTrackPlaying ? 'text-theme-10' : 'text-white group-hover:text-theme-10'}`}>
                {track.title}
              </span>
              <span className="text-zinc-400 truncate text-[11px]">
                • {track.artist}
              </span>
            </div>
            <span className="text-zinc-500 truncate max-w-[140px] hidden md:block">
              {track.album || ''}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-theme-30/80 text-zinc-300 uppercase font-mono">
              {track.format || 'MP3'}
            </span>
            <span className="w-12 text-right text-zinc-400 font-mono text-[11px]">
              {formatDuration(track.duration)}
            </span>
            {!track.isCloud && (
              <button 
                onClick={(e) => { e.stopPropagation(); openTagEditor(track, e); }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-theme-10 p-1 transition"
              >
                <Edit2 size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
});

const SortableQueueItem = React.memo(({ id, track, isActive, isPlaying, isLite, onPlay, onContextMenu }: any) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
         {(!isLite && track.coverArt) ? <img src={toMediaUrl(track.coverArt)} className="w-full h-full object-cover pointer-events-none" /> : <ListMusic size={16} className="text-zinc-500" />}
         {isActive && isPlaying && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-3 h-3 bg-theme-10 rounded-full animate-pulse" /></div>}
      </div>
      <div className="truncate flex-1">
        <p className={`text-sm font-semibold truncate ${isActive ? 'text-theme-10' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
      </div>
    </div>
  );
}, (prev, next) => prev.isActive === next.isActive && prev.isPlaying === next.isPlaying && prev.isLite === next.isLite && prev.track.id === next.track.id);

const PlaylistGridCard = React.memo(({ 
  pl, 
  isLite, 
  onClick, 
  onContextMenu, 
  onChangeImage, 
  onExtractImage, 
  onRename, 
  t 
}: any) => {
  return (
    <div 
      className="bg-theme-60/40 p-4 rounded-xl border border-theme-30/50 hover:bg-theme-30/50 transition group cursor-pointer track-card-optimized" 
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="aspect-square bg-theme-30 rounded-lg mb-4 overflow-hidden relative shadow-md">
        {(!isLite && pl.thumbnail) ? (
          <img loading="lazy" decoding="async" src={toMediaUrl(pl.thumbnail)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={40} /></div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onChangeImage(); }} className="absolute bottom-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition" title={t('playlistsView.chooseCover')}><ImageIcon size={16}/></button>
        <button onClick={(e) => { e.stopPropagation(); onExtractImage(); }} className="absolute bottom-2 right-10 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition" title={t('playlistsView.extractCover')}><Sparkles size={16}/></button>
      </div>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-2">
          <h3 className="font-bold text-white truncate text-sm group-hover:text-theme-10 transition">{pl.name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{pl.tracks.length} {t('common.songs')}</p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRename(); }} className="text-zinc-500 hover:text-theme-10 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={14}/></button>
      </div>
    </div>
  )
});

const PlaylistTableRow = React.memo(({
  pl,
  idx,
  isLite,
  onClick,
  onContextMenu,
  onPlay,
  onChangeImage,
  onRename,
  t
}: any) => {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized"
    >
      <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
        {idx + 1}
      </div>
      <div className="col-span-7 flex items-center gap-3.5 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow-md">
          {(!isLite && pl.thumbnail) ? <img loading="lazy" decoding="async" src={toMediaUrl(pl.thumbnail)} className="w-full h-full object-cover" /> : <FolderPlus size={20} className="text-zinc-600" />}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="text-white hover:scale-110 transition"
            >
              <Play size={16} className="fill-current" />
            </button>
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">{pl.name}</h4>
          <p className="text-xs text-zinc-500 truncate mt-0.5">Playlist thư mục</p>
        </div>
      </div>
      <div className="col-span-2 text-center">
        <span className="px-2.5 py-1 rounded-full bg-theme-30/60 text-xs font-semibold text-zinc-300">
          {pl.tracks.length} {t('common.songs')}
        </span>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2">
        <button onClick={(e) => { e.stopPropagation(); onChangeImage() }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100" title={t('playlistsView.chooseCover')}><ImageIcon size={15}/></button>
        <button onClick={(e) => { e.stopPropagation(); onRename() }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100" title={t('modals.playlistRename.title')}><Edit2 size={15}/></button>
        <button onClick={(e) => { e.stopPropagation(); onContextMenu(e) }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition"><MoreVertical size={15}/></button>
      </div>
    </div>
  )
});

const PlaylistCompactRow = React.memo(({
  pl,
  idx,
  isLite,
  onClick,
  onContextMenu,
  onPlay,
  t
}: any) => {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">{idx + 1}</span>
        <div className="w-9 h-9 rounded-lg bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow">
          {(!isLite && pl.thumbnail) ? <img loading="lazy" decoding="async" src={toMediaUrl(pl.thumbnail)} className="w-full h-full object-cover" /> : <FolderPlus size={16} className="text-zinc-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-white text-sm group-hover:text-theme-10 transition truncate">{pl.name}</h4>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs text-zinc-400 font-mono">{pl.tracks.length} {t('common.songs')}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100"
          title={t('artistsView.playAll')}
        >
          <Play size={13} className="ml-0.5 fill-current" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
          className="text-zinc-500 hover:text-white p-1 rounded transition opacity-0 group-hover:opacity-100"
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>
  )
});

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

export default function App() {
  const { t, language, setLanguage } = useTranslation()

  // ==========================================
  // 1. REFS
  // ==========================================
  const audioRef = useRef<HTMLAudioElement>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const preampNodeRef = useRef<GainNode | null>(null)
  const filterNodesRef = useRef<BiquadFilterNode[]>([])
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null)
  const eqCanvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimRef = useRef<number>(0)
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)

  // ==========================================
  // 2. STATES
  // ==========================================

  // State cho Dashboard
  const [dashboardData, setDashboardData] = useState<any[]>([])
  const [activeAlbum, setActiveAlbum] = useState<{ title: string, tracks: any[] } | null>(null)
  const [isAlbumLoading, setIsAlbumLoading] = useState(false)
  const preloadedRef = useRef<string | null>(null) // Đánh dấu ID đã được preload
  const crossfadeTriggeredRef = useRef<boolean>(false) // Chống kích hoạt chuyển bài nhiều lần khi crossfade

  // State Chế độ hiệu suất
  const [appMode, setAppMode] = useState<'default' | 'lite' | 'core'>('default')
  const isLite = appMode === 'lite' || appMode === 'core' // Dùng chung cho việc tắt ảnh bìa, màu sắc
  const isCore = appMode === 'core' // Chỉ định cắt luồng mảng Audio và UI mạng

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', appMode)
  }, [appMode])
  
  // UI & General App States
  const [activeView, setActiveView] = useState<'home' | 'home-ytm' | 'home-soundcloud' | 'songs' | 'playlists' | 'artists' | 'genres' | 'user-playlists' | 'settings' | 'drive'>('home')
  const [themeColor, setThemeColor] = useState('rgba(39, 39, 42, 0)')
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info', visible: boolean}>({message: '', type: 'info', visible: false})
  const [customBgImage, setCustomBgImage] = useState<string | null>(null)
  const [useTrackCoverAsBg, setUseTrackCoverAsBg] = useState<boolean>(false)
  const [bgImageInput, setBgImageInput] = useState<string>('')
  const [customBgOpacity, setCustomBgOpacity] = useState<number>(1)
  const [customBgBlur, setCustomBgBlur] = useState<number>(0)
  const [isReloading, setIsReloading] = useState(false)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false) // Flag để ngăn ghi đè config

  // Recently Played State (Lưu lịch sử bài hát đã nghe)
  const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('meis_recent_played')
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      return []
    }
  })

  // SoundCloud & YTM Auth States
  const [scDashboardData, setScDashboardData] = useState<any[]>([])
  const [isScLoading, setIsScLoading] = useState<boolean>(false)
  const [scUser, setScUser] = useState<any | null>(null)
  const [selectedScGenre, setSelectedScGenre] = useState<string>('all-music')
  const [isYtmLoggedIn, setIsYtmLoggedIn] = useState<boolean>(false)
  
  // Library & Search States
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [libraryPaths, setLibraryPaths] = useState<string[]>([])
  const [libraryTracks, setLibraryTracks] = useState<any[]>([])
  const [playlists, setPlaylists] = useState<any[]>([])
  const [userPlaylists, setUserPlaylists] = useState<any[]>([])
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null)
  const [activeUserPlaylist, setActiveUserPlaylist] = useState<any | null>(null)
  const [activeArtist, setActiveArtist] = useState<any | null>(null)
  const [activeGenre, setActiveGenre] = useState<any | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'compact'>(() => {
    return (localStorage.getItem('meis_view_mode') as any) || 'table'
  })
  const [showCreateUserPlaylistModal, setShowCreateUserPlaylistModal] = useState(false)
  const [showAddSongsToUserPlaylistModal, setShowAddSongsToUserPlaylistModal] = useState(false)
  const [editingUserPlaylist, setEditingUserPlaylist] = useState<any | null>(null)
  const [showEditUserPlaylistModal, setShowEditUserPlaylistModal] = useState(false)
  const [collapsedArtistLetters, setCollapsedArtistLetters] = useState<Record<string, boolean>>({})
  
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Player & Queue States
  const [currentTrack, setCurrentTrack] = useState<any | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)

  const [playQueue, setPlayQueue] = useState<any[]>([])

  // DnD Sensors (Móc Hook ở cấp cao nhất để tránh lỗi Rules of Hooks)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [originalQueue, setOriginalQueue] = useState<any[]>([])
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0)
  const [volume, setVolume] = useState(1)
  const [prevVolume, setPrevVolume] = useState<number>(1)
  const [bitPerfectEnabled, setBitPerfectEnabled] = useState(false)
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [crossfadeDuration, setCrossfadeDuration] = useState(3)

  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [closeToTray, setCloseToTray] = useState(false)
  const [isMiniPlayer, setIsMiniPlayer] = useState(false)

  // Discord Rich Presence States
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState(true)
  const [discordClientId, setDiscordClientId] = useState('1539993441851670589')
  const [discordShowDetails, setDiscordShowDetails] = useState(true)
  const [discordShowTime, setDiscordShowTime] = useState(true)
  const [discordShowCover, setDiscordShowCover] = useState(true)
  const [discordShowQuality, setDiscordShowQuality] = useState(true)
  const [discordShowButtons, setDiscordShowButtons] = useState(true)
  const [discordShowIdle, setDiscordShowIdle] = useState(true)
  const [discordConnected, setDiscordConnected] = useState(false)

  // Modals & Panels Visibility
  const [showQueuePanel, setShowQueuePanel] = useState<boolean>(false)
  const [showEQ, setShowEQ] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(true)
  const [showSpectrogramModal, setShowSpectrogramModal] = useState(false)
  const [showLyricsPanel, setShowLyricsPanel] = useState<boolean>(false)
  const [isLyricsMaximized, setIsLyricsMaximized] = useState<boolean>(false)

  useEffect(() => {
    if (isLyricsMaximized) {
      setIsLyricsMaximized(false)
    }
  }, [activeView])

  // Audio Devices & EQ States
  const [isEqEnabled, setIsEqEnabled] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default')
  const selectedDeviceRef = useRef<string>('default');
  useEffect(() => { 
    selectedDeviceRef.current = selectedDeviceId; 
  }, [selectedDeviceId]);
  const [eqBands, setEqBands] = useState<EQBand[]>([
    { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
    { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
    { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
    { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
    { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
  ])
  const [preampGain, setPreampGain] = useState<number>(0)

  // Lyrics States
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(-1)
  const [originalCover, setOriginalCover] = useState<string | null>(null)

  // Tag Editor & Renaming States
  const [editingTrack, setEditingTrack] = useState<any | null>(null)
  const [editTags, setEditTags] = useState({ title: '', artist: '', album: '', genre: '', lyrics: '' })
  const [editImagePath, setEditImagePath] = useState<string | null>(null)
  const [playlistRename, setPlaylistRename] = useState<{ isOpen: boolean, oldName: string, newName: string, id?: string }>({ isOpen: false, oldName: '', newName: '', id: undefined })

  // Smart Autoplay State (Gợi ý thông minh)
  const [smartAutoplay, setSmartAutoplay] = useState<boolean>(() => {
    return localStorage.getItem('meis_smart_autoplay') === 'true'
  })
  useEffect(() => {
    localStorage.setItem('meis_smart_autoplay', String(smartAutoplay))
  }, [smartAutoplay])

  // Custom Dialog Modal State (Hộp thoại xác nhận / cảnh báo đồng bộ giao diện)
  const [customDialog, setCustomDialog] = useState<DialogOptions | null>(null)

  const showConfirm = (options: {
    title?: string
    message: string | React.ReactNode
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm: () => void
    onCancel?: () => void
  }) => {
    setCustomDialog({
      isOpen: true,
      type: options.danger ? 'danger' : 'confirm',
      title: options.title,
      message: options.message,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      onConfirm: () => {
        setCustomDialog(null)
        options.onConfirm()
      },
      onCancel: () => {
        setCustomDialog(null)
        options.onCancel?.()
      }
    })
  }

  const showAlert = (options: {
    title?: string
    message: string | React.ReactNode
    confirmText?: string
    onConfirm?: () => void
  }) => {
    setCustomDialog({
      isOpen: true,
      type: 'alert',
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'OK',
      onConfirm: () => {
        setCustomDialog(null)
        options.onConfirm?.()
      },
      onCancel: () => {
        setCustomDialog(null)
      }
    })
  }

  // Navigation History Stack (Quản lý nút chuột 4/5 và điều hướng lùi/tiến)
  const navHistoryRef = useRef<any[]>([])
  const navForwardRef = useRef<any[]>([])
  const isNavigatingRef = useRef(false)

  // Quản lý và khôi phục vị trí cuộn khi điều hướng / quay lại
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionsRef = useRef<Record<string, number>>({})

  const currentViewKey = `${activeView}-${activeAlbum ? (activeAlbum.browseId || activeAlbum.title || 'album') : ''}-${activeArtist?.name || ''}-${activeGenre?.name || ''}-${activePlaylist?.name || ''}-${activeUserPlaylist?.id || ''}${searchQuery ? `-${searchQuery}` : ''}`

  useLayoutEffect(() => {
    const saved = scrollPositionsRef.current[currentViewKey]
    if (saved !== undefined && contentContainerRef.current) {
      contentContainerRef.current.scrollTop = saved
      const raf = requestAnimationFrame(() => {
        if (contentContainerRef.current) {
          contentContainerRef.current.scrollTop = saved
        }
      })
      const timer = setTimeout(() => {
        if (contentContainerRef.current) {
          contentContainerRef.current.scrollTop = saved
        }
      }, 50)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(timer)
      }
    } else if (contentContainerRef.current) {
      contentContainerRef.current.scrollTop = 0
    }
    return () => {
      if (contentContainerRef.current) {
        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop
      }
    }
  }, [currentViewKey])

  const captureNavState = () => ({
    activeView,
    activeAlbum,
    activeArtist,
    activeGenre,
    activePlaylist,
    activeUserPlaylist,
    searchQuery,
    searchInput,
    scrollTop: contentContainerRef.current?.scrollTop || 0
  })

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false
      return
    }
    const current = captureNavState()
    const last = navHistoryRef.current[navHistoryRef.current.length - 1]
    if (!last || last.activeView !== current.activeView || last.activeAlbum !== current.activeAlbum || last.activeArtist !== current.activeArtist || last.activeGenre !== current.activeGenre || last.activePlaylist !== current.activePlaylist || last.activeUserPlaylist !== current.activeUserPlaylist || last.searchQuery !== current.searchQuery) {
      navHistoryRef.current.push(current)
      navForwardRef.current = []
      if (navHistoryRef.current.length > 50) {
        navHistoryRef.current.shift()
      }
    }
  }, [activeView, activeAlbum, activeArtist, activeGenre, activePlaylist, activeUserPlaylist, searchQuery])

  const handleNavBack = () => {
    if (contentContainerRef.current) {
      scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop
    }
    if (activeAlbum) {
      setActiveAlbum(null)
      return
    }
    if (activeArtist) {
      setActiveArtist(null)
      return
    }
    if (activeGenre) {
      setActiveGenre(null)
      return
    }
    if (activePlaylist) {
      setActivePlaylist(null)
      return
    }
    if (activeUserPlaylist) {
      setActiveUserPlaylist(null)
      return
    }
    if ((activeView === 'home' || activeView === 'home-ytm' || activeView === 'home-soundcloud') && (searchQuery || searchInput)) {
      setSearchInput('')
      setSearchQuery('')
      if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard()
      if (activeView === 'home-soundcloud') fetchScDashboard()
      return
    }

    if (navHistoryRef.current.length > 1) {
      const currentState = navHistoryRef.current.pop()
      if (currentState) {
        navForwardRef.current.push(currentState)
      }
      const prevState = navHistoryRef.current[navHistoryRef.current.length - 1]
      if (prevState) {
        isNavigatingRef.current = true
        setActiveView(prevState.activeView)
        setActiveAlbum(prevState.activeAlbum)
        setActiveArtist(prevState.activeArtist)
        setActiveGenre(prevState.activeGenre)
        setActivePlaylist(prevState.activePlaylist)
        setActiveUserPlaylist(prevState.activeUserPlaylist)
        setSearchQuery(prevState.searchQuery)
        setSearchInput(prevState.searchInput)
      }
    }
  }

  const handleNavForward = () => {
    if (navForwardRef.current.length > 0) {
      const nextState = navForwardRef.current.pop()
      if (nextState) {
        isNavigatingRef.current = true
        navHistoryRef.current.push(nextState)
        setActiveView(nextState.activeView)
        setActiveAlbum(nextState.activeAlbum)
        setActiveArtist(nextState.activeArtist)
        setActiveGenre(nextState.activeGenre)
        setActivePlaylist(nextState.activePlaylist)
        setActiveUserPlaylist(nextState.activeUserPlaylist)
        setSearchQuery(nextState.searchQuery)
        setSearchInput(nextState.searchInput)
      }
    }
  }

  const handleNavBackRef = useRef(handleNavBack)
  handleNavBackRef.current = handleNavBack

  const handleNavForwardRef = useRef(handleNavForward)
  handleNavForwardRef.current = handleNavForward

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        handleNavBackRef.current()
      } else if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        handleNavForwardRef.current()
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('auxclick', handleMouseUp)

    // @ts-ignore
    let unlistenBack = window.api?.onNavBack?.(() => handleNavBackRef.current())
    // @ts-ignore
    let unlistenForward = window.api?.onNavForward?.(() => handleNavForwardRef.current())

    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('auxclick', handleMouseUp)
      if (typeof unlistenBack === 'function') unlistenBack()
      if (typeof unlistenForward === 'function') unlistenForward()
    }
  }, [])

  // Cloud & Google Drive States
  const [googleDriveApiKey, setGoogleDriveApiKey] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const [isFetchingDrive, setIsFetchingDrive] = useState(false)
  const [driveFiles, setDriveFiles] = useState<any[]>([])
  const [cloudActionTrack, setCloudActionTrack] = useState<any | null>(null) 
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{current: number, total: number, fileName: string} | null>(null)

  // Create playlists
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddSongsModal, setShowAddSongsModal] = useState(false)


  // ==========================================
  // 3. UTILITIES & HANDLERS
  // ==========================================

  // Thêm log kiểm tra lệch Sample Rate
  useEffect(() => {
    if (audioCtxRef.current && currentTrack) {
      const ctxRate = audioCtxRef.current.sampleRate;
      const fileRate = currentTrack.sampleRate;

      console.log(`[Audio Check] AudioContext Rate: ${ctxRate}Hz | File Rate: ${fileRate}Hz`);
      
      if (fileRate && ctxRate !== fileRate) {
        console.warn(`[Warning] Đang xảy ra Resampling từ ${fileRate}Hz sang ${ctxRate}Hz!`);
      }
    }
  }, [currentTrack]);

  // --- Dashboard & Online Music ---
  const fetchDashboard = useCallback(async () => {
    // @ts-ignore
    const res = await window.api.getHomeDashboard()
    if (res.success) {
      setDashboardData(res.data)
      setIsYtmLoggedIn(true)
    } else {
      setIsYtmLoggedIn(false)
      if (res.error && res.error !== 'Chưa đăng nhập') {
        console.warn("Lỗi Dashboard YTM:", res.error)
      }
    }
  }, [])

  const handleYtmLogin = async () => {
    // @ts-ignore
    const res = await window.api.ytmLogin()
    if (res.success) {
      setIsYtmLoggedIn(true)
      showToast(t('toasts.ytmLoginSuccess'), 'success')
      fetchDashboard()
    } else {
      showAlert({ title: t('common.error'), message: 'Error: ' + res.error })
    }
  }

  const handleYtmLogout = async () => {
    // @ts-ignore
    const res = await window.api.ytmLogout()
    if (res.success) {
      setIsYtmLoggedIn(false)
      setDashboardData([])
      showToast(t('toasts.ytmLogout'), 'info')
    }
  }

  const fetchScDashboard = useCallback(async (genre?: string) => {
    setIsScLoading(true)
    const targetGenre = genre || selectedScGenre
    // @ts-ignore
    const res = await window.api.getScDashboard(targetGenre)
    if (res && res.success) {
      setScDashboardData(res.data)
    }
    // @ts-ignore
    const userRes = await window.api.getScUser()
    if (userRes && userRes.success) {
      setScUser(userRes.user)
    } else {
      setScUser(null)
    }
    setIsScLoading(false)
  }, [selectedScGenre])

  const handleScLogin = async () => {
    // @ts-ignore
    const res = await window.api.scLogin()
    if (res.success) {
      showToast(t('toasts.scLoginSuccess'), 'success')
      if (res.user) setScUser(res.user)
      fetchScDashboard()
    } else {
      showAlert({ title: t('common.error'), message: 'Error: ' + res.error })
    }
  }

  const handleScLogout = async () => {
    // @ts-ignore
    const res = await window.api.scLogout()
    if (res.success) {
      setScUser(null)
      showToast(t('toasts.scLogout'), 'info')
      fetchScDashboard()
    }
  }

  const handleScItemClick = async (item: any) => {
    if (item.isPlaylist || item.playlistId) {
      if (contentContainerRef.current) {
        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop
      }
      setActiveAlbum({ title: item.title, tracks: [] })
      setIsAlbumLoading(true)
      // @ts-ignore
      const res = await window.api.getScPlaylist(item.playlistId)
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks })
      else { showAlert({ title: t('common.error'), message: res.error }); setActiveAlbum(null); }
      setIsAlbumLoading(false)
    } else {
      const track = {
        id: item.id || `sc-${item.originalId}`,
        originalId: item.originalId,
        title: item.title,
        artist: item.artist,
        album: item.album || 'SoundCloud Single',
        duration: item.duration || 0,
        format: 'STREAM',
        isCloud: true,
        isOnline: true,
        platform: 'soundcloud',
        permalinkUrl: item.permalinkUrl,
        coverArt: item.coverArt || (item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[0].url : null),
        coverArtHighRes: item.coverArtHighRes || null
      }
      playAndGenerateRadio(track)
    }
  }

  const handleDashboardItemClick = async (item: any) => {
    if (item.videoId && !item.isArtist) { 
      // XỬ LÝ PHÁT NHẠC
      const track = {
        id: `yt-${item.videoId}`, originalId: item.videoId,
        title: item.title, artist: item.subtitle, album: 'YouTube Music', duration: 0,
        format: 'STREAM', isCloud: true, isOnline: true, platform: 'youtube',
        coverArt: item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[0].url : null,
        coverArtHighRes: item.coverArtHighRes || null
      };
      playAndGenerateRadio(track);
      
    } else if (item.isArtist) {
      // XỬ LÝ MỞ TRANG NGHỆ SĨ
      if (contentContainerRef.current) {
        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop
      }
      setActiveAlbum({ title: item.title, tracks: [] });
      setIsAlbumLoading(true);
      // @ts-ignore
      const res = await window.api.getYtmArtist(item.playlistId);
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks });
      else { showAlert({ title: t('common.error'), message: res.error }); setActiveAlbum(null); }
      setIsAlbumLoading(false);

    } else if (item.playlistId) {
      // XỬ LÝ MỞ ALBUM/PLAYLIST
      if (contentContainerRef.current) {
        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop
      }
      setActiveAlbum({ title: item.title, tracks: [] });
      setIsAlbumLoading(true);
      // @ts-ignore
      const res = await window.api.getYtmPlaylist(item.playlistId);
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks });
      else { showAlert({ title: t('common.error'), message: res.error }); setActiveAlbum(null); }
      setIsAlbumLoading(false);
    }
  }

  // Hàm mới: Bắt đầu phát 1 bài hát Online đơn lẻ và tự động gọi API lấy danh sách gợi ý
  const playAndGenerateRadio = (track: any) => {
    // 1. Đặt bài hát hiện tại vào hàng đợi
    setOriginalQueue([track]);
    setPlayQueue([track]);
    
    // 2. Phát nhạc ngay lập tức
    handlePlayTrack(track);

    // 3. Nếu là bài hát YouTube thì gọi ngầm API lấy danh sách "Tiếp theo"
    if (track.platform === 'youtube' || (!track.platform && !String(track.id).startsWith('sc-'))) {
      // @ts-ignore
      window.api.getUpNext(track.originalId).then((res: any) => {
        if (res && res.success && res.tracks && res.tracks.length > 0) {
          // Lọc bỏ bài hát đầu tiên nếu nó trùng với bài đang phát
          const nextTracks = res.tracks.filter((t: any) => t.originalId !== track.originalId);
          
          // Bơm nhạc vào Hàng đợi một cách an toàn
          setPlayQueue(prev => {
            if (prev.length === 1 && prev[0].originalId === track.originalId) {
              return [...prev, ...nextTracks];
            }
            return prev;
          });
          
          setOriginalQueue(prev => {
            if (prev.length === 1 && prev[0].originalId === track.originalId) {
              return [...prev, ...nextTracks];
            }
            return prev;
          });
        }
      }).catch(() => {});
    }
  }

  const handleDashboardItemDownload = async (item: any) => {
    if (item.videoId || item.platform === 'soundcloud' || (item.originalId && !item.isPlaylist)) {
      // 1. TẢI 1 BÀI HÁT ĐƠN LẺ
      const track = {
        originalId: item.originalId || item.videoId,
        title: item.title,
        artist: item.artist || item.subtitle,
        album: item.album || item.subtitle || 'Singles',
        platform: item.platform || 'youtube',
        permalinkUrl: item.permalinkUrl
      };
      
      setIsDownloading(true);
      setDownloadProgress({ current: 0, total: 1, fileName: `Đang tải: ${item.title}` });
      
      // @ts-ignore
      const res = await window.api.downloadOnline(track);
      
      setIsDownloading(false);
      setDownloadProgress(null);
      
      if (res.success) { 
        showToast(t('toasts.downloadFinished', { title: item.title }), 'success'); 
        loadLibrary(); 
      } else if (!res.canceled) { 
        showAlert({ title: t('common.error'), message: 'Download Error: ' + res.error }); 
      }

    } else if (item.playlistId) {
      // 2. TẢI TOÀN BỘ ALBUM / PLAYLIST
      showConfirm({
        title: t('common.confirm'),
        message: `Do you want to download all tracks from "${item.title}"? (This might take a while)`,
        onConfirm: async () => {
          setIsDownloading(true);
          setDownloadProgress({ current: 0, total: 0, fileName: t('common.loading') });
          
          // Lấy danh sách track trong Album
          // @ts-ignore
          const res = item.platform === 'soundcloud'
            ? await window.api.getScPlaylist(item.playlistId)
            : await window.api.getYtmPlaylist(item.playlistId);

          if (res.success && res.tracks) {
             const tracks = res.tracks;
             let successCount = 0;
             
             for (let i = 0; i < tracks.length; i++) {
                setDownloadProgress({ current: i + 1, total: tracks.length, fileName: tracks[i].title });
                
                // Ép tên Album cho bài hát để gom chung vào 1 thư mục
                const trackToDl = { ...tracks[i], album: item.title, platform: item.platform || 'youtube' };
                
                // @ts-ignore
                const dlRes = await window.api.downloadOnline(trackToDl);
                if (dlRes.success) successCount++;
             }
             
             showToast(t('toasts.albumDownloadFinished', { count: successCount, total: tracks.length }), 'success');
             loadLibrary();
          } else {
             showAlert({ title: t('common.error'), message: 'Error getting album tracks: ' + res.error });
          }
          
          setIsDownloading(false);
          setDownloadProgress(null);
        }
      });
    }
  }

  // --- UI Utilities ---
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, visible: true })
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000)
  }

  // --- Playlists Management ---
  const handleCreatePlaylistSubmit = async (name: string) => {
    // @ts-ignore
    const res = await window.api.createPlaylist(name)
    if (res.success) {
      showToast(t('toasts.playlistCreated'), 'success')
      setShowCreateModal(false)
      loadLibrary()
    } else {
      showAlert({ title: t('common.error'), message: 'Error: ' + res.error })
    }
  }

  const handleAddTracksToActivePlaylist = async (tracksToAdd: any[]) => {
    if (!activePlaylist) return
    for (const track of tracksToAdd) {
      // Lấy chính xác đường dẫn gốc thực tế của bài hát (loại bỏ tiền tố file:// nếu có)
      const rawTrackPath = track.id || track.filePath
      if (rawTrackPath) {
        // @ts-ignore
        await window.api.addTrackToPlaylist(activePlaylist.name, rawTrackPath)
      }
    }
    showToast(t('toasts.tracksAddedToPlaylist', { count: tracksToAdd.length }), 'success')
    setShowAddSongsModal(false)
    loadLibrary()
  }

  // --- Library Management ---
  const loadLibrary = async (forceRefresh: boolean = false) => {
    // @ts-ignore
    const res = await window.api.getLibrary(forceRefresh)
    if (res.success) {
      const sanitizeTrack = (t: any) => ({
        ...t,
        filePath: toMediaUrl(t.filePath),
        coverArt: toMediaUrl(t.coverArt)
      })
      const sanitizePlaylist = (pl: any) => ({
        ...pl,
        thumbnail: toMediaUrl(pl.thumbnail),
        tracks: Array.isArray(pl.tracks) ? pl.tracks.map(sanitizeTrack) : []
      })
      setLibraryPath(res.libraryPath)
      setLibraryPaths(res.libraryPaths || (res.libraryPath ? [res.libraryPath] : []))
      setLibraryTracks((res.tracks || []).map(sanitizeTrack))
      setPlaylists((res.playlists || []).map(sanitizePlaylist))
      setUserPlaylists((res.userPlaylists || []).map(sanitizePlaylist))
    }
  }

  // Lắng nghe sự kiện Live Update từ main process khi có tệp nhạc được thêm/xóa/sửa
  useEffect(() => {
    // @ts-ignore
    const unlisten = window.api?.onLibraryChanged?.(() => {
      loadLibrary(true)
    })
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  // Tự động đồng bộ Active Playlist mỗi khi thêm/xóa bài hát trong thư viện
  useEffect(() => {
    if (activePlaylist) {
      const updated = playlists.find(p => p.name === activePlaylist.name);
      if (updated) {
        setActivePlaylist(updated);
      }
    }
  }, [playlists]);

  // Tự động đồng bộ Active User Playlist
  useEffect(() => {
    if (activeUserPlaylist) {
      const updated = userPlaylists.find(p => p.id === activeUserPlaylist.id);
      if (updated) {
        setActiveUserPlaylist(updated);
      }
    }
  }, [userPlaylists]);


  const handleReloadLibrary = async () => {
    setIsReloading(true)
    try {
      await loadLibrary(true)
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => setIsReloading(false), 500)
    }
  }

  const handleSelectLibrary = async () => {
    // @ts-ignore
    const res = await window.api.setLibraryFolder()
    if (res.success) {
      showToast(t('toasts.librarySavedSuccess'), 'success')
      loadLibrary(true)
    }
  }

  const handleAddLibraryFolder = async () => {
    // @ts-ignore
    const res = await window.api.addLibraryFolder()
    if (res && res.success) {
      setLibraryPaths(res.libraryPaths)
      showToast(t('toasts.librarySavedSuccess'), 'success')
      loadLibrary(true)
    }
  }

  const handleRemoveLibraryFolder = async (folderPath: string) => {
    if (libraryPaths.length <= 1) {
      showConfirm({
        title: t('common.warning'),
        message: t('settings.library.removeFolder') + '?',
        danger: true,
        onConfirm: async () => {
          // @ts-ignore
          const res = await window.api.removeLibraryFolder(folderPath)
          if (res && res.success) {
            setLibraryPaths(res.libraryPaths)
            showToast(t('toasts.removedFromPlaylist'), 'success')
            loadLibrary(true)
          }
        }
      })
      return
    }
    // @ts-ignore
    const res = await window.api.removeLibraryFolder(folderPath)
    if (res && res.success) {
      setLibraryPaths(res.libraryPaths)
      showToast(t('toasts.removedFromPlaylist'), 'success')
      loadLibrary(true)
    }
  }

  const handleUpdateLibraryFolder = async (oldPath: string) => {
    // @ts-ignore
    const res = await window.api.updateLibraryFolder(oldPath)
    if (res && res.success) {
      setLibraryPaths(res.libraryPaths)
      showToast(t('toasts.librarySavedSuccess'), 'success')
      loadLibrary(true)
    }
  }

  // --- Virtual User Playlists Handlers ---
  const handleCreateUserPlaylist = async (name: string) => {
    // @ts-ignore
    const res = await window.api.createUserPlaylist(name)
    if (res && res.success) {
      setUserPlaylists(res.playlists)
      setShowCreateUserPlaylistModal(false)
      showToast(t('toasts.playlistCreatedSuccess', { name }), 'success')
      setActiveUserPlaylist(res.playlist)
      setActiveView('user-playlists')
    } else if (res && res.error) {
      showAlert({ title: t('common.error'), message: res.error })
    }
  }

  const handleDeleteUserPlaylist = async (playlist: any) => {
    showConfirm({
      title: t('userPlaylistsView.deletePlaylist'),
      message: t('userPlaylistsView.confirmDelete', { name: playlist.name }),
      danger: true,
      onConfirm: async () => {
        // @ts-ignore
        const res = await window.api.deleteUserPlaylist(playlist.id)
        if (res && res.success) {
          setUserPlaylists(res.playlists)
          if (activeUserPlaylist?.id === playlist.id) {
            setActiveUserPlaylist(null)
          }
          showToast(t('toasts.playlistDeleted', { name: playlist.name }), 'success')
        }
      }
    })
  }

  const handleChangeUserPlaylistCover = async (playlistId: string) => {
    // @ts-ignore
    const res = await window.api.setUserPlaylistThumbnail(playlistId)
    if (res && res.success) {
      setUserPlaylists(res.playlists)
      if (activeUserPlaylist && activeUserPlaylist.id === playlistId && res.playlist) {
        setActiveUserPlaylist(res.playlist)
      }
      showToast(t('toasts.coverChangedSuccess'), 'success')
    }
  }

  const handleSaveEditUserPlaylist = async (
    playlistId: string, 
    updates: { name: string; description: string; thumbnail?: string | null; customImagePath?: string }
  ) => {
    // @ts-ignore
    const res = await window.api.updateUserPlaylist(playlistId, updates)
    if (res && res.success) {
      setUserPlaylists(res.playlists)
      if (activeUserPlaylist && activeUserPlaylist.id === playlistId) {
        setActiveUserPlaylist(res.playlist)
      }
      showToast(t('toasts.playlistUpdatedSuccess'), 'success')
    } else {
      showAlert({ title: t('common.error'), message: res?.error || 'Lỗi cập nhật playlist' })
    }
  }

  const handleAddSongsToUserPlaylist = async (selectedTracks: any[]) => {
    if (!activeUserPlaylist) return
    const trackPaths = selectedTracks.map(t => t.id || t.filePath)
    // @ts-ignore
    const res = await window.api.addTracksToUserPlaylist(activeUserPlaylist.id, trackPaths)
    if (res && res.success) {
      setUserPlaylists(res.playlists)
      setShowAddSongsToUserPlaylistModal(false)
      showToast(t('toasts.tracksAddedToPlaylist', { count: selectedTracks.length }), 'success')
    }
  }

  const handleAutoGeneratePlaylists = async () => {
    showConfirm({
      title: t('settings.library.autoCategorize'),
      message: t('toasts.autoCategorizeConfirm'),
      onConfirm: async () => {
        // @ts-ignore
        const res = await window.api.autoGeneratePlaylists()
        if (res.success) {
          showToast(t('toasts.autoCategorizeSuccess', { count: res.movedCount }), 'success')
          loadLibrary()
        }
      }
    })
  }

  const handleImportFiles = async () => {
    const targetFolder = (activeView === 'playlists' && activePlaylist) ? activePlaylist.name : undefined
    // @ts-ignore
    const res = await window.api.importLocalFiles(targetFolder, libraryTracks)
    if (res && res.success) {
      if (res.tracks.length > 0) {
        showToast(t('toasts.tracksAddedToPlaylist', { count: res.tracks.length }), 'success')
        loadLibrary()
      }
    } else if (res && res.error) {
      showAlert({ title: t('common.error'), message: res.error })
    }
  }

  const handleRenameSubmit = async () => {
    if (!playlistRename.newName || playlistRename.newName === playlistRename.oldName) {
      setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
      return
    }
    if (playlistRename.id) {
      // @ts-ignore
      const res = await window.api.renameUserPlaylist(playlistRename.id, playlistRename.newName.trim())
      if (res && res.success) {
        setUserPlaylists(res.playlists)
        setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
        showToast(t('toasts.playlistRenamedSuccess'), 'success')
      } else {
        showAlert({ title: t('common.error'), message: res?.error || 'Error renaming playlist' })
      }
    } else {
      // @ts-ignore
      const res = await window.api.renamePlaylist(playlistRename.oldName, playlistRename.newName.trim())
      if (res.success) {
        setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
        loadLibrary()
      } else {
        showAlert({ title: t('common.error'), message: 'Error renaming playlist: ' + res.error })
      }
    }
  }

  const handleExtractPlaylistImage = async (playlistName: string) => {
    // @ts-ignore
    const res = await window.api.extractPlaylistThumbnail(playlistName)
    if (res.success) {
      showToast(t('toasts.coverUpdatedSuccess'), 'success')
      loadLibrary()
    } else {
      showAlert({ title: t('common.error'), message: res.error })
    }
  }

  const handleChangePlaylistImage = async (playlistName: string) => {
    // @ts-ignore
    const res = await window.api.setPlaylistThumbnail(playlistName)
    if (res.success) {
      showToast(t('toasts.coverChangeSuccess'), 'success')
      loadLibrary()
    }
  }

  // --- Sorting & Filtering ---
  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else {
        setSortField(null)
        setSortOrder('asc')
      }
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getSortedTracks = (tracks: any[]) => {
    if (!sortField || !tracks) return tracks
    return [...tracks].sort((a, b) => {
      let valA = a[sortField] ?? ''
      let valB = b[sortField] ?? ''
      if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = (valB || '').toLowerCase()
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }

  const getFilteredTracks = (tracks: any[]) => {
    if (!searchQuery.trim()) return tracks
    const lowerQuery = searchQuery.toLowerCase()
    return tracks.filter(t => 
      (t.title && t.title.toLowerCase().includes(lowerQuery)) ||
      (t.artist && t.artist.toLowerCase().includes(lowerQuery)) ||
      (t.album && t.album.toLowerCase().includes(lowerQuery))
    )
  }

  // --- Player Controls ---
  const handlePlayTrack = async (track: any) => {
    if (crossfadeEnabled && isPlaying && audioRef.current && currentTrack && !bitPerfectEnabled) {
      try {
        const fadeAudio = new Audio(audioRef.current.src)
        fadeAudio.currentTime = audioRef.current.currentTime
        fadeAudio.volume = volume
        fadeAudio.play().catch(() => {})
        
        const step = volume / (crossfadeDuration * 20)
        const fadeInterval = setInterval(() => {
          if (fadeAudio.volume - step > 0) fadeAudio.volume -= step
          else {
            fadeAudio.pause()
            clearInterval(fadeInterval)
          }
        }, 50)
      } catch (e) {}
    }

    let trackToPlay = { ...track };

    // TỰ ĐỘNG: Phân giải URL cho nhạc Online nếu chưa có
    const isOnlineTrack = trackToPlay.isOnline || trackToPlay.isCloud || trackToPlay.platform === 'youtube' || trackToPlay.platform === 'soundcloud' || String(trackToPlay.id).startsWith('sc-') || String(trackToPlay.id).startsWith('yt-');
    if (isOnlineTrack && (!trackToPlay.filePath || !trackToPlay.filePath.startsWith('http://127.0.0.1'))) {
      showToast(t('toasts.connectingStream'), 'info');
      // @ts-ignore
      const res = await window.api.getStreamUrl(trackToPlay);
      if (res.success && res.url) {
        trackToPlay.filePath = res.url;
        // @ts-ignore
        if (window.api.logWatchHistory && trackToPlay.platform === 'youtube') window.api.logWatchHistory(trackToPlay.originalId);
      } else {
        showAlert({ title: t('common.error'), message: 'Stream error: ' + (res.error || 'Unknown') });
        return;
      }
    }

    setCurrentTrack(trackToPlay);
    setIsPlaying(true);
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }

    // Ghi nhận vào Lịch sử nghe gần đây (Recently Played)
    setRecentlyPlayed(prev => {
      const trackId = trackToPlay.id || trackToPlay.filePath
      const filtered = prev.filter(t => (t.id || t.filePath) !== trackId)
      const updated = [{
        id: trackId,
        title: trackToPlay.title || 'Unknown Title',
        artist: trackToPlay.artist || 'Unknown Artist',
        album: trackToPlay.album || 'Unknown Album',
        duration: trackToPlay.duration || 0,
        filePath: trackToPlay.filePath,
        coverArt: trackToPlay.coverArt,
        genre: trackToPlay.genre,
        isOnline: trackToPlay.isOnline,
        platform: trackToPlay.platform,
        playedAt: Date.now()
      }, ...filtered].slice(0, 50)
      try {
        localStorage.setItem('meis_recent_played', JSON.stringify(updated))
      } catch (e) {}
      return updated
    })
  }

  // --- THUẬT TOÁN GỢI Ý BÀI HÁT CHO DASHBOARD TỪ THƯ MỤC NHẠC ---
  const dashboardRecommendations = useMemo(() => {
    if (!libraryTracks || libraryTracks.length === 0) return []

    // 1. Thu thập các nghệ sĩ và thể loại từ các bài hát nghe gần đây
    const recentArtists = new Map<string, number>()
    const recentGenres = new Map<string, number>()

    const recentSample = recentlyPlayed.slice(0, 20)
    recentSample.forEach((t, idx) => {
      const weight = 20 - idx
      const a = (t.artist || '').toString().toLowerCase().trim()
      if (a && a !== 'unknown' && a !== 'various artists' && a !== 'không rõ') {
        recentArtists.set(a, (recentArtists.get(a) || 0) + weight)
      }
      const g = (t.genre || '').toString().toLowerCase().trim()
      if (g && g !== 'unknown' && g !== 'không rõ') {
        recentGenres.set(g, (recentGenres.get(g) || 0) + weight)
      }
    })

    const topArtists = Array.from(recentArtists.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0])
    const topGenres = Array.from(recentGenres.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0])
    const recentIds = new Set(recentSample.map(t => t.id || t.filePath))

    if (topArtists.length === 0 && topGenres.length === 0) {
      // Nếu chưa có lịch sử nghe, gợi ý các bài hát phong phú từ thư viện
      return [...libraryTracks].slice(0, 20)
    }

    const scoredTracks = libraryTracks.map(t => {
      let score = 0
      const tArtist = (t.artist || '').toString().toLowerCase().trim()
      const tGenre = (t.genre || '').toString().toLowerCase().trim()
      const tId = t.id || t.filePath

      // Khớp nghệ sĩ hàng đầu
      topArtists.forEach((a, idx) => {
        if (tArtist && (tArtist.includes(a) || a.includes(tArtist))) {
          score += (topArtists.length - idx) * 12
        }
      })

      // Khớp thể loại hàng đầu
      topGenres.forEach((g, idx) => {
        if (tGenre && (tGenre.includes(g) || g.includes(tGenre))) {
          score += (topGenres.length - idx) * 8
        }
      })

      // Trừ điểm nhẹ cho bài vừa nghe để ưu tiên khám phá thêm bài mới trong thư mục
      if (recentIds.has(tId)) {
        score -= 5
      }

      return { track: t, score }
    })

    scoredTracks.sort((a, b) => b.score - a.score)
    return scoredTracks.filter(st => st.score > 0).slice(0, 24).map(st => st.track)
  }, [libraryTracks, recentlyPlayed])

  // Tuyển tập ngẫu nhiên "Khám phá từ thư mục nhạc"
  const randomDiscoverTracks = useMemo(() => {
    if (!libraryTracks || libraryTracks.length === 0) return []
    return [...libraryTracks].sort(() => Math.random() - 0.5).slice(0, 12)
  }, [libraryTracks])

  // Thuật toán tìm bài hát gợi ý thông minh dựa trên Thể loại / Nghệ sĩ
  const findRecommendedTrack = (current: any, queue: any[], allTracks: any[]) => {
    if (!current || !allTracks || allTracks.length === 0) return null

    const queueIds = new Set(queue.map(t => t.id || t.filePath))
    let pool = allTracks.filter(t => (t.id || t.filePath) !== (current.id || current.filePath) && !queueIds.has(t.id || t.filePath))
    if (pool.length === 0) {
      pool = allTracks.filter(t => (t.id || t.filePath) !== (current.id || current.filePath))
    }
    if (pool.length === 0) return null

    const currentGenre = (current.genre || '').toString().toLowerCase().trim()
    const currentArtist = (current.artist || '').toString().toLowerCase().trim()

    // 1. Khớp thể loại (Genre)
    if (currentGenre && currentGenre !== 'unknown') {
      const genreMatches = pool.filter(t => {
        const g = (t.genre || '').toString().toLowerCase().trim()
        return g && g !== 'unknown' && (g.includes(currentGenre) || currentGenre.includes(g))
      })
      if (genreMatches.length > 0) {
        return genreMatches[Math.floor(Math.random() * genreMatches.length)]
      }
    }

    // 2. Khớp nghệ sĩ (Artist)
    if (currentArtist && currentArtist !== 'unknown' && currentArtist !== 'various artists') {
      const artistMatches = pool.filter(t => {
        const a = (t.artist || '').toString().toLowerCase().trim()
        return a && a !== 'unknown' && (a.includes(currentArtist) || currentArtist.includes(a))
      })
      if (artistMatches.length > 0) {
        return artistMatches[Math.floor(Math.random() * artistMatches.length)]
      }
    }

    // 3. Ngẫu nhiên từ kho nhạc
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const handleNext = () => {
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (!currentTrack) return
    if (!playQueue || playQueue.length === 0) return

    const currentIndex = playQueue.findIndex(t => t.id === currentTrack.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= playQueue.length) {
      if (repeatMode === 1 || repeatMode === 2) {
        nextIndex = 0
      } else if (smartAutoplay) {
        const candidate = findRecommendedTrack(currentTrack, playQueue, libraryTracks)
        if (candidate) {
          const newQueue = [...playQueue, candidate]
          setPlayQueue(newQueue)
          setOriginalQueue(prev => [...prev, candidate])
          handlePlayTrack(candidate)
          showToast(t('player.smartAutoplayPlaying', { title: candidate.title, artist: candidate.artist || t('player.unknownArtist') }), 'info')
          return
        } else {
          setIsPlaying(false)
          return
        }
      } else {
        setIsPlaying(false)
        return
      }
    }
    handlePlayTrack(playQueue[nextIndex])
  }

  const handlePrev = () => {
    if (!currentTrack) return
    if (audioRef.current && audioRef.current.currentTime > 3) { 
      audioRef.current.currentTime = 0
      return 
    }
    if (!playQueue || playQueue.length === 0) return

    const currentIndex = playQueue.findIndex(t => t.id === currentTrack.id)
    let prevIndex = currentIndex - 1

    if (prevIndex < 0) {
      if (repeatMode === 1 || repeatMode === 2) prevIndex = playQueue.length - 1
      else prevIndex = 0
    }
    handlePlayTrack(playQueue[prevIndex])
  }

  const handlePlayPause = () => {
    if (!currentTrack) {
      if (libraryTracks.length > 0) {
        handleRowClick(libraryTracks[0], libraryTracks)
      }
      return
    }
    
    if (bitPerfectEnabled) {
      if (isPlaying) {
        window.api.mpvPause()
        setIsPlaying(false)
      } else {
        window.api.mpvResume()
        setIsPlaying(true)
      }
    } else if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play().catch(console.warn)
        setIsPlaying(true)
      }
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (audioRef.current) audioRef.current.volume = val
  }

  const handleVolumeUp = () => {
    setVolume(prev => {
      const newVol = Math.min(1, Math.round((prev + 0.05) * 100) / 100)
      if (audioRef.current) audioRef.current.volume = newVol
      return newVol
    })
  }

  const handleVolumeDown = () => {
    setVolume(prev => {
      const newVol = Math.max(0, Math.round((prev - 0.05) * 100) / 100)
      if (audioRef.current) audioRef.current.volume = newVol
      return newVol
    })
  }

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume)
      setVolume(0)
      if (audioRef.current) audioRef.current.volume = 0
    } else {
      const newVol = prevVolume > 0 ? prevVolume : 1
      setVolume(newVol)
      if (audioRef.current) audioRef.current.volume = newVol
    }
  }

  const toggleShuffle = () => {
    if (!isShuffle) {
      setPlayQueue([...originalQueue].sort(() => Math.random() - 0.5))
    } else {
      setPlayQueue(originalQueue)
    }
    setIsShuffle(!isShuffle)
  }

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev + 1) % 3 as 0 | 1 | 2)
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current && currentTrack) {
      const actualDuration = audioRef.current.duration
      if (!currentTrack.duration || currentTrack.duration === 0) {
        setCurrentTrack({ ...currentTrack, duration: actualDuration })
        setLibraryTracks(prevTracks => prevTracks.map(t => 
          t.id === currentTrack.id ? { ...t, duration: actualDuration } : t
        ))
      }
    }
  }

  const handleToggleMiniPlayer = () => {
    const nextState = !isMiniPlayer
    setIsMiniPlayer(nextState)
    // @ts-ignore
    window.api.toggleMiniPlayer(nextState)
  }

  const handleToggleLyrics = () => {
    if (showLyricsPanel) {
      setShowLyricsPanel(false)
      setIsLyricsMaximized(false)
    } else {
      setShowLyricsPanel(true)
      setShowQueuePanel(false)
    }
  }

  const handleToggleQueue = () => {
    if (showQueuePanel) {
      setShowQueuePanel(false)
    } else {
      setShowQueuePanel(true)
      setShowLyricsPanel(false)
      setIsLyricsMaximized(false)
    }
  }

  const handleRowClick = async (track: any, contextList?: any[]) => {
    if (contextList) {
      setOriginalQueue(contextList);
      setPlayQueue(isShuffle ? [...contextList].sort(() => Math.random() - 0.5) : contextList);
    }
    if (track.isCloud && !track.isOnline) {
      setCloudActionTrack(track);
    } else {
      handlePlayTrack(track); // Gọi thẳng, hệ thống sẽ tự phân giải
    }
  }

  // --- EQ & Audio Setup ---
  const handleAddBand = () => {
    const newBand: EQBand = {
      id: Date.now().toString(),
      frequency: 1000, 
      gain: 0,
      type: 'peaking',
      q: 1.4,
    }
    setEqBands(prev => [...prev, newBand])
  }

  const handleDeleteBand = (id: string) => {
    setEqBands(prev => prev.filter(b => b.id !== id))
  }

  const handleUpdateBand = (id: string, key: keyof EQBand, value: any) => {
    setEqBands(prev =>
      prev.map(band => (band.id === id ? { ...band, [key]: value } : band))
    )
  }

  const handleResetEQ = () => {
    const timestamp = Date.now()
    setEqBands([
      { id: `reset-${timestamp}-1`, frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-2`, frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-3`, frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-4`, frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-5`, frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
    ])
    if (filterNodesRef.current) {
      filterNodesRef.current.forEach(node => {
        try { node.gain.value = 0 } catch(e){}
      })
    }
  }

  // --- Lyrics ---
  const parseLRC = (rawText: any): LyricLine[] => {
    if (!rawText) return []
    let lrcText = ''
    if (typeof rawText === 'string') {
      lrcText = rawText
    } else if (typeof rawText === 'object') {
      if (rawText.text) lrcText = rawText.text
      else if (Array.isArray(rawText)) lrcText = rawText.join('\n')
      else lrcText = String(rawText)
    }
    if (typeof lrcText !== 'string' || !lrcText.split) return []

    let globalOffset = 0
    const offsetMatch = /\[offset:\s*(-?\d+)\]/i.exec(lrcText)
    if (offsetMatch) {
      globalOffset = parseInt(offsetMatch[1], 10) / 1000
    }

    const lines = lrcText.split('\n')
    const result: LyricLine[] = []
    const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{1,3}))?\]/

    lines.forEach((line) => {
      const match = timeRegex.exec(line)
      if (match) {
        const minutes = parseInt(match[1], 10)
        const seconds = parseInt(match[2], 10)
        const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0
        
        let time = (minutes * 60) + seconds + (milliseconds / 1000) + globalOffset
        if (time < 0) time = 0
        
        const text = line.replace(/\[\d{2,}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
        if (text) {
          result.push({ time, text })
        }
      }
    })

    return result.sort((a, b) => a.time - b.time)
  }

  // --- Cloud & Google Drive ---
  const handleDriveSubmit = async () => {
    const match = driveLink.match(/folders\/([-\w]+)/) || driveLink.match(/id=([-\w]+)/)
    if (!match) {
      showAlert({ title: t('common.warning'), message: 'Vui lòng nhập link thư mục Google Drive hợp lệ!' })
      return
    }
    setIsFetchingDrive(true)
    try {
      const folderId = match[1]
      // @ts-ignore
      const result = await window.api.fetchDriveFiles(folderId) 
      if (result.success) {
        if (result.tracks.length === 0) showAlert({ title: t('common.notice'), message: 'Không tìm thấy file âm thanh nào. Hãy đảm bảo thư mục đã bật "Bất kỳ ai có liên kết"!' })
        else setDriveFiles(result.tracks)
      } else showAlert({ title: t('common.error'), message: 'Lỗi từ hệ thống: ' + result.error })
    } catch (err) {
      showAlert({ title: t('common.error'), message: 'Lỗi kết nối tới hệ thống!' })
    }
    setIsFetchingDrive(false)
  }

  const handleDriveStream = () => {
    setLibraryTracks(prev => [...prev, ...driveFiles])
    showToast(t('toasts.tracksAddedToPlaylist', { count: driveFiles.length }), 'success')
  }

  const handleDriveDownload = async () => {
    if (!libraryPath) {
      showToast(t('toasts.setLibraryFirst'), 'error')
      return
    }
    setIsDownloading(true)
    setDownloadProgress({ current: 0, total: driveFiles.length, fileName: t('common.loading') })
    try {
      // @ts-ignore
      const result = await window.api.downloadMultipleFiles(driveFiles, processedLibraryTracks)
      if (result.success) {
        if (result.tracks.length > 0) {
          showToast(t('toasts.driveDownloadFinished', { count: result.tracks.length }), 'success')
          loadLibrary()
        }
      } else {
        showToast(t('toasts.systemError') + result.error, 'error')
      }
    } catch (e) {
      showToast(t('toasts.downloadError'), 'error')
    }
    setIsDownloading(false)
    setDownloadProgress(null)
  }

  const handleCloudAction = async (action: 'stream' | 'download') => {
    if (!cloudActionTrack) return
    if (action === 'stream') {
      // Handle stream
    } else {
      setIsDownloading(true)
      try {
        const ext = cloudActionTrack.format ? cloudActionTrack.format.toLowerCase() : 'mp3'
        // @ts-ignore
        const result = await window.api.downloadCloudFile(cloudActionTrack.url, `${cloudActionTrack.title}.${ext}`, libraryTracks)
        if (result.success) {
          showAlert({ title: t('common.notice'), message: 'Tải về thành công! Nhạc sẽ bắt đầu phát từ máy tính.' })
          handlePlayTrack({ ...cloudActionTrack, filePath: result.localPath, isCloud: false })
          loadLibrary()
        } else if (result.canceled) {
          // Cancelled
        } else {
          showAlert({ title: t('common.error'), message: 'Lỗi tải file: ' + result.error })
        }
      } catch (e) {}
      setIsDownloading(false)
      setCloudActionTrack(null)
    }
  }

  // Nạp ảnh bìa chất lượng gốc siêu nét cho Background Theme và Lời bài hát
  const [trackHighResCover, setTrackHighResCover] = useState<string | null>(null)

  useEffect(() => {
    if (!currentTrack || isCore) {
      setTrackHighResCover(null)
      return
    }

    if (currentTrack.isOnline) {
      setTrackHighResCover(currentTrack.coverArtHighRes || currentTrack.coverArt || null)
      return
    }

    if (!currentTrack.isCloud && (currentTrack.id || currentTrack.filePath)) {
      let isCurrent = true
      // @ts-ignore
      window.api.getOriginalTrackCover(currentTrack.id || currentTrack.filePath).then((cover: string | null) => {
        if (isCurrent) {
          setTrackHighResCover(cover || currentTrack.coverArt || null)
        }
      }).catch(() => {
        if (isCurrent) setTrackHighResCover(currentTrack.coverArt || null)
      })
      return () => { isCurrent = false }
    } else {
      setTrackHighResCover(currentTrack.coverArt || null)
    }
  }, [currentTrack?.id, currentTrack?.filePath, currentTrack?.coverArt, currentTrack?.coverArtHighRes, currentTrack?.isOnline, currentTrack?.isCloud, isCore])

  // Determine effective background image (Tắt hoàn toàn trong Core Mode)
  const rawEffectiveBgImage = isCore
    ? null
    : useTrackCoverAsBg 
    ? (trackHighResCover || currentTrack?.coverArtHighRes || currentTrack?.coverArt || null)
    : customBgImage
  const effectiveBgImage = rawEffectiveBgImage ? toMediaUrl(rawEffectiveBgImage) : null

  // Quản lý Dual-layer Background Crossfade cho chế độ Standard (Chống stutter khi chuyển bài)
  const [bgLayerA, setBgLayerA] = useState<string | null>(null)
  const [bgLayerB, setBgLayerB] = useState<string | null>(null)
  const [activeBgLayer, setActiveBgLayer] = useState<'A' | 'B'>('A')

  useEffect(() => {
    if (isCore) {
      setBgLayerA(null)
      setBgLayerB(null)
      return
    }

    if (!effectiveBgImage) {
      setBgLayerA(null)
      setBgLayerB(null)
      return
    }

    if (isLite) {
      // Chế độ Lite: Cập nhật trực tiếp 1 layer, không chạy animation crossfade
      setBgLayerA(effectiveBgImage)
      setActiveBgLayer('A')
      return
    }

    // Chế độ Standard: Preload ảnh và Crossfade mượt mà giữa Layer A và Layer B
    let isCancelled = false
    const targetLayer = activeBgLayer === 'A' ? 'B' : 'A'

    const applyTransition = () => {
      if (isCancelled) return
      if (targetLayer === 'B') {
        setBgLayerB(effectiveBgImage)
        setActiveBgLayer('B')
      } else {
        setBgLayerA(effectiveBgImage)
        setActiveBgLayer('A')
      }
    }

    const img = new Image()
    if (effectiveBgImage.startsWith('http://') || effectiveBgImage.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = applyTransition
    img.onerror = applyTransition
    img.src = effectiveBgImage

    return () => {
      isCancelled = true
    }
  }, [effectiveBgImage, isLite, isCore])

  // Khởi tạo và nạp trước Theme Colors Cache từ JSON vào RAM
  useEffect(() => {
    if ((window as any).api?.getThemeColorsCache) {
      (window as any).api.getThemeColorsCache().then((cachedColors: any) => {
        if (cachedColors) {
          initThemeColorCache(cachedColors)
        }
      }).catch(() => {})
    }
  }, [])

  // Apply Background & Extract Theme Colors (Quy luật 60/30/10 cho Standard & Lite mode)
  useEffect(() => {
    if (isCore) {
      document.documentElement.style.setProperty('--bg-image', 'none')
      document.documentElement.style.setProperty('--theme-60', '#18181b')
      document.documentElement.style.setProperty('--theme-30', '#27272a')
      document.documentElement.style.setProperty('--theme-10', '#10b981')
      return
    }

    const trackKey = currentTrack?.id || currentTrack?.filePath

    // 1. Áp dụng ngay lập tức màu từ cache JSON nếu đã có sẵn
    if (currentTrack?.themeColors && !isCore) {
      document.documentElement.style.setProperty('--theme-60', currentTrack.themeColors.primary60)
      document.documentElement.style.setProperty('--theme-30', currentTrack.themeColors.secondary30)
      document.documentElement.style.setProperty('--theme-10', currentTrack.themeColors.accent10)
    }

    // 2. Cập nhật ảnh nền giao diện
    if (effectiveBgImage) {
      const sanitizedUrl = effectiveBgImage.replace(/"/g, '\\"')
      document.documentElement.style.setProperty('--bg-image', `url("${sanitizedUrl}")`)
      
      extractThemeColors(effectiveBgImage, trackKey || effectiveBgImage).then(colors => {
        if (colors && !isCore) {
          document.documentElement.style.setProperty('--theme-60', colors.primary60)
          document.documentElement.style.setProperty('--theme-30', colors.secondary30)
          document.documentElement.style.setProperty('--theme-10', colors.accent10)
        }
      })
    } else {
      document.documentElement.style.setProperty('--bg-image', 'none')
      
      const trackCover = trackHighResCover || currentTrack?.coverArtHighRes || currentTrack?.coverArt
      if (trackCover) {
        extractThemeColors(trackCover, trackKey || trackCover).then(colors => {
          if (colors && !isCore) {
            document.documentElement.style.setProperty('--theme-60', colors.primary60)
            document.documentElement.style.setProperty('--theme-30', colors.secondary30)
            document.documentElement.style.setProperty('--theme-10', colors.accent10)
          }
        })
      } else if (!currentTrack?.themeColors) {
        // Fallback về mặc định
        document.documentElement.style.setProperty('--theme-60', '#18181b')
        document.documentElement.style.setProperty('--theme-30', '#27272a')
        document.documentElement.style.setProperty('--theme-10', '#10b981')
      }
    }
  }, [effectiveBgImage, trackHighResCover, currentTrack?.id, currentTrack?.filePath, currentTrack?.themeColors, currentTrack?.coverArt, currentTrack?.coverArtHighRes, isCore])

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-opacity', customBgOpacity.toString())
  }, [customBgOpacity])

  useEffect(() => {
    document.documentElement.style.setProperty('--bg-blur', `${customBgBlur}px`)
  }, [customBgBlur])

  // Change Audio Device
  useEffect(() => {
    if (selectedDeviceId) {
      if (audioRef.current) {
        if (typeof (audioRef.current as any).setSinkId === 'function') {
          (audioRef.current as any).setSinkId(selectedDeviceId).catch(console.error);
        }
      }
      window.api.setAudioDevice(selectedDeviceId)
    }
  }, [selectedDeviceId])

  // --- Chức năng cài đặt ---
  // --- Tag Editor ---
  const openTagEditor = (track: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTrack(track)

    let rawLyrics = ''
    if (typeof track.lyrics === 'string') {
      rawLyrics = track.lyrics
    } else if (typeof track.lyrics === 'object' && track.lyrics !== null) {
      rawLyrics = track.lyrics.text || ''
    }

    setEditTags({ 
      title: track.title || '', 
      artist: track.artist || '', 
      album: track.album || '', 
      genre: (track.genre && track.genre !== 'Unknown' && track.genre !== 'Chưa phân loại') ? track.genre : '',
      lyrics: rawLyrics 
    })
    setEditImagePath(null)
  }

  const handleSelectTagImage = async () => {
    // @ts-ignore
    const path = await window.api.selectImageFile()
    if (path) setEditImagePath(path)
  }

  const saveTags = async () => {
    // @ts-ignore
    const res = await window.api.updateTags(editingTrack.id, editTags, editImagePath)
    if (res.success) {
      showToast(res.note || t('toasts.tagSavedSuccess'), 'success')
      const newCover = res.coverUrl || currentTrack?.coverArt
      setLibraryTracks(prev => prev.map(t => {
        if (t.id === editingTrack.id || t.filePath === editingTrack.filePath) {
          return {
            ...t,
            title: editTags.title,
            artist: editTags.artist,
            album: editTags.album,
            genre: editTags.genre,
            lyrics: editTags.lyrics,
            coverArt: newCover || t.coverArt
          }
        }
        return t
      }))
      if (currentTrack && (currentTrack.id === editingTrack.id || currentTrack.filePath === editingTrack.filePath)) {
        setCurrentTrack({
          ...currentTrack,
          title: editTags.title,
          artist: editTags.artist,
          album: editTags.album,
          genre: editTags.genre,
          lyrics: editTags.lyrics,
          coverArt: newCover || currentTrack.coverArt
        })
      }
      setEditingTrack(null)
      loadLibrary()
    } else alert('Error: ' + res.error)
  }

  // --- Context Menu State & Handlers ---
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const handleTrackContextMenu = (track: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const isInsidePlaylist = activeView === 'playlists' && activePlaylist
    const isInsideUserPlaylist = activeView === 'user-playlists' && activeUserPlaylist

    const userPlaylistSubItems = userPlaylists.map(upl => ({
      id: `upl-${upl.id}`,
      label: upl.name,
      icon: <ListPlus size={14} />,
      onClick: async () => {
        const rawTrackPath = track.id || track.filePath
        // @ts-ignore
        const res = await window.api.addTracksToUserPlaylist(upl.id, [rawTrackPath])
        if (res && res.success) {
          setUserPlaylists(res.playlists)
          showToast(t('toasts.addedToPlaylist', { name: upl.name }), 'success')
        }
      }
    }))

    const folderPlaylistSubItems = playlists.map(pl => ({
      id: `pl-${pl.name}`,
      label: pl.name,
      icon: <Disc size={14} />,
      onClick: async () => {
        const rawTrackPath = track.id || track.filePath
        // @ts-ignore
        await window.api.addTrackToPlaylist(pl.name, rawTrackPath)
        showToast(t('toasts.addedToPlaylist', { name: pl.name }), 'success')
        loadLibrary()
      }
    }))

    const playlistSubItems = [
      {
        id: 'new-user-playlist',
        label: '+ ' + t('userPlaylistsView.createPlaylist'),
        icon: <Plus size={14} className="text-theme-10" />,
        onClick: () => {
          setShowCreateUserPlaylistModal(true)
        }
      },
      ...(userPlaylistSubItems.length > 0 ? [{ id: 'div-upl', label: '', divider: true }, ...userPlaylistSubItems] : []),
      ...(folderPlaylistSubItems.length > 0 ? [{ id: 'div-fpl', label: '', divider: true }, ...folderPlaylistSubItems] : [])
    ]

    const items: ContextMenuItem[] = [
      {
        id: 'play',
        label: t('contextMenu.play'),
        icon: <Play size={14} />,
        onClick: () => handleRowClick(track, libraryTracks)
      },
      {
        id: 'add-queue',
        label: t('contextMenu.addQueue'),
        icon: <ListPlus size={14} />,
        onClick: () => {
          setPlayQueue(prev => [...prev, track])
          showToast(t('toasts.addedToQueue', { title: track.title }), 'success')
        }
      },
      {
        id: 'add-to-playlist',
        label: t('contextMenu.addToPlaylist'),
        icon: <FolderPlus size={14} />,
        subItems: playlistSubItems
      },
      { id: 'div-1', label: '', divider: true },
      {
        id: 'edit-tags',
        label: t('contextMenu.editTags'),
        icon: <Edit2 size={14} />,
        disabled: track.isCloud,
        onClick: () => openTagEditor(track, e)
      },
      {
        id: 'show-in-folder',
        label: t('contextMenu.showInFolder'),
        icon: <FolderOpen size={14} />,
        disabled: track.isCloud,
        onClick: async () => {
          const rawTrackPath = track.id || track.filePath
          // @ts-ignore
          await window.api.showInFolder(rawTrackPath)
        }
      },
      { id: 'div-2', label: '', divider: true }
    ]

    if (isInsideUserPlaylist) {
      items.push({
        id: 'remove-from-user-playlist',
        label: t('userPlaylistsView.removeFromPlaylist'),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => {
          showConfirm({
            title: t('userPlaylistsView.removeFromPlaylist'),
            message: t('userPlaylistsView.confirmRemove', { title: track.title }),
            danger: true,
            onConfirm: async () => {
              const rawTrackPath = track.id || track.filePath
              // @ts-ignore
              const res = await window.api.removeTrackFromUserPlaylist(activeUserPlaylist.id, rawTrackPath)
              if (res && res.success) {
                setUserPlaylists(res.playlists)
                showToast(t('toasts.removedFromPlaylist'), 'success')
              }
            }
          })
        }
      })
    } else if (isInsidePlaylist) {
      items.push({
        id: 'remove-from-playlist',
        label: t('contextMenu.removeFromPlaylist', { name: activePlaylist.name }),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => {
          showConfirm({
            title: t('contextMenu.removeFromPlaylist', { name: activePlaylist.name }),
            message: t('contextMenu.confirmRemoveFromPlaylist', { title: track.title, name: activePlaylist.name }),
            danger: true,
            onConfirm: async () => {
              const rawTrackPath = track.id || track.filePath
              // @ts-ignore
              await window.api.deleteTrack(rawTrackPath, false)
              showToast(t('toasts.removedFromPlaylist'), 'success')
              loadLibrary()
            }
          })
        }
      })
    }

    items.push({
      id: 'delete-permanent',
      label: t('contextMenu.deleteFile'),
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: track.isCloud,
      onClick: () => {
        showConfirm({
          title: t('contextMenu.deleteFile'),
          message: t('contextMenu.confirmDeleteFile', { title: track.title }),
          danger: true,
          onConfirm: async () => {
            const rawTrackPath = track.id || track.filePath
            // @ts-ignore
            const res = await window.api.deleteTrack(rawTrackPath, true)
            if (res && res.success) {
              showToast(t('toasts.movedToTrash', { title: track.title }), 'success')
              loadLibrary()
            } else {
              showAlert({ title: t('common.error'), message: 'Error deleting track: ' + res?.error })
            }
          }
        })
      }
    })

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handlePlaylistContextMenu = (pl: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const items: ContextMenuItem[] = [
      {
        id: 'play-all',
        label: t('contextMenu.playAll'),
        icon: <Play size={14} />,
        disabled: !pl.tracks || pl.tracks.length === 0,
        onClick: () => {
          if (pl.tracks && pl.tracks.length > 0) {
            handleRowClick(pl.tracks[0], pl.tracks)
          }
        }
      },
      {
        id: 'add-songs',
        label: t('contextMenu.addSongs'),
        icon: <Plus size={14} />,
        onClick: () => {
          setActivePlaylist(pl)
          setShowAddSongsModal(true)
        }
      },
      { id: 'div-1', label: '', divider: true },
      {
        id: 'rename-playlist',
        label: t('contextMenu.renamePlaylist'),
        icon: <Edit2 size={14} />,
        onClick: () => setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name, id: undefined })
      },
      {
        id: 'change-cover',
        label: t('contextMenu.changeCover'),
        icon: <ImageIcon size={14} />,
        onClick: () => handleChangePlaylistImage(pl.name)
      },
      {
        id: 'extract-cover',
        label: t('contextMenu.extractCover'),
        icon: <Sparkles size={14} />,
        disabled: !pl.tracks || pl.tracks.length === 0,
        onClick: () => handleExtractPlaylistImage(pl.name)
      },
      {
        id: 'show-in-folder',
        label: t('contextMenu.openPlaylistFolder'),
        icon: <FolderOpen size={14} />,
        onClick: async () => {
          // @ts-ignore
          await window.api.showInFolder(pl.path)
        }
      },
      { id: 'div-2', label: '', divider: true },
      {
        id: 'delete-playlist',
        label: t('contextMenu.deletePlaylist', { name: pl.name }),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => {
          showConfirm({
            title: t('contextMenu.deletePlaylist', { name: pl.name }),
            message: t('contextMenu.confirmDeletePlaylist', { name: pl.name }),
            danger: true,
            onConfirm: async () => {
              // @ts-ignore
              const res = await window.api.deletePlaylist(pl.name)
              if (res && res.success) {
                showToast(t('toasts.playlistDeleted', { name: pl.name }), 'success')
                if (activePlaylist?.name === pl.name) setActivePlaylist(null)
                loadLibrary()
              } else {
                showAlert({ title: t('common.error'), message: 'Error deleting playlist: ' + res?.error })
              }
            }
          })
        }
      }
    ]

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handleUserPlaylistContextMenu = (upl: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const resolvedTracks = getResolvedUserPlaylistTracks(upl)

    const items: ContextMenuItem[] = [
      {
        id: 'play-all',
        label: t('userPlaylistsView.playAll'),
        icon: <Play size={14} />,
        disabled: resolvedTracks.length === 0,
        onClick: () => {
          if (resolvedTracks.length > 0) {
            handleRowClick(resolvedTracks[0], resolvedTracks)
          }
        }
      },
      {
        id: 'add-songs',
        label: t('userPlaylistsView.addSongs'),
        icon: <Plus size={14} />,
        onClick: () => {
          setActiveUserPlaylist(upl)
          setShowAddSongsToUserPlaylistModal(true)
        }
      },
      { id: 'div-1', label: '', divider: true },
      {
        id: 'edit-playlist',
        label: t('modals.editPlaylist.title'),
        icon: <Edit2 size={14} />,
        onClick: () => {
          setEditingUserPlaylist(upl)
          setShowEditUserPlaylistModal(true)
        }
      },
      { id: 'div-2', label: '', divider: true },
      {
        id: 'delete-playlist',
        label: t('userPlaylistsView.deletePlaylist'),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => handleDeleteUserPlaylist(upl)
      }
    ]

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handleArtistContextMenu = (artist: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const items: ContextMenuItem[] = [
      {
        id: 'play-all',
        label: t('artistsView.playAll'),
        icon: <Play size={14} />,
        disabled: !artist.tracks || artist.tracks.length === 0,
        onClick: () => {
          if (artist.tracks && artist.tracks.length > 0) {
            handleRowClick(artist.tracks[0], artist.tracks)
          }
        }
      },
      {
        id: 'add-queue',
        label: t('contextMenu.addQueue'),
        icon: <ListPlus size={14} />,
        onClick: () => {
          setPlayQueue(prev => [...prev, ...(artist.tracks || [])])
          showToast(t('toasts.addedToQueue', { title: artist.name }), 'success')
        }
      }
    ]

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  // ==========================================
  // 4. MEMOS
  // ==========================================
  const libraryTracksMap = useMemo(() => {
    const map = new Map<string, any>()
    for (const t of libraryTracks) {
      if (t.id) map.set(t.id, t)
      if (t.filePath) map.set(t.filePath, t)
    }
    return map
  }, [libraryTracks])

  const getResolvedUserPlaylistTracks = useCallback((upl: any) => {
    if (!upl || !Array.isArray(upl.trackIds)) return []
    const resolved: any[] = []
    for (const trackId of upl.trackIds) {
      const found = libraryTracksMap.get(trackId)
      if (found) {
        resolved.push(found)
      } else {
        const title = trackId.split('/').pop()?.split('\\').pop() || trackId
        resolved.push({
          id: trackId,
          filePath: trackId,
          title: title.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown',
          album: 'Unknown',
          duration: 0,
          isCloud: false
        })
      }
    }
    return resolved
  }, [libraryTracksMap])

  const activeUserPlaylistTracks = useMemo(() => {
    if (!activeUserPlaylist) return []
    const resolved = getResolvedUserPlaylistTracks(activeUserPlaylist)
    const filtered = getFilteredTracks(resolved)
    return getSortedTracks(filtered)
  }, [activeUserPlaylist, getResolvedUserPlaylistTracks, searchQuery, sortField, sortOrder])

  const artistsData = useMemo(() => {
    const artistMap = new Map<string, {
      name: string
      tracks: any[]
      albums: Map<string, any[]>
      coverArt: string | null
    }>()

    for (const track of libraryTracks) {
      let rawArtists: string[] = []
      if (Array.isArray(track.artists) && track.artists.length > 0) {
        rawArtists = track.artists
      } else if (track.artist && track.artist.trim() && track.artist.toLowerCase() !== 'unknown') {
        rawArtists = track.artist.split(/\s*,\s*|\s*;\s*|\s*\/\s*|\s*&\s*/).map((s: string) => s.trim()).filter(Boolean)
      }

      if (rawArtists.length === 0) {
        rawArtists = [language === 'vi' ? 'Nghệ sĩ chưa rõ' : 'Unknown Artist']
      }

      for (const artistName of rawArtists) {
        if (!artistMap.has(artistName)) {
          artistMap.set(artistName, {
            name: artistName,
            tracks: [],
            albums: new Map(),
            coverArt: null
          })
        }
        const item = artistMap.get(artistName)!
        item.tracks.push(track)
        if (!item.coverArt && track.coverArt) {
          item.coverArt = track.coverArt
        }
        const albumName = (track.album && track.album.trim() && track.album.toLowerCase() !== 'unknown') ? track.album.trim() : null
        if (albumName) {
          if (!item.albums.has(albumName)) {
            item.albums.set(albumName, [])
          }
          item.albums.get(albumName)!.push(track)
        }
      }
    }

    const artistsList = Array.from(artistMap.values()).map(a => ({
      name: a.name,
      tracks: a.tracks,
      albums: Array.from(a.albums.entries()).map(([title, tracks]) => ({
        title,
        tracks,
        coverArt: tracks.find(t => t.coverArt)?.coverArt || a.coverArt,
        year: tracks.find(t => t.year)?.year || null
      })),
      albumCount: a.albums.size,
      trackCount: a.tracks.length,
      coverArt: a.coverArt
    }))

    // Sắp xếp theo thứ tự bảng chữ cái
    artistsList.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    // Gom nhóm theo chữ cái đầu (A-Z, 0-9, #)
    const letterMap = new Map<string, typeof artistsList>()
    for (const artist of artistsList) {
      let firstChar = artist.name.charAt(0).toUpperCase()
      const normalized = firstChar.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const groupKey = /[A-Z]/.test(normalized) ? normalized : (/[0-9]/.test(firstChar) ? '0-9' : '#')
      if (!letterMap.has(groupKey)) {
        letterMap.set(groupKey, [])
      }
      letterMap.get(groupKey)!.push(artist)
    }

    const alphabetGroups = Array.from(letterMap.entries()).map(([letter, list]) => ({
      letter,
      count: list.length,
      artists: list
    }))

    alphabetGroups.sort((a, b) => {
      if (a.letter === '#') return 1
      if (b.letter === '#') return -1
      if (a.letter === '0-9') return 1
      if (b.letter === '0-9') return -1
      return a.letter.localeCompare(b.letter)
    })

    return { artistsList, alphabetGroups }
  }, [libraryTracks, language])

  const genresData = useMemo(() => {
    const genreMap = new Map<string, {
      name: string
      tracks: any[]
      artists: Set<string>
      albums: Set<string>
      coverArts: string[]
    }>()

    for (const track of libraryTracks) {
      const rawGenre = track.genre || 'Unknown'
      const splitGenres = String(rawGenre).split(/[,;/|]+/).map(g => g.trim()).filter(Boolean)
      const list = splitGenres.length > 0 ? splitGenres : ['Unknown']

      for (const g of list) {
        const normalized = g.toLowerCase() === 'unknown' ? (language === 'vi' ? 'Chưa phân loại' : 'Unknown') : g
        if (!genreMap.has(normalized)) {
          genreMap.set(normalized, {
            name: normalized,
            tracks: [],
            artists: new Set(),
            albums: new Set(),
            coverArts: []
          })
        }
        const item = genreMap.get(normalized)!
        item.tracks.push(track)
        if (track.artist && track.artist !== 'Unknown') item.artists.add(track.artist)
        if (track.album && track.album !== 'Unknown') item.albums.add(track.album)
        if (track.coverArt && item.coverArts.length < 4 && !item.coverArts.includes(track.coverArt)) {
          item.coverArts.push(track.coverArt)
        }
      }
    }

    const genresList = Array.from(genreMap.values()).map(g => ({
      name: g.name,
      tracks: g.tracks,
      artistCount: g.artists.size,
      albumCount: g.albums.size,
      trackCount: g.tracks.length,
      coverArts: g.coverArts,
      artists: Array.from(g.artists)
    }))

    // Sắp xếp theo số lượng bài hát giảm dần, đưa 'Chưa phân loại'/'Unknown' về cuối
    genresList.sort((a, b) => {
      const isAUnknown = a.name === 'Unknown' || a.name === 'Chưa phân loại'
      const isBUnknown = b.name === 'Unknown' || b.name === 'Chưa phân loại'
      if (isAUnknown && !isBUnknown) return 1
      if (!isAUnknown && isBUnknown) return -1
      return b.trackCount - a.trackCount
    })

    return genresList
  }, [libraryTracks, language])

  const processedLibraryTracks = useMemo(() => {
    const filtered = getFilteredTracks(libraryTracks)
    return getSortedTracks(filtered)
  }, [libraryTracks, searchQuery, sortField, sortOrder])

  const processedPlaylistTracks = useMemo(() => {
    if (!activePlaylist) return []
    const filtered = getFilteredTracks(activePlaylist.tracks)
    return getSortedTracks(filtered)
  }, [activePlaylist, searchQuery, sortField, sortOrder])

  const processedGenreTracks = useMemo(() => {
    if (!activeGenre) return []
    const filtered = getFilteredTracks(activeGenre.tracks)
    return getSortedTracks(filtered)
  }, [activeGenre, searchQuery, sortField, sortOrder])

  const matchedPlaylists = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    return lowerQuery ? playlists.filter(pl => pl.name.toLowerCase().includes(lowerQuery)) : playlists
  }, [playlists, searchQuery])

  const matchedUserPlaylists = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()
    return lowerQuery ? userPlaylists.filter(pl => pl.name.toLowerCase().includes(lowerQuery)) : userPlaylists
  }, [userPlaylists, searchQuery])

  // Lấy Sample Rate chuẩn của bài hát hiện tại (Mặc định 44100Hz nếu không rõ)
  const currentSampleRate = currentTrack?.sampleRate && currentTrack.sampleRate >= 8000 && currentTrack.sampleRate <= 384000 
    ? currentTrack.sampleRate 
    : 44100;


  // ==========================================
  // 5. EFFECTS
  // ==========================================

  // Tự động đồng bộ Active Genre khi thư viện thay đổi
  useEffect(() => {
    if (activeGenre) {
      const updated = genresData.find(g => g.name === activeGenre.name);
      if (updated) {
        setActiveGenre(updated);
      }
    }
  }, [genresData]);

  // Tự động đồng bộ Active Artist khi thư viện thay đổi
  useEffect(() => {
    if (activeArtist) {
      const updated = artistsData.artistsList.find(a => a.name === activeArtist.name);
      if (updated) {
        setActiveArtist(updated);
      }
    }
  }, [artistsData]);

  // Get audio output devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput')
        setAudioDevices(audioOutputs)
      } catch (err) {
        console.error("Lỗi lấy danh sách thiết bị:", err)
      }
    }
    getDevices()
    navigator.mediaDevices.addEventListener('devicechange', getDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices)
  }, [])

  // Fetch Original High-Res Cover for Fullscreen Lyrics
  useEffect(() => {
    if (!isLyricsMaximized || isLite || !currentTrack) {
      setOriginalCover(null)
      return
    }
    // Tải tăng cường: Nếu là nhạc Online, nạp thẳng URL ảnh cực nét ẩn
    if (currentTrack.isOnline) {
      setOriginalCover(currentTrack.coverArtHighRes || currentTrack.coverArt)
    } 
    else if (!currentTrack.isCloud && currentTrack.coverArt?.includes('.thumbnails')) {
      let isCurrent = true
      // @ts-ignore
      window.api.getOriginalTrackCover(currentTrack.id || currentTrack.filePath).then(cover => {
        if (isCurrent && cover) setOriginalCover(cover)
      })
      return () => { isCurrent = false }
    } else {
      setOriginalCover(currentTrack.coverArt)
    }
  }, [isLyricsMaximized, currentTrack?.id, isLite])

  // Apply device change
  useEffect(() => {
    const applyDevice = async () => {
      try {
        // TỐI ƯU HÓA: Chromium yêu cầu dùng chuỗi rỗng '' cho thiết bị mặc định
        const targetId = selectedDeviceId === 'default' ? '' : selectedDeviceId;
        if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
          await (audioRef.current as any).setSinkId(targetId)
        }
        if (audioCtxRef.current && typeof (audioCtxRef.current as any).setSinkId === 'function') {
          await (audioCtxRef.current as any).setSinkId(targetId)
        }
      } catch (error) {
        console.error("Lỗi khi chuyển đổi thiết bị âm thanh:", error)
      }
    }
    applyDevice()
  }, [selectedDeviceId])

  // Download Progress Listener
  useEffect(() => {
    if ((window as any).api?.onDownloadProgress) {
      (window as any).api.onDownloadProgress((data: any) => {
        setDownloadProgress(data)
      })
    }
  }, [])

  // Load Config
  useEffect(() => {
    // @ts-ignore
    window.api.getConfig().then(cfg => {
      if (cfg.volume !== undefined) setVolume(cfg.volume)
      if (cfg.crossfadeEnabled !== undefined) setCrossfadeEnabled(cfg.crossfadeEnabled)
      if (cfg.bitPerfectEnabled !== undefined) setBitPerfectEnabled(cfg.bitPerfectEnabled)
      if (cfg.crossfadeDuration !== undefined) setCrossfadeDuration(cfg.crossfadeDuration)
      if (cfg.eqBands) setEqBands(cfg.eqBands)
      if (cfg.isEqEnabled !== undefined) setIsEqEnabled(cfg.isEqEnabled)
      if (cfg.googleDriveApiKey) setGoogleDriveApiKey(cfg.googleDriveApiKey)
      if (cfg.driveLink) setDriveLink(cfg.driveLink) 
      if (cfg.selectedDeviceId) setSelectedDeviceId(cfg.selectedDeviceId)
      if (cfg.showVisualizer !== undefined) if (!cfg.bitPerfectEnabled) setShowVisualizer(cfg.showVisualizer)
      if (cfg.minimizeToTray !== undefined) setMinimizeToTray(cfg.minimizeToTray)
      if (cfg.closeToTray !== undefined) setCloseToTray(cfg.closeToTray)
      if (cfg.appMode !== undefined) setAppMode(cfg.appMode)
      else if (cfg.liteMode !== undefined) setAppMode(cfg.liteMode ? 'lite' : 'default') // Fallback cấu hình cũ
      if (cfg.customBgImage !== undefined) {
        setCustomBgImage(cfg.customBgImage);
        setBgImageInput(cfg.customBgImage || '');
      }
      if (cfg.useTrackCoverAsBg !== undefined) setUseTrackCoverAsBg(cfg.useTrackCoverAsBg)
      if (cfg.customBgOpacity !== undefined) setCustomBgOpacity(cfg.customBgOpacity)
      if (cfg.customBgBlur !== undefined) setCustomBgBlur(cfg.customBgBlur)
      if (cfg.ytCookie) {
        setIsYtmLoggedIn(true)
        fetchDashboard()
      }
      if (cfg.scUserInfo) {
        setScUser(cfg.scUserInfo)
      }
      if (cfg.discordRpc) {
        if (cfg.discordRpc.enabled !== undefined) setDiscordRpcEnabled(cfg.discordRpc.enabled)
        if (cfg.discordRpc.clientId !== undefined) setDiscordClientId(cfg.discordRpc.clientId)
        if (cfg.discordRpc.showDetails !== undefined) setDiscordShowDetails(cfg.discordRpc.showDetails)
        if (cfg.discordRpc.showTime !== undefined) setDiscordShowTime(cfg.discordRpc.showTime)
        if (cfg.discordRpc.showCover !== undefined) setDiscordShowCover(cfg.discordRpc.showCover)
        if (cfg.discordRpc.showQuality !== undefined) setDiscordShowQuality(cfg.discordRpc.showQuality)
        if (cfg.discordRpc.showButtons !== undefined) setDiscordShowButtons(cfg.discordRpc.showButtons)
        if (cfg.discordRpc.showIdle !== undefined) setDiscordShowIdle(cfg.discordRpc.showIdle)
      }
      fetchScDashboard()
      setIsConfigLoaded(true)
      loadLibrary()
    })
  }, [])

  // Auto-save Config & Update Tray
  useEffect(() => {
    if (!isConfigLoaded) return; // Không lưu cấu hình mặc định vào file khi chưa đọc xong
    // @ts-ignore
    window.api.saveConfig({ 
      volume, crossfadeEnabled, crossfadeDuration, bitPerfectEnabled, eqBands, isEqEnabled, googleDriveApiKey,
      driveLink, selectedDeviceId, showVisualizer, minimizeToTray, closeToTray, appMode,
      customBgImage, customBgOpacity, customBgBlur, useTrackCoverAsBg
    }) 
    // @ts-ignore
    window.api.updateTrayConfig({ minimizeToTray, closeToTray })
  }, [volume, crossfadeEnabled, crossfadeDuration, bitPerfectEnabled, eqBands, isEqEnabled, googleDriveApiKey, driveLink, selectedDeviceId, showVisualizer, minimizeToTray, closeToTray, appMode, customBgImage, customBgOpacity, customBgBlur, useTrackCoverAsBg, isConfigLoaded])

  // Dominant Color (Bỏ qua hoàn toàn trong Core Mode và Lite Mode)
  useEffect(() => {
    if (isLite || isCore || effectiveBgImage) {
      setThemeColor('transparent') // Không dùng màu nền đè lên ảnh nền
      return
    }
    if (currentTrack?.coverArt) {
      getDominantColor(currentTrack.coverArt, setThemeColor)
    } else {
      setThemeColor('rgba(39, 39, 42, 0)')
    }
  }, [currentTrack, isLite, isCore, effectiveBgImage])

  // SMART MEMORY RECOVERY (DỌN DẸP BỘ NHỚ THÔNG MINH - 0% GIẬT LAG)
  // 1. Dọn dẹp khi đổi bài hát (trì hoãn 1.5s để UI ổn định trước)
  useEffect(() => {
    if (!currentTrack) return
    const timer = setTimeout(() => {
      // @ts-ignore
      window.api?.clearMemoryCache?.()
    }, 1500)
    return () => clearTimeout(timer)
  }, [currentTrack?.id])

  // 2. Dọn dẹp sâu khi ứng dụng thu nhỏ hoặc nhận sự kiện onDeepClean từ Main Process
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // @ts-ignore
        window.api?.clearMemoryCache?.()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // @ts-ignore
    if (window.api?.onDeepClean) {
      // @ts-ignore
      window.api.onDeepClean(() => {
        // @ts-ignore
        window.api?.clearMemoryCache?.()
      })
    }

    // 3. Chu kỳ kiểm tra dọn dẹp nhàn rỗi (mỗi 4 phút khi chạy ngầm)
    const idleInterval = setInterval(() => {
      if (document.hidden) {
        // @ts-ignore
        window.api?.clearMemoryCache?.()
      }
    }, 240000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(idleInterval)
    }
  }, [])

  // DISCORD RICH PRESENCE SYNC
  const updateDiscordSettings = (updates: Partial<{
    enabled: boolean
    clientId: string
    showDetails: boolean
    showTime: boolean
    showCover: boolean
    showQuality: boolean
    showButtons: boolean
    showIdle: boolean
  }>) => {
    if (updates.enabled !== undefined) setDiscordRpcEnabled(updates.enabled)
    if (updates.clientId !== undefined) setDiscordClientId(updates.clientId)
    if (updates.showDetails !== undefined) setDiscordShowDetails(updates.showDetails)
    if (updates.showTime !== undefined) setDiscordShowTime(updates.showTime)
    if (updates.showCover !== undefined) setDiscordShowCover(updates.showCover)
    if (updates.showQuality !== undefined) setDiscordShowQuality(updates.showQuality)
    if (updates.showButtons !== undefined) setDiscordShowButtons(updates.showButtons)
    if (updates.showIdle !== undefined) setDiscordShowIdle(updates.showIdle)

    // @ts-ignore
    if (window.api && window.api.discordUpdateConfig) {
      // @ts-ignore
      window.api.discordUpdateConfig(updates)
    }
  }

  // Periodic Discord RPC connection status check
  useEffect(() => {
    const checkStatus = () => {
      // @ts-ignore
      if (window.api && window.api.discordGetStatus) {
        // @ts-ignore
        window.api.discordGetStatus().then((st: any) => {
          if (st) setDiscordConnected(Boolean(st.isConnected))
        }).catch(() => {})
      }
    }
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Send Discord Rich Presence updates
  const sendDiscordPresence = useCallback((override?: { isPlaying?: boolean; position?: number }) => {
    // @ts-ignore
    if (!window.api || !window.api.discordUpdatePresence) return

    if (!currentTrack) {
      // @ts-ignore
      window.api.discordUpdatePresence({ isPlaying: false })
      return
    }

    let onlineUrl: string | null = null
    if (currentTrack.isOnline) {
      if (currentTrack.platform === 'soundcloud') {
        onlineUrl = currentTrack.permalinkUrl || currentTrack.url || currentTrack.id
      } else if (currentTrack.videoId) {
        onlineUrl = `https://music.youtube.com/watch?v=${currentTrack.videoId}`
      }
    }

    const curPos = override?.position !== undefined 
      ? override.position 
      : (bitPerfectEnabled ? ((audioRef.current as any)?._currentTime || 0) : (audioRef.current?.currentTime || 0))
    
    const curPlaying = override?.isPlaying !== undefined ? override.isPlaying : isPlaying

    const curDur = bitPerfectEnabled 
      ? ((audioRef.current as any)?._duration || currentTrack.duration || 0) 
      : (audioRef.current?.duration || currentTrack.duration || 0)

    // @ts-ignore
    window.api.discordUpdatePresence({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      duration: curDur,
      position: curPos,
      isPlaying: curPlaying,
      coverArt: currentTrack.coverArt,
      isOnline: currentTrack.isOnline,
      platform: currentTrack.platform,
      onlineUrl: onlineUrl,
      format: currentTrack.format,
      bitrate: currentTrack.bitrate,
      sampleRate: currentTrack.sampleRate,
      bitDepth: currentTrack.bitDepth
    })
  }, [currentTrack, isPlaying, bitPerfectEnabled])

  useEffect(() => {
    if (isConfigLoaded) {
      sendDiscordPresence()
    }
  }, [currentTrack?.id, currentTrack?.filePath, currentTrack?.title, isPlaying, isConfigLoaded, sendDiscordPresence])

  // Audio Context & Cấu trúc luồng Bit-perfect
  // EFFECT 1: CHỈ KHỞI TẠO LẠI BỘ LỌC KHI ĐỔI BÀI HOẶC BẬT/TẮT EQ (Tiết kiệm CPU)
  useEffect(() => {
    if (!audioRef.current) return
    const setupAudio = async () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        try { audioCtxRef.current = new AudioContextClass() } 
        catch (e) { audioCtxRef.current = new AudioContextClass() }
        
        // Bơm lại thiết bị đầu ra cho Context mới ngay khi nó vừa được tái tạo
        const targetId = selectedDeviceRef.current === 'default' ? '' : selectedDeviceRef.current;
        if (typeof (audioCtxRef.current as any).setSinkId === 'function') {
          (audioCtxRef.current as any).setSinkId(targetId).catch(console.error);
        }
      }
      const ctx = audioCtxRef.current
      if (!analyserNodeRef.current) { 
        analyserNodeRef.current = ctx.createAnalyser()
        analyserNodeRef.current.fftSize = 2048 
      }
      if (!sourceNodeRef.current) {
        try { 
          if (!audioRef.current || !(audioRef.current instanceof HTMLAudioElement)) return
          sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current) 
        } catch (e) { 
          console.warn('[setupAudio] createMediaElementSource failed:', e)
          return 
        }
      }
      if (!preampNodeRef.current) {
        preampNodeRef.current = ctx.createGain()
      }

      try { sourceNodeRef.current.disconnect() } catch (e) {}
      try { preampNodeRef.current.disconnect() } catch (e) {}
      filterNodesRef.current.forEach(node => {
        try {
          node.disconnect()
          node.frequency.cancelScheduledValues(0) 
          node.gain.cancelScheduledValues(0)
        } catch (e) {}
      })
      filterNodesRef.current = []

      // Độ lợi tuyến tính của Preamp: G = 10^(dB / 20)
      const linearPreamp = isEqEnabled ? Math.pow(10, preampGain / 20) : 1.0
      preampNodeRef.current.gain.value = linearPreamp

      if (isCore) {
        // CHẾ ĐỘ CỐT LÕI (CORE MODE): DIRECT STREAMING (0% DSP, 0% CPU, Bit-Perfect)
        sourceNodeRef.current.connect(ctx.destination)
        return
      }

      let prevNode: AudioNode = sourceNodeRef.current
      if (isEqEnabled) {
        // Nối qua GainNode Preamp trước khi vào các BiquadFilter EQ
        prevNode.connect(preampNodeRef.current)
        prevNode = preampNodeRef.current

        const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
        sortedBands.forEach((band) => {
          const filter = ctx.createBiquadFilter()
          filter.type = band.type || 'peaking'
          filter.frequency.value = band.frequency
          filter.gain.value = band.gain
          filter.Q.value = band.q ?? 1.4
          prevNode.connect(filter)
          prevNode = filter
          filterNodesRef.current.push(filter)
        })
      }
      prevNode.connect(analyserNodeRef.current)
      analyserNodeRef.current.connect(ctx.destination)
    }
    setupAudio().catch(e => console.error('[setupAudio error]', e))
  }, [isEqEnabled, isCore, eqBands.length])

  // EFFECT 2: THAY ĐỔI EQ & PREAMP REALTIME (0% CPU - Chỉ thay thế thông số, không nối lại Graph)
  useEffect(() => {
    if (preampNodeRef.current) {
      const linearPreamp = isEqEnabled ? Math.pow(10, preampGain / 20) : 1.0
      preampNodeRef.current.gain.value = linearPreamp
    }
    if (!isEqEnabled || filterNodesRef.current.length === 0) return
    const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
    sortedBands.forEach((band, index) => {
      const filter = filterNodesRef.current[index]
      if (filter) {
        // Thuật toán gán số trực tiếp, phản hồi thời gian thực
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        filter.Q.value = band.q ?? 1.4
        filter.type = band.type || 'peaking'
      }
    })
  }, [eqBands, isEqEnabled, preampGain])

  // Track Cover Loading
  useEffect(() => {
    if (isLite) return
    let isCurrent = true 
    if (currentTrack && !currentTrack.isCloud && currentTrack.coverArt?.includes('.thumbnails')) {
      // @ts-ignore
      window.api.getTrackCover(currentTrack.id || currentTrack.filePath).then(highResCover => {
        if (isCurrent && highResCover) {
          setCurrentTrack((prev: any) => ({ ...prev, coverArt: highResCover }))
        }
      })
    }
    return () => { isCurrent = false }
  }, [currentTrack?.id])

  // Audio Playing Effect
  useEffect(() => {
    if (bitPerfectEnabled) return;
    if (audioRef.current && audioCtxRef.current) {
      if (isPlaying) {
        // Đánh thức lại AudioContext khi bấm Play
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {})
        }
        
        audioRef.current.play().catch(e => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e)
        })
        if (crossfadeEnabled) {
          audioRef.current.volume = 0
          const step = volume / (crossfadeDuration * 20)
          const fadeInterval = setInterval(() => {
            if (audioRef.current && audioRef.current.volume + step < volume) {
              audioRef.current.volume += step
            } else {
              if (audioRef.current) audioRef.current.volume = volume
              clearInterval(fadeInterval)
            }
          }, 50)
        } else {
          audioRef.current.volume = volume
        }
      } else {
        audioRef.current.pause()
        // ĐÓNG BĂNG toàn bộ xử lý âm thanh (EQ, Visualizer) khi dừng nhạc
        if (audioCtxRef.current.state === 'running') {
          audioCtxRef.current.suspend().catch(() => {})
        }
      }
    }
  }, [isPlaying, currentTrack, bitPerfectEnabled])

  // Load Lyrics
  useEffect(() => {
    if (isLite || !currentTrack) {
      setLyrics([])
      return
    }

    const trackPath = currentTrack.id || currentTrack.filePath

    const loadLyrics = async () => {
      let externalLrc = null
      if (trackPath && (window as any).api?.readLrcFile) {
        try { externalLrc = await (window as any).api.readLrcFile(trackPath) } catch (e) {}
      }

      if (externalLrc) {
        const parsedExternal = parseLRC(externalLrc)
        if (parsedExternal.length > 0) {
          setLyrics(parsedExternal)
          return
        }
      }

      if (currentTrack.lyrics) {
        const parsedInternal = parseLRC(currentTrack.lyrics)
        if (parsedInternal.length > 0) {
          setLyrics(parsedInternal)
          return
        }
      }

      if (currentTrack.title && currentTrack.artist && !currentTrack.artist.toLowerCase().includes('unknown')) {
        try {
          // @ts-ignore
          const mmRes = await window.api.fetchMusixmatchLyrics(currentTrack.title, currentTrack.artist)
          if (mmRes.success && mmRes.lyrics) {
            if (mmRes.isSynced) setLyrics(parseLRC(mmRes.lyrics))
            else setLyrics([{ time: 0, text: mmRes.lyrics + '\n\n---\n(Lời bài hát được cung cấp bởi Musixmatch)' }])
            return
          }
        } catch (e) {
          console.error("Lỗi lấy lời Musixmatch", e)
        }
      }

      setLyrics([])
    }

    loadLyrics()
  }, [currentTrack])

  // Sync Lyrics & Preload Buffer Next Track
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      // --- LOGIC 1: ĐỒNG BỘ LỜI BÀI HÁT (Chỉ cập nhật khi giao diện đang mở trên màn hình) ---
      if (!document.hidden && lyrics.length > 0) {
        const visualTime = audio.currentTime + 0.3
        const index = lyrics.findIndex((line, i) => {
          const nextLine = lyrics[i + 1]
          if (nextLine) return visualTime >= line.time && visualTime < nextLine.time
          return visualTime >= line.time
        })
        if (index !== currentLyricIndex) setCurrentLyricIndex(index)
      } else if (!document.hidden && currentLyricIndex !== -1 && lyrics.length === 0) {
        setCurrentLyricIndex(-1)
      }

      // --- LOGIC 2: PRELOAD BUFFER BÀI TIẾP THEO ---
      // Nếu chỉ còn 15 giây là hết bài, chuẩn bị tải bài kế tiếp
      if (audio.duration && (audio.duration - audio.currentTime < 15) && playQueue.length > 0) {
        const currentIndex = playQueue.findIndex(t => t.id === currentTrack?.id);
        let nextIndex = currentIndex + 1;
        if (nextIndex >= playQueue.length) nextIndex = (repeatMode > 0) ? 0 : -1;

        if (nextIndex !== -1) {
          const nextTrack = playQueue[nextIndex];
          // Nếu bài tiếp theo là nhạc Online và chưa được preload
          if (nextTrack.isOnline && nextTrack.originalId && preloadedRef.current !== nextTrack.originalId) {
            preloadedRef.current = nextTrack.originalId;
            // @ts-ignore
            window.api.preloadStream(nextTrack.originalId); // Gọi Backend ngầm bóc tách URL trước
          }
        }
      }

      // --- LOGIC 3: CROSSFADE CHUYỂN BÀI TỰ ĐỘNG ---
      if (crossfadeEnabled && !bitPerfectEnabled && !currentTrack?.isOnline && audio.duration > crossfadeDuration) {
        const timeLeft = audio.duration - audio.currentTime
        if (timeLeft <= crossfadeDuration && timeLeft > 0 && !crossfadeTriggeredRef.current) {
          crossfadeTriggeredRef.current = true
          handleNext()
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [lyrics, currentLyricIndex, playQueue, currentTrack, repeatMode, crossfadeEnabled, crossfadeDuration, bitPerfectEnabled, handleNext])

  // Scroll Active Lyric
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLyricIndex])

  // In-App Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      // Space / K -> Play / Pause
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault()
        handlePlayPause()
        return
      }

      // ArrowRight -> Seek +5s
      if (e.code === 'ArrowRight' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (bitPerfectEnabled) {
          window.api.mpvSeek(5)
        } else if (audioRef.current && currentTrack) {
          audioRef.current.currentTime = Math.min(audioRef.current.duration || 9999, audioRef.current.currentTime + 5)
        }
        return
      }

      // ArrowLeft -> Seek -5s
      if (e.code === 'ArrowLeft' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (bitPerfectEnabled) {
          window.api.mpvSeek(-5)
        } else if (audioRef.current && currentTrack) {
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5)
        }
        return
      }

      // Ctrl+Right / Shift+N / KeyN -> Next track
      if ((e.ctrlKey && e.code === 'ArrowRight') || (e.shiftKey && e.code === 'KeyN') || (e.code === 'KeyN' && !e.ctrlKey && !e.altKey)) {
        e.preventDefault()
        handleNext()
        return
      }

      // Ctrl+Left / Shift+P / KeyP -> Previous track
      if ((e.ctrlKey && e.code === 'ArrowLeft') || (e.shiftKey && e.code === 'KeyP') || (e.code === 'KeyP' && !e.ctrlKey && !e.altKey)) {
        e.preventDefault()
        handlePrev()
        return
      }

      // ArrowUp / Ctrl+Up -> Volume Up
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        handleVolumeUp()
        return
      }

      // ArrowDown / Ctrl+Down -> Volume Down
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        handleVolumeDown()
        return
      }

      // M -> Mute toggle
      if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleMute()
        return
      }

      // S -> Shuffle toggle
      if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleShuffle()
        return
      }

      // R -> Repeat toggle
      if (e.code === 'KeyR' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleRepeat()
        return
      }

      // / or Ctrl+F -> Focus Search
      if ((e.code === 'Slash' && !e.ctrlKey && !e.shiftKey) || (e.ctrlKey && e.code === 'KeyF')) {
        e.preventDefault()
        const searchEl = document.querySelector('header input[type="text"]') as HTMLInputElement
        if (searchEl) {
          searchEl.focus()
          searchEl.select()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTrack, isPlaying, bitPerfectEnabled, playQueue, repeatMode, volume, prevVolume, isShuffle, originalQueue])

  // Global Shortcuts
  useEffect(() => {
    if ((window as any).api?.onGlobalShortcut) {
      (window as any).api.onGlobalShortcut((action: string) => {
        switch (action) {
          case 'play-pause':
            handlePlayPause()
            break
          case 'next':
            handleNext()
            break
          case 'prev':
            handlePrev()
            break
          case 'vol-up':
            handleVolumeUp()
            break
          case 'vol-down':
            handleVolumeDown()
            break
          case 'seek-forward':
            if (bitPerfectEnabled) {
              window.api.mpvSeek(5)
            } else if (audioRef.current && currentTrack) {
              audioRef.current.currentTime = Math.min(audioRef.current.duration || 9999, audioRef.current.currentTime + 5)
            }
            break
          case 'seek-backward':
            if (bitPerfectEnabled) {
              window.api.mpvSeek(-5)
            } else if (audioRef.current && currentTrack) {
              audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5)
            }
            break
        }
      })
    }
  }, [currentTrack, isPlaying, bitPerfectEnabled, playQueue, repeatMode, volume, prevVolume])


  // ==========================================
  // 6. RENDERERS
  // ==========================================
  // ==========================================
  // 6. RENDERERS (VIRTUALIZED TABLE)
  // ==========================================
  const renderTrackTable = (tracks: any[]) => {
    if (!tracks || tracks.length === 0) return null;

    if (viewMode === 'grid') {
      return (
        <TrackGrid 
          tracks={tracks}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isLite={isLite}
          handleRowClick={handleRowClick}
          onContextMenu={handleTrackContextMenu}
          openTagEditor={openTagEditor}
        />
      );
    }

    if (viewMode === 'compact') {
      return (
        <TrackCompactList 
          tracks={tracks}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isLite={isLite}
          handleRowClick={handleRowClick}
          onContextMenu={handleTrackContextMenu}
          openTagEditor={openTagEditor}
        />
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-[300px] h-full w-full bg-theme-60/20 rounded-lg border border-theme-30/50 overflow-hidden">
        <TableVirtuoso
          style={{ height: '100%', width: '100%', minHeight: '300px' }}
          data={tracks}
          components={VirtuosoComponents}
          increaseViewportBy={{ top: 200, bottom: 200 }}
          fixedHeaderContent={() => (
            <tr className="text-zinc-500 border-b border-theme-30/50 select-none bg-theme-60 shadow-sm">
              <th onClick={() => handleSort('id')} className="pb-3 pt-4 font-medium w-12 text-center cursor-pointer group hover:text-white transition" title={t('trackTable.sortIndex')}>
                <div className="inline-flex items-center gap-1 justify-center">
                  <span>{t('trackTable.index')}</span>
                  {sortField === 'id' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-theme-10" /> : <ArrowDown size={12} className="text-theme-10" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </th>
              <th onClick={() => handleSort('title')} className="pb-3 pt-4 font-medium cursor-pointer group hover:text-white transition" title={t('trackTable.sortTitle')}>
                <div className="inline-flex items-center gap-1">
                  <span>{t('trackTable.title')}</span>
                  {sortField === 'title' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-theme-10" /> : <ArrowDown size={12} className="text-theme-10" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </th>
              <th onClick={() => handleSort('album')} className="pb-3 pt-4 font-medium cursor-pointer group hover:text-white transition" title={t('trackTable.sortAlbum')}>
                <div className="inline-flex items-center gap-1">
                  <span>{t('trackTable.album')}</span>
                  {sortField === 'album' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-theme-10" /> : <ArrowDown size={12} className="text-theme-10" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </th>
              <th onClick={() => handleSort('isCloud')} className="pb-3 pt-4 font-medium cursor-pointer group hover:text-white transition" title={t('trackTable.sortFormat')}>
                <div className="inline-flex items-center gap-1">
                  <span>{t('trackTable.format')}</span>
                  {sortField === 'isCloud' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-theme-10" /> : <ArrowDown size={12} className="text-theme-10" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </th>
              <th onClick={() => handleSort('duration')} className="pb-3 pt-4 font-medium text-right pr-4 cursor-pointer group hover:text-white transition" title={t('trackTable.sortDuration')}>
                <div className="inline-flex items-center gap-1 justify-end">
                  <span>{t('trackTable.duration')}</span>
                  {sortField === 'duration' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-theme-10" /> : <ArrowDown size={12} className="text-theme-10" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
              </th>
              <th className="pb-3 pt-4 font-medium text-center">{t('trackTable.actions')}</th>
            </tr>
          )}
          itemContent={(index, track) => (
            <TrackRow 
              track={track} 
              index={index} 
              isThisTrackPlaying={currentTrack?.id === track.id}
              isPlaying={isPlaying}
              isLite={isLite}
              handleRowClick={handleRowClick}
              tracks={tracks}
              openTagEditor={openTagEditor}
              onContextMenu={handleTrackContextMenu}
            />
          )}
        />
      </div>
    )
  }

  // ==========================================
  // 7. MAIN RENDER
  // ==========================================

  // MPV Listeners
  useEffect(() => {
    const unTime = window.api.onMpvTime((val) => {
      if (bitPerfectEnabled && audioRef.current) {
        (audioRef.current as any)._currentTime = val
        if (crossfadeEnabled && !currentTrack?.isOnline) {
          const curDur = (audioRef.current as any)._duration || currentTrack.duration || 0
          if (curDur > crossfadeDuration) {
            const timeLeft = curDur - val
            if (timeLeft <= crossfadeDuration && timeLeft > 0 && !crossfadeTriggeredRef.current) {
              crossfadeTriggeredRef.current = true
              handleNext()
            }
          }
        }
      }
    })
    const unDuration = window.api.onMpvDuration((val) => {
      if (bitPerfectEnabled && audioRef.current) {
        (audioRef.current as any)._duration = val
      }
    })
    const unPaused = window.api.onMpvPaused((val) => {
      if (bitPerfectEnabled) {
        setIsPlaying(!val)
      }
    })
    const unEnded = window.api.onMpvEnded(() => {
      if (bitPerfectEnabled) {
        if (!crossfadeTriggeredRef.current) {
          crossfadeTriggeredRef.current = true
          handleNext()
        }
      }
    })
    return () => {
      if (typeof unTime === 'function') unTime()
      if (typeof unDuration === 'function') unDuration()
      if (typeof unPaused === 'function') unPaused()
      if (typeof unEnded === 'function') unEnded()
    }
  }, [handleNext, crossfadeEnabled, crossfadeDuration, bitPerfectEnabled, currentTrack])

  // Watch currentTrack
  useEffect(() => {
    if (currentTrack && currentTrack.filePath) {
      if (bitPerfectEnabled) {
        window.api.mpvPlay(currentTrack.filePath, crossfadeEnabled ? crossfadeDuration : 0)
        if (audioRef.current) audioRef.current.pause()
      } else {
        // Dừng mpv khi phát bằng HTML Audio
        window.api.mpvPause()
      }
    }
  }, [currentTrack, bitPerfectEnabled, crossfadeEnabled, crossfadeDuration])

  // Watch EQ & Preamp
  useEffect(() => {
    if (isEqEnabled) {
      window.api.mpvSetEqualizer(eqBands.map(b => b.gain), preampGain)
    } else {
      window.api.mpvSetEqualizer([0,0,0,0,0,0,0,0,0,0], 0)
    }
  }, [eqBands, isEqEnabled, preampGain])

  // Watch Volume with debounce/throttle for MPV IPC
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
    if (bitPerfectEnabled) {
      const timer = setTimeout(() => {
        window.api.mpvSetVolume(volume)
      }, 25)
      return () => clearTimeout(timer)
    }
  }, [volume, bitPerfectEnabled])

  // Reset Crossfade Triggered Ref khi đổi bài
  useEffect(() => {
    crossfadeTriggeredRef.current = false
  }, [currentTrack?.id, currentTrack?.filePath])

  // Đồng bộ Media Session API (Phím Media bàn phím, tai nghe Bluetooth & Windows Action Center)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    if (currentTrack) {
      const artwork = currentTrack.coverArt
        ? [{ src: toMediaUrl(currentTrack.coverArt), sizes: '512x512', type: 'image/jpeg' }]
        : []

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Mei\'s Radio',
        artwork: artwork
      })

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    } else {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
    }
  }, [currentTrack, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlaying) handlePlayPause()
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlaying) handlePlayPause()
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        handlePrev()
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handleNext()
      })
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          if (bitPerfectEnabled) {
            window.api.mpvSeek(details.seekTime)
          } else if (audioRef.current) {
            audioRef.current.currentTime = details.seekTime
          }
        }
      })
    } catch (e) {
      console.warn('[MediaSession] Failed to set action handler:', e)
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('seekto', null)
      } catch (e) {}
    }
  }, [isPlaying, handlePlayPause, handlePrev, handleNext, bitPerfectEnabled])

  return (
    <>
      {!isCore && (
        <div className="custom-bg-container">
          <div 
            className={`custom-bg-layer ${!isLite ? 'transition-all' : ''}`}
            style={{
              backgroundImage: bgLayerA ? `url("${bgLayerA.replace(/"/g, '\\"')}")` : 'none',
              opacity: activeBgLayer === 'A' && bgLayerA ? customBgOpacity : 0
            }}
          />
          <div 
            className={`custom-bg-layer ${!isLite ? 'transition-all' : ''}`}
            style={{
              backgroundImage: bgLayerB ? `url("${bgLayerB.replace(/"/g, '\\"')}")` : 'none',
              opacity: activeBgLayer === 'B' && bgLayerB ? customBgOpacity : 0
            }}
          />
        </div>
      )}
      {/* 1. THẺ AUDIO SINGLETON BẢO TOÀN WEB AUDIO GRAPH */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous" // QUAN TRỌNG: Ổn định luồng CORS cho Web Audio API
        autoPlay={!bitPerfectEnabled}
        src={currentTrack ? toMediaUrl(currentTrack.filePath) : undefined}
        onEnded={() => { 
          const audio = audioRef.current;
          // BẢO HIỂM 2 (CHỐNG ĐỨT LUỒNG NGẦM):
          // Nếu bài hát kết thúc giả (còn dư > 2 giây) do rớt mạng, tự động tải và nối lại đúng thời điểm đó!
          if (audio && audio.duration && (audio.duration - audio.currentTime > 2)) {
            console.warn('[Player] Phát hiện đứt luồng mạng, tự động nối lại...');
            const time = audio.currentTime;
            audio.load();
            audio.currentTime = time;
            audio.play();
            return;
          }
          if (!crossfadeTriggeredRef.current) {
            crossfadeTriggeredRef.current = true
            handleNext()
          }
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => {
          // BẢO HIỂM 3 (CHỐNG TREO THẺ AUDIO & LẶP VÔ HẠN):
          const audio = audioRef.current;
          if (audio && currentTrack) {
            // Nếu lỗi ngay từ giây đầu tiên (Server sập 500), bỏ qua luôn bài này để tránh kẹt
            if (audio.currentTime === 0) {
              console.warn(`[Player] Luồng dữ liệu bị hỏng hoàn toàn. Bỏ qua bài: ${currentTrack.title}`);
              handleNext();
            } else {
              // Nếu đang phát giữa chừng mà bị lỗi (mất mạng tạm thời), mới cố gắng phục hồi
              console.warn('[Player] Trình phát báo lỗi kết nối giữa chừng, tự động phục hồi...');
              const time = audio.currentTime;
              audio.load();
              audio.currentTime = time;
              audio.play();
            }
          }
        }}
        loop={repeatMode === 2}
      />

      {/* 2. RẼ NHÁNH GIAO DIỆN BẰNG TERNARY OPERATOR */}
      {isMiniPlayer ? (
        // --- GIAO DIỆN MINI PLAYER ---
        <div 
          className="h-screen w-screen bg-zinc-950/90 backdrop-blur-md overflow-hidden flex items-center p-3 border border-theme-30 select-none cursor-move" 
          style={{ backgroundColor: themeColor, WebkitAppRegion: 'drag' } as any}
        >
          {!isLite && <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />}
          
          <div className="w-24 h-24 bg-theme-30 rounded-lg overflow-hidden shadow-xl flex-shrink-0 relative group" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {(!isLite && currentTrack?.coverArt) ? (
              <img loading="lazy" src={toMediaUrl(currentTrack.coverArt)} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <ListMusic size={32} />
              </div>
            )}
            <button 
              onClick={handleToggleMiniPlayer} 
              className="absolute top-1 left-1 bg-black/60 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition" 
              title="Trở về chế độ Đầy đủ"
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              <Maximize2 size={14} />
            </button>
          </div>

          <div className="flex-1 ml-4 flex flex-col justify-center overflow-hidden pointer-events-none">
            <div className="truncate mb-2 pr-4">
              <h4 className="text-sm font-bold text-white truncate">{currentTrack ? currentTrack.title : 'Meis Radio'}</h4>
              <p className="text-xs text-zinc-400 truncate">{currentTrack ? currentTrack.artist : 'Sẵn sàng phát nhạc'}</p>
            </div>
            
            <div className="flex items-center gap-3 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <SkipBack size={18} />
              </button>
              <button onClick={handlePlayPause} className="w-8 h-8 rounded-full bg-theme-10 text-white flex items-center justify-center hover:scale-105 transition" style={{ WebkitAppRegion: 'no-drag' } as any}>
                {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current translate-x-[1px]" />}
              </button>
              <button onClick={handleNext} className="text-zinc-400 hover:text-white transition" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <SkipForward size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // --- GIAO DIỆN CHÍNH (FULL SCREEN) ---
        <div data-mode={appMode} className={`flex flex-col h-screen text-zinc-200 font-sans overflow-hidden relative ${isLite ? '' : 'transition-colors duration-1000'}`} style={{ backgroundColor: effectiveBgImage ? 'transparent' : (isCore ? '#121212' : themeColor) }}>
      {!isLite && !effectiveBgImage && <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />}

      {/* OVERLAYS & MODALS */}
      {toast.visible && (
        <div className="fixed top-10 right-10 z-[100] animate-fade-in flex items-center gap-3 bg-theme-60 border border-zinc-700 shadow-2xl py-3 px-5 rounded-xl">
          {toast.type === 'success' && <Sparkles size={18} className="text-theme-10" />}
          {toast.type === 'error' && <X size={18} className="text-red-400" />}
          {toast.type === 'info' && <Cloud size={18} className="text-blue-400" />}
          <span className="text-sm font-medium text-white">{toast.message}</span>
        </div>
      )}

      {/* ========================================= */}
      {/* MỚI: PROGRESS BAR DẠNG TOAST (NỔI GÓC PHẢI) */}
      {/* ========================================= */}
      {isDownloading && downloadProgress && (
        <div className="fixed bottom-28 right-8 z-[90] bg-theme-60/95 backdrop-blur-md border border-zinc-700/80 rounded-xl p-5 w-80 shadow-2xl flex flex-col animate-fade-in pointer-events-none">
          <div className="flex items-center gap-3 mb-2">
            <Cloud size={20} className="text-theme-10 animate-pulse" />
            <h3 className="text-sm font-bold text-white">Đang tải xuống...</h3>
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
            <span className="text-theme-10">{Math.round((downloadProgress.current / downloadProgress.total) * 100)}%</span>
            <span className="text-zinc-500">{downloadProgress.current} / {downloadProgress.total} tệp</span>
          </div>
        </div>
      )}

      <CloudActionModal
        track={cloudActionTrack}
        isDownloading={isDownloading}
        onClose={() => setCloudActionTrack(null)}
        onAction={handleCloudAction}
      />

      <TagEditorModal
        track={editingTrack}
        tags={editTags}
        imagePath={editImagePath}
        setTags={setEditTags}
        onSelectImage={handleSelectTagImage}
        onSave={saveTags}
        onClose={() => setEditingTrack(null)}
      />

      <PlaylistRenameModal
        isOpen={playlistRename.isOpen}
        newName={playlistRename.newName}
        setNewName={(name) => setPlaylistRename({ ...playlistRename, newName: name })}
        onCancel={() => setPlaylistRename({ isOpen: false, oldName: '', newName: '' })}
        onSubmit={handleRenameSubmit}
      />

      <EditPlaylistModal
        isOpen={showEditUserPlaylistModal}
        playlist={editingUserPlaylist}
        onClose={() => {
          setShowEditUserPlaylistModal(false)
          setEditingUserPlaylist(null)
        }}
        onSave={handleSaveEditUserPlaylist}
      />

      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreatePlaylistSubmit}
      />

      <CreatePlaylistModal
        isOpen={showCreateUserPlaylistModal}
        onClose={() => setShowCreateUserPlaylistModal(false)}
        onCreate={handleCreateUserPlaylist}
      />

      <AddSongsModal
        isOpen={showAddSongsModal}
        tracks={libraryTracks}
        playlistName={activePlaylist?.name || ''}
        onClose={() => setShowAddSongsModal(false)}
        onAddTracks={handleAddTracksToActivePlaylist}
      />

      <AddSongsModal
        isOpen={showAddSongsToUserPlaylistModal}
        tracks={libraryTracks}
        playlistName={activeUserPlaylist?.name || ''}
        onClose={() => setShowAddSongsToUserPlaylistModal(false)}
        onAddTracks={handleAddSongsToUserPlaylist}
      />

      <EQPanel 
        showEQ={showEQ} 
        setShowEQ={setShowEQ} 
        isEqEnabled={isEqEnabled} 
        setIsEqEnabled={setIsEqEnabled}
        eqBands={eqBands} 
        setEqBands={setEqBands} 
        filterNodesRef={filterNodesRef}
        preampGain={preampGain}
        setPreampGain={setPreampGain}
        showToast={showToast}
      />

      <SpectrogramModal 
        isOpen={showSpectrogramModal} 
        onClose={() => setShowSpectrogramModal(false)} 
        analyserNodeRef={analyserNodeRef} 
        isPlaying={isPlaying} 
        isLite={isLite} 
        currentTrack={currentTrack} 
        audioRef={audioRef}
      />

      <CustomDialogModal 
        dialog={customDialog} 
        onClose={() => setCustomDialog(null)} 
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div 
        className="w-full h-8 flex-shrink-0 z-[100] flex items-center px-3 gap-2" 
        style={{ WebkitAppRegion: 'drag' as any }}
      >
        <div className="flex items-center gap-2 text-zinc-400 text-sm font-semibold opacity-70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
          <span className="font-whisper text-xl" style={{ letterSpacing: '1px', marginTop: '2px' }}>Mei's Radio</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR TABS */}
        {/* SIDEBAR COMPONENT */}
      <Sidebar 
        activeView={activeView} setActiveView={setActiveView}
        setSearchQuery={setSearchQuery} setSearchInput={setSearchInput}
        setActiveAlbum={setActiveAlbum} setActivePlaylist={setActivePlaylist}
        setActiveArtist={setActiveArtist} setActiveGenre={setActiveGenre}
        setActiveUserPlaylist={setActiveUserPlaylist}
        fetchDashboard={fetchDashboard}
        fetchScDashboard={fetchScDashboard}
        isCore={isCore}
      />

        {/* NỘI DUNG CHÍNH (ĐỔI THEO TAB) */}
        <main className={`flex-1 flex flex-col bg-transparent overflow-hidden ${(isLyricsMaximized && showLyricsPanel) ? 'hidden' : ''}`}>
          
          <header className="h-20 px-8 flex items-center justify-between border-b border-theme-30/50 flex-shrink-0 w-full">
            <div className="relative w-96 flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={18} />
              <input 
                type="text" 
                value={searchInput}
                onChange={(e) => { 
                  const val = e.target.value;
                  setSearchInput(val); 
                  if (activeView !== 'home' && activeView !== 'home-ytm' && activeView !== 'home-soundcloud') {
                    setSearchQuery(val);
                  } else if (val === '') {
                    setSearchQuery('');
                    if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard();
                    if (activeView === 'home-soundcloud') fetchScDashboard();
                  } 
                }}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && searchInput.trim() !== '') {
                    if (activeView === 'home' || activeView === 'home-ytm') {
                      // @ts-ignore
                      window.api.searchOnline(searchInput).then(res => {
                        if (res.success) {
                          if (res.isUrl) {
                            // Mở Playlist hoặc Phát bài hát từ Link
                            if (res.type === 'playlist') setActiveAlbum({ title: res.title, tracks: res.tracks });
                            else if (res.type === 'song') playAndGenerateRadio(res.track);
                          } else {
                            // Hiển thị giao diện danh mục như Trang chủ
                            setDashboardData(res.data);
                          }
                        } else {
                          showAlert({ title: t('common.error'), message: 'Lỗi tìm kiếm YouTube Music: ' + res.error });
                        }
                      });
                    } else if (activeView === 'home-soundcloud') {
                      // @ts-ignore
                      window.api.searchScOnline(searchInput).then(res => {
                        if (res.success) {
                          const sections: any[] = [];
                          if (res.tracks && res.tracks.length > 0) {
                            sections.push({
                              title: `Kết quả tìm kiếm: "${searchInput}"`,
                              contents: res.tracks
                            });
                          }
                          if (res.playlists && res.playlists.length > 0) {
                            sections.push({
                              title: `Danh sách phát liên quan`,
                              contents: res.playlists
                            });
                          }
                          setScDashboardData(sections);
                        } else {
                          showAlert({ title: t('common.error'), message: 'Lỗi tìm kiếm SoundCloud: ' + res.error });
                        }
                      });
                    } else {
                      setSearchQuery(searchInput); 
                    }
                  } 
                }}
                placeholder={
                  (activeView === 'home' || activeView === 'home-ytm') 
                    ? t('header.searchYtm')
                    : (activeView === 'home-soundcloud')
                    ? t('header.searchSc')
                    : t('header.searchLocal')
                } 
                className="w-full bg-theme-60/50 border border-zinc-700/50 rounded-full py-2 pl-10 pr-9 text-sm text-white focus:outline-none focus:border-theme-10 transition-colors placeholder:text-zinc-500" 
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard();
                    if (activeView === 'home-soundcloud') fetchScDashboard();
                  }}
                  className="absolute right-3 text-zinc-400 hover:text-white p-0.5 rounded transition"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {/* Tùy chọn chuyển đổi kiểu hiển thị (View Mode Switcher) */}
              {(activeView === 'songs' || activeView === 'playlists' || activeView === 'artists' || activeView === 'genres' || activeView === 'user-playlists') && (
                <div className="flex items-center bg-theme-60/50 p-1 rounded-full border border-zinc-700/50">
                  <button 
                    onClick={() => { setViewMode('table'); localStorage.setItem('meis_view_mode', 'table'); }} 
                    className={`p-1.5 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${viewMode === 'table' ? 'bg-theme-10 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                    title={t('viewOptions.table')}
                  >
                    <List size={14} />
                    <span className="hidden xl:inline">{t('viewOptions.table')}</span>
                  </button>
                  <button 
                    onClick={() => { setViewMode('grid'); localStorage.setItem('meis_view_mode', 'grid'); }} 
                    className={`p-1.5 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${viewMode === 'grid' ? 'bg-theme-10 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                    title={t('viewOptions.grid')}
                  >
                    <LayoutGrid size={14} />
                    <span className="hidden xl:inline">{t('viewOptions.grid')}</span>
                  </button>
                  <button 
                    onClick={() => { setViewMode('compact'); localStorage.setItem('meis_view_mode', 'compact'); }} 
                    className={`p-1.5 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${viewMode === 'compact' ? 'bg-theme-10 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                    title={t('viewOptions.compact')}
                  >
                    <Rows3 size={14} />
                    <span className="hidden xl:inline">{t('viewOptions.compact')}</span>
                  </button>
                </div>
              )}

              <button onClick={handleReloadLibrary} disabled={isReloading} className={`flex items-center gap-2 px-4 py-2 bg-theme-60/50 border border-zinc-700/50 rounded-full text-sm font-medium transition-colors ${isReloading ? 'text-theme-10' : 'text-zinc-400 hover:text-white hover:border-zinc-600'}`} title={t('header.refreshLibrary')}>
                <RefreshCw size={16} className={isReloading ? 'animate-spin' : ''} />
                {isReloading ? t('header.refreshing') : t('header.refresh')}
              </button>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            
            {/* CỘT TRÁI: DATA VIEW */}
            <div 
              ref={contentContainerRef}
              onScroll={(e) => {
                scrollPositionsRef.current[currentViewKey] = e.currentTarget.scrollTop
              }}
              style={{ overflowAnchor: 'none' }}
              className={`flex-1 flex flex-col p-8 relative ${activeView === 'settings' || activeView === 'drive' || activeView === 'home' || (activeView === 'home-ytm' && !activeAlbum) || (activeView === 'home-soundcloud' && !activeAlbum) || (activeView === 'playlists' && !activePlaylist) || activeView === 'artists' || (activeView === 'genres' && !activeGenre) || (activeView === 'user-playlists' && !activeUserPlaylist) ? 'overflow-y-auto' : 'overflow-hidden'}`}
            >
              <div key={currentViewKey} className="animate-fade-in flex-1 flex flex-col min-h-0">
              
              {/* VIEW: TRANG CHỦ TỔNG QUAN (DASHBOARD) */}
              {activeView === 'home' && (
                <div className="flex flex-col space-y-8 pb-16">
                  {/* HERO HEADER */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-theme-10/15 border border-theme-10/30 text-theme-10 flex items-center justify-center shadow-lg shadow-theme-10/10">
                        <Sparkles size={24} className="fill-current" />
                      </div>
                      <div>
                        <h2 className="text-2xl lg:text-3xl font-extrabold text-white">
                          {t('home.dashboardTitle')}
                        </h2>
                        <p className="text-xs text-zinc-400">{t('home.dashboardSubtitle')}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          if (dashboardRecommendations.length > 0) {
                            handleRowClick(dashboardRecommendations[0], dashboardRecommendations)
                          } else if (libraryTracks.length > 0) {
                            handleRowClick(libraryTracks[0], libraryTracks)
                          }
                        }}
                        disabled={libraryTracks.length === 0}
                        className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10/90 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
                      >
                        <Play size={16} className="fill-current" />
                        <span>{t('home.playAllRecommendations')}</span>
                      </button>

                      <button 
                        onClick={() => {
                          if (libraryTracks.length > 0) {
                            const shuffled = [...libraryTracks].sort(() => Math.random() - 0.5)
                            handleRowClick(shuffled[0], shuffled)
                          }
                        }}
                        disabled={libraryTracks.length === 0}
                        className="flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 hover:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                      >
                        <Shuffle size={16} />
                        <span>{t('home.shuffleAllLibrary')}</span>
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
                        <p className="text-2xl font-black text-white group-hover:text-theme-10 transition">{libraryTracks.length}</p>
                        <p className="text-xs text-zinc-400 truncate">{t('home.statsSongs')}</p>
                      </div>
                    </div>

                    <div 
                      onClick={() => setActiveView('playlists')} 
                      className="bg-theme-60/40 hover:bg-theme-30/40 border border-theme-30/60 hover:border-theme-10/40 rounded-2xl p-4 flex items-center gap-4 transition cursor-pointer group shadow-sm"
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Disc size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xl font-black text-white group-hover:text-blue-400 transition">{playlists.length + userPlaylists.length}</p>
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
                        <p className="text-2xl font-black text-white group-hover:text-purple-400 transition">{new Set(libraryTracks.map(t => t.artist).filter(Boolean)).size}</p>
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

                  {/* KHỐI 1: GỢI Ý BÀI HÁT TỪ THƯ MỤC NHẠC (DỰA TRÊN LỊCH SỬ NGHE VÀ THƯ VIỆN) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Sparkles size={18} className="text-theme-10" />
                          {t('home.forYouTitle')}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{t('home.forYouSubtitle')}</p>
                      </div>
                      {dashboardRecommendations.length > 0 && (
                        <button 
                          onClick={() => handleRowClick(dashboardRecommendations[0], dashboardRecommendations)}
                          className="text-xs font-medium text-theme-10 hover:underline flex items-center gap-1 transition"
                        >
                          <Play size={12} className="fill-current" /> {t('userPlaylistsView.playAll')}
                        </button>
                      )}
                    </div>

                    {dashboardRecommendations.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {dashboardRecommendations.map((track, idx) => {
                          const isCurrent = currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
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
                                {track.coverArt ? (
                                  <img src={toMediaUrl(track.coverArt)} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                                    <Music size={18} />
                                  </div>
                                )}
                                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                  {isCurrent && isPlaying ? (
                                    <span className="w-3.5 h-3.5 rounded-full bg-theme-10 animate-pulse"></span>
                                  ) : (
                                    <Play size={16} className="text-white fill-current ml-0.5" />
                                  )}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}>
                                  {track.title || t('common.unknown')}
                                </p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">
                                  {track.artist || t('player.unknownArtist')}
                                </p>
                              </div>

                              <span className="text-[11px] text-zinc-500 shrink-0 pr-2">
                                {formatDuration(track.duration)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="bg-theme-60/30 border border-theme-30/40 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
                        <Music size={40} className="text-zinc-600 mb-3" />
                        <p className="text-sm font-medium text-zinc-300">{t('home.noRecentTitle')}</p>
                        <p className="text-xs text-zinc-500 max-w-md mt-1">{t('home.noRecentDesc')}</p>
                      </div>
                    )}
                  </div>

                  {/* KHỐI 2: ĐÃ NGHE GẦN ĐÂY (RECENTLY PLAYED) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <History size={18} className="text-amber-400" />
                          {t('home.recentlyPlayedTitle')}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{t('home.recentlyPlayedSubtitle')}</p>
                      </div>
                    </div>

                    {recentlyPlayed.length > 0 ? (
                      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide snap-x">
                        {recentlyPlayed.slice(0, 15).map((track, idx) => {
                          const isCurrent = currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
                          return (
                            <div 
                              key={idx}
                              onClick={() => handleRowClick(track, recentlyPlayed)}
                              onContextMenu={(e) => handleTrackContextMenu(track, e)}
                              className="min-w-[140px] max-w-[140px] snap-start group cursor-pointer"
                            >
                              <div className="w-full aspect-square rounded-2xl bg-theme-30 mb-2.5 overflow-hidden relative shadow-lg border border-theme-30/40">
                                {track.coverArt ? (
                                  <img src={toMediaUrl(track.coverArt)} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                                    <Music size={28} />
                                  </div>
                                )}
                                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                  {isCurrent && isPlaying ? (
                                    <span className="w-5 h-5 rounded-full bg-theme-10 animate-pulse"></span>
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-theme-10 flex items-center justify-center shadow-lg text-white">
                                      <Play size={16} className="fill-current ml-0.5" />
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}>
                                {track.title}
                              </p>
                              <p className="text-[11px] text-zinc-500 truncate mt-0.5">{track.artist}</p>
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
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Compass size={18} className="text-blue-400" />
                            {t('home.discoverFolderTitle')}
                          </h3>
                          <p className="text-xs text-zinc-400 mt-0.5">{t('home.discoverFolderSubtitle')}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {randomDiscoverTracks.map((track, idx) => {
                          const isCurrent = currentTrack?.id === track.id || currentTrack?.filePath === track.filePath
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
                                {track.coverArt ? (
                                  <img src={toMediaUrl(track.coverArt)} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                                    <Music size={18} />
                                  </div>
                                )}
                                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                  {isCurrent && isPlaying ? (
                                    <span className="w-3.5 h-3.5 rounded-full bg-theme-10 animate-pulse"></span>
                                  ) : (
                                    <Play size={16} className="text-white fill-current ml-0.5" />
                                  )}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-theme-10' : 'text-zinc-100 group-hover:text-white'}`}>
                                  {track.title || t('common.unknown')}
                                </p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">
                                  {track.artist || t('player.unknownArtist')}
                                </p>
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
              )}
              
              {/* VIEW: TRANG CHỦ YOUTUBE MUSIC */}
              {activeView === 'home-ytm' && (
                <div className={`flex flex-col ${activeAlbum ? 'h-full' : 'space-y-6'}`}>
                  {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST --- */}
                  {activeAlbum ? (
                    <div className="flex flex-col h-full animate-fade-in space-y-6">
                      <div>
                        <button 
                          onClick={() => {
                            if (contentContainerRef.current) {
                              scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                            }
                            setActiveAlbum(null);
                          }} 
                          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
                        >
                          <ArrowLeft size={16}/> {t('home.backToDashboard')}
                        </button>
                        <div className="flex items-end justify-between gap-6 mb-6">
                          <div className="flex items-end gap-6 min-w-0">
                            {activeAlbum.thumbnail && (
                              <div className="w-36 h-36 rounded-2xl overflow-hidden bg-theme-30 border border-theme-30/80 shadow-2xl flex-shrink-0">
                                <img src={toMediaUrl(activeAlbum.thumbnail)} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">{t('home.ytmPlaylist')}</p>
                              <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-3 truncate">{activeAlbum.title}</h2>
                              <p className="text-sm text-zinc-400 mb-4">{activeAlbum.tracks?.length || 0} {t('common.songs')}</p>
                              {activeAlbum.tracks && activeAlbum.tracks.length > 0 && (
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={() => handleRowClick(activeAlbum.tracks[0], activeAlbum.tracks)}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-red-600/20 cursor-pointer"
                                  >
                                    <Play size={16} className="fill-current" /> {t('userPlaylistsView.playAll')}
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const shuffled = [...activeAlbum.tracks].sort(() => Math.random() - 0.5)
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
                           <p className="text-red-400 animate-pulse font-medium">{t('home.extractingYtm')}</p>
                        </div>
                      ) : (
                        renderTrackTable(activeAlbum.tracks)
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
                                setSearchInput('');
                                setSearchQuery('');
                                fetchDashboard();
                              }}
                              title={t('home.backToDashboard')}
                              className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition cursor-pointer shrink-0"
                            >
                              <ArrowLeft size={18} />
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              setSearchInput('');
                              setSearchQuery('');
                              fetchDashboard();
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
                                <span className="text-xs text-zinc-300 font-medium">{t('home.ytmSynced')}</span>
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
                            <button onClick={handleYtmLogin} className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-red-600/20">
                              <Cloud size={18} /> {t('home.ytmLogin')}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-10 pb-20">
                        {/* THÔNG BÁO KHI CHƯA ĐĂNG NHẬP (TRỐNG DỮ LIỆU) */}
                        {dashboardData.length === 0 ? (
                           <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                             <ListMusic size={56} className="mb-4 opacity-20" />
                             <p className="text-lg">{t('home.noRecommendationsTitle')}</p>
                             <p className="text-sm mt-1">{t('home.noRecommendationsDesc')}</p>
                           </div>
                        ) : (
                          dashboardData.map((section, index) => {
                            const isListSection = section.contents.some((t: any) => t.style === 'LIST');

                            return (
                            <div key={index}>
                              <h3 className="text-xl font-bold text-white mb-4">{section.title}</h3>
                              
                              <div className={`overflow-x-auto pb-4 scrollbar-hide snap-x ${isListSection ? 'grid grid-rows-4 grid-flow-col gap-x-6 gap-y-3' : 'flex gap-4'}`}>
                                {section.contents.map((item: any, i: number) => {
                                  if (item.style === 'LIST') {
                                    return (
                                      <div key={i} className="flex items-center gap-3 w-96 snap-start group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition" onClick={() => handleDashboardItemClick(item)}>
                                        <div className="w-12 h-12 bg-theme-30 rounded flex-shrink-0 relative overflow-hidden shadow-md">
                                          {item.thumbnails && item.thumbnails.length > 0 ? (
                                            <img loading="lazy" src={item.thumbnails[item.thumbnails.length - 1].url} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                          ) : (
                                            <ListMusic size={16} className="m-auto mt-4 text-zinc-600" />
                                          )}
                                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Play size={18} className="text-white fill-current ml-0.5" />
                                          </div>
                                        </div>
                                        <div className="flex-1 truncate">
                                          <p className="font-semibold text-sm text-white truncate group-hover:text-red-400 transition">{item.title}</p>
                                          <p className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
                                        </div>
                                        {!item.isArtist && (
                                          <button onClick={(e) => { e.stopPropagation(); handleDashboardItemDownload(item); }} className="w-8 h-8 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 rounded-full transition" title={t('home.downloadToLib')}>
                                            <Download size={14} />
                                          </button>
                                        )}
                                      </div>
                                    )
                                  }

                                  return (
                                    <div key={i} className="min-w-[160px] max-w-[160px] snap-start group cursor-pointer" onClick={() => handleDashboardItemClick(item)}>
                                      <div className="w-40 h-40 bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-lg">
                                        {item.thumbnails && item.thumbnails.length > 0 ? (
                                          <img loading="lazy" src={item.thumbnails[item.thumbnails.length - 1].url} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                        ) : (
                                          <ListMusic size={40} className="m-auto mt-16 text-zinc-600" />
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleDashboardItemClick(item); }} 
                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-xs text-white font-medium flex items-center gap-1 transition"
                                          >
                                            <Play size={14}/> {t('home.playNow')}
                                          </button>
                                          {!item.isArtist && (
                                            <button onClick={(e) => { e.stopPropagation(); handleDashboardItemDownload(item); }} className="w-10 h-10 flex items-center justify-center bg-theme-30/90 text-white rounded-full hover:bg-red-600 hover:scale-110 transition shadow-2xl" title={t('home.downloadToLib')}>
                                              <Download size={18} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="font-semibold text-sm text-white truncate">{item.title}</p>
                                      <p className="text-xs text-zinc-500 truncate mt-1">{item.subtitle}</p>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* VIEW: TRANG CHỦ SOUNDCLOUD */}
              {activeView === 'home-soundcloud' && (
                <div className={`flex flex-col ${activeAlbum ? 'h-full' : 'space-y-6'}`}>
                  {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST SOUNDCLOUD --- */}
                  {activeAlbum ? (
                    <div className="flex flex-col h-full animate-fade-in space-y-6">
                      <div>
                        <button 
                          onClick={() => {
                            if (contentContainerRef.current) {
                              scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                            }
                            setActiveAlbum(null);
                          }} 
                          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
                        >
                          <ArrowLeft size={16}/> {t('home.backToDashboard')}
                        </button>
                        <div className="flex items-end justify-between gap-6 mb-6">
                          <div className="flex items-end gap-6 min-w-0">
                            {activeAlbum.thumbnail && (
                              <div className="w-36 h-36 rounded-2xl overflow-hidden bg-theme-30 border border-theme-30/80 shadow-2xl flex-shrink-0">
                                <img src={toMediaUrl(activeAlbum.thumbnail)} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">{t('home.scPlaylist')}</p>
                              <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-3 truncate">{activeAlbum.title}</h2>
                              <p className="text-sm text-zinc-400 mb-4">{activeAlbum.tracks?.length || 0} {t('common.songs')}</p>
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
                                      const shuffled = [...activeAlbum.tracks].sort(() => Math.random() - 0.5)
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
                        renderTrackTable(activeAlbum.tracks)
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
                                setSearchInput('');
                                setSearchQuery('');
                                fetchScDashboard();
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
                                <img src={scUser.avatarUrl} alt={scUser.username} className="w-7 h-7 rounded-full object-cover border border-amber-500/50" />
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
                            <button onClick={handleScLogin} className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-lg shadow-orange-600/20">
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
                      <div className="space-y-10 pb-20">
                        {isScLoading && scDashboardData.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center mt-20 text-zinc-500">
                            <Activity size={40} className="text-amber-500 animate-bounce mb-3" />
                            <p className="text-sm font-medium text-amber-400 animate-pulse">{t('home.loadingSc')}</p>
                          </div>
                        ) : scDashboardData.length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                            <Cloud size={56} className="mb-4 opacity-20 text-amber-500" />
                            <p className="text-lg">{t('home.noScTracksTitle')}</p>
                            <p className="text-sm mt-1">{t('home.noScTracksDesc')}</p>
                          </div>
                        ) : (
                          scDashboardData.map((section, index) => {
                            const isListSection = section.contents.some((t: any) => t.style === 'LIST' || t.format === 'STREAM');

                            return (
                              <div key={index}>
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                  <span>{section.title}</span>
                                </h3>
                                
                                <div className={`overflow-x-auto pb-4 scrollbar-hide snap-x ${isListSection ? 'grid grid-rows-4 grid-flow-col gap-x-6 gap-y-3' : 'flex gap-4'}`}>
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
                                                { id: 'sc-play', label: t('contextMenu.play'), onClick: () => handleScItemClick(item) },
                                                { id: 'sc-queue', label: t('contextMenu.addQueue'), onClick: () => setPlayQueue(prev => [...prev, item]) },
                                                { id: 'sc-dl', label: t('contextMenu.downloadToLib'), onClick: () => handleDashboardItemDownload(item) }
                                              ]
                                            })
                                          }}
                                        >
                                          <div className="w-12 h-12 bg-theme-30 rounded-lg flex-shrink-0 relative overflow-hidden shadow-md">
                                            {item.coverArt || (item.thumbnails && item.thumbnails.length > 0) ? (
                                              <img loading="lazy" src={item.coverArt || item.thumbnails[0].url} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                            ) : (
                                              <Cloud size={20} className="m-auto mt-3 text-amber-500/50" />
                                            )}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                              <Play size={18} className="text-amber-400 fill-current ml-0.5" />
                                            </div>
                                          </div>
                                          <div className="flex-1 truncate">
                                            <p className="font-semibold text-sm text-white truncate group-hover:text-amber-400 transition">{item.title}</p>
                                            <p className="text-xs text-zinc-500 truncate mt-0.5">{item.artist || item.subtitle}</p>
                                          </div>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleDashboardItemDownload(item); }} 
                                            className="w-8 h-8 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:bg-amber-400/10 rounded-full transition" 
                                            title={t('home.downloadToLib')}
                                          >
                                            <Download size={14} />
                                          </button>
                                        </div>
                                      )
                                    }

                                    return (
                                      <div key={i} className="min-w-[160px] max-w-[160px] snap-start group cursor-pointer" onClick={() => handleScItemClick(item)}>
                                        <div className="w-40 h-40 bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-lg">
                                          {item.coverArt || (item.thumbnails && item.thumbnails.length > 0) ? (
                                            <img loading="lazy" src={item.coverArt || item.thumbnails[0].url} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                          ) : (
                                            <Cloud size={40} className="m-auto mt-16 text-amber-500/40" />
                                          )}
                                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); handleScItemClick(item); }} 
                                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 rounded-lg text-xs text-black font-semibold flex items-center gap-1 transition"
                                            >
                                              <Play size={14}/> {t('home.playNow')}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDashboardItemDownload(item); }} className="w-10 h-10 flex items-center justify-center bg-theme-30/90 text-white rounded-full hover:bg-amber-500 hover:text-black hover:scale-110 transition shadow-2xl" title={t('home.downloadToLib')}>
                                              <Download size={18} />
                                            </button>
                                          </div>
                                        </div>
                                        <p className="font-semibold text-sm text-white truncate">{item.title}</p>
                                        <p className="text-xs text-zinc-500 truncate mt-1">{item.subtitle || item.artist}</p>
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
              )}

              {/* VIEW: BÀI HÁT */}
              {activeView === 'songs' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-end gap-4">
                      <h2 className="text-3xl font-bold text-white">{searchQuery ? t('songsView.searchResults') : t('songsView.songList')}</h2>
                      <span className="text-zinc-500 text-sm mb-1">{processedLibraryTracks.length} {t('common.songs')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          if (processedLibraryTracks.length > 0) {
                            setIsShuffle(true)
                            const shuffled = [...processedLibraryTracks].sort(() => Math.random() - 0.5)
                            handleRowClick(shuffled[0], shuffled)
                          }
                        }}
                        disabled={processedLibraryTracks.length === 0}
                        className="flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                        title={t('songsView.randomPlay')}
                      >
                        <Shuffle size={16} /> {t('songsView.randomPlay')}
                      </button>
                      <button onClick={handleImportFiles} className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer">
                        <Plus size={18} /> {t('songsView.addMusic')}
                      </button>
                    </div>
                  </div>
                  {libraryPath ? (
                    processedLibraryTracks.length > 0 ? renderTrackTable(processedLibraryTracks) : <p className="text-zinc-500 mt-10 text-center">{t('songsView.noSongsMatched', { query: searchQuery })}</p>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                      <HardDrive size={56} className="mb-4 opacity-20" />
                      <p className="text-lg">{t('songsView.libraryNotConfigured')}</p>
                      <p className="text-sm mt-1">{t('songsView.libraryNotConfiguredDesc')}</p>
                    </div>
                  )}
                </>
              )}

              {/* VIEW: GOOGLE DRIVE */}
              {activeView === 'drive' && (
                <div className="flex flex-col h-full max-w-4xl">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                      <Cloud size={32} className="text-theme-10" /> {t('driveView.title')}
                    </h2>
                  </div>
                  
                  <div className="bg-theme-60/50 border border-theme-30 p-6 rounded-xl mb-6 shadow-lg">
                    <h3 className="text-theme-10 font-semibold mb-2">{t('driveView.enterFolderLink')}</h3>
                    <p className="text-sm text-zinc-400 mb-4">{t('driveView.folderLinkDesc')}</p>
                    <div className="flex gap-3 items-center">
                      <div className="relative flex-1">
                        <Link size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input type="text" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder={t('driveView.folderLinkPlaceholder')} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-theme-10 transition-colors" />
                      </div>
                      <button onClick={handleDriveSubmit} disabled={!driveLink || isFetchingDrive} className="bg-theme-10 hover:bg-theme-10 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2">
                        {isFetchingDrive ? <span className="animate-pulse">{t('driveView.scanning')}</span> : t('driveView.scanData')}
                      </button>
                    </div>
                  </div>

                  {/* Kết quả / Danh sách file đã tìm thấy */}
                  <div className="flex-1 flex flex-col bg-theme-60/30 border border-theme-30/50 rounded-xl p-6 min-h-[300px]">
                    {driveFiles.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                        <Cloud size={56} className="mb-4 opacity-20" />
                        <p className="text-lg">{t('driveView.emptyTitle')}</p>
                        <p className="text-sm mt-1">{t('driveView.emptyDesc')}</p>
                      </div>
                    ) : (
                      (() => {
                        // Lọc file Drive theo từ khóa tìm kiếm trên Header
                        const lowerQuery = searchQuery.toLowerCase()
                        const filteredDriveFiles = searchQuery 
                          ? driveFiles.filter(f => f.title.toLowerCase().includes(lowerQuery)) 
                          : driveFiles

                        return (
                          <>
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-theme-30/50">
                              <h3 className="font-bold text-white">
                                {searchQuery 
                                  ? t('driveView.foundResults', { count: filteredDriveFiles.length, query: searchQuery }) 
                                  : t('driveView.foundAudioFiles', { count: driveFiles.length })}
                              </h3>
                              <div className="flex gap-3">
                                <button onClick={handleDriveStream} className="flex items-center gap-2 bg-theme-10/10 text-theme-10 hover:bg-theme-10/20 px-4 py-2 rounded-lg text-sm font-medium transition">
                                  <Wifi size={16} /> {t('driveView.streamAll')}
                                </button>
                                <button onClick={handleDriveDownload} disabled={isDownloading} className="flex items-center gap-2 bg-theme-30 text-white hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                                  {isDownloading ? <span className="animate-pulse">{t('common.loading')}</span> : <><Download size={16} /> {t('driveView.downloadLossless')}</>}
                                </button>
                              </div>
                            </div>
                            
                            <div className="space-y-2 overflow-y-auto pr-2">
                              {filteredDriveFiles.length === 0 ? (
                                <p className="text-zinc-500 text-center mt-10">{t('songsView.noSongsMatched', { query: searchQuery })}</p>
                              ) : (
                                filteredDriveFiles.map((f, i) => (
                                  <div key={i} className="flex items-center gap-4 p-3 bg-theme-60/40 hover:bg-theme-30/80 rounded-lg border border-theme-30/50 transition">
                                    <div className="w-10 h-10 bg-theme-30 rounded flex items-center justify-center flex-shrink-0 text-theme-10"><ListMusic size={18} /></div>
                                    <div className="flex-1 truncate">
                                      <p className="font-semibold text-white truncate text-sm">{f.title}</p>
                                      <p className="text-xs text-zinc-500 mt-0.5">{t('driveView.originalFormat')}: <span className="text-theme-10/80 uppercase">{f.format}</span></p>
                                    </div>
                                    <button onClick={() => setCloudActionTrack(f)} className="px-3 py-1.5 bg-theme-30 hover:bg-zinc-700 rounded text-xs text-zinc-300 font-medium transition">{t('common.options')}</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )
                      })()
                    )}
                  </div>
                </div>
              )}
{/* VIEW: CÀI ĐẶT */}
              {activeView === 'settings' && (
                <div className="w-full max-w-5xl">
                  <h2 className="text-3xl font-bold text-white mb-6">{t('settings.title')}</h2>
                  <div className="bg-theme-60/50 border border-theme-30 p-6 rounded-xl space-y-6">
                    {/* NGÔN NGỮ / LANGUAGE */}
                    <div>
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.language.title')}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.language.desc')}</p>
                      <div className="w-72">
                        <CustomSelect 
                          value={language} 
                          onChange={(val) => setLanguage(val as any)} 
                          options={[
                            { value: 'en', label: t('settings.language.english') },
                            { value: 'vi', label: t('settings.language.vietnamese') }
                          ]} 
                        />
                      </div>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-3">{t('settings.customBg.title')}</h3>
                      
                      {isCore ? (
                        <p className="text-xs text-zinc-400 italic bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
                          {language === 'vi' ? 'Tính năng hình nền & giao diện màu sắc bị tắt hoàn toàn ở Chế độ cốt lõi (Core Mode) để tối ưu hiệu năng.' : 'Background and dynamic theme are completely disabled in Core Mode for maximum performance.'}
                        </p>
                      ) : (
                        <>
                          {/* Checkbox tùy chọn dùng ảnh bìa bài hát */}
                          <label className="flex items-center gap-3 cursor-pointer mb-4 select-none group w-fit">
                            <input 
                              type="checkbox" 
                              checked={useTrackCoverAsBg} 
                              onChange={(e) => setUseTrackCoverAsBg(e.target.checked)}
                              className="w-4 h-4 accent-theme-10 rounded cursor-pointer"
                            />
                            <span className="text-sm text-zinc-300 group-hover:text-white transition">
                              {t('settings.customBg.useTrackCover')}
                            </span>
                          </label>

                          {/* Phần dán link & chọn file: Ẩn khi bật chế độ dùng ảnh bìa */}
                          {!useTrackCoverAsBg && (
                            <div className="flex gap-3 items-center mb-4">
                              <input 
                                type="text" 
                                value={bgImageInput} 
                                onChange={(e) => setBgImageInput(e.target.value)} 
                                placeholder={t('settings.customBg.placeholder')} 
                                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300 focus:border-theme-10 outline-none" 
                              />
                              <button 
                                onClick={() => {
                                  const normalized = normalizeImagePath(bgImageInput)
                                  if (normalized) {
                                    setBgImageInput(normalized)
                                    setCustomBgImage(normalized)
                                  }
                                }}
                                className="bg-theme-30 hover:bg-theme-10/20 text-white hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-4 py-2 rounded-lg text-sm font-medium transition"
                              >
                                {t('settings.customBg.applyLink')}
                              </button>
                              <button 
                                onClick={async () => {
                                  const filePath = await window.api.selectImageFile()
                                  if (filePath) {
                                    const normalized = normalizeImagePath(filePath)
                                    setBgImageInput(normalized)
                                    setCustomBgImage(normalized)
                                  }
                                }}
                                className="bg-theme-10 hover:bg-theme-10 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                              >
                                {t('settings.customBg.chooseImage')}
                              </button>
                              <button 
                                onClick={() => { setCustomBgImage(null); setBgImageInput(''); }}
                                className="bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 px-4 py-2 rounded-lg text-sm font-medium transition"
                              >
                                {t('settings.customBg.removeBg')}
                              </button>
                            </div>
                          )}
                          
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-zinc-300 w-32">{t('settings.customBg.opacity')}:</span>
                              <input 
                                type="range" 
                                min="0" max="1" step="0.05" 
                                value={customBgOpacity} 
                                onChange={(e) => setCustomBgOpacity(parseFloat(e.target.value))}
                                onWheel={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const delta = e.deltaY < 0 ? 0.05 : -0.05
                                  setCustomBgOpacity(prev => Math.max(0, Math.min(1, Math.round((prev + delta) * 100) / 100)))
                                }}
                                className="flex-1 accent-theme-10"
                              />
                              <span className="text-sm font-mono text-zinc-400 w-12 text-right">{Math.round(customBgOpacity * 100)}%</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-zinc-300 w-32">{t('settings.customBg.blur')}:</span>
                              <input 
                                type="range" 
                                min="0" max="100" step="1" 
                                value={customBgBlur} 
                                onChange={(e) => setCustomBgBlur(parseInt(e.target.value))}
                                onWheel={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const delta = e.deltaY < 0 ? 2 : -2
                                  setCustomBgBlur(prev => Math.max(0, Math.min(100, prev + delta)))
                                }}
                                className="flex-1 accent-theme-10"
                              />
                              <span className="text-sm font-mono text-zinc-400 w-12 text-right">{customBgBlur}px</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* QUẢN LÝ ĐA THƯ MỤC NHẠC */}
                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-theme-10 font-semibold">{t('settings.library.title')}</h3>
                        <span className="text-xs text-zinc-400">
                          {libraryPaths.length} {t('settings.library.folderCount')} • {libraryTracks.length} {t('common.songs')}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.library.desc')}</p>
                      
                      <div className="space-y-2.5 mb-4">
                        {libraryPaths.length === 0 ? (
                          <p className="text-zinc-500 italic text-sm p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">{t('settings.library.notSet')}</p>
                        ) : (
                          libraryPaths.map((fPath, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3 bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 hover:border-zinc-700 transition">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Folder size={18} className="text-theme-10 shrink-0" />
                                <span className="text-sm text-zinc-200 truncate font-mono">{fPath}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button 
                                  onClick={() => handleUpdateLibraryFolder(fPath)}
                                  className="px-3 py-1.5 bg-theme-30/60 hover:bg-theme-30 text-xs font-medium text-zinc-300 hover:text-white rounded-lg transition"
                                  title={t('settings.library.updateFolder')}
                                >
                                  {t('settings.library.change')}
                                </button>
                                <button 
                                  onClick={async () => {
                                    // @ts-ignore
                                    await window.api.showInFolder(fPath)
                                  }}
                                  className="p-1.5 bg-theme-30/60 hover:bg-theme-30 text-zinc-400 hover:text-white rounded-lg transition"
                                  title={t('settings.library.openFolder')}
                                >
                                  <FolderOpen size={15} />
                                </button>
                                <button 
                                  onClick={() => handleRemoveLibraryFolder(fPath)}
                                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                                  title={t('settings.library.removeFolder')}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleAddLibraryFolder} 
                          className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-theme-10/20"
                        >
                          <Plus size={16} /> {t('settings.library.addFolder')}
                        </button>
                        <button 
                          onClick={handleReloadLibrary} 
                          disabled={isReloading}
                          className="flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                        >
                          <RefreshCw size={15} className={isReloading ? 'animate-spin' : ''} /> {t('settings.library.rescan')}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.bitPerfect.title')}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 text-sm">{t('settings.bitPerfect.label')}</span>
                        <input 
                          type="checkbox" 
                          checked={bitPerfectEnabled} 
                          onChange={async (e) => {
                            const val = e.target.checked
                            const prevTrack = currentTrack
                            const currentPlaybackTime = (audioRef.current as any)?._currentTime || audioRef.current?.currentTime || 0
                            const wasPlaying = isPlaying

                            setBitPerfectEnabled(val)
                            await window.api.setBitPerfect(val)

                            if (prevTrack && prevTrack.filePath) {
                              if (val) {
                                if (audioRef.current) audioRef.current.pause()
                                if (wasPlaying) {
                                  await window.api.mpvPlay(prevTrack.filePath, 0)
                                  if (currentPlaybackTime > 0) {
                                    window.api.mpvSeek(currentPlaybackTime)
                                  }
                                }
                              } else {
                                if (audioRef.current) {
                                  audioRef.current.currentTime = currentPlaybackTime
                                  if (wasPlaying) {
                                    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                                      await audioCtxRef.current.resume().catch(() => {})
                                    }
                                    audioRef.current.play().catch(console.warn)
                                  }
                                }
                              }
                            }
                          }} 
                          className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">{t('settings.bitPerfect.note')}</p>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.googleDrive.title')}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.googleDrive.desc')}</p>
                      <div className="flex gap-3 items-center">
                        <input type="text" value={googleDriveApiKey} onChange={e => setGoogleDriveApiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-theme-10 transition-colors" />
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 italic">{t('settings.googleDrive.note')}</p>
                    </div>


                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.windowBehavior.title')}</h3>
                      <div className="flex flex-col gap-4 mt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-zinc-200 text-sm">{t('settings.windowBehavior.onMinimize')}</p>
                            <p className="text-xs text-zinc-500">{t('settings.windowBehavior.onMinimizeDesc')}</p>
                          </div>
                          <div className="w-72">
                            <CustomSelect value={minimizeToTray ? 'tray' : 'taskbar'} onChange={(val) => setMinimizeToTray(val === 'tray')} options={[{ value: 'taskbar', label: t('settings.windowBehavior.minimizeTaskbar') }, { value: 'tray', label: t('settings.windowBehavior.minimizeTray') }]} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-zinc-200 text-sm">{t('settings.windowBehavior.onClose')}</p>
                            <p className="text-xs text-zinc-500">{t('settings.windowBehavior.onCloseDesc')}</p>
                          </div>
                          <div className="w-72">
                            <CustomSelect value={closeToTray ? 'tray' : 'quit'} onChange={(val) => setCloseToTray(val === 'tray')} options={[{ value: 'quit', label: t('settings.windowBehavior.closeQuit') }, { value: 'tray', label: t('settings.windowBehavior.closeTray') }]} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.appMode.title')}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.appMode.desc')}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Tiêu chuẩn (Standard) */}
                        <div 
                          onClick={() => {
                            setAppMode('default')
                          }}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            appMode === 'default'
                              ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10'
                              : 'bg-theme-60/40 border-theme-30/60 hover:bg-theme-30/40 hover:border-zinc-600'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-white flex items-center gap-2">
                                <Sparkles size={16} className={appMode === 'default' ? 'text-theme-10' : 'text-zinc-400'} />
                                {t('settings.appMode.standard')}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                              {t('settings.appMode.standardDesc')}
                            </p>
                          </div>
                        </div>

                        {/* 2. Tiết kiệm (Lite) */}
                        <div 
                          onClick={() => {
                            setAppMode('lite')
                            setShowVisualizer(false)
                            setShowLyricsPanel(false)
                            setIsLyricsMaximized(false)
                            // @ts-ignore
                            if (window.api && window.api.forceGC) setTimeout(() => window.api.forceGC(), 100)
                          }}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            appMode === 'lite'
                              ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10'
                              : 'bg-theme-60/40 border-theme-30/60 hover:bg-theme-30/40 hover:border-zinc-600'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-white flex items-center gap-2">
                                <Leaf size={16} className={appMode === 'lite' ? 'text-theme-10' : 'text-zinc-400'} />
                                {t('settings.appMode.lite')}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                              {t('settings.appMode.liteDesc')}
                            </p>
                          </div>
                        </div>

                        {/* 3. Cốt lõi (Core) */}
                        <div 
                          onClick={() => {
                            setAppMode('core')
                            setShowVisualizer(false)
                            setShowLyricsPanel(false)
                            setIsLyricsMaximized(false)
                            setShowEQ(false)
                            if (activeView === 'home' || activeView === 'home-ytm' || activeView === 'home-soundcloud' || activeView === 'online' || activeView === 'drive') {
                              setActiveView('songs')
                            }
                            // @ts-ignore
                            if (window.api && window.api.forceGC) setTimeout(() => window.api.forceGC(), 100)
                          }}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            appMode === 'core'
                              ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10'
                              : 'bg-theme-60/40 border-theme-30/60 hover:bg-theme-30/40 hover:border-zinc-600'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-white flex items-center gap-2">
                                <Cpu size={16} className={appMode === 'core' ? 'text-theme-10' : 'text-zinc-400'} />
                                {t('settings.appMode.core')}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                              {t('settings.appMode.coreDesc')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DISCORD RICH PRESENCE SETTINGS */}
                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-theme-10 font-semibold">{t('settings.discordRpc.title')}</h3>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            discordConnected 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${discordConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                            {discordConnected ? t('settings.discordRpc.connectedStatus') : t('settings.discordRpc.disconnectedStatus')}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={discordRpcEnabled}
                          onChange={(e) => updateDiscordSettings({ enabled: e.target.checked })}
                          className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer"
                        />
                      </div>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.discordRpc.desc')}</p>

                      {discordRpcEnabled && (
                        <div className="space-y-4 pl-1">
                          {/* Toggles Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* 1. Show Details */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showDetails')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showDetailsDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowDetails}
                                onChange={(e) => updateDiscordSettings({ showDetails: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>

                            {/* 2. Show Live Progress Time */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showTime')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showTimeDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowTime}
                                onChange={(e) => updateDiscordSettings({ showTime: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>

                            {/* 3. Show Cover Art */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showCover')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showCoverDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowCover}
                                onChange={(e) => updateDiscordSettings({ showCover: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>

                            {/* 4. Show Quality */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showQuality')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showQualityDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowQuality}
                                onChange={(e) => updateDiscordSettings({ showQuality: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>

                            {/* 5. Show Buttons */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showButtons')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showButtonsDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowButtons}
                                onChange={(e) => updateDiscordSettings({ showButtons: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>

                            {/* 6. Show Idle */}
                            <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                              <div className="pr-2">
                                <p className="text-zinc-200 text-sm">{t('settings.discordRpc.showIdle')}</p>
                                <p className="text-xs text-zinc-500">{t('settings.discordRpc.showIdleDesc')}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={discordShowIdle}
                                onChange={(e) => updateDiscordSettings({ showIdle: e.target.checked })}
                                className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW: NGHỆ SĨ (ARTISTS LIST) */}
              {activeView === 'artists' && !activeArtist && (
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold text-white">{searchQuery ? t('artistsView.searchResults') : t('artistsView.title')}</h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        {artistsData.artistsList.length} {t('artistsView.artistCount')} • {libraryTracks.length} {t('common.songs')}
                      </p>
                    </div>
                  </div>

                  {/* Alphabet fast jump bar */}
                  <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-theme-30/40 sticky top-0 bg-theme-90/80 backdrop-blur z-10 py-1">
                    {artistsData.alphabetGroups.map(grp => (
                      <button
                        key={grp.letter}
                        onClick={() => {
                          const el = document.getElementById(`artist-group-${grp.letter}`)
                          if (el) el.scrollIntoView({ behavior: 'smooth' })
                        }}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-theme-60/40 hover:bg-theme-10 hover:text-white text-zinc-400 transition"
                      >
                        {grp.letter} <span className="text-[10px] opacity-60">({grp.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Danh sách nhóm theo Alphabet A-Z */}
                  <div className="space-y-8">
                    {(() => {
                      const lowerQuery = searchQuery.toLowerCase().trim()
                      const filteredArtists = searchQuery 
                        ? artistsData.artistsList.filter(a => a.name.toLowerCase().includes(lowerQuery))
                        : null

                      if (filteredArtists) {
                        if (filteredArtists.length === 0) {
                          return <p className="text-zinc-500 text-center mt-10">{t('artistsView.noArtists')}</p>
                        }
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredArtists.map(artist => (
                              <div 
                                key={artist.name} 
                                onClick={() => {
                                  if (contentContainerRef.current) {
                                    scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                  }
                                  setActiveArtist(artist);
                                }}
                                onContextMenu={(e) => handleArtistContextMenu(artist, e)}
                                className="bg-theme-60/40 hover:bg-theme-30/60 p-3.5 rounded-2xl border border-theme-30/40 hover:border-theme-10/40 transition group cursor-pointer flex items-center justify-between shadow-md track-card-optimized"
                              >
                                <div className="flex items-center gap-4 min-w-0">
                                  <div className="w-14 h-14 rounded-full overflow-hidden bg-theme-30 border border-theme-30/80 shadow-md flex items-center justify-center flex-shrink-0">
                                    {(!isLite && artist.coverArt) ? (
                                      <img loading="lazy" src={toMediaUrl(artist.coverArt)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                    ) : (
                                      <Mic2 size={24} className="text-theme-10" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">{artist.name}</h3>
                                    <p className="text-xs text-zinc-400 mt-1">
                                      {artist.albumCount} {t('artistsView.albumCount')} • {artist.trackCount} {t('artistsView.trackCount')}
                                    </p>
                                  </div>
                                </div>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleArtistContextMenu(artist, e); }}
                                  className="text-zinc-500 hover:text-white p-2 rounded-lg transition opacity-0 group-hover:opacity-100"
                                >
                                  <MoreVertical size={16} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      }

                      if (artistsData.alphabetGroups.length === 0) {
                        return <p className="text-zinc-500 text-center mt-10">{t('artistsView.noArtists')}</p>
                      }

                      return artistsData.alphabetGroups.map(grp => {
                        const isCollapsed = collapsedArtistLetters[grp.letter]
                        return (
                          <div key={grp.letter} id={`artist-group-${grp.letter}`} className="space-y-3">
                            <div 
                              onClick={() => setCollapsedArtistLetters(prev => ({ ...prev, [grp.letter]: !prev[grp.letter] }))}
                              className="flex items-center gap-3 cursor-pointer py-1 select-none border-b border-theme-30/30 group w-fit"
                            >
                              <span className="text-2xl font-black text-theme-10">{grp.letter}</span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-theme-10/10 text-theme-10">{grp.count}</span>
                              {isCollapsed ? <ChevronRight size={16} className="text-zinc-500 group-hover:text-white" /> : <ChevronDown size={16} className="text-zinc-500 group-hover:text-white" />}
                            </div>

                            {!isCollapsed && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                                {grp.artists.map(artist => (
                                  <div 
                                    key={artist.name} 
                                    onClick={() => {
                                      if (contentContainerRef.current) {
                                        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                      }
                                      setActiveArtist(artist);
                                    }}
                                    onContextMenu={(e) => handleArtistContextMenu(artist, e)}
                                    className="bg-theme-60/40 hover:bg-theme-30/60 p-3.5 rounded-2xl border border-theme-30/40 hover:border-theme-10/40 transition group cursor-pointer flex items-center justify-between shadow-md track-card-optimized"
                                  >
                                    <div className="flex items-center gap-4 min-w-0">
                                      <div className="w-14 h-14 rounded-full overflow-hidden bg-theme-30 border border-theme-30/80 shadow-md flex items-center justify-center flex-shrink-0">
                                        {(!isLite && artist.coverArt) ? (
                                          <img loading="lazy" src={toMediaUrl(artist.coverArt)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                        ) : (
                                          <Mic2 size={24} className="text-theme-10" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">{artist.name}</h3>
                                        <p className="text-xs text-zinc-400 mt-1">
                                          {artist.albumCount} {t('artistsView.albumCount')} • {artist.trackCount} {t('artistsView.trackCount')}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleArtistContextMenu(artist, e); }}
                                      className="text-zinc-500 hover:text-white p-2 rounded-lg transition opacity-0 group-hover:opacity-100"
                                    >
                                      <MoreVertical size={16} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {/* VIEW: CHI TIẾT NGHỆ SĨ (ARTIST DETAIL) */}
              {activeView === 'artists' && activeArtist && (
                <div className="flex flex-col space-y-8 pb-16">
                  <div>
                    <button 
                      onClick={() => {
                        if (contentContainerRef.current) {
                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                        }
                        setActiveArtist(null);
                      }} 
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
                    >
                      <ArrowLeft size={16} /> {t('artistsView.backToArtists')}
                    </button>

                    <div className="flex items-end gap-6 mb-6">
                      <div className="w-36 h-36 rounded-full overflow-hidden bg-theme-30 border-2 border-theme-10/40 shadow-2xl flex items-center justify-center flex-shrink-0">
                        {(!isLite && activeArtist.coverArt) ? (
                          <img src={toMediaUrl(activeArtist.coverArt)} className="w-full h-full object-cover" />
                        ) : (
                          <Mic2 size={48} className="text-theme-10" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">Nghệ sĩ</p>
                        <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">{activeArtist.name}</h2>
                        <p className="text-sm text-zinc-400 mb-4">
                          {activeArtist.albums.length} {t('artistsView.albumCount')} • {activeArtist.tracks.length} {t('artistsView.trackCount')}
                        </p>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => {
                              if (activeArtist.tracks.length > 0) {
                                handleRowClick(activeArtist.tracks[0], activeArtist.tracks)
                              }
                            }}
                            className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20"
                          >
                            <Play size={16} className="fill-current" /> {t('artistsView.playAll')}
                          </button>
                          <button 
                            onClick={() => {
                              if (activeArtist.tracks.length > 0) {
                                const shuffled = [...activeArtist.tracks].sort(() => Math.random() - 0.5)
                                handleRowClick(shuffled[0], shuffled)
                              }
                            }}
                            className="flex items-center gap-2 bg-theme-30 hover:bg-theme-30/80 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
                          >
                            <Shuffle size={16} /> {t('artistsView.shuffle')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Albums & Danh sách phát của nghệ sĩ */}
                  {activeArtist.albums && activeArtist.albums.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Disc size={18} className="text-theme-10" /> {t('artistsView.albums')} ({activeArtist.albums.length})
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
                              {(!isLite && alb.coverArt) ? (
                                <img src={toMediaUrl(alb.coverArt)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                                  <Disc size={32} />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg">
                                  <Play size={18} className="ml-0.5 fill-current" />
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm text-white group-hover:text-theme-10 transition truncate">{alb.title}</h4>
                              <p className="text-xs text-zinc-400 truncate mt-0.5">
                                {alb.year ? `${alb.year} • ` : ''}{alb.tracks.length} {t('artistsView.trackCount')}
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
                      <Music size={18} className="text-theme-10" /> {t('artistsView.singlesAndTracks')} ({activeArtist.tracks.length})
                    </h3>
                    <div className="w-full h-[540px]">
                      {renderTrackTable(activeArtist.tracks)}
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW: THỂ LOẠI (GENRES LIST) */}
              {activeView === 'genres' && !activeGenre && (
                <div className="flex flex-col space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white">{searchQuery ? t('genresView.searchResults') : t('genresView.title')}</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {genresData.length} {t('genresView.genreCount')} • {libraryTracks.length} {t('common.songs')}
                    </p>
                  </div>

                  <div className="space-y-8">
                    {(() => {
                      const lowerQuery = searchQuery.toLowerCase().trim()
                      const filteredGenres = searchQuery 
                        ? genresData.filter(g => g.name.toLowerCase().includes(lowerQuery))
                        : genresData
                      const matchedSongs = searchQuery ? processedLibraryTracks : []

                      if (!searchQuery && genresData.length === 0) {
                        return <p className="text-zinc-500 text-center mt-10">{t('genresView.noGenres')}</p>
                      }

                      return (
                        <div className="space-y-10">
                          {filteredGenres.length > 0 && (
                            <div>
                              {searchQuery && (
                                <h3 className="text-xl font-bold text-white mb-6">
                                  {t('genresView.title')} ({filteredGenres.length})
                                </h3>
                              )}
                              {viewMode === 'table' ? (
                                <div className="w-full bg-theme-60/20 rounded-2xl border border-theme-30/40 overflow-hidden shadow-xl">
                                  <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-theme-30/40 border-b border-theme-30/50 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <div className="col-span-1 text-center">#</div>
                                    <div className="col-span-5">{t('genresView.title')}</div>
                                    <div className="col-span-4">{t('genresView.topArtists')}</div>
                                    <div className="col-span-1 text-center">{t('common.songs')}</div>
                                    <div className="col-span-1 text-right">Phát</div>
                                  </div>
                                  <div className="divide-y divide-theme-30/20">
                                    {filteredGenres.map((genre, idx) => (
                                      <div
                                        key={genre.name}
                                        onClick={() => {
                                          if (contentContainerRef.current) {
                                            scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                          }
                                          setActiveGenre(genre);
                                        }}
                                        className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized"
                                      >
                                        <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
                                          {idx + 1}
                                        </div>
                                        <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-theme-10/30 to-theme-30 border border-theme-10/30 flex items-center justify-center shrink-0 shadow-md">
                                            <Tag size={20} className="text-theme-10" />
                                          </div>
                                          <div className="min-w-0">
                                            <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">{genre.name}</h4>
                                            <p className="text-xs text-zinc-500 truncate mt-0.5">{genre.artistCount} {t('artistsView.artistCount')}</p>
                                          </div>
                                        </div>
                                        <div className="col-span-4 flex items-center gap-1.5 overflow-hidden">
                                          {genre.artists.slice(0, 3).map((art: string) => (
                                            <span key={art} className="px-2 py-0.5 bg-theme-30/50 text-[11px] text-zinc-300 rounded-md truncate max-w-[120px]">
                                              {art}
                                            </span>
                                          ))}
                                          {genre.artists.length > 3 && (
                                            <span className="text-[10px] text-zinc-500">+{genre.artists.length - 3}</span>
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
                                              e.stopPropagation();
                                              if (genre.tracks.length > 0) handleRowClick(genre.tracks[0], genre.tracks);
                                            }}
                                            className="p-2 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition"
                                            title={t('artistsView.playAll')}
                                          >
                                            <Play size={14} className="ml-0.5 fill-current" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : viewMode === 'compact' ? (
                                <div className="w-full space-y-1.5">
                                  {filteredGenres.map((genre, idx) => (
                                    <div
                                      key={genre.name}
                                      onClick={() => {
                                        if (contentContainerRef.current) {
                                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                        }
                                        setActiveGenre(genre);
                                      }}
                                      className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
                                    >
                                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                        <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">{idx + 1}</span>
                                        <div className="w-8 h-8 rounded-lg bg-theme-10/20 border border-theme-10/30 flex items-center justify-center shrink-0">
                                          <Tag size={15} className="text-theme-10" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <h4 className="font-semibold text-white text-sm group-hover:text-theme-10 transition truncate">{genre.name}</h4>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 shrink-0">
                                        <span className="text-xs text-zinc-400 font-mono">{genre.trackCount} {t('common.songs')} • {genre.artistCount} {t('artistsView.artistCount')}</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (genre.tracks.length > 0) handleRowClick(genre.tracks[0], genre.tracks);
                                          }}
                                          className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100"
                                          title={t('artistsView.playAll')}
                                        >
                                          <Play size={13} className="ml-0.5 fill-current" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                                  {filteredGenres.map(genre => (
                                    <div 
                                      key={genre.name} 
                                      onClick={() => {
                                        if (contentContainerRef.current) {
                                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                        }
                                        setActiveGenre(genre);
                                      }}
                                      className="bg-gradient-to-br from-theme-60/80 to-theme-30/40 hover:from-theme-10/20 hover:to-theme-30/70 p-4 rounded-2xl border border-theme-30/50 hover:border-theme-10/50 transition duration-300 group cursor-pointer shadow-lg flex flex-col justify-between h-48 track-card-optimized"
                                    >
                                      <div className="w-full aspect-video bg-theme-30/60 rounded-xl overflow-hidden relative mb-3 flex items-center justify-center">
                                        {(!isLite && genre.coverArts.length > 0) ? (
                                          <div className="w-full h-full grid grid-cols-2 gap-0.5">
                                            {genre.coverArts.slice(0, 4).map((c, i) => (
                                              <img key={i} loading="lazy" src={toMediaUrl(c)} className="w-full h-full object-cover" />
                                            ))}
                                          </div>
                                        ) : (
                                          <Tag size={32} className="text-theme-10/80" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (genre.tracks.length > 0) handleRowClick(genre.tracks[0], genre.tracks);
                                            }}
                                            className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition"
                                          >
                                            <Play size={18} className="ml-0.5 fill-current" />
                                          </button>
                                        </div>
                                      </div>
                                      <div>
                                        <h3 className="font-bold text-white text-base group-hover:text-theme-10 transition truncate">{genre.name}</h3>
                                        <p className="text-xs text-zinc-400 mt-1">
                                          {genre.trackCount} {t('common.songs')} • {genre.artistCount} {t('artistsView.artistCount')}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {searchQuery && (
                            <div className="flex flex-col h-[520px] w-full shrink-0">
                              <h3 className="text-xl font-bold text-white mb-4 shrink-0">{t('common.songs')} ({matchedSongs.length})</h3>
                              <div className="flex-1 min-h-0 flex flex-col h-[460px] w-full">
                                {matchedSongs.length > 0 ? (
                                  renderTrackTable(matchedSongs)
                                ) : (
                                  <p className="text-zinc-500 mt-4">{t('songsView.noSongsMatched', { query: searchQuery })}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {searchQuery && filteredGenres.length === 0 && matchedSongs.length === 0 && (
                            <p className="text-zinc-500 mt-8 text-center">{t('playlistsView.noResults', { query: searchQuery })}</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* VIEW: CHI TIẾT THỂ LOẠI (GENRE DETAIL) */}
              {activeView === 'genres' && activeGenre && (
                <div className="flex flex-col h-full space-y-6">
                  <div>
                    <button 
                      onClick={() => {
                        if (contentContainerRef.current) {
                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                        }
                        setActiveGenre(null);
                      }} 
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
                    >
                      <ArrowLeft size={16} /> {t('genresView.backToGenres')}
                    </button>

                    <div className="flex items-end gap-6 mb-6">
                      <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-theme-10/30 to-theme-30 border border-theme-10/40 shadow-2xl flex items-center justify-center flex-shrink-0">
                        <Tag size={48} className="text-theme-10" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">Thể loại</p>
                        <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">{activeGenre.name}</h2>
                        <p className="text-sm text-zinc-400 mb-4">
                          {searchQuery ? `${processedGenreTracks.length} / ${activeGenre.tracks.length}` : activeGenre.tracks.length} {t('common.songs')} • {activeGenre.artistCount} {t('artistsView.artistCount')}
                        </p>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => {
                              const tracksToPlay = searchQuery ? processedGenreTracks : activeGenre.tracks;
                              if (tracksToPlay.length > 0) {
                                handleRowClick(tracksToPlay[0], tracksToPlay);
                              }
                            }}
                            className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20"
                          >
                            <Play size={16} className="fill-current" /> {t('artistsView.playAll')}
                          </button>
                          <button 
                            onClick={() => {
                              const tracksToPlay = searchQuery ? processedGenreTracks : activeGenre.tracks;
                              if (tracksToPlay.length > 0) {
                                const shuffled = [...tracksToPlay].sort(() => Math.random() - 0.5);
                                handleRowClick(shuffled[0], shuffled);
                              }
                            }}
                            className="flex items-center gap-2 bg-theme-30 hover:bg-theme-30/80 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
                          >
                            <Shuffle size={16} /> {t('artistsView.shuffle')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Top nghệ sĩ trong thể loại */}
                    {activeGenre.artists && activeGenre.artists.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <span className="text-xs text-zinc-500 shrink-0">{t('genresView.topArtists')}:</span>
                        {activeGenre.artists.slice(0, 10).map((art: string) => (
                          <span 
                            key={art} 
                            onClick={() => {
                              const found = artistsData.artistsList.find(a => a.name.toLowerCase() === art.toLowerCase())
                              if (found) {
                                setActiveArtist(found)
                                setActiveView('artists')
                              }
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
                    {renderTrackTable(processedGenreTracks)}
                  </div>
                </div>
              )}

              {/* VIEW: PLAYLIST CỦA NGƯỜI DÙNG (USER PLAYLISTS LIST) */}
              {activeView === 'user-playlists' && !activeUserPlaylist && (
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold text-white">{searchQuery ? t('userPlaylistsView.searchResults') : t('userPlaylistsView.title')}</h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        {userPlaylists.length} {t('userPlaylistsView.playlistCount')}
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowCreateUserPlaylistModal(true)} 
                      className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20"
                    >
                      <Plus size={16} /> {t('userPlaylistsView.createPlaylist')}
                    </button>
                  </div>

                  <div className="space-y-8">
                    {(() => {
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
                              <div className="col-span-2 text-right">Thao tác</div>
                            </div>
                            <div className="divide-y divide-theme-30/20">
                              {matchedUserPlaylists.map((pl, idx) => {
                                const resolved = getResolvedUserPlaylistTracks(pl)
                                const coverImg = pl.thumbnail || resolved.find(t => t.coverArt)?.coverArt

                                return (
                                  <div
                                    key={pl.id}
                                    onClick={() => {
                                      if (contentContainerRef.current) {
                                        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                      }
                                      setActiveUserPlaylist(pl);
                                    }}
                                    onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                                    className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-theme-30/40 transition group cursor-pointer track-row-optimized"
                                  >
                                    <div className="col-span-1 text-center text-xs text-zinc-500 font-mono group-hover:text-theme-10 font-bold">
                                      {idx + 1}
                                    </div>
                                    <div className="col-span-6 flex items-center gap-3.5 min-w-0">
                                      <div className="w-12 h-12 rounded-xl bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow-md">
                                        {(!isLite && coverImg) ? <img loading="lazy" decoding="async" src={toMediaUrl(coverImg)} className="w-full h-full object-cover" /> : <ListPlus size={20} className="text-zinc-600" />}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (resolved.length > 0) handleRowClick(resolved[0], resolved);
                                            }}
                                            className="text-white hover:scale-110 transition"
                                          >
                                            <Play size={16} className="fill-current" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-bold text-white text-sm group-hover:text-theme-10 transition truncate">{pl.name}</h4>
                                        <p className="text-xs text-zinc-500 truncate mt-0.5">Playlist của tôi</p>
                                      </div>
                                    </div>
                                    <div className="col-span-3 text-center">
                                      <span className="px-2.5 py-1 rounded-full bg-theme-30/60 text-xs font-semibold text-zinc-300">
                                        {pl.trackIds?.length || 0} {t('common.songs')}
                                      </span>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-end gap-2">
                                      <button onClick={(e) => { e.stopPropagation(); handleChangeUserPlaylistCover(pl.id); }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition opacity-0 group-hover:opacity-100" title={t('userPlaylistsView.chooseCover')}><ImageIcon size={15}/></button>
                                      <button onClick={(e) => { e.stopPropagation(); handleUserPlaylistContextMenu(pl, e) }} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-theme-30 transition"><MoreVertical size={15}/></button>
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
                              const coverImg = pl.thumbnail || resolved.find(t => t.coverArt)?.coverArt

                              return (
                                <div
                                  key={pl.id}
                                  onClick={() => {
                                    if (contentContainerRef.current) {
                                      scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                    }
                                    setActiveUserPlaylist(pl);
                                  }}
                                  onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                                  className="flex items-center justify-between px-4 py-2 bg-theme-60/30 hover:bg-theme-30/50 rounded-xl border border-theme-30/20 hover:border-theme-30/60 transition group cursor-pointer shadow-sm track-row-optimized"
                                >
                                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                    <span className="text-xs text-zinc-500 font-mono w-6 text-center shrink-0 group-hover:text-theme-10 font-bold">{idx + 1}</span>
                                    <div className="w-9 h-9 rounded-lg bg-theme-30 overflow-hidden shrink-0 relative flex items-center justify-center shadow">
                                      {(!isLite && coverImg) ? <img loading="lazy" decoding="async" src={toMediaUrl(coverImg)} className="w-full h-full object-cover" /> : <ListPlus size={16} className="text-zinc-600" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="font-semibold text-white text-sm group-hover:text-theme-10 transition truncate">{pl.name}</h4>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <span className="text-xs text-zinc-400 font-mono">{pl.trackIds?.length || 0} {t('common.songs')}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (resolved.length > 0) handleRowClick(resolved[0], resolved);
                                      }}
                                      className="p-1.5 bg-theme-10/20 hover:bg-theme-10 text-theme-10 hover:text-white rounded-lg transition opacity-0 group-hover:opacity-100"
                                      title={t('artistsView.playAll')}
                                    >
                                      <Play size={13} className="ml-0.5 fill-current" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUserPlaylistContextMenu(pl, e); }}
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
                          {matchedUserPlaylists.map(pl => {
                            const resolved = getResolvedUserPlaylistTracks(pl)
                            const coverImg = pl.thumbnail || resolved.find(t => t.coverArt)?.coverArt

                            return (
                              <div 
                                key={pl.id} 
                                onClick={() => {
                                  if (contentContainerRef.current) {
                                    scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                  }
                                  setActiveUserPlaylist(pl);
                                }}
                                onContextMenu={(e) => handleUserPlaylistContextMenu(pl, e)}
                                className="bg-theme-60/40 hover:bg-theme-30/50 p-4 rounded-2xl border border-theme-30/50 hover:border-theme-10/40 transition group cursor-pointer flex flex-col justify-between shadow-lg track-card-optimized"
                              >
                                <div className="aspect-square bg-theme-30 rounded-xl mb-3 overflow-hidden relative shadow-md">
                                  {(!isLite && coverImg) ? (
                                    <img loading="lazy" decoding="async" src={toMediaUrl(coverImg)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                                      <ListPlus size={36} />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (resolved.length > 0) handleRowClick(resolved[0], resolved);
                                      }}
                                      className="w-10 h-10 rounded-full bg-theme-10 text-white flex items-center justify-center shadow-lg"
                                    >
                                      <Play size={18} className="ml-0.5 fill-current" />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleChangeUserPlaylistCover(pl.id); }}
                                      className="w-8 h-8 rounded-full bg-black/70 text-white hover:bg-theme-10 flex items-center justify-center transition"
                                      title={t('userPlaylistsView.chooseCover')}
                                    >
                                      <ImageIcon size={14} />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0 flex-1 pr-2">
                                    <h3 className="font-bold text-white truncate text-sm group-hover:text-theme-10 transition">{pl.name}</h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">{pl.trackIds?.length || 0} {t('common.songs')}</p>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleUserPlaylistContextMenu(pl, e); }}
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
              )}

              {/* VIEW: CHI TIẾT PLAYLIST NGƯỜI DÙNG (USER PLAYLIST DETAIL) */}
              {activeView === 'user-playlists' && activeUserPlaylist && (
                <div className="flex flex-col h-full space-y-6">
                  <div>
                    <button 
                      onClick={() => {
                        if (contentContainerRef.current) {
                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                        }
                        setActiveUserPlaylist(null);
                      }} 
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
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
                          {(!isLite && (activeUserPlaylist.thumbnail || activeUserPlaylistTracks.find(t => t.coverArt)?.coverArt)) ? (
                            <img 
                              src={toMediaUrl(activeUserPlaylist.thumbnail || activeUserPlaylistTracks.find(t => t.coverArt)?.coverArt)} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                              <ListPlus size={44} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1">
                            <ImageIcon size={18} />
                            <span>{t('modals.editPlaylist.title')}</span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">{t('userPlaylistsView.title')}</p>
                          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-2 truncate">{activeUserPlaylist.name}</h2>
                          {activeUserPlaylist.description && (
                            <p className="text-sm text-zinc-300 line-clamp-2 max-w-xl mb-3">{activeUserPlaylist.description}</p>
                          )}
                          <p className="text-sm text-zinc-400 mb-4">{activeUserPlaylistTracks.length} {t('common.songs')}</p>
                          
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
                                  const shuffled = [...activeUserPlaylistTracks].sort(() => Math.random() - 0.5)
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
                      renderTrackTable(activeUserPlaylistTracks)
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
              )}

              {/* VIEW: PLAYLISTS THƯ MỤC / ALBUMS */}
              {activeView === 'playlists' && !activePlaylist && (
                <>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-bold text-white">{searchQuery ? t('playlistsView.searchResults') : t('playlistsView.title')}</h2>
                    {!searchQuery && (
                      <div className="flex gap-3">
                        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-theme-10/20">
                          <Plus size={16} /> {t('playlistsView.createPlaylist')}
                        </button>
                        <button onClick={handleAutoGeneratePlaylists} className="flex items-center gap-2 bg-theme-30 hover:bg-theme-10/20 hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-4 py-2 rounded-lg text-sm font-medium transition">
                          <Sparkles size={16} /> {t('playlistsView.autoCategorize')}
                        </button>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const matchedSongs = searchQuery ? processedLibraryTracks : []

                    if (!searchQuery && playlists.length === 0) {
                      return <p className="text-zinc-500">{t('playlistsView.noPlaylists')}</p>
                    }

                    return (
                      <div className="space-y-10">
                        {(matchedPlaylists.length > 0 || !searchQuery) && (
                          <div>
                            {searchQuery && <h3 className="text-xl font-bold text-white mb-6">{t('playlistsView.playlistsAndAlbums', { count: matchedPlaylists.length })}</h3>}
                            
                            {viewMode === 'table' ? (
                              <div className="w-full bg-theme-60/20 rounded-2xl border border-theme-30/40 overflow-hidden shadow-xl">
                                <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-theme-30/40 border-b border-theme-30/50 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                  <div className="col-span-1 text-center">#</div>
                                  <div className="col-span-7">{t('playlistsView.title')}</div>
                                  <div className="col-span-2 text-center">{t('common.songs')}</div>
                                  <div className="col-span-2 text-right">Thao tác</div>
                                </div>
                                <div className="divide-y divide-theme-30/20">
                                  {matchedPlaylists.map((pl, idx) => (
                                    <PlaylistTableRow
                                      key={pl.path || pl.name}
                                      pl={pl}
                                      idx={idx}
                                      isLite={isLite}
                                      onClick={() => {
                                        if (contentContainerRef.current) {
                                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                        }
                                        setActivePlaylist(pl);
                                        setSearchQuery('');
                                      }}
                                      onContextMenu={(e) => handlePlaylistContextMenu(pl, e)}
                                      onPlay={() => {
                                        if (pl.tracks.length > 0) handleRowClick(pl.tracks[0], pl.tracks);
                                      }}
                                      onChangeImage={() => handleChangePlaylistImage(pl.name)}
                                      onRename={() => setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name })}
                                      t={t}
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : viewMode === 'compact' ? (
                              <div className="w-full space-y-1.5">
                                {matchedPlaylists.map((pl, idx) => (
                                  <PlaylistCompactRow
                                    key={pl.path || pl.name}
                                    pl={pl}
                                    idx={idx}
                                    isLite={isLite}
                                    onClick={() => {
                                      if (contentContainerRef.current) {
                                        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                      }
                                      setActivePlaylist(pl);
                                      setSearchQuery('');
                                    }}
                                    onContextMenu={(e) => handlePlaylistContextMenu(pl, e)}
                                    onPlay={() => {
                                      if (pl.tracks.length > 0) handleRowClick(pl.tracks[0], pl.tracks);
                                    }}
                                    t={t}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                                {matchedPlaylists.map(pl => (
                                  <PlaylistGridCard
                                    key={pl.path || pl.name}
                                    pl={pl}
                                    isLite={isLite}
                                    onClick={() => {
                                      if (contentContainerRef.current) {
                                        scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                                      }
                                      setActivePlaylist(pl);
                                      setSearchQuery('');
                                    }}
                                    onContextMenu={(e) => handlePlaylistContextMenu(pl, e)}
                                    onChangeImage={() => handleChangePlaylistImage(pl.name)}
                                    onExtractImage={() => handleExtractPlaylistImage(pl.name)}
                                    onRename={() => setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name })}
                                    t={t}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {searchQuery && (
                          <div className="flex flex-col h-[520px] w-full shrink-0">
                            <h3 className="text-xl font-bold text-white mb-4 shrink-0">{t('common.songs')} ({matchedSongs.length})</h3>
                            <div className="flex-1 min-h-0 flex flex-col h-[460px] w-full">
                              {matchedSongs.length > 0 ? (
                                renderTrackTable(matchedSongs)
                              ) : (
                                <p className="text-zinc-500 mt-4">{t('songsView.noSongsMatched', { query: searchQuery })}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {searchQuery && matchedPlaylists.length === 0 && matchedSongs.length === 0 && (
                          <p className="text-zinc-500 mt-8 text-center">{t('playlistsView.noResults', { query: searchQuery })}</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}

              {/* VIEW: CHI TIẾT PLAYLIST THƯ MỤC */}
              {activeView === 'playlists' && activePlaylist && (
                <div className="flex flex-col h-full space-y-6">
                  <div>
                    <button 
                      onClick={() => {
                        if (contentContainerRef.current) {
                          scrollPositionsRef.current[currentViewKey] = contentContainerRef.current.scrollTop;
                        }
                        setActivePlaylist(null);
                      }} 
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4 transition cursor-pointer"
                    >
                      <ArrowLeft size={16} /> {t('sidebar.myPlaylists')}
                    </button>

                    <div className="flex items-end justify-between gap-6 mb-6" onContextMenu={(e) => handlePlaylistContextMenu(activePlaylist, e)}>
                      <div className="flex items-end gap-6 min-w-0">
                        <div className="w-36 h-36 bg-theme-30 rounded-2xl overflow-hidden shadow-2xl relative group shrink-0 border border-theme-30/80">
                          {(!isLite && activePlaylist.thumbnail) ? (
                            <img loading="lazy" src={toMediaUrl(activePlaylist.thumbnail)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <FolderPlus size={40} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">Playlist</p>
                          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-3 truncate">{activePlaylist.name}</h2>
                          <p className="text-sm text-zinc-400 mb-4">{processedPlaylistTracks.length} {t('common.songs')}</p>
                          
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => {
                                if (processedPlaylistTracks.length > 0) {
                                  handleRowClick(processedPlaylistTracks[0], processedPlaylistTracks)
                                }
                              }}
                              className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
                            >
                              <Play size={16} className="fill-current" /> {t('userPlaylistsView.playAll')}
                            </button>
                            <button 
                              onClick={() => {
                                if (processedPlaylistTracks.length > 0) {
                                  const shuffled = [...processedPlaylistTracks].sort(() => Math.random() - 0.5)
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
                        <button onClick={() => setShowAddSongsModal(true)} className="flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer">
                          <Plus size={16} /> {t('playlistsView.addExistingSongs')}
                        </button>
                        <button onClick={handleImportFiles} className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer">
                          <Plus size={16} /> {t('playlistsView.importFromComputer')}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    {renderTrackTable(processedPlaylistTracks)}
                  </div>
                </div>
              )}

              </div>
            </div>
            
            {/* CỘT PHẢI: LỜI BÀI HÁT (SPLIT VIEW) */}
            {showLyricsPanel && (
              <div className="w-[25vw] min-w-[300px] max-w-[400px] border-l border-theme-30/50 bg-theme-60/40 backdrop-blur-sm flex flex-col">
                <div className="p-4 flex items-center justify-between border-b border-theme-30/50">
                  <h3 className="font-bold text-white flex items-center gap-2"><Mic2 size={16} className="text-theme-10"/> {t('lyrics.title')}</h3>
                  <button onClick={() => setIsLyricsMaximized(true)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-theme-30"><Maximize2 size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 text-center">
                  {lyrics.length === 0 ? <p className="text-zinc-500 italic mt-10">{t('lyrics.noLyrics')}</p> : lyrics.map((line, index) => {
                    const isActive = index === currentLyricIndex
                    return <p key={index} ref={isActive ? activeLyricRef : null} onClick={() => {if(audioRef.current){audioRef.current.currentTime = line.time}}} className={`cursor-pointer transition-all duration-300 font-bold ${isActive ? 'text-theme-10 text-xl' : 'text-zinc-500 text-sm hover:text-zinc-300'}`}>{line.text}</p>
                  })}
                </div>
                <div className="p-3 border-t border-theme-30/50 bg-zinc-950/40 h-16 shrink-0 w-full overflow-hidden flex items-center justify-center">
                  <WebGLVisualizer 
                    analyserNodeRef={analyserNodeRef} 
                    isPlaying={isPlaying} 
                    isLite={isLite} 
                    showVisualizer={true} 
                  />
                </div>
              </div>
            )}

            {/* CỘT PHẢI: HÀNG ĐỢI DANH SÁCH PHÁT (QUEUE) */}
            {showQueuePanel && (
              <div className="w-[25vw] min-w-[300px] max-w-[400px] border-l border-theme-30/50 bg-theme-60/40 backdrop-blur-sm flex flex-col">
                <div className="p-4 flex items-center justify-between border-b border-theme-30/50">
                  <h3 className="font-bold text-white flex items-center gap-2"><List size={16} className="text-theme-10"/> {t('queue.title')}</h3>
                  <button onClick={() => setShowQueuePanel(false)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-theme-30"><X size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {playQueue.length === 0 ? (
                    <p className="text-zinc-500 italic mt-10 text-center">{t('queue.empty')}</p>
                  ) : (
                    <DndContext 
                      sensors={dndSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => {
                        const { active, over } = event;
                        if (active.id !== over?.id) {
                          setPlayQueue((items) => {
                            const oldIndex = items.findIndex((_, i) => `queue-${i}` === active.id);
                            const newIndex = items.findIndex((_, i) => `queue-${i}` === over?.id);
                            return arrayMove(items, oldIndex, newIndex);
                          });
                        }
                      }}
                    >
                      <SortableContext items={playQueue.map((_, i) => `queue-${i}`)} strategy={verticalListSortingStrategy}>
                        {playQueue.map((track, index) => {
                          const isActive = currentTrack?.id === track.id
                          return (
                            <SortableQueueItem 
                              key={`queue-${index}`} 
                              id={`queue-${index}`}
                              track={track} 
                              isActive={isActive} 
                              isPlaying={isPlaying} 
                              isLite={isLite} 
                              onPlay={handlePlayTrack} 
                              onContextMenu={handleTrackContextMenu}
                            />
                          )
                        })}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* FULLSCREEN LYRICS */}
        {isLyricsMaximized && showLyricsPanel && (
          <div className="flex-1 flex flex-col bg-transparent z-40 relative animate-fade-in" style={{ willChange: 'opacity, transform' }}>
            <button onClick={() => setIsLyricsMaximized(false)} className="absolute top-8 right-8 text-zinc-400 hover:text-white bg-theme-30 p-3 rounded-full hover:scale-110 transition-transform"><Minimize2 size={24}/></button>
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="w-1/2 flex flex-col items-center justify-center gap-6">
                <div className="w-[25vw] max-w-[400px] min-w-[250px] aspect-square rounded-full shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden relative border-8 border-theme-30 flex items-center justify-center bg-zinc-900 group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none z-10 rounded-full mix-blend-overlay"></div>
                  <div className="w-12 h-12 bg-zinc-950 rounded-full absolute z-20 border-2 border-zinc-700 shadow-inner"></div>
                  {(!isLite && (originalCover || currentTrack?.coverArt)) ? (
                    <img 
                      loading="lazy" 
                      src={toMediaUrl(originalCover || currentTrack.coverArt)} 
                      className="w-full h-full object-cover animate-spin-slow"
                      style={{ willChange: 'transform', animationPlayState: isPlaying ? 'running' : 'paused' }} 
                    />
                  ) : (
                    <img 
                      loading="lazy" 
                      src={meiSingingPlaceholder} 
                      className="w-full h-full object-cover animate-spin-slow"
                      style={{ willChange: 'transform', animationPlayState: isPlaying ? 'running' : 'paused' }} 
                    />
                  )}
                </div>

                {/* VISUALIZER DƯỚI ĐĨA THAN */}
                <div className="w-[25vw] max-w-[400px] min-w-[250px] h-14 rounded-xl bg-zinc-950/50 border border-theme-30/50 p-2 overflow-hidden flex items-center justify-center shadow-inner">
                  <WebGLVisualizer 
                    analyserNodeRef={analyserNodeRef} 
                    isPlaying={isPlaying} 
                    isLite={isLite} 
                    showVisualizer={true} 
                  />
                </div>

                <div className="text-center"><h2 className="text-3xl font-bold text-white mb-2">{currentTrack?.title}</h2><p className="text-theme-10 text-lg">{currentTrack?.artist}</p></div>
              </div>
              <div className="w-1/2 h-[70vh] overflow-y-auto px-8 space-y-8 text-center scrollbar-hide">
                 {lyrics.length === 0 ? <p className="text-zinc-500 italic mt-32 text-xl">{t('lyrics.noLyrics')}</p> : lyrics.map((line, index) => {
                  const isActive = index === currentLyricIndex
                  return <p key={index} ref={isActive ? activeLyricRef : null} onClick={() => {if(audioRef.current){audioRef.current.currentTime = line.time}}} className={`cursor-pointer transition-all duration-300 font-bold ${isActive ? 'text-theme-10 text-3xl scale-105' : 'text-zinc-500 text-xl hover:text-zinc-300 opacity-50'}`}>{line.text}</p>
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* PLAYER BAR */}
      <footer className="h-24 bg-theme-60 border-t border-theme-30 flex items-center justify-between px-6 z-20 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        
        <div className="flex items-center gap-4 w-1/3">
          <div className="w-14 h-14 bg-theme-30 rounded-md shadow-lg overflow-hidden flex-shrink-0">
            {(!isLite && currentTrack?.coverArt) ? <img loading="lazy" src={toMediaUrl(currentTrack.coverArt)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-zinc-600"><ListMusic size={24} /></div>}
          </div>
          <div className="truncate">
            <h4 className="text-sm font-bold text-white leading-tight truncate">{currentTrack ? currentTrack.title : t('player.noTrack')}</h4>
            <p className="text-xs text-zinc-400 mt-1 truncate">{currentTrack ? currentTrack.artist : t('player.unknownArtist')}</p>
            {currentTrack && (
              <div className="flex items-center gap-2 mt-1">
                <div className="inline-flex items-center gap-1 bg-white/5 p-0.5 rounded-md">
                  <span className="text-[10px] uppercase font-bold text-theme-10 bg-theme-10/10 px-1.5 py-0.5 rounded">
                    {currentTrack.lossless ? 'Lossless' : (currentTrack.format || 'MP3')}
                  </span>
                  {currentTrack.bitDepth && (
                    <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                      {currentTrack.bitDepth}-BIT
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500">{currentTrack.sampleRate ? `${currentTrack.sampleRate / 1000}kHz` : ''} {currentTrack.bitrate ? ` | ${Math.round(currentTrack.bitrate / 1000)} kbps` : ''}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 max-w-md relative">
          <div className="relative w-full flex items-center justify-center mb-2">
            {/* 5 nút điều khiển đối xứng tuyệt đối qua nút Play ở giữa */}
            <div className="flex items-center gap-6 justify-center">
              <button onClick={toggleShuffle} className={`transition ${isShuffle ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}><Shuffle size={18} /></button>
              <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition"><SkipBack size={20} /></button>
              <button onClick={handlePlayPause} className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${currentTrack ? 'bg-theme-10 text-white hover:scale-105' : 'bg-theme-30 text-zinc-500 cursor-not-allowed'}`}>
                {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current translate-x-[2px]" />}
              </button>
              <button onClick={handleNext} className="text-zinc-400 hover:text-white transition"><SkipForward size={20} /></button>
              <button onClick={toggleRepeat} className={`transition ${repeatMode > 0 ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}>{repeatMode === 2 ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
            </div>

            {/* YouTube-style Smart Autoplay Switch đặt absolute ở lề phải để không làm lệch tâm nút Play */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5" title={smartAutoplay ? t('player.smartAutoplay') : t('player.smartAutoplayDesc')}>
              <button
                type="button"
                onClick={() => setSmartAutoplay(prev => !prev)}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  smartAutoplay ? 'bg-theme-10' : 'bg-zinc-700'
                }`}
                role="switch"
                aria-checked={smartAutoplay}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                    smartAutoplay ? 'translate-x-3 text-zinc-950' : 'translate-x-0 text-zinc-500'
                  }`}
                >
                  {smartAutoplay ? <Sparkles size={7} className="text-zinc-950 fill-current" /> : <div className="w-1 h-1 rounded-full bg-zinc-400" />}
                </span>
              </button>
            </div>
          </div>
          <PlayerProgressBar 
            audioRef={audioRef} 
            currentTrack={currentTrack} 
            crossfadeEnabled={crossfadeEnabled} 
            crossfadeDuration={crossfadeDuration} 
            repeatMode={repeatMode} 
            onNext={handleNext}
            bitPerfectEnabled={bitPerfectEnabled}
          />
        </div>
        
        <div className="flex items-center justify-end gap-4 w-1/3 text-zinc-400">
          {!isCore && (
            <>
              {!isLite && (
                <>
                  <button onClick={() => setShowSpectrogramModal(true)} className={`transition ${showSpectrogramModal ? 'text-theme-10' : 'hover:text-white'}`} title={t('player.spectrogram')}><Radio size={18} /></button>
                  <button onClick={handleToggleLyrics} className={`transition ${showLyricsPanel ? 'text-theme-10' : 'hover:text-white'}`} title={t('player.lyrics')}><Mic2 size={18} /></button>
                </>
              )}
              <button onClick={handleToggleMiniPlayer} className="transition hover:text-white text-zinc-400" title={t('player.miniPlayer')}><PictureInPicture2 size={18} /></button>
              <button onClick={handleToggleQueue} className={`transition ${showQueuePanel ? 'text-theme-10' : 'hover:text-white'}`} title={t('player.queue')}><List size={18} /></button>
              <button onClick={() => setShowEQ(!showEQ)} className={`transition ${showEQ ? 'text-theme-10' : 'hover:text-white'}`} title={t('player.equalizer')}><Sliders size={18} /></button>
            </>
          )}

          {/* Thanh chỉnh âm lượng luôn giữ lại */}
          <VolumeSlider volume={volume} setVolume={setVolume} audioRef={audioRef} bitPerfectEnabled={bitPerfectEnabled} />
        </div>
      </footer>
      </div>
    )}
  </>
)
}