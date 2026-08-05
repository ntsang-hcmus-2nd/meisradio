import { useState, useRef, useEffect, useMemo } from 'react'
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Sliders, Cloud, HardDrive, Search, Library, 
  ListMusic, Settings, FolderPlus, Download, Wifi, Link, Edit2, Image as ImageIcon,
  Sparkles, Plus, Trash2, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown,
  Mic2, Maximize2, Minimize2, List, X, Activity, RefreshCw, PictureInPicture2,
} from 'lucide-react'
// Đã sử dụng đúng đường dẫn logo của bạn
import logoImg from '../../../resources/HoT_Chibi_Icon.png'
import thumbnailHolder from '../../../resources/HoT_Chibi_Emoji.png'
import { CustomNumberInput } from './components/CustomNumberInput'
import { CustomSelect } from './components/CustomSelect'
import { PlaylistRenameModal } from './components/modals/PlaylistRenameModal'
import { CloudActionModal } from './components/modals/CloudActionModal'
import { TagEditorModal } from './components/modals/TagEditorModal'
import { CreatePlaylistModal } from './components/modals/CreatePlaylistModal'
import { AddSongsModal } from './components/modals/AddSongsModal'

// --- HELPER FUNCTIONS & INTERFACES (OUTSIDE COMPONENT) ---
const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

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

// Hàm phân tích màu chủ đạo bằng Canvas
const getDominantColor = (imageSrc: string, callback: (color: string) => void) => {
  const img = new Image()
  img.crossOrigin = 'Anonymous'
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)
    
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let r = 0, g = 0, b = 0, count = 0
    for (let i = 0; i < data.length; i += 40) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]
      count++
    }
    r = Math.floor(r / count); g = Math.floor(g / count); b = Math.floor(b / count)
    callback(`rgba(${Math.max(r-30, 0)}, ${Math.max(g-30, 0)}, ${Math.max(b-30, 0)}, 0.4)`)
  }
  img.src = imageSrc
}

export default function App() {

  // ==========================================
  // 1. REFS
  // ==========================================
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const filterNodesRef = useRef<BiquadFilterNode[]>([])
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null)
  const eqCanvasRef = useRef<HTMLCanvasElement>(null)
  const reqAnimRef = useRef<number>(0)
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)

  // ==========================================
  // 2. STATES
  // ==========================================
  
  // UI & General App States
  const [activeView, setActiveView] = useState<'songs' | 'playlists' | 'settings' | 'drive'>('songs')
  const [themeColor, setThemeColor] = useState('rgba(39, 39, 42, 0)')
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info', visible: boolean}>({message: '', type: 'info', visible: false})
  const [isReloading, setIsReloading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(25)

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
  const [currentTime, setCurrentTime] = useState(0)
  const [isShuffle, setIsShuffle] = useState(false)
  const [playQueue, setPlayQueue] = useState<any[]>([])
  const [originalQueue, setOriginalQueue] = useState<any[]>([])
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0)
  const [volume, setVolume] = useState(1)
  const [prevVolume, setPrevVolume] = useState<number>(1)
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [crossfadeDuration, setCrossfadeDuration] = useState(3)

  // System Tray & Mini Player States
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [closeToTray, setCloseToTray] = useState(false)
  const [isMiniPlayer, setIsMiniPlayer] = useState(false)

  // Modals & Panels Visibility
  const [showQueuePanel, setShowQueuePanel] = useState<boolean>(false)
  const [showEQ, setShowEQ] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(false)
  const [showLyricsPanel, setShowLyricsPanel] = useState<boolean>(false)
  const [isLyricsMaximized, setIsLyricsMaximized] = useState<boolean>(false)

  // Audio Devices & EQ States
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default')
  const [eqBands, setEqBands] = useState<EQBand[]>([
    { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
    { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
    { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
    { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
    { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
  ])

  // Lyrics States
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(-1)

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
      showToast('Đã tạo playlist thành công!', 'success')
      setShowCreateModal(false)
      loadLibrary()
    } else {
      alert('Lỗi: ' + res.error)
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
    showToast(`Đã thêm ${tracksToAdd.length} bài hát vào playlist!`, 'success')
    loadLibrary()
  }

  // --- Library Management ---
  const loadLibrary = async () => {
    // @ts-ignore
    const res = await window.api.getLibrary()
    if (res.success) {
      setLibraryPath(res.libraryPath)
      setLibraryTracks(res.tracks)
      setPlaylists(res.playlists)
    }
  }

  const handleReloadLibrary = async () => {
    setIsReloading(true)
    await loadLibrary()
    setTimeout(() => setIsReloading(false), 500)
  }

  const handleSelectLibrary = async () => {
    // @ts-ignore
    const res = await window.api.setLibraryFolder()
    if (res.success) {
      alert('Đã lưu thư mục thư viện gốc!')
      loadLibrary()
    }
  }

  const handleAutoGeneratePlaylists = async () => {
    if (!confirm('Hành động này sẽ tự động tạo thư mục và di chuyển các bài hát có chung Album vào đó. Bạn có chắc chắn?')) return
    // @ts-ignore
    const res = await window.api.autoGeneratePlaylists()
    if (res.success) {
      alert(`Đã di chuyển thành công ${res.movedCount} bài hát vào các Playlist Album!`)
      loadLibrary()
    }
  }

  const handleImportFiles = async () => {
    const targetFolder = (activeView === 'playlists' && activePlaylist) ? activePlaylist.name : undefined
    // @ts-ignore
    const res = await window.api.importLocalFiles(targetFolder, libraryTracks)
    if (res && res.success) {
      if (res.tracks.length > 0) {
        alert(`Đã thêm thành công ${res.tracks.length} bài hát vào thư mục!`)
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
      alert('Lỗi đổi tên: ' + res.error)
    }
  }

  const handleExtractPlaylistImage = async (playlistName: string) => {
    // @ts-ignore
    const res = await window.api.extractPlaylistThumbnail(playlistName)
    if (res.success) {
      alert('Đã cập nhật ảnh bìa từ bài hát đầu tiên thành công!')
      loadLibrary()
    } else {
      alert(res.error)
    }
  }

  const handleChangePlaylistImage = async (playlistName: string) => {
    // @ts-ignore
    const res = await window.api.setPlaylistThumbnail(playlistName)
    if (res.success) {
      alert('Đã thay đổi ảnh bìa thành công! Đang tải lại thư viện...')
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
    if (crossfadeEnabled && isPlaying && audioRef.current && currentTrack) {
      const fadeAudio = new Audio(audioRef.current.src)
      fadeAudio.currentTime = audioRef.current.currentTime
      fadeAudio.volume = volume
      fadeAudio.play()
      
      const step = volume / (crossfadeDuration * 20)
      const fadeInterval = setInterval(() => {
        if (fadeAudio.volume - step > 0) fadeAudio.volume -= step
        else {
          fadeAudio.pause()
          clearInterval(fadeInterval)
        }
      }, 50)
    }

    setCurrentTrack(track)
    setIsPlaying(true)
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
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
    if (currentTime > 3 && audioRef.current) { 
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

  const handleTimeUpdate = () => {
    if (!audioRef.current || !currentTrack) return
    const cTime = audioRef.current.currentTime
    setCurrentTime(cTime)
    
    if (crossfadeEnabled && currentTrack.duration > 0 && repeatMode !== 2) {
      if (currentTrack.duration - cTime <= crossfadeDuration && currentTrack.duration - cTime > crossfadeDuration - 0.5) {
        handleNext()
      }
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
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

  const handleRowClick = (track: any, contextList?: any[]) => {
    if (track.isCloud) {
      setCloudActionTrack(track)
    } else {
      if (contextList) {
        setOriginalQueue(contextList)
        setPlayQueue(isShuffle ? [...contextList].sort(() => Math.random() - 0.5) : contextList)
      }
      handlePlayTrack(track)
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
    setEqBands([
      { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
      { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
      { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
      { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
      { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
    ])
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
    alert(`Đã thêm ${driveFiles.length} bài hát vào danh sách phát!`)
  }

  const handleDriveDownload = async () => {
    if (!libraryPath) {
      showToast("Vui lòng vào Cài đặt để thiết lập Thư viện gốc trước khi tải!", 'error')
      return
    }
    setIsDownloading(true)
    setDownloadProgress({ current: 0, total: driveFiles.length, fileName: 'Chuẩn bị tải...' })
    try {
      // @ts-ignore
      const result = await window.api.downloadMultipleFiles(driveFiles, processedLibraryTracks)
      if (result.success) {
        if (result.tracks.length > 0) {
          showToast(`Đã tải xong ${result.tracks.length} bài hát về máy!`, 'success')
          loadLibrary()
        }
      } else {
        showToast('Lỗi hệ thống: ' + result.error, 'error')
      }
    } catch (e) {
      showToast('Có lỗi xảy ra khi tải file!', 'error')
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
      alert(res.note || 'Lưu thông tin thành công!')
      if (currentTrack && currentTrack.id === editingTrack.id) {
        setCurrentTrack({
          ...currentTrack,
          title: editTags.title,
          artist: editTags.artist,
          album: editTags.album,
          lyrics: editTags.lyrics
        })
      }
      setEditingTrack(null)
      loadLibrary()
    } else alert('Lỗi: ' + res.error)
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


  // ==========================================
  // 5. EFFECTS
  // ==========================================

  // Reset visible counts when views change
  useEffect(() => {
    setVisibleCount(25)
  }, [activeView, activePlaylist, searchQuery, sortField, sortOrder])

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

  // Apply device change
  useEffect(() => {
    const applyDevice = async () => {
      try {
        if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
          await (audioRef.current as any).setSinkId(selectedDeviceId)
        }
        if (audioCtxRef.current && typeof (audioCtxRef.current as any).setSinkId === 'function') {
          await (audioCtxRef.current as any).setSinkId(selectedDeviceId)
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
      if (cfg.crossfadeDuration !== undefined) setCrossfadeDuration(cfg.crossfadeDuration)
      if (cfg.eqBands) setEqBands(cfg.eqBands)
      if (cfg.googleDriveApiKey) setGoogleDriveApiKey(cfg.googleDriveApiKey)
      if (cfg.driveLink) setDriveLink(cfg.driveLink) 
      if (cfg.selectedDeviceId) setSelectedDeviceId(cfg.selectedDeviceId)
      if (cfg.showVisualizer !== undefined) setShowVisualizer(cfg.showVisualizer)
      if (cfg.minimizeToTray !== undefined) setMinimizeToTray(cfg.minimizeToTray)
      if (cfg.closeToTray !== undefined) setCloseToTray(cfg.closeToTray)
      loadLibrary()
    })
  }, [])

  // Auto-save Config & Update Tray
  useEffect(() => {
    // @ts-ignore
    window.api.saveConfig({ 
      volume, crossfadeEnabled, crossfadeDuration, eqBands, googleDriveApiKey, 
      driveLink, selectedDeviceId, showVisualizer, minimizeToTray, closeToTray,
    }) 
    // @ts-ignore
    window.api.updateTrayConfig({ minimizeToTray, closeToTray })
  }, [volume, crossfadeEnabled, crossfadeDuration, eqBands, googleDriveApiKey, driveLink, selectedDeviceId, showVisualizer, minimizeToTray, closeToTray])

  // Dominant Color
  useEffect(() => {
    if (currentTrack?.coverArt) {
      getDominantColor(currentTrack.coverArt, setThemeColor)
    } else {
      setThemeColor('rgba(39, 39, 42, 0)')
    }
  }, [currentTrack])

  // Audio Context & EQ Setup
  useEffect(() => {
    if (!audioRef.current) return

    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }

    const ctx = audioCtxRef.current

    if (!analyserNodeRef.current) {
      analyserNodeRef.current = ctx.createAnalyser()
      analyserNodeRef.current.fftSize = 256
    }

    if (!sourceNodeRef.current) {
      try {
        sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
      } catch (e) {
        console.error('Lỗi khởi tạo MediaElementSource:', e)
      }
    }

    if (!sourceNodeRef.current) return

    sourceNodeRef.current.disconnect()
    filterNodesRef.current.forEach(node => node.disconnect())
    filterNodesRef.current = []

    const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
    let prevNode: AudioNode = sourceNodeRef.current

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

    prevNode.connect(analyserNodeRef.current)
    analyserNodeRef.current.connect(ctx.destination)
  }, [eqBands])

  // Visualizer Animation
  useEffect(() => {
    if (!isPlaying || !visualizerCanvasRef.current || !analyserNodeRef.current || !showVisualizer) return

    const canvas = visualizerCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const analyser = analyserNodeRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      reqAnimRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const barWidth = (canvas.width / bufferLength) * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height
        ctx.fillStyle = `rgba(16, 185, 129, ${dataArray[i] / 255})` 
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
        x += barWidth + 1
      }
    }
    draw()

    return () => cancelAnimationFrame(reqAnimRef.current)
  }, [isPlaying, isLyricsMaximized, showVisualizer])

  // EQ Curve Drawing
  useEffect(() => {
    if (!showEQ || !eqCanvasRef.current || filterNodesRef.current.length === 0) return
    
    const canvas = eqCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    
    ctx.strokeStyle = '#27272a' 
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i < 10; i++) {
      ctx.moveTo(0, (height / 10) * i)
      ctx.lineTo(width, (height / 10) * i)
      ctx.moveTo((width / 10) * i, 0)
      ctx.lineTo((width / 10) * i, height)
    }
    ctx.stroke()

    const freqCount = width
    const freqArray = new Float32Array(freqCount)
    const magResponse = new Float32Array(freqCount)
    const phaseResponse = new Float32Array(freqCount)

    const minFreq = 20
    const maxFreq = 20000
    for (let i = 0; i < freqCount; i++) {
      freqArray[i] = minFreq * Math.pow(maxFreq / minFreq, i / freqCount)
    }

    const totalMag = new Float32Array(freqCount).fill(1.0)
    
    filterNodesRef.current.forEach(filter => {
      filter.getFrequencyResponse(freqArray, magResponse, phaseResponse)
      for (let i = 0; i < freqCount; i++) {
        totalMag[i] *= magResponse[i]
      }
    })

    ctx.beginPath()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#10b981' 
    
    for (let i = 0; i < freqCount; i++) {
      const db = 20 * Math.log10(totalMag[i])
      const y = height / 2 - (db / 20) * (height / 2) 
      if (i === 0) ctx.moveTo(i, y)
      else ctx.lineTo(i, y)
    }
    ctx.stroke()

    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)'
    ctx.fill()
  }, [showEQ, eqBands])

  // Track Cover Loading
  useEffect(() => {
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
    if (audioRef.current && audioCtxRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error(e))
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
      } else audioRef.current.pause()
    }
  }, [isPlaying, currentTrack])

  // Load Lyrics
  useEffect(() => {
    if (!currentTrack) {
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

  // Sync Lyrics with Time
  useEffect(() => {
    if (lyrics.length === 0) {
      setCurrentLyricIndex(-1)
      return
    }
    const visualTime = currentTime + 0.3
    const index = lyrics.findIndex((line, i) => {
      const nextLine = lyrics[i + 1]
      if (nextLine) return visualTime >= line.time && visualTime < nextLine.time
      return visualTime >= line.time
    })
    setCurrentLyricIndex(index)
  }, [currentTime, lyrics])

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
              setCurrentTime(newTime)
            }
            break;
          case 'seek-backward':
            if (audioRef.current) {
              const newTime = Math.max(0, audioRef.current.currentTime - 5)
              audioRef.current.currentTime = newTime
              setCurrentTime(newTime)
            }
            break;
        }
      })
    }
  }, [currentTrack, playQueue, isPlaying, repeatMode, volume])


  // ==========================================
  // 6. RENDERERS
  // ==========================================
  const renderTrackTable = (tracks: any[]) => {
    const visibleTracks = tracks.slice(0, visibleCount)
    
    return (
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800/50 select-none">
            {/* Cột STT (#) */}
            <th onClick={() => handleSort('id')} className="pb-3 font-medium w-12 text-center cursor-pointer group hover:text-white transition" title="Sắp xếp theo STT">
              <div className="inline-flex items-center gap-1 justify-center">
                <span>#</span>
                {sortField === 'id' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </th>
            {/* Cột TÊN BÀI HÁT */}
            <th onClick={() => handleSort('title')} className="pb-3 font-medium cursor-pointer group hover:text-white transition" title="Sắp xếp theo tên bài hát">
              <div className="inline-flex items-center gap-1">
                <span>TÊN BÀI HÁT</span>
                {sortField === 'title' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </th>
            {/* Cột ALBUM */}
            <th onClick={() => handleSort('album')} className="pb-3 font-medium cursor-pointer group hover:text-white transition" title="Sắp xếp theo Album">
              <div className="inline-flex items-center gap-1">
                <span>ALBUM</span>
                {sortField === 'album' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </th>
            {/* Cột ĐỊNH DẠNG */}
            <th onClick={() => handleSort('isCloud')} className="pb-3 font-medium cursor-pointer group hover:text-white transition" title="Sắp xếp theo định dạng">
              <div className="inline-flex items-center gap-1">
                <span>ĐỊNH DẠNG</span>
                {sortField === 'isCloud' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </th>
            {/* Cột THỜI GIAN */}
            <th onClick={() => handleSort('duration')} className="pb-3 font-medium text-right pr-4 cursor-pointer group hover:text-white transition" title="Sắp xếp theo thời lượng">
              <div className="inline-flex items-center gap-1 justify-end">
                <span>THỜI GIAN</span>
                {sortField === 'duration' ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
              </div>
            </th>
            <th className="pb-3 font-medium text-center">THAO TÁC</th>
          </tr>
        </thead>
        <tbody>
          {visibleTracks.map((track, index) => {
            const isThisTrackPlaying = currentTrack?.id === track.id
            return (
              <tr key={track.id} onClick={() => handleRowClick(track, tracks)} className={`group border-b border-zinc-800/20 transition-colors cursor-pointer ${isThisTrackPlaying ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <td className="py-4 text-center text-zinc-500 group-hover:text-white">
                  {isThisTrackPlaying && isPlaying ? <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse mx-auto" /> : index + 1}
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-zinc-800 rounded-md overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                      {track.coverArt ? <img src={track.coverArt} className="w-full h-full object-cover" /> : <img src={thumbnailHolder} className="w-3/4 h-3/4 object-contain" />}
                      {track.isCloud && <div className="absolute top-0 right-0 bg-emerald-500/80 p-0.5 rounded-bl-md"><Cloud size={10} className="text-white" /></div>}
                    </div>
                    <div className="truncate w-48 lg:w-64">
                      <p className={`font-semibold transition-colors truncate ${isThisTrackPlaying ? 'text-emerald-400' : 'text-white group-hover:text-emerald-400'}`}>{track.title}</p>
                      <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 text-zinc-400 truncate max-w-[150px]">{track.album || 'Unknown'}</td>
                <td className="py-4"><span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300 font-medium uppercase">{track.format || 'MP3'}</span></td>
                <td className="py-4 text-right pr-4 text-zinc-400">{formatDuration(track.duration)}</td>
                <td className="py-4 text-center">{!track.isCloud && <button onClick={(e) => openTagEditor(track, e)} className="text-zinc-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={16}/></button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  // ==========================================
  // 7. MAIN RENDER
  // ==========================================

  // Giao diện chính (Full Screen)
 return (
    <>
      {/* 1. ĐƯA THẺ AUDIO RA NGOÀI CÙNG ĐỂ KHÔNG BAO GIỜ BỊ RESET */}
      <audio
        ref={audioRef}
        src={currentTrack ? (currentTrack.filePath?.startsWith('http') || currentTrack.filePath?.startsWith('file://') ? currentTrack.filePath : `file://${currentTrack.filePath}`) : undefined}
        onEnded={() => { if (!crossfadeEnabled) handleNext() }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        loop={repeatMode === 2}
      />

      {/* 2. RẼ NHÁNH GIAO DIỆN BẰNG TERNARY OPERATOR */}
      {isMiniPlayer ? (
        // --- GIAO DIỆN MINI PLAYER ---
        <div className="h-screen w-screen bg-zinc-950/90 backdrop-blur-md overflow-hidden flex items-center p-3 border border-zinc-800" style={{ backgroundColor: themeColor }}>
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />
          
          <div className="w-24 h-24 bg-zinc-800 rounded-lg overflow-hidden shadow-xl flex-shrink-0 relative group">
            {currentTrack?.coverArt ? <img src={currentTrack.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><ListMusic size={32} /></div>}
            <button onClick={handleToggleMiniPlayer} className="absolute top-1 left-1 bg-black/60 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-emerald-500 transition" title="Trở về chế độ Đầy đủ">
              <Maximize2 size={14} />
            </button>
          </div>

          <div className="flex-1 ml-4 flex flex-col justify-center overflow-hidden">
            <div className="truncate mb-2 pr-4">
              <h4 className="text-sm font-bold text-white truncate">{currentTrack ? currentTrack.title : 'Meis Radio'}</h4>
              <p className="text-xs text-zinc-400 truncate">{currentTrack ? currentTrack.artist : 'Sẵn sàng phát nhạc'}</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition"><SkipBack size={18} /></button>
              <button onClick={() => { if(currentTrack) setIsPlaying(!isPlaying) }} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition">
                {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current translate-x-[1px]" />}
              </button>
              <button onClick={handleNext} className="text-zinc-400 hover:text-white transition"><SkipForward size={18} /></button>
            </div>
          </div>
        </div>
      ) : (
        // --- GIAO DIỆN CHÍNH (FULL SCREEN) ---
        <div className="flex flex-col h-screen text-zinc-200 font-sans overflow-hidden relative transition-colors duration-1000" style={{ backgroundColor: themeColor }}>
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />

      {/* OVERLAYS & MODALS */}
      {toast.visible && (
        <div className="fixed top-10 right-10 z-[100] animate-fade-in flex items-center gap-3 bg-zinc-900 border border-zinc-700 shadow-2xl py-3 px-5 rounded-xl">
          {toast.type === 'success' && <Sparkles size={18} className="text-emerald-400" />}
          {toast.type === 'error' && <X size={18} className="text-red-400" />}
          {toast.type === 'info' && <Cloud size={18} className="text-blue-400" />}
          <span className="text-sm font-medium text-white">{toast.message}</span>
        </div>
      )}

      {isDownloading && downloadProgress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] flex items-center justify-center p-4 transition-opacity">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-[450px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none" />
            <Cloud size={48} className="text-emerald-500 mb-6 animate-bounce relative z-10" />
            <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Đang tải dữ liệu</h2>
            <p className="text-sm text-zinc-400 mb-8 truncate w-full relative z-10">{downloadProgress.fileName}</p>
            <div className="w-full bg-zinc-950 rounded-full h-2.5 mb-3 overflow-hidden border border-zinc-800 relative z-10">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between w-full text-xs font-medium relative z-10">
              <span className="text-emerald-400">{Math.round((downloadProgress.current / downloadProgress.total) * 100)}%</span>
              <span className="text-zinc-500">{downloadProgress.current} / {downloadProgress.total} tệp</span>
            </div>
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

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR TABS */}
        <aside className="w-64 bg-zinc-900/40 border-r border-zinc-800/50 flex flex-col justify-between">
          <div className="p-6 space-y-8">
            <h1 className="text-2xl font-bold text-white tracking-wider flex items-center gap-2">
              <img src={logoImg} alt="Logo" className="w-8 h-8 object-contain" /> 
              MEI'S RADIO
            </h1>
            <nav className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Thư viện</p>
                <ul className="space-y-2">
                  <li onClick={() => { setActiveView('songs'); setSearchQuery(''); setSearchInput(''); }} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'songs' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    <Library size={18} /> Danh sách bài hát
                  </li>
                  <li onClick={() => { setActiveView('playlists'); setActivePlaylist(null); setSearchQuery(''); setSearchInput(''); }} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'playlists' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    <ListMusic size={18} /> Playlist của tôi
                  </li>
                </ul>
              </div>
              
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Liên kết cloud</p>
                <ul className="space-y-2">
                  <li onClick={() => { setActiveView('drive'); setSearchQuery(''); setSearchInput(''); }} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'drive' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-white'}`}>
                    <Cloud size={18} /> Google Drive
                  </li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="p-6">
            <div onClick={() => { setActiveView('settings'); setSearchQuery(''); setSearchInput(''); }} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'settings' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Settings size={18} /> Cài đặt
            </div>
          </div>
        </aside>

        {/* NỘI DUNG CHÍNH (ĐỔI THEO TAB) */}
        <main className={`flex-1 flex flex-col bg-transparent overflow-hidden ${isLyricsMaximized ? 'hidden' : ''}`}>
          
          <header className="h-20 px-8 flex items-center justify-between border-b border-zinc-800/50 flex-shrink-0 w-full">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="text" 
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); if (e.target.value === '') setSearchQuery(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') setSearchQuery(searchInput); }}
                placeholder="Tìm kiếm bài hát, nghệ sĩ..." 
                className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" 
              />
            </div>
            
            <button onClick={handleReloadLibrary} disabled={isReloading} className={`flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border border-zinc-700/50 rounded-full text-sm font-medium transition-colors ${isReloading ? 'text-emerald-500' : 'text-zinc-400 hover:text-white hover:border-zinc-600'}`} title="Làm mới Thư viện">
              <RefreshCw size={16} className={isReloading ? 'animate-spin' : ''} />
              {isReloading ? 'Đang làm mới...' : 'Làm mới'}
            </button>
          </header>

          <div className="flex-1 flex overflow-hidden">
            
            {/* CỘT TRÁI: DATA VIEW */}
            <div key={activeView} className="animate-fade-in flex-1 flex flex-col overflow-y-auto p-8 relative" onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
                if (scrollHeight - scrollTop <= clientHeight + 100) setVisibleCount(prev => prev + 25)
              }}>
              
              {/* VIEW: BÀI HÁT */}
              {activeView === 'songs' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-end gap-4">
                      <h2 className="text-3xl font-bold text-white">{searchQuery ? 'Kết quả tìm kiếm' : 'Danh sách bài hát'}</h2>
                      <span className="text-zinc-500 text-sm mb-1">{processedLibraryTracks.length} bài hát</span>
                    </div>
                    <button onClick={handleImportFiles} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-500/20">
                      <Plus size={18} /> Thêm nhạc vào Thư viện
                    </button>
                  </div>
                  {libraryPath ? (
                    processedLibraryTracks.length > 0 ? renderTrackTable(processedLibraryTracks) : <p className="text-zinc-500 mt-10 text-center">Không tìm thấy bài hát nào khớp với "{searchQuery}".</p>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 mt-20">
                      <HardDrive size={56} className="mb-4 opacity-20" />
                      <p className="text-lg">Chưa cấu hình Thư viện</p>
                      <p className="text-sm mt-1">Vui lòng vào phần Cài đặt để chọn Thư mục chứa nhạc của bạn.</p>
                    </div>
                  )}
                </>
              )}

              {/* VIEW: GOOGLE DRIVE */}
              {activeView === 'drive' && (
                <div className="flex flex-col h-full max-w-4xl">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                      <Cloud size={32} className="text-emerald-400" /> Google Drive
                    </h2>
                  </div>
                  
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl mb-6 shadow-lg">
                    <h3 className="text-emerald-400 font-semibold mb-2">Nhập liên kết thư mục</h3>
                    <p className="text-sm text-zinc-400 mb-4">Dán liên kết thư mục Drive chứa nhạc của bạn (Yêu cầu bật chế độ "Bất kỳ ai có liên kết").</p>
                    <div className="flex gap-3 items-center">
                      <div className="relative flex-1">
                        <Link size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input type="text" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                      </div>
                      <button onClick={handleDriveSubmit} disabled={!driveLink || isFetchingDrive} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2">
                        {isFetchingDrive ? <span className="animate-pulse">Đang quét...</span> : 'Quét dữ liệu'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-6 min-h-[300px]">
                    {driveFiles.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                        <Cloud size={56} className="mb-4 opacity-20" />
                        <p className="text-lg">Danh sách bài hát trống</p>
                        <p className="text-sm mt-1">Vui lòng dán liên kết và nhấn quét để lấy danh sách từ Cloud.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/50">
                          <h3 className="font-bold text-white">Đã tìm thấy {driveFiles.length} tệp âm thanh</h3>
                          <div className="flex gap-3">
                            <button onClick={handleDriveStream} className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-4 py-2 rounded-lg text-sm font-medium transition">
                              <Wifi size={16} /> Stream tất cả
                            </button>
                            <button onClick={handleDriveDownload} disabled={isDownloading} className="flex items-center gap-2 bg-zinc-800 text-white hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                              {isDownloading ? <span className="animate-pulse">Đang xử lý...</span> : <><Download size={16} /> Tải về Thư viện (Lossless)</>}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 overflow-y-auto pr-2">
                          {driveFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-4 p-3 bg-zinc-900/40 hover:bg-zinc-800/80 rounded-lg border border-zinc-800/50 transition">
                              <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center flex-shrink-0 text-emerald-500"><ListMusic size={18} /></div>
                              <div className="flex-1 truncate">
                                <p className="font-semibold text-white truncate text-sm">{f.title}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">Định dạng gốc: <span className="text-emerald-500/80 uppercase">{f.format}</span></p>
                              </div>
                              <button onClick={() => setCloudActionTrack(f)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 font-medium transition">Tùy chọn</button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW: CÀI ĐẶT */}
              {activeView === 'settings' && (
                <div className="max-w-2xl">
                  <h2 className="text-3xl font-bold text-white mb-6">Cài đặt hệ thống</h2>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl space-y-6">
                    <div>
                      <h3 className="text-emerald-400 font-semibold mb-2">Thư mục gốc (Thư viện)</h3>
                      <p className="text-sm text-zinc-400 mb-4">Chọn thư mục chứa nhạc. Ứng dụng sẽ tự động quét bài hát...</p>
                      <div className="flex gap-3 items-center">
                        <input type="text" readOnly value={libraryPath || 'Chưa thiết lập'} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300" />
                        <button onClick={handleSelectLibrary} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Thay đổi</button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Crossfade (Chuyển bài mượt mà)</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 text-sm">Bật hiệu ứng Crossfade</span>
                        <input type="checkbox" checked={crossfadeEnabled} onChange={e => setCrossfadeEnabled(e.target.checked)} className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                      </div>
                      {crossfadeEnabled && (
                        <div className="mt-4 flex items-center gap-4">
                          <span className="text-zinc-400 text-sm">Thời gian làm mờ:</span>
                          <CustomNumberInput min={1} max={10} value={crossfadeDuration} onChange={setCrossfadeDuration} />
                          <span className="text-zinc-400 text-sm">giây</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Google Drive API Key</h3>
                      <p className="text-sm text-zinc-400 mb-4">Nhập khóa API của bạn để sử dụng tính năng tải nhạc từ Cloud.</p>
                      <div className="flex gap-3 items-center">
                        <input type="text" value={googleDriveApiKey} onChange={e => setGoogleDriveApiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors" />
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 italic">*Khóa của bạn sẽ được lưu an toàn trên máy tính cá nhân.</p>
                    </div>

                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Thiết bị âm thanh (Output Device)</h3>
                      <p className="text-sm text-zinc-400 mb-4">Chọn loa hoặc tai nghe để phát nhạc.</p>
                      <CustomSelect value={selectedDeviceId} onChange={setSelectedDeviceId} options={audioDevices.map(device => ({ value: device.deviceId, label: device.label || (device.deviceId === 'default' ? 'Thiết bị mặc định của hệ thống' : `Thiết bị ${device.deviceId.slice(0, 8)}...`) }))} />
                    </div>

                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Hành vi cửa sổ</h3>
                      <div className="flex flex-col gap-4 mt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-zinc-200 text-sm">Khi nhấn nút Thu nhỏ (Minimize)</p>
                            <p className="text-xs text-zinc-500">Mặc định thu nhỏ xuống thanh Taskbar</p>
                          </div>
                          <div className="w-72">
                            <CustomSelect value={minimizeToTray ? 'tray' : 'taskbar'} onChange={(val) => setMinimizeToTray(val === 'tray')} options={[{ value: 'taskbar', label: 'Thu nhỏ xuống Taskbar' }, { value: 'tray', label: 'Thu nhỏ xuống System Tray' }]} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-zinc-200 text-sm">Khi nhấn nút Đóng (Close)</p>
                            <p className="text-xs text-zinc-500">Tránh vô tình tắt nhạc khi đóng cửa sổ</p>
                          </div>
                          <div className="w-72">
                            <CustomSelect value={closeToTray ? 'tray' : 'quit'} onChange={(val) => setCloseToTray(val === 'tray')} options={[{ value: 'quit', label: 'Thoát hoàn toàn ứng dụng' }, { value: 'tray', label: 'Thu nhỏ xuống System Tray' }]} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW: PLAYLISTS */}
              {activeView === 'playlists' && !activePlaylist && (
                <>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-bold text-white">{searchQuery ? 'Kết quả tìm kiếm' : 'Playlist của tôi'}</h2>
                    {!searchQuery && (
                      <div className="flex gap-3">
                        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-500/20">
                          <Plus size={16} /> Tạo Playlist mới
                        </button>
                        <button onClick={handleAutoGeneratePlaylists} className="flex items-center gap-2 bg-zinc-800 hover:bg-emerald-600/20 hover:text-emerald-400 border border-zinc-700 hover:border-emerald-500/50 px-4 py-2 rounded-lg text-sm font-medium transition">
                          <Sparkles size={16} /> Tự động phân loại Album
                        </button>
                      </div>
                    )}
                  </div>
                  {(() => {
                    if (playlists.length === 0) return <p className="text-zinc-500">Chưa có danh sách phát nào. Hãy tạo các thư mục con trong Thư viện gốc.</p>
                    const lowerQuery = searchQuery.toLowerCase()
                    const matchedPlaylists = searchQuery ? playlists.filter(pl => pl.name.toLowerCase().includes(lowerQuery)) : playlists
                    const matchedTracks = searchQuery ? getFilteredTracks(libraryTracks) : []

                    return (
                      <div className="space-y-10">
                        {(matchedPlaylists.length > 0 || !searchQuery) && (
                          <div>
                            {searchQuery && <h3 className="text-xl font-bold text-white mb-6">Album & Danh sách phát</h3>}
                            <div className="grid grid-cols-4 gap-6">
                              {matchedPlaylists.map(pl => (
                                <div key={pl.name} className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50 hover:bg-zinc-800/50 transition group cursor-pointer" onClick={() => { setActivePlaylist(pl); setSearchQuery(''); }}>
                                  <div className="aspect-square bg-zinc-800 rounded-lg mb-4 overflow-hidden relative">
                                    {pl.thumbnail ? <img src={pl.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={40} /></div>}
                                    <button onClick={(e) => { e.stopPropagation(); handleChangePlaylistImage(pl.name) }} className="absolute bottom-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-emerald-500 transition" title="Chọn ảnh từ máy tính"><ImageIcon size={16}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleExtractPlaylistImage(pl.name) }} className="absolute bottom-2 right-10 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-emerald-500 transition" title="Lấy ảnh từ bài hát đầu tiên"><Sparkles size={16}/></button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h3 className="font-bold text-white truncate max-w-[140px]">{pl.name}</h3>
                                      <p className="text-xs text-zinc-500">{pl.tracks.length} bài hát</p>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name }) }} className="text-zinc-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={14}/></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {searchQuery && processedLibraryTracks.length > 0 && <div><h3 className="text-xl font-bold text-white mb-6">Bài hát</h3>{renderTrackTable(processedLibraryTracks)}</div>}
                        {searchQuery && matchedPlaylists.length === 0 && matchedTracks.length === 0 && <p className="text-zinc-500 mt-8 text-center">Không tìm thấy kết quả nào cho "{searchQuery}".</p>}
                      </div>
                    )
                  })()}
                </>
              )}

              {/* VIEW: CHI TIẾT PLAYLIST */}
              {activeView === 'playlists' && activePlaylist && (
                <>
                  <div className="flex items-end justify-between mb-8">
                    <div className="flex items-end gap-6">
                      <div className="w-40 h-40 bg-zinc-800 rounded-xl overflow-hidden shadow-2xl relative group">
                        {activePlaylist.thumbnail ? <img src={activePlaylist.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={48} /></div>}
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-2">Playlist</p>
                        <h2 className="text-5xl font-extrabold text-white mb-4">{activePlaylist.name}</h2>
                        <p className="text-zinc-400">{activePlaylist.tracks.length} bài hát</p>
                      </div>
                    </div>
                    {/* Nút thêm nhạc riêng cho Playlist */}
                    <div className="flex gap-3">
                      <button onClick={() => setShowAddSongsModal(true)} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                        <Plus size={16} /> Thêm bài hát có sẵn
                      </button>
                      <button onClick={handleImportFiles} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-500/20">
                        <Plus size={16} /> Tải file từ máy tính
                      </button>
                    </div>
                  </div>
                  {renderTrackTable(processedPlaylistTracks)}
                </>
              )}
            </div>
            
            {/* CỘT PHẢI: LỜI BÀI HÁT (SPLIT VIEW) */}
            {showLyricsPanel && (
              <div className="w-96 border-l border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm flex flex-col">
                <div className="p-4 flex items-center justify-between border-b border-zinc-800/50">
                  <h3 className="font-bold text-white flex items-center gap-2"><Mic2 size={16} className="text-emerald-400"/> Lời bài hát</h3>
                  <button onClick={() => setIsLyricsMaximized(true)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800"><Maximize2 size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 text-center">
                  {lyrics.length === 0 ? <p className="text-zinc-500 italic mt-10">Không có lời bài hát.</p> : lyrics.map((line, index) => {
                    const isActive = index === currentLyricIndex
                    return <p key={index} ref={isActive ? activeLyricRef : null} onClick={() => {if(audioRef.current){audioRef.current.currentTime = line.time; setCurrentTime(line.time)}}} className={`cursor-pointer transition-all duration-300 font-bold ${isActive ? 'text-emerald-400 text-xl' : 'text-zinc-500 text-sm hover:text-zinc-300'}`}>{line.text}</p>
                  })}
                </div>
              </div>
            )}

            {/* CỘT PHẢI: HÀNG ĐỢI DANH SÁCH PHÁT (QUEUE) */}
            {showQueuePanel && (
              <div className="w-96 border-l border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm flex flex-col">
                <div className="p-4 flex items-center justify-between border-b border-zinc-800/50">
                  <h3 className="font-bold text-white flex items-center gap-2"><List size={16} className="text-emerald-400"/> Danh sách đang phát</h3>
                  <button onClick={() => setShowQueuePanel(false)} className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800"><X size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {playQueue.length === 0 ? (
                    <p className="text-zinc-500 italic mt-10 text-center">Hàng đợi trống.</p>
                  ) : (
                    playQueue.map((track, index) => {
                      const isActive = currentTrack?.id === track.id
                      return (
                        <div key={index} onClick={() => handlePlayTrack(track)} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${isActive ? 'bg-emerald-500/20 border border-emerald-500/30' : 'hover:bg-zinc-800/50 border border-transparent'}`}>
                          <div className="w-10 h-10 bg-zinc-800 rounded flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                             {track.coverArt ? <img src={track.coverArt} className="w-full h-full object-cover" /> : <ListMusic size={16} className="text-zinc-500" />}
                             {isActive && isPlaying && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" /></div>}
                          </div>
                          <div className="truncate flex-1">
                            <p className={`text-sm font-semibold truncate ${isActive ? 'text-emerald-400' : 'text-white'}`}>{track.title}</p>
                            <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* FULLSCREEN LYRICS */}
        {isLyricsMaximized && showLyricsPanel && (
          <div className="flex-1 flex flex-col bg-zinc-950/90 backdrop-blur-xl z-40 relative">
            <button onClick={() => setIsLyricsMaximized(false)} className="absolute top-8 right-8 text-zinc-400 hover:text-white bg-zinc-800 p-3 rounded-full"><Minimize2 size={24}/></button>
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="w-1/2 flex flex-col items-center justify-center gap-6">
                <div className="w-80 h-80 bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden">{currentTrack?.coverArt ? <img src={currentTrack.coverArt} className="w-full h-full object-cover" /> : <ListMusic size={60} className="m-auto mt-32 text-zinc-600" />}</div>
                <div className="text-center"><h2 className="text-3xl font-bold text-white mb-2">{currentTrack?.title}</h2><p className="text-emerald-400 text-lg">{currentTrack?.artist}</p></div>
              </div>
              <div className="w-1/2 h-[70vh] overflow-y-auto px-8 space-y-8 text-center scrollbar-hide">
                 {lyrics.length === 0 ? <p className="text-zinc-500 italic mt-32 text-xl">Không có lời bài hát.</p> : lyrics.map((line, index) => {
                  const isActive = index === currentLyricIndex
                  return <p key={index} ref={isActive ? activeLyricRef : null} onClick={() => {if(audioRef.current){audioRef.current.currentTime = line.time; setCurrentTime(line.time)}}} className={`cursor-pointer transition-all duration-300 font-bold ${isActive ? 'text-emerald-400 text-3xl scale-105' : 'text-zinc-500 text-xl hover:text-zinc-300 opacity-50'}`}>{line.text}</p>
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VISUALIZER CANVAS */}
      <canvas ref={visualizerCanvasRef} width={1024} height={150} className={`w-full h-24 bg-transparent pointer-events-none absolute bottom-24 left-0 z-10 transition-opacity duration-500 ${showVisualizer ? 'opacity-20' : 'opacity-0'}`} />
      
      {/* PLAYER BAR */}
      <footer className="h-24 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-6 z-20 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        
        {/* EQ Overlay */}
        {showEQ && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Sliders className="text-emerald-500" size={22} />
                  <h2 className="text-lg font-bold text-white">Equalizer (EQ)</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleAddBand} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"><Plus size={16} /> Thêm dải tần</button>
                  <button onClick={handleResetEQ} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition"><RotateCcw size={14} /> Reset</button>
                  <button onClick={() => setShowEQ(false)} className="text-zinc-400 hover:text-white px-2 text-lg">✕</button>
                </div>
              </div>

              <canvas ref={eqCanvasRef} width={800} height={150} className="w-full h-32 bg-zinc-950 rounded-lg border border-zinc-800 mb-4 shrink-0" />

              <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                {eqBands.length === 0 ? <p className="text-center text-zinc-500 py-8">Chưa có dải tần nào. Hãy bấm "Thêm dải tần".</p> : (
                  eqBands.sort((a, b) => a.frequency - b.frequency).map((band) => (
                      <div key={band.id} className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex flex-wrap items-center gap-4 text-xs">
                        <div className="flex flex-col gap-1 w-28">
                          <label className="text-zinc-400 font-mono text-xs">Tần số (Hz)</label>
                          <CustomNumberInput min={20} max={20000} step={10} value={band.frequency} onChange={(val) => handleUpdateBand(band.id, 'frequency', val)} />
                        </div>
                        <div className="flex flex-col gap-1 w-36">
                          <label className="text-zinc-400 text-xs">Loại bộ lọc</label>
                          <CustomSelect
                            value={band.type}
                            onChange={(val) => handleUpdateBand(band.id, 'type', val)}
                            options={[
                              { value: 'peaking', label: 'Peaking' }, { value: 'lowshelf', label: 'Low Shelf' },
                              { value: 'highshelf', label: 'High Shelf' }, { value: 'lowpass', label: 'Low Pass' }, { value: 'highpass', label: 'High Pass' }
                            ]}
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <div className="flex justify-between text-zinc-400">
                              <span>Mức khuếch đại (Gain)</span>
                              <span className="font-mono text-emerald-400">{band.gain > 0 ? `+${band.gain}` : band.gain} dB</span>
                            </div>
                            <input type="range" min="-20" max="20" step="0.5" value={band.gain} onChange={(e) => handleUpdateBand(band.id, 'gain', Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500" style={{ background: `linear-gradient(to right, #10b981 ${((band.gain + 20) / 40) * 100}%, #27272a ${((band.gain + 20) / 40) * 100}%)` }} />
                        </div>
                        <button onClick={() => handleDeleteBand(band.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition mt-3" title="Xóa dải EQ"><Trash2 size={16} /></button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 w-1/3">
          <div className="w-14 h-14 bg-zinc-800 rounded-md shadow-lg overflow-hidden flex-shrink-0">
            {currentTrack?.coverArt ? <img src={currentTrack.coverArt} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-zinc-600"><ListMusic size={24} /></div>}
          </div>
          <div className="truncate">
            <h4 className="text-sm font-bold text-white leading-tight truncate">{currentTrack ? currentTrack.title : 'Chưa có bài hát'}</h4>
            <p className="text-xs text-zinc-400 mt-1 truncate">{currentTrack ? currentTrack.artist : '---'}</p>
            {currentTrack && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">{currentTrack.lossless ? 'Lossless' : (currentTrack.format || 'MP3')}</span>
                <span className="text-[10px] text-zinc-500">{currentTrack.sampleRate ? `${currentTrack.sampleRate / 1000}kHz` : ''} {currentTrack.bitrate ? ` | ${Math.round(currentTrack.bitrate / 1000)} kbps` : ''}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 max-w-md">
          <div className="flex items-center gap-6 mb-2">
            <button onClick={toggleShuffle} className={`transition ${isShuffle ? 'text-emerald-500' : 'text-zinc-400 hover:text-white'}`}><Shuffle size={18} /></button>
            <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition"><SkipBack size={20} /></button>
            <button onClick={() => { if(currentTrack) setIsPlaying(!isPlaying) }} className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${currentTrack ? 'bg-white text-black hover:scale-105' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}>
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current translate-x-[2px]" />}
            </button>
            <button onClick={handleNext} className="text-zinc-400 hover:text-white transition"><SkipForward size={20} /></button>
            <button onClick={toggleRepeat} className={`transition ${repeatMode > 0 ? 'text-emerald-500' : 'text-zinc-400 hover:text-white'}`}>{repeatMode === 2 ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
          </div>
          <div className="w-full flex items-center gap-3 text-[11px] text-zinc-400 font-medium">
            <span>{formatDuration(currentTime)}</span>
            <input type="range" min={0} max={currentTrack?.duration || 100} value={currentTime} onChange={handleSeek} disabled={!currentTrack} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400" style={{ background: `linear-gradient(to right, #10b981 ${currentTrack?.duration ? (currentTime / currentTrack.duration) * 100 : 0}%, #27272a ${currentTrack?.duration ? (currentTime / currentTrack.duration) * 100 : 0}%)` }} />
            <span>{currentTrack ? formatDuration(currentTrack.duration) : '0:00'}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-4 w-1/3 text-zinc-400">
          <button onClick={handleToggleMiniPlayer} className="transition hover:text-white text-zinc-400" title="Trình phát thu nhỏ (Mini Player)"><PictureInPicture2 size={18} /></button>
          <button onClick={() => setShowVisualizer(!showVisualizer)} className={`transition ${showVisualizer ? 'text-emerald-500' : 'hover:text-white'}`} title="Bật/tắt hiệu ứng sóng âm"><Activity size={18} /></button>
          <button onClick={() => { setShowQueuePanel(!showQueuePanel); setShowLyricsPanel(false); }} className={`transition ${showQueuePanel ? 'text-emerald-500' : 'hover:text-white'}`} title="Danh sách đang phát"><List size={18} /></button>
          <button onClick={() => setShowLyricsPanel(!showLyricsPanel)} className={`transition ${showLyricsPanel ? 'text-emerald-500' : 'hover:text-white'}`} title="Lời bài hát"><Mic2 size={18} /></button>
          <button onClick={() => setShowEQ(!showEQ)} className={`transition ${showEQ ? 'text-emerald-500' : 'hover:text-white'}`} title="Bộ chỉnh âm (Equalizer)"><Sliders size={18} /></button>

          <div className="flex items-center gap-2 w-32">
            <button onClick={toggleMute} className="hover:text-white transition">{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400" style={{ background: `linear-gradient(to right, #10b981 ${volume * 100}%, #27272a ${volume * 100}%)` }} />
          </div>
        </div>
      </footer>
      </div>
    )}
  </>
)
}