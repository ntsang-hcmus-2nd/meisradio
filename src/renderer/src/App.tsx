// @ts-nocheck
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Sliders, Cloud, HardDrive, Search, Library, 
  ListMusic, Settings, FolderPlus, Download, Wifi, Link, Edit2, Image as ImageIcon,
  Sparkles, Plus, Trash2, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown,
  Mic2, Maximize2, Minimize2, List, X, Activity, RefreshCw, PictureInPicture2,
  Home, ArrowLeft, Radio, BarChart2,
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
import { CloudActionModal } from './components/modals/CloudActionModal'
import { TagEditorModal } from './components/modals/TagEditorModal'
import { CreatePlaylistModal } from './components/modals/CreatePlaylistModal'
import { AddSongsModal } from './components/modals/AddSongsModal'
import { PlayerProgressBar } from './components/PlayerProgressBar'
import { Sidebar } from './components/Sidebar'
import { EQPanel } from './components/EQPanel'
import { VolumeSlider } from './components/VolumeSlider'
import { SpectrogramModal } from './components/SpectrogramModal'
import { ContextMenu, ContextMenuItem } from './components/ContextMenu'

import { extractThemeColors } from './utils/colorUtils'

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
  let trimmed = input.trim().replace(/^["']|["']$/g, '')
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) {
    const forwardSlashes = trimmed.replace(/\\/g, '/')
    return 'file:///' + encodeURI(forwardSlashes).replace(/#/g, '%23').replace(/\?/g, '%3F')
  }
  return trimmed
}

// Hàm phân tích màu chủ đạo bằng Canvas
const getDominantColor = (imageSrc: string, callback: (color: string) => void) => {
  const img = new Image()
  img.crossOrigin = 'Anonymous'
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    
    // Tối ưu CPU/RAM: Thu nhỏ ảnh xuống 128x128
    canvas.width = 128
    canvas.height = 128
    ctx.drawImage(img, 0, 0, 128, 128)
    
    const data = ctx.getImageData(0, 0, 128, 128).data
    let r = 0, g = 0, b = 0, count = 0
    // Lấy mẫu (sample) để tính màu trung bình
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]
      count++
    }
    if (count === 0) count = 1
    r = Math.floor(r / count); g = Math.floor(g / count); b = Math.floor(b / count)
    callback(`rgba(${Math.max(r-30, 0)}, ${Math.max(g-30, 0)}, ${Math.max(b-30, 0)}, 0.4)`)
  }
  img.src = imageSrc
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
            {(!isLite && track.coverArt) ? <img src={track.coverArt} className="w-full h-full object-cover" /> : <img src={thumbnailHolder} className="w-3/4 h-3/4 object-contain" />}
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
         {(!isLite && track.coverArt) ? <img src={track.coverArt} className="w-full h-full object-cover pointer-events-none" /> : <ListMusic size={16} className="text-zinc-500" />}
         {isActive && isPlaying && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-3 h-3 bg-theme-10 rounded-full animate-pulse" /></div>}
      </div>
      <div className="truncate flex-1">
        <p className={`text-sm font-semibold truncate ${isActive ? 'text-theme-10' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
      </div>
    </div>
  );
}, (prev, next) => prev.isActive === next.isActive && prev.isPlaying === next.isPlaying && prev.isLite === next.isLite && prev.track.id === next.track.id);

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

  // State Chế độ hiệu suất
  const [appMode, setAppMode] = useState<'default' | 'lite' | 'core'>('default')
  const isLite = appMode === 'lite' || appMode === 'core' // Dùng chung cho việc tắt ảnh bìa, màu sắc
  const isCore = appMode === 'core' // Chỉ định cắt luồng mảng Audio và UI mạng
  
  // UI & General App States
  const [activeView, setActiveView] = useState<'home' | 'home-ytm' | 'home-soundcloud' | 'songs' | 'playlists' | 'settings' | 'drive'>('home-ytm')
  const [themeColor, setThemeColor] = useState('rgba(39, 39, 42, 0)')
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info', visible: boolean}>({message: '', type: 'info', visible: false})
  const [customBgImage, setCustomBgImage] = useState<string | null>(null)
  const [useTrackCoverAsBg, setUseTrackCoverAsBg] = useState<boolean>(false)
  const [bgImageInput, setBgImageInput] = useState<string>('')
  const [customBgOpacity, setCustomBgOpacity] = useState<number>(1)
  const [customBgBlur, setCustomBgBlur] = useState<number>(0)
  const [isReloading, setIsReloading] = useState(false)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false) // Flag để ngăn ghi đè config

  // SoundCloud & YTM Auth States
  const [scDashboardData, setScDashboardData] = useState<any[]>([])
  const [isScLoading, setIsScLoading] = useState<boolean>(false)
  const [scUser, setScUser] = useState<any | null>(null)
  const [selectedScGenre, setSelectedScGenre] = useState<string>('all-music')
  const [isYtmLoggedIn, setIsYtmLoggedIn] = useState<boolean>(false)
  // Library & Search States
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [libraryTracks, setLibraryTracks] = useState<any[]>([])
  const [playlists, setPlaylists] = useState<any[]>([])
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null)
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

  // System Tray & Mini Player States
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [closeToTray, setCloseToTray] = useState(false)
  const [isMiniPlayer, setIsMiniPlayer] = useState(false)

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
  const [editTags, setEditTags] = useState({ title: '', artist: '', album: '', lyrics: '' })
  const [editImagePath, setEditImagePath] = useState<string | null>(null)
  const [playlistRename, setPlaylistRename] = useState<{ isOpen: boolean, oldName: string, newName: string }>({ isOpen: false, oldName: '', newName: '' })

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
  const fetchDashboard = async () => {
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
  }

  const handleYtmLogin = async () => {
    // @ts-ignore
    const res = await window.api.ytmLogin()
    if (res.success) {
      setIsYtmLoggedIn(true)
      showToast(t('toasts.ytmLoginSuccess'), 'success')
      fetchDashboard()
    } else {
      alert('Error: ' + res.error)
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

  const fetchScDashboard = async (genre?: string) => {
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
  }

  const handleScLogin = async () => {
    // @ts-ignore
    const res = await window.api.scLogin()
    if (res.success) {
      showToast(t('toasts.scLoginSuccess'), 'success')
      if (res.user) setScUser(res.user)
      fetchScDashboard()
    } else {
      alert('Error: ' + res.error)
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
      setActiveAlbum({ title: item.title, tracks: [] })
      setIsAlbumLoading(true)
      // @ts-ignore
      const res = await window.api.getScPlaylist(item.playlistId)
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks })
      else { alert(res.error); setActiveAlbum(null); }
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
      setActiveAlbum({ title: item.title, tracks: [] });
      setIsAlbumLoading(true);
      // @ts-ignore
      const res = await window.api.getYtmArtist(item.playlistId);
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks });
      else { alert(res.error); setActiveAlbum(null); }
      setIsAlbumLoading(false);

    } else if (item.playlistId) {
      // XỬ LÝ MỞ ALBUM/PLAYLIST
      setActiveAlbum({ title: item.title, tracks: [] });
      setIsAlbumLoading(true);
      // @ts-ignore
      const res = await window.api.getYtmPlaylist(item.playlistId);
      if (res.success) setActiveAlbum({ title: item.title, tracks: res.tracks });
      else { alert(res.error); setActiveAlbum(null); }
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
        alert('Download Error: ' + res.error); 
      }

    } else if (item.playlistId) {
      // 2. TẢI TOÀN BỘ ALBUM / PLAYLIST
      const confirmDownload = confirm(`Do you want to download all tracks from "${item.title}"? (This might take a while)`);
      if (!confirmDownload) return;
      
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
         alert('Error getting album tracks: ' + res.error);
      }
      
      setIsDownloading(false);
      setDownloadProgress(null);
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
      alert('Error: ' + res.error)
    }
  }

  const handleAddTracksToActivePlaylist = async (tracksToAdd: any[]) => {
    if (!activePlaylist) return
    for (const track of tracksToAdd) {
      // Lấy chính xác đường dẫn gốc thực tế của bài hát (loại bỏ tiền tố file:// nếu có)
      const rawTrackPath = track.id || track.filePath
      
      // @ts-ignore
      await window.api.addTrackToPlaylist(activePlaylist.name, rawTrackPath)
    }
    showToast(t('toasts.tracksAddedToPlaylist', { count: tracksToAdd.length }), 'success')
    loadLibrary()
  }

  // --- Library Management ---
  const loadLibrary = async (forceRefresh: boolean = false) => {
    // @ts-ignore
    const res = await window.api.getLibrary(forceRefresh)
    if (res.success) {
      setLibraryPath(res.libraryPath)
      setLibraryTracks(res.tracks)
      setPlaylists(res.playlists)
    }
  }

  // Tự động đồng bộ Active Playlist mỗi khi thêm/xóa bài hát trong thư viện
  useEffect(() => {
    if (activePlaylist) {
      const updated = playlists.find(p => p.name === activePlaylist.name);
      if (updated && updated.tracks.length !== activePlaylist.tracks.length) {
        setActivePlaylist(updated);
      }
    }
  }, [playlists]);

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
      loadLibrary()
    }
  }

  const handleAutoGeneratePlaylists = async () => {
    if (!confirm(t('toasts.autoCategorizeConfirm'))) return
    // @ts-ignore
    const res = await window.api.autoGeneratePlaylists()
    if (res.success) {
      showToast(t('toasts.autoCategorizeSuccess', { count: res.movedCount }), 'success')
      loadLibrary()
    }
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
      alert(res.error)
    }
  }

  const handleRenameSubmit = async () => {
    if (!playlistRename.newName || playlistRename.newName === playlistRename.oldName) {
      setPlaylistRename({ isOpen: false, oldName: '', newName: '' })
      return
    }
    // @ts-ignore
    const res = await window.api.renamePlaylist(playlistRename.oldName, playlistRename.newName)
    if (res.success) {
      setPlaylistRename({ isOpen: false, oldName: '', newName: '' })
      loadLibrary()
    } else {
      alert('Error renaming playlist: ' + res.error)
    }
  }

  const handleExtractPlaylistImage = async (playlistName: string) => {
    // @ts-ignore
    const res = await window.api.extractPlaylistThumbnail(playlistName)
    if (res.success) {
      showToast(t('toasts.coverUpdatedSuccess'), 'success')
      loadLibrary()
    } else {
      alert(res.error)
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
        alert('Stream error: ' + (res.error || 'Unknown'));
        return;
      }
    }

    setCurrentTrack(trackToPlay);
    setIsPlaying(true);
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
  }

  const handleNext = () => {
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (!currentTrack) return
    if (!playQueue || playQueue.length === 0) return

    const currentIndex = playQueue.findIndex(t => t.id === currentTrack.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= playQueue.length) {
      if (repeatMode === 1 || repeatMode === 2) nextIndex = 0
      else {
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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (audioRef.current) audioRef.current.volume = val
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
      alert('Vui lòng nhập link thư mục Google Drive hợp lệ!')
      return
    }
    setIsFetchingDrive(true)
    try {
      const folderId = match[1]
      // @ts-ignore
      const result = await window.api.fetchDriveFiles(folderId) 
      if (result.success) {
        if (result.tracks.length === 0) alert('Không tìm thấy file âm thanh nào. Hãy đảm bảo thư mục đã bật "Bất kỳ ai có liên kết"!')
        else setDriveFiles(result.tracks)
      } else alert('Lỗi từ hệ thống: ' + result.error)
    } catch (err) {
      alert('Lỗi kết nối tới hệ thống!')
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
          alert('Tải về thành công! Nhạc sẽ bắt đầu phát từ máy tính.')
          handlePlayTrack({ ...cloudActionTrack, filePath: result.localPath, isCloud: false })
          loadLibrary()
        } else if (result.canceled) {
          // Cancelled
        } else {
          alert('Lỗi tải file: ' + result.error)
        }
      } catch (e) {}
      setIsDownloading(false)
      setCloudActionTrack(null)
    }
  }

  // Determine effective background image
  const effectiveBgImage = useTrackCoverAsBg 
    ? (currentTrack?.coverArtHighRes || currentTrack?.coverArt || null)
    : customBgImage

  // Apply Background & Extract Theme
  useEffect(() => {
    if (effectiveBgImage) {
      const sanitizedUrl = effectiveBgImage.replace(/"/g, '\\"')
      document.documentElement.style.setProperty('--bg-image', `url("${sanitizedUrl}")`)
      
      extractThemeColors(effectiveBgImage).then(colors => {
        if (colors) {
          document.documentElement.style.setProperty('--theme-60', colors.primary60)
          document.documentElement.style.setProperty('--theme-30', colors.secondary30)
          document.documentElement.style.setProperty('--theme-10', colors.accent10)
        }
      })
    } else {
      document.documentElement.style.setProperty('--bg-image', 'none')
      // Reset to default
      document.documentElement.style.setProperty('--theme-60', '#18181b')
      document.documentElement.style.setProperty('--theme-30', '#27272a')
      document.documentElement.style.setProperty('--theme-10', '#10b981')
    }
  }, [effectiveBgImage])

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
      if (currentTrack && currentTrack.id === editingTrack.id) {
        setCurrentTrack({
          ...currentTrack,
          title: editTags.title,
          artist: editTags.artist,
          album: editTags.album,
          lyrics: editTags.lyrics,
          coverArt: res.coverUrl || currentTrack.coverArt
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
      }
    ]

    if (playlists && playlists.length > 0) {
      items.push({
        id: 'add-to-playlist',
        label: t('contextMenu.addToPlaylist'),
        icon: <FolderPlus size={14} />,
        subItems: playlists.map(pl => ({
          id: `pl-${pl.name}`,
          label: pl.name,
          icon: <FolderPlus size={14} />,
          onClick: async () => {
            const rawTrackPath = track.id || track.filePath
            // @ts-ignore
            await window.api.addTrackToPlaylist(pl.name, rawTrackPath)
            showToast(t('toasts.addedToPlaylist', { name: pl.name }), 'success')
            loadLibrary()
          }
        }))
      })
    }

    items.push(
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
    )

    if (isInsidePlaylist) {
      items.push({
        id: 'remove-from-playlist',
        label: t('contextMenu.removeFromPlaylist', { name: activePlaylist.name }),
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: async () => {
          if (!confirm(t('contextMenu.confirmRemoveFromPlaylist', { title: track.title, name: activePlaylist.name }))) return
          const rawTrackPath = track.id || track.filePath
          // @ts-ignore
          await window.api.deleteTrack(rawTrackPath, false)
          showToast(t('toasts.removedFromPlaylist'), 'success')
          loadLibrary()
        }
      })
    }

    items.push({
      id: 'delete-permanent',
      label: t('contextMenu.deleteFile'),
      icon: <Trash2 size={14} />,
      danger: true,
      disabled: track.isCloud,
      onClick: async () => {
        if (!confirm(t('contextMenu.confirmDeleteFile', { title: track.title }))) return
        const rawTrackPath = track.id || track.filePath
        // @ts-ignore
        const res = await window.api.deleteTrack(rawTrackPath, true)
        if (res && res.success) {
          showToast(t('toasts.movedToTrash', { title: track.title }), 'success')
          loadLibrary()
        } else {
          alert('Error deleting track: ' + res?.error)
        }
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
        onClick: () => setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name })
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
        onClick: async () => {
          if (!confirm(t('contextMenu.confirmDeletePlaylist', { name: pl.name }))) return
          // @ts-ignore
          const res = await window.api.deletePlaylist(pl.name)
          if (res && res.success) {
            showToast(t('toasts.playlistDeleted', { name: pl.name }), 'success')
            if (activePlaylist?.name === pl.name) setActivePlaylist(null)
            loadLibrary()
          } else {
            alert('Error deleting playlist: ' + res?.error)
          }
        }
      }
    ]

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  // ==========================================
  // 4. MEMOS
  // ==========================================
  const processedLibraryTracks = useMemo(() => {
    const filtered = getFilteredTracks(libraryTracks)
    return getSortedTracks(filtered)
  }, [libraryTracks, searchQuery, sortField, sortOrder])

  const processedPlaylistTracks = useMemo(() => {
    if (!activePlaylist) return []
    const filtered = getFilteredTracks(activePlaylist.tracks)
    return getSortedTracks(filtered)
  }, [activePlaylist, searchQuery, sortField, sortOrder])

  // Lấy Sample Rate chuẩn của bài hát hiện tại (Mặc định 44100Hz nếu không rõ)
  const currentSampleRate = currentTrack?.sampleRate && currentTrack.sampleRate >= 8000 && currentTrack.sampleRate <= 192000 
    ? currentTrack.sampleRate 
    : 44100;


  // ==========================================
  // 5. EFFECTS
  // ==========================================

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

  // Dominant Color
  useEffect(() => {
    if (isLite || effectiveBgImage) {
      setThemeColor('transparent') // Không dùng màu nền đè lên ảnh nền
      return
    }
    if (currentTrack?.coverArt) {
      getDominantColor(currentTrack.coverArt, setThemeColor)
    } else {
      setThemeColor('rgba(39, 39, 42, 0)')
    }
  }, [currentTrack, isLite, effectiveBgImage]) // Thêm isLite vào dependency

  // Audio Context & Cấu trúc luồng Bit-perfect
  // EFFECT 1: CHỈ KHỞI TẠO LẠI BỘ LỌC KHI ĐỔI BÀI HOẶC BẬT/TẮT EQ (Tiết kiệm CPU)
  useEffect(() => {
    if (!audioRef.current) return
    const setupAudio = async () => {
      if (audioCtxRef.current && audioCtxRef.current.sampleRate !== currentSampleRate) {
        try { await audioCtxRef.current.close() } catch (e) {}
        audioCtxRef.current = null
        sourceNodeRef.current = null
        analyserNodeRef.current = null
        preampNodeRef.current = null
        filterNodesRef.current = []
      }
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        try { audioCtxRef.current = new AudioContextClass({ sampleRate: currentSampleRate }) } 
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

      let prevNode: AudioNode = sourceNodeRef.current
      if (isEqEnabled && !isCore) {
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
  }, [isEqEnabled, currentSampleRate]) // <-- Đã bỏ eqBands ra khỏi dependency

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
      // --- LOGIC 1: ĐỒNG BỘ LỜI BÀI HÁT (Giữ nguyên) ---
      if (lyrics.length > 0) {
        const visualTime = audio.currentTime + 0.3
        const index = lyrics.findIndex((line, i) => {
          const nextLine = lyrics[i + 1]
          if (nextLine) return visualTime >= line.time && visualTime < nextLine.time
          return visualTime >= line.time
        })
        if (index !== currentLyricIndex) setCurrentLyricIndex(index)
      } else if (currentLyricIndex !== -1) {
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
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [lyrics, currentLyricIndex, playQueue, currentTrack, repeatMode])

  // Scroll Active Lyric
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLyricIndex])

  // Spacebar Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.code === 'Space' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault() 
        if (currentTrack) setIsPlaying(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTrack])

  // Global Shortcuts
  useEffect(() => {
    if ((window as any).api?.onGlobalShortcut) {
      (window as any).api.onGlobalShortcut((action: string) => {
        switch (action) {
          case 'play-pause': setIsPlaying(prev => !prev); break;
          case 'next': handleNext(); break;
          case 'prev': handlePrev(); break;
          case 'vol-up':
            setVolume(prev => {
              const newVol = Math.min(1, prev + 0.1)
              if (audioRef.current) audioRef.current.volume = newVol
              return newVol
            }); break;
          case 'vol-down':
            setVolume(prev => {
              const newVol = Math.max(0, prev - 0.1)
              if (audioRef.current) audioRef.current.volume = newVol
              return newVol
            }); break;
          case 'seek-forward':
            if (audioRef.current) {
              const newTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 5)
              audioRef.current.currentTime = newTime
            }
            break;
          case 'seek-backward':
            if (audioRef.current) {
              const newTime = Math.max(0, audioRef.current.currentTime - 5)
              audioRef.current.currentTime = newTime
            }
            break;
        }
      })
    }
  }, [currentTrack, playQueue, isPlaying, repeatMode, volume])


  // ==========================================
  // 6. RENDERERS
  // ==========================================
  // ==========================================
  // 6. RENDERERS (VIRTUALIZED TABLE)
  // ==========================================
  const renderTrackTable = (tracks: any[]) => {
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
    window.api.onMpvTime((val) => {
      if (bitPerfectEnabled && audioRef.current) {
        (audioRef.current as any)._currentTime = val;
      }
    });
    window.api.onMpvDuration((val) => {
      if (bitPerfectEnabled && audioRef.current) {
        (audioRef.current as any)._duration = val;
      }
    });
    window.api.onMpvPaused((val) => {
      if (bitPerfectEnabled) {
        setIsPlaying(!val)
      }
    });
    window.api.onMpvEnded(() => {
      if (bitPerfectEnabled && !crossfadeEnabled) handleNext()
    });
  }, [handleNext, crossfadeEnabled, bitPerfectEnabled]);

  // Watch currentTrack
  useEffect(() => {
    if (currentTrack && currentTrack.filePath) {
      if (bitPerfectEnabled) {
        window.api.mpvPlay(currentTrack.filePath, crossfadeEnabled ? crossfadeDuration : 0)
        if (audioRef.current) audioRef.current.pause()
      } else {
        // Dừng mpv khi phát bằng HTML Audio
        window.api.mpvPause(true)
      }
    }
  }, [currentTrack, bitPerfectEnabled]);

  // Watch EQ & Preamp
  useEffect(() => {
    if (isEqEnabled) {
      window.api.mpvSetEqualizer(eqBands.map(b => b.gain), preampGain)
    } else {
      window.api.mpvSetEqualizer([0,0,0,0,0,0,0,0,0,0], 0)
    }
  }, [eqBands, isEqEnabled, preampGain]);

  const handlePlayPause = () => {
    if (!currentTrack) return;
    
    if (bitPerfectEnabled) {
      window.api.mpvPause();
    } else if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(console.warn);
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Giao diện chính (Full Screen)
 return (
    <>
      <div className="custom-bg" />
      {/* 1. ĐƯA THẺ AUDIO RA NGOÀI CÙNG VÀ ÉP THAY ĐỔI SAMPLE RATE */}
      <audio
        key={currentSampleRate} // Tự động remount khi Sample Rate thay đổi
        ref={audioRef}
        crossOrigin="anonymous" // QUAN TRỌNG: Ổn định luồng CORS cho Web Audio API
        autoPlay={!bitPerfectEnabled}
        src={currentTrack ? (currentTrack.filePath?.startsWith('http') || currentTrack.filePath?.startsWith('file://') ? currentTrack.filePath : `file://${currentTrack.filePath}`) : undefined}
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
          if (!crossfadeEnabled) handleNext() 
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
              <img loading="lazy" src={currentTrack.coverArt} className="w-full h-full object-cover pointer-events-none" />
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
        <div className={`flex flex-col h-screen text-zinc-200 font-sans overflow-hidden relative ${isLite ? '' : 'transition-colors duration-1000'}`} style={{ backgroundColor: effectiveBgImage ? 'transparent' : themeColor }}>
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

      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreatePlaylistSubmit}
      />

      <AddSongsModal
        isOpen={showAddSongsModal}
        tracks={libraryTracks}
        playlistName={activePlaylist?.name || ''}
        onClose={() => setShowAddSongsModal(false)}
        onAddTracks={handleAddTracksToActivePlaylist}
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
        fetchDashboard={fetchDashboard}
        fetchScDashboard={fetchScDashboard}
        isCore={isCore}
      />

        {/* NỘI DUNG CHÍNH (ĐỔI THEO TAB) */}
        <main className={`flex-1 flex flex-col bg-transparent overflow-hidden ${(isLyricsMaximized && showLyricsPanel) ? 'hidden' : ''}`}>
          
          <header className="h-20 px-8 flex items-center justify-between border-b border-theme-30/50 flex-shrink-0 w-full">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
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
                          alert('Lỗi tìm kiếm YouTube Music: ' + res.error);
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
                          alert('Lỗi tìm kiếm SoundCloud: ' + res.error);
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
                className="w-full bg-theme-60/50 border border-zinc-700/50 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-theme-10 transition-colors" 
              />
            </div>
            
            <button onClick={handleReloadLibrary} disabled={isReloading} className={`flex items-center gap-2 px-4 py-2 bg-theme-60/50 border border-zinc-700/50 rounded-full text-sm font-medium transition-colors ${isReloading ? 'text-theme-10' : 'text-zinc-400 hover:text-white hover:border-zinc-600'}`} title={t('header.refreshLibrary')}>
              <RefreshCw size={16} className={isReloading ? 'animate-spin' : ''} />
              {isReloading ? t('header.refreshing') : t('header.refresh')}
            </button>
          </header>

          <div className="flex-1 flex overflow-hidden">
            
            {/* CỘT TRÁI: DATA VIEW */}
            <div key={activeView} className={`${isLite ? '' : 'animate-fade-in'} flex-1 flex flex-col p-8 relative ${activeView === 'settings' || activeView === 'drive' || (activeView === 'playlists' && !activePlaylist) ? 'overflow-y-auto' : 'overflow-hidden'}`}>
              
              {/* VIEW: TRANG CHỦ YOUTUBE MUSIC */}
              {(activeView === 'home' || activeView === 'home-ytm') && (
                <div className="flex flex-col h-full">
                  {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST --- */}
                  {activeAlbum ? (
                    <div className="flex flex-col h-full animate-fade-in">
                      <div className="flex items-center gap-4 mb-8">
                        <button onClick={() => setActiveAlbum(null)} className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition">
                          <ArrowLeft size={20}/>
                        </button>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">{t('home.ytmPlaylist')}</p>
                          <h2 className="text-3xl font-extrabold text-white">{activeAlbum.title}</h2>
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
                <div className="flex flex-col h-full">
                  {/* --- NẾU ĐANG XEM CHI TIẾT ALBUM/PLAYLIST SOUNDCLOUD --- */}
                  {activeAlbum ? (
                    <div className="flex flex-col h-full animate-fade-in">
                      <div className="flex items-center gap-4 mb-8">
                        <button onClick={() => setActiveAlbum(null)} className="p-2.5 bg-theme-30 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition">
                          <ArrowLeft size={20}/>
                        </button>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-1">{t('home.scPlaylist')}</p>
                          <h2 className="text-3xl font-extrabold text-white">{activeAlbum.title}</h2>
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
                      <div className="flex-1 overflow-y-auto pr-4 space-y-10 pb-20">
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
                    <button onClick={handleImportFiles} className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition shadow-lg shadow-theme-10/20">
                      <Plus size={18} /> {t('songsView.addMusic')}
                    </button>
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
                            className="flex-1 accent-theme-10"
                          />
                          <span className="text-sm font-mono text-zinc-400 w-12 text-right">{customBgBlur}px</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.library.title')}</h3>
                      <p className="text-sm text-zinc-400 mb-4">{t('settings.library.desc')}</p>
                      <div className="flex gap-3 items-center">
                        <input type="text" readOnly value={libraryPath || t('settings.library.notSet')} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300" />
                        <button onClick={handleSelectLibrary} className="bg-theme-10 hover:bg-theme-10 text-white px-4 py-2 rounded-lg text-sm font-medium transition">{t('settings.library.change')}</button>
                      </div>
                    </div>

                    <div className="border-t border-theme-30 pt-6 mt-6">
                      <h3 className="text-theme-10 font-semibold mb-2">{t('settings.bitPerfect.title')}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 text-sm">{t('settings.bitPerfect.label')}</span>
                        <input 
                          type="checkbox" 
                          checked={bitPerfectEnabled} 
                          onChange={e => {
                            const val = e.target.checked
                            setBitPerfectEnabled(val)
                            window.api.setBitPerfect(val)
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
                      <div className="w-full">
                        <CustomSelect 
                          value={appMode} 
                          onChange={(val) => {
                            setAppMode(val as any)
                            if (val === 'lite' || val === 'core') {
                              setShowVisualizer(false)
                              setShowLyricsPanel(false)
                              setIsLyricsMaximized(false)
                              if (val === 'core') {
                                setShowEQ(false)
                                // Tự động đóng tab mạng nếu đang xem
                                if (activeView === 'home' || activeView === 'online' || activeView === 'drive') setActiveView('songs')
                              }
                              // Ép thu gom rác ngay lập tức
                              // @ts-ignore
                              if (window.api && window.api.forceGC) setTimeout(() => window.api.forceGC(), 100)
                            }
                          }} 
                          options={[
                            { value: 'default', label: t('settings.appMode.standard') }, 
                            { value: 'lite', label: t('settings.appMode.lite') },
                            { value: 'core', label: t('settings.appMode.core') }
                          ]} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW: PLAYLISTS */}
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
                    const lowerQuery = searchQuery.toLowerCase().trim()
                    const matchedPlaylists = searchQuery ? playlists.filter(pl => pl.name.toLowerCase().includes(lowerQuery)) : playlists
                    const matchedSongs = processedLibraryTracks

                    if (!searchQuery && playlists.length === 0) {
                      return <p className="text-zinc-500">{t('playlistsView.noPlaylists')}</p>
                    }

                    return (
                      <div className="space-y-10">
                        {(matchedPlaylists.length > 0 || !searchQuery) && (
                          <div>
                            {searchQuery && <h3 className="text-xl font-bold text-white mb-6">{t('playlistsView.playlistsAndAlbums', { count: matchedPlaylists.length })}</h3>}
                            <div className="grid grid-cols-4 gap-6">
                              {matchedPlaylists.map(pl => (
                                <div 
                                  key={pl.name} 
                                  className="bg-theme-60/40 p-4 rounded-xl border border-theme-30/50 hover:bg-theme-30/50 transition group cursor-pointer" 
                                  onClick={() => { setActivePlaylist(pl); setSearchQuery(''); }}
                                  onContextMenu={(e) => handlePlaylistContextMenu(pl, e)}
                                >
                                  <div className="aspect-square bg-theme-30 rounded-lg mb-4 overflow-hidden relative">
                                    {(!isLite && pl.thumbnail) ? <img loading="lazy" src={pl.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={40} /></div>}
                                    <button onClick={(e) => { e.stopPropagation(); handleChangePlaylistImage(pl.name) }} className="absolute bottom-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition" title={t('playlistsView.chooseCover')}><ImageIcon size={16}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleExtractPlaylistImage(pl.name) }} className="absolute bottom-2 right-10 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-theme-10 transition" title={t('playlistsView.extractCover')}><Sparkles size={16}/></button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0 flex-1 pr-2">
                                      <h3 className="font-bold text-white truncate">{pl.name}</h3>
                                      <p className="text-xs text-zinc-500">{pl.tracks.length} {t('common.songs')}</p>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name }) }} className="text-zinc-500 hover:text-theme-10 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={14}/></button>
                                  </div>
                                </div>
                              ))}
                            </div>
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

              {/* VIEW: CHI TIẾT PLAYLIST */}
              {activeView === 'playlists' && activePlaylist && (
                <>
                  <div className="flex items-end justify-between mb-8" onContextMenu={(e) => handlePlaylistContextMenu(activePlaylist, e)}>
                    <div className="flex items-end gap-6">
                      <div className="w-40 h-40 bg-theme-30 rounded-xl overflow-hidden shadow-2xl relative group">
                        {(!isLite && activePlaylist.thumbnail) ? <img loading="lazy" src={activePlaylist.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={40} /></div>}
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-theme-10 mb-2">Playlist</p>
                        <h2 className="text-5xl font-extrabold text-white mb-4">{activePlaylist.name}</h2>
                        <p className="text-zinc-400">{activePlaylist.tracks.length} {t('common.songs')}</p>
                      </div>
                    </div>
                    {/* Nút thêm nhạc riêng cho Playlist */}
                    <div className="flex gap-3">
                      <button onClick={() => setShowAddSongsModal(true)} className="flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                        <Plus size={16} /> {t('playlistsView.addExistingSongs')}
                      </button>
                      <button onClick={handleImportFiles} className="flex items-center gap-2 bg-theme-10 hover:bg-theme-10 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-theme-10/20">
                        <Plus size={16} /> {t('playlistsView.importFromComputer')}
                      </button>
                    </div>
                  </div>
                  {renderTrackTable(processedPlaylistTracks)}
                </>
              )}


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
                      src={originalCover || currentTrack.coverArt} 
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
            {(!isLite && currentTrack?.coverArt) ? <img loading="lazy" src={currentTrack.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-zinc-600"><ListMusic size={24} /></div>}
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

        <div className="flex flex-col items-center justify-center w-1/3 max-w-md">
          <div className="flex items-center gap-6 mb-2">
            <button onClick={toggleShuffle} className={`transition ${isShuffle ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}><Shuffle size={18} /></button>
            <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition"><SkipBack size={20} /></button>
            <button onClick={handlePlayPause} className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${currentTrack ? 'bg-theme-10 text-white hover:scale-105' : 'bg-theme-30 text-zinc-500 cursor-not-allowed'}`}>
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current translate-x-[2px]" />}
            </button>
            <button onClick={handleNext} className="text-zinc-400 hover:text-white transition"><SkipForward size={20} /></button>
            <button onClick={toggleRepeat} className={`transition ${repeatMode > 0 ? 'text-theme-10' : 'text-zinc-400 hover:text-white'}`}>{repeatMode === 2 ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
          </div>
          <PlayerProgressBar 
            audioRef={audioRef} 
            currentTrack={currentTrack} 
            crossfadeEnabled={crossfadeEnabled} 
            crossfadeDuration={crossfadeDuration} 
            repeatMode={repeatMode} 
            onNext={handleNext} 
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
          <VolumeSlider volume={volume} setVolume={setVolume} audioRef={audioRef} />
        </div>
      </footer>
      </div>
    )}
  </>
)
}