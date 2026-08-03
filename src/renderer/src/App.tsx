import { useState, useRef, useEffect } from 'react'
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Sliders, Cloud, HardDrive, Search, Library, 
  ListMusic, Settings, ChevronDown, FolderPlus, Download, Wifi, Link, Edit2, Image as ImageIcon, Sparkles, Plus, Trash2, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown,
  Mic2, Maximize2, Minimize2
} from 'lucide-react'
// Đã sử dụng đúng đường dẫn logo của bạn
import logoImg from '../../../resources/HoT_Chibi_Icon.png'
import thumbnailHolder from '../../../resources/HoT_Chibi_Emoji.png'

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
  // --- STATES GIAO DIỆN & THƯ VIỆN ---
  const [activeView, setActiveView] = useState<'songs' | 'playlists' | 'settings' | 'drive'>('songs')
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [libraryTracks, setLibraryTracks] = useState<any[]>([])
  const [playlists, setPlaylists] = useState<any[]>([])
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // --- STATES PLAYER & EQ ---
  const [currentTrack, setCurrentTrack] = useState<any | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isShuffle, setIsShuffle] = useState(false)
  const [shuffledTracks, setShuffledTracks] = useState<any[]>([])
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0)
  const [volume, setVolume] = useState(1)
  const [showEQ, setShowEQ] = useState(false)
  const [eqBands, setEqBands] = useState<EQBand[]>([
    { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
    { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
    { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
    { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
    { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
  ])
  const filtersRef = useRef<any>({})
  const [prevVolume, setPrevVolume] = useState<number>(1)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(-1)
  const [showLyricsPanel, setShowLyricsPanel] = useState<boolean>(false)
  const [isLyricsMaximized, setIsLyricsMaximized] = useState<boolean>(false)
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)

  // Settings & Theme State
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)
  const [crossfadeDuration, setCrossfadeDuration] = useState(3)
  const [themeColor, setThemeColor] = useState('rgba(39, 39, 42, 0)')

  // Tag Editor State
  const [editingTrack, setEditingTrack] = useState<any | null>(null)
  const [editTags, setEditTags] = useState({ title: '', artist: '', album: '', lyrics: '' })
  const [editImagePath, setEditImagePath] = useState<string | null>(null)
  const [playlistRename, setPlaylistRename] = useState<{ isOpen: boolean, oldName: string, newName: string }>({ isOpen: false, oldName: '', newName: '' })

  // --- STATES GOOGLE DRIVE (ĐÃ KHÔI PHỤC) ---
  const [driveLink, setDriveLink] = useState('')
  const [isFetchingDrive, setIsFetchingDrive] = useState(false)
  const [driveFiles, setDriveFiles] = useState<any[]>([])
  const [cloudActionTrack, setCloudActionTrack] = useState<any | null>(null) 
  const [isDownloading, setIsDownloading] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const filterNodesRef = useRef<BiquadFilterNode[]>([])

  // --- INIT CẤU HÌNH ---
  useEffect(() => {
    // @ts-ignore
    window.api.getConfig().then(cfg => {
      if (cfg.volume !== undefined) setVolume(cfg.volume)
      if (cfg.crossfadeEnabled !== undefined) setCrossfadeEnabled(cfg.crossfadeEnabled)
      if (cfg.crossfadeDuration !== undefined) setCrossfadeDuration(cfg.crossfadeDuration)
      if (cfg.eqBands) setEqBands(cfg.eqBands)
      loadLibrary()
    })
  }, [])

  // Auto-save Config
  useEffect(() => {
    // @ts-ignore
    window.api.saveConfig({ volume, crossfadeEnabled, crossfadeDuration, eqBands })
  }, [volume, crossfadeEnabled, crossfadeDuration, eqBands])

  // Lấy màu chủ đạo
  useEffect(() => {
    if (currentTrack?.coverArt) {
      getDominantColor(currentTrack.coverArt, setThemeColor)
    } else {
      setThemeColor('rgba(39, 39, 42, 0)')
    }
  }, [currentTrack])

  // Khởi tạo Web Audio API cho EQ
  // Re-chain audio filters khi danh sách eqBands thay đổi
  // Hợp nhất khởi tạo AudioContext và Chuỗi Filter EQ
  useEffect(() => {
    if (!audioRef.current) return

    // 1. Tạo AudioContext nếu chưa có
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }

    const ctx = audioCtxRef.current

    // 2. Tạo Source Node duy nhất 1 lần từ thẻ <audio>
    if (!sourceNodeRef.current) {
      try {
        sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
      } catch (e) {
        console.error('Lỗi khởi tạo MediaElementSource:', e)
      }
    }

    if (!sourceNodeRef.current) return

    // 3. Ngắt kết nối tất cả các Node cũ để nối lại
    sourceNodeRef.current.disconnect()
    filterNodesRef.current.forEach(node => node.disconnect())
    filterNodesRef.current = []

    // 4. Sắp xếp các dải EQ theo tần số tăng dần
    const sortedBands = [...eqBands].sort((a, b) => a.frequency - b.frequency)
    let prevNode: AudioNode = sourceNodeRef.current

    // 5. Nối chuỗi từng dải Filter
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

    // 6. Nối Node cuối cùng ra loa (destination)
    prevNode.connect(ctx.destination)
  }, [eqBands]) // Tự động chạy lại khi thêm/xóa/sửa dải EQ

  // Nạp thư viện khi mở app
  const loadLibrary = async () => {
    // @ts-ignore
    const res = await window.api.getLibrary()
    if (res.success) {
      setLibraryPath(res.libraryPath)
      setLibraryTracks(res.tracks)
      setPlaylists(res.playlists)
    }
  }

  useEffect(() => { loadLibrary() }, [])

  // --- CÁC HÀM QUẢN LÝ THƯ VIỆN ---
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

  // Xử lý đổi tên Playlist thông qua Custom Modal (Thay cho lệnh prompt() bị Electron chặn)
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc') // Đổi sang giảm dần
      } else {
        setSortField(null)   // Bấm lần thứ 3 -> Bỏ sắp xếp (về mặc định)
        setSortOrder('asc')
      }
    } else {
      setSortField(field)
      setSortOrder('asc')     // Chọn cột mới -> Mặc định tăng dần
    }
  }

  const getSortedTracks = (tracks: any[]) => {
    if (!sortField || !tracks) return tracks

    return [...tracks].sort((a, b) => {
      let valA = a[sortField] ?? ''
      let valB = b[sortField] ?? ''

      // Xử lý so sánh chuỗi (không phân biệt hoa/thường)
      if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = (valB || '').toLowerCase()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }

  const getDisplayedTracks = () => {
    const baseList = activeView === 'playlists' && activePlaylist ? activePlaylist.tracks : libraryTracks
    const queue = isShuffle ? shuffledTracks : baseList
    return getSortedTracks(queue)
  }

  // --- LOGIC PLAYER VÀ ĐIỀU KHIỂN ---
  const getCurrentQueue = () => {
    const baseList = activeView === 'playlists' && activePlaylist ? activePlaylist.tracks : libraryTracks
    return isShuffle ? shuffledTracks : baseList
  }

  const handlePlayTrack = async (track: any) => {
    // Crossfade Logic: Fade out file ảo
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

  const handleEnded = () => {
    if (repeatMode === 2) {
      // Chế độ 2: Lặp lại duy nhất 1 bài hiện tại (Repeat One)
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(e => console.error(e))
      }
    } else {
      // Chế độ 0 & 1: Chuyển sang bài tiếp theo trong hàng đợi
      handleNext()
    }
  }

  const handleNext = () => {
    if (!currentTrack) return
    const queue = getCurrentQueue()
    if (!queue || queue.length === 0) return

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id)
    let nextIndex = currentIndex + 1

    if (nextIndex >= queue.length) {
      if (repeatMode === 1 || repeatMode === 2) {
        // Lặp lại toàn bộ: Quay về bài đầu tiên
        nextIndex = 0
      } else {
        // Tắt Repeat: Dừng phát nhạc khi hết danh sách
        setIsPlaying(false)
        return
      }
    }
    handlePlayTrack(queue[nextIndex])
  }

  const handlePrev = () => {
    if (!currentTrack) return
    if (currentTime > 3 && audioRef.current) { 
      audioRef.current.currentTime = 0
      return 
    }
    const queue = getCurrentQueue()
    if (!queue || queue.length === 0) return

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id)
    let prevIndex = currentIndex - 1

    if (prevIndex < 0) {
      if (repeatMode === 1 || repeatMode === 2) {
        prevIndex = queue.length - 1
      } else {
        prevIndex = 0
      }
    }
    handlePlayTrack(queue[prevIndex])
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current || !currentTrack) return
    const cTime = audioRef.current.currentTime
    setCurrentTime(cTime)
    
    // Crossfade Trigger (Chuyển bài sớm)
    if (crossfadeEnabled && currentTrack.duration > 0) {
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

  // ĐÃ KHÔI PHỤC: Hàm điều chỉnh thanh trượt âm lượng
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

  const parseLRC = (rawText: any): LyricLine[] => {
    if (!rawText) return []

    // Xử lý dữ liệu nạp vào: Đảm bảo luôn trích xuất ra một chuỗi văn bản (String)
    let lrcText = ''
    if (typeof rawText === 'string') {
      lrcText = rawText
    } else if (typeof rawText === 'object') {
      if (rawText.text) lrcText = rawText.text
      else if (Array.isArray(rawText)) lrcText = rawText.join('\n')
      else lrcText = String(rawText)
    }

    if (typeof lrcText !== 'string' || !lrcText.split) return []

    const lines = lrcText.split('\n')
    const result: LyricLine[] = []
    
    // Cập nhật Regex linh hoạt hơn: hỗ trợ [00:00], [00:00.0], [00:00.00], [00:00.000]
    const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{1,3}))?\]/

    lines.forEach((line) => {
      const match = timeRegex.exec(line)
      if (match) {
        const minutes = parseInt(match[1], 10)
        const seconds = parseInt(match[2], 10)
        // Xử lý linh hoạt số mili-giây (nếu có)
        const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0
        const time = minutes * 60 + seconds + milliseconds / 1000
        
        // Xóa toàn bộ các thẻ thời gian trong dòng để lấy text sạch
        const text = line.replace(/\[\d{2,}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()
        if (text) {
          result.push({ time, text })
        }
      }
    })

    return result.sort((a, b) => a.time - b.time)
  }

  // Thêm 1 dải EQ mới
  const handleAddBand = () => {
    const newBand: EQBand = {
      id: Date.now().toString(),
      frequency: 1000, // Tần số mặc định 1kHz
      gain: 0,
      type: 'peaking',
      q: 1.4,
    }
    setEqBands(prev => [...prev, newBand])
  }

  // Xóa 1 dải EQ
  const handleDeleteBand = (id: string) => {
    setEqBands(prev => prev.filter(b => b.id !== id))
  }

  // Cập nhật thuộc tính của 1 dải EQ (tần số, gain, loại filter)
  const handleUpdateBand = (id: string, key: keyof EQBand, value: any) => {
    setEqBands(prev =>
      prev.map(band => (band.id === id ? { ...band, [key]: value } : band))
    )
  }

  // Khôi phục EQ về mặc định (Flat)
  const handleResetEQ = () => {
    setEqBands([
      { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
      { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
      { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
      { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
      { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
    ])
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

  useEffect(() => {
    if (audioRef.current && audioCtxRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error(e))
        // Fade In Logic
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

  // --- LOGIC GOOGLE DRIVE VÀ CLOUD (ĐÃ KHÔI PHỤC) ---
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
      alert("Vui lòng vào Cài đặt để thiết lập Thư viện gốc trước khi tải!")
      return
    }
    setIsDownloading(true)
    try {
      // @ts-ignore
      const result = await window.api.downloadMultipleFiles(driveFiles)
      if (result.success) {
        alert(`Tải thành công ${result.tracks.length} bài hát về Thư viện!\nChất lượng nguyên bản của tệp đã được giữ nguyên 100%.`)
        loadLibrary()
      } else {
        alert('Lỗi hệ thống: ' + result.error)
      }
    } catch (e) {
      alert('Có lỗi xảy ra khi tải file!')
    }
    setIsDownloading(false)
  }

  const handleRowClick = (track: any) => {
    if (track.isCloud) setCloudActionTrack(track)
    else handlePlayTrack(track)
  }

  const handleCloudAction = async (action: 'stream' | 'download') => {
    if (!cloudActionTrack) return
    if (action === 'stream') {
      handlePlayTrack({ ...cloudActionTrack, filePath: cloudActionTrack.url })
      setCloudActionTrack(null)
    } else {
      setIsDownloading(true)
      try {
        // Lấy đúng định dạng gốc của file từ Cloud (FLAC, WAV, MP3...), mặc định là mp3 nếu không rõ
        const ext = cloudActionTrack.format ? cloudActionTrack.format.toLowerCase() : 'mp3'
        
        // @ts-ignore
        const result = await window.api.downloadCloudFile(cloudActionTrack.url, `${cloudActionTrack.title}.${ext}`)
        
        if (result.success) {
          alert('Tải về thành công! Nhạc sẽ bắt đầu phát từ máy tính.')
          handlePlayTrack({ ...cloudActionTrack, filePath: result.localPath, isCloud: false })
          loadLibrary() // Nạp lại thư viện sau khi tải xong
        }
      } catch (e) {}
      setIsDownloading(false)
      setCloudActionTrack(null)
    }
  }

  const toggleShuffle = () => {
    if (!isShuffle) setShuffledTracks([...getCurrentQueue()].sort(() => Math.random() - 0.5))
    setIsShuffle(!isShuffle)
  }

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev + 1) % 3 as 0 | 1 | 2)
  }

  // 3. Effect: Tải lời bài hát khi đổi Track (từ Metadata hoặc file .lrc trùng tên)
  useEffect(() => {
    if (!currentTrack) {
      setLyrics([])
      return
    }

    const trackPath = currentTrack.id || currentTrack.filePath

    const loadLyrics = async () => {
      let externalLrc = null

      // ƯU TIÊN 1: Thử đọc file .lrc nằm cùng thư mục trước
      if (trackPath && (window as any).api?.readLrcFile) {
        try {
          externalLrc = await (window as any).api.readLrcFile(trackPath)
        } catch (e) {}
      }

      if (externalLrc) {
        const parsedExternal = parseLRC(externalLrc)
        // Nếu parse thành công có lời, dùng luôn và thoát
        if (parsedExternal.length > 0) {
          setLyrics(parsedExternal)
          return
        }
      }

      // ƯU TIÊN 2: Nếu không có file .lrc hoặc file lỗi, dùng lời bài hát nội bộ (metadata)
      if (currentTrack.lyrics) {
        const parsedInternal = parseLRC(currentTrack.lyrics)
        setLyrics(parsedInternal)
        return
      }

      // MẶC ĐỊNH: Không tìm thấy gì
      setLyrics([])
    }

    loadLyrics()
  }, [currentTrack])

  // 4. Effect: Tìm câu hát hiện tại dựa trên `currentTime`
  useEffect(() => {
    if (lyrics.length === 0) {
      setCurrentLyricIndex(-1)
      return
    }

    const index = lyrics.findIndex((line, i) => {
      const nextLine = lyrics[i + 1]
      if (nextLine) {
        return currentTime >= line.time && currentTime < nextLine.time
      }
      return currentTime >= line.time
    })

    setCurrentLyricIndex(index)
  }, [currentTime, lyrics])

  // 5. Effect: Tự động cuộn mượt đến câu hát đang phát
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentLyricIndex])

  // 6. Hàm nhảy đến thời gian khi bấm vào dòng lời bài hát
  const handleLyricClick = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // --- TAG EDITOR LOGIC ---
  const openTagEditor = (track: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTrack(track)

    // Xử lý trích xuất chính xác chuỗi văn bản lời bài hát
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
      
      // MỚI: Nếu bài hát đang phát chính là bài vừa sửa, cập nhật lại state để UI hiển thị lời ngay lập tức
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

  // --- RENDERING UI CHÍNH ---
  const renderTrackTable = (tracks: any[]) => {
    // 1. Lấy danh sách bài hát đã được sắp xếp
    const sortedTracks = getSortedTracks(tracks)
    return (
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800/50 select-none">
            {/* Cột STT (#) */}
            <th 
              onClick={() => handleSort('id')} 
              className="pb-3 font-medium w-12 text-center cursor-pointer group hover:text-white transition"
              title="Sắp xếp theo STT"
            >
              <div className="inline-flex items-center gap-1 justify-center">
                <span>#</span>
                {sortField === 'id' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                ) : (
                  <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </th>

            {/* Cột TÊN BÀI HÁT */}
            <th 
              onClick={() => handleSort('title')} 
              className="pb-3 font-medium cursor-pointer group hover:text-white transition"
              title="Sắp xếp theo tên bài hát"
            >
              <div className="inline-flex items-center gap-1">
                <span>TÊN BÀI HÁT</span>
                {sortField === 'title' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                ) : (
                  <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </th>

            {/* Cột ALBUM */}
            <th 
              onClick={() => handleSort('album')} 
              className="pb-3 font-medium cursor-pointer group hover:text-white transition"
              title="Sắp xếp theo Album"
            >
              <div className="inline-flex items-center gap-1">
                <span>ALBUM</span>
                {sortField === 'album' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                ) : (
                  <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </th>

            {/* Cột ĐỊNH DẠNG */}
            <th 
              onClick={() => handleSort('isCloud')} 
              className="pb-3 font-medium cursor-pointer group hover:text-white transition"
              title="Sắp xếp theo định dạng"
            >
              <div className="inline-flex items-center gap-1">
                <span>ĐỊNH DẠNG</span>
                {sortField === 'isCloud' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                ) : (
                  <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </th>

            {/* Cột THỜI GIAN */}
            <th 
              onClick={() => handleSort('duration')} 
              className="pb-3 font-medium text-right pr-4 cursor-pointer group hover:text-white transition"
              title="Sắp xếp theo thời lượng"
            >
              <div className="inline-flex items-center gap-1 justify-end">
                <span>THỜI GIAN</span>
                {sortField === 'duration' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                ) : (
                  <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </th>
            <th className="pb-3 font-medium text-center">THAO TÁC</th>
          </tr>
        </thead>
        <tbody>
          {/* 2. Đổi tracks.map thành sortedTracks.map */}
          {sortedTracks.map((track, index) => {
            const isThisTrackPlaying = currentTrack?.id === track.id
            return (
              <tr key={track.id} onClick={() => handleRowClick(track)} className={`group border-b border-zinc-800/20 transition-colors cursor-pointer ${isThisTrackPlaying ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <td className="py-4 text-center text-zinc-500 group-hover:text-white">
                  {isThisTrackPlaying && isPlaying ? <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse mx-auto" /> : index + 1}
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-zinc-800 rounded-md overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                      {track.coverArt ? (
                        <img src={track.coverArt} className="w-full h-full object-cover" />
                      ) : (
                        <img src={thumbnailHolder} className="w-3/4 h-3/4 object-contain" />
                      )}
                      {track.isCloud && (
                        <div className="absolute top-0 right-0 bg-emerald-500/80 p-0.5 rounded-bl-md">
                          <Cloud size={10} className="text-white" />
                        </div>
                      )}
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

  return (
    <div className="flex flex-col h-screen text-zinc-200 font-sans overflow-hidden relative transition-colors duration-1000" style={{ backgroundColor: themeColor }}>
      {/* Lớp nền gradient đè lên màu chủ đạo để làm tối */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />
      <audio
        ref={audioRef}
        src={currentTrack ? (currentTrack.filePath?.startsWith('http') || currentTrack.filePath?.startsWith('file://') ? currentTrack.filePath : `file://${currentTrack.filePath}`) : undefined}
        onEnded={() => { if (!crossfadeEnabled) handleNext() }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* MODAL CLOUD ACTION */}
      {cloudActionTrack && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{cloudActionTrack.title}</h3>
            <p className="text-zinc-400 text-sm mb-6">Đây là file lưu trên Cloud. Bạn muốn phát trực tiếp hay tải về máy để nghe Offline?</p>
            <div className="space-y-3">
              <button 
                onClick={() => handleCloudAction('stream')}
                className="w-full flex items-center justify-center gap-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 py-3 rounded-lg font-medium transition"
              >
                <Wifi size={18} /> Phát trực tiếp (Stream)
              </button>
              <button 
                onClick={() => handleCloudAction('download')}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-3 bg-zinc-800 text-white hover:bg-zinc-700 py-3 rounded-lg font-medium transition disabled:opacity-50"
              >
                {isDownloading ? <span className="animate-pulse">Đang tải...</span> : <><Download size={18} /> Lưu về máy (Download)</>}
              </button>
              <button onClick={() => setCloudActionTrack(null)} className="w-full text-zinc-500 hover:text-white py-2 mt-2 text-sm transition">Huỷ bỏ</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAG EDITOR */}
      {editingTrack && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[600px] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Chỉnh sửa thông tin bài hát</h2>
            <div className="flex gap-6">
              <div className="w-1/3 flex flex-col gap-3 items-center">
                <div className="w-32 h-32 bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
                  {editImagePath ? <img src={`file://${editImagePath}`} className="w-full h-full object-cover" /> : 
                   editingTrack.coverArt ? <img src={editingTrack.coverArt} className="w-full h-full object-cover" /> : <ImageIcon size={40} className="text-zinc-600"/>}
                </div>
                <button onClick={handleSelectTagImage} className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-md">Đổi ảnh bìa</button>
              </div>
              <div className="w-2/3 space-y-4">
                <div><label className="text-xs text-zinc-400">Tên bài hát</label><input type="text" value={editTags.title} onChange={e => setEditTags({...editTags, title: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
                <div><label className="text-xs text-zinc-400">Ca sĩ</label><input type="text" value={editTags.artist} onChange={e => setEditTags({...editTags, artist: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
                <div><label className="text-xs text-zinc-400">Album</label><input type="text" value={editTags.album} onChange={e => setEditTags({...editTags, album: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" /></div>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs text-zinc-400">Lời bài hát (LRC Format)</label>
              <textarea value={editTags.lyrics} onChange={e => setEditTags({...editTags, lyrics: e.target.value})} className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white font-mono" placeholder="[00:00.00] Lyrics..." />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingTrack(null)} className="px-4 py-2 text-zinc-400 hover:text-white">Hủy</button>
              <button onClick={saveTags} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {playlistRename.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[400px] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Đổi tên Playlist</h2>
            <input 
              type="text" 
              value={playlistRename.newName} 
              onChange={e => setPlaylistRename({...playlistRename, newName: e.target.value})} 
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-white mb-6 focus:outline-none focus:border-emerald-500" 
              placeholder="Nhập tên mới..." 
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setPlaylistRename({ isOpen: false, oldName: '', newName: '' })} className="px-4 py-2 text-zinc-400 hover:text-white transition">Hủy</button>
              <button onClick={handleRenameSubmit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition">Lưu tên mới</button>
            </div>
          </div>
        </div>
      )}

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
                  <li onClick={() => setActiveView('songs')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'songs' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    <Library size={18} /> Danh sách bài hát
                  </li>
                  <li onClick={() => { setActiveView('playlists'); setActivePlaylist(null) }} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'playlists' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    <ListMusic size={18} /> Playlist của tôi
                  </li>
                </ul>
              </div>
              
              {/* ĐÃ KHÔI PHỤC: Nút Google Drive trong Sidebar */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Liên kết cloud</p>
                <ul className="space-y-2">
                  <li onClick={() => setActiveView('drive')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'drive' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-white'}`}>
                    <Cloud size={18} /> Google Drive
                  </li>
                </ul>
              </div>

            </nav>
          </div>
          <div className="p-6">
            <div onClick={() => setActiveView('settings')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'settings' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
              <Settings size={18} /> Cài đặt
            </div>
          </div>
        </aside>

        {/* NỘI DUNG CHÍNH (ĐỔI THEO TAB) */}
        <main className={`flex-1 flex flex-col bg-transparent overflow-hidden ${isLyricsMaximized ? 'hidden' : ''}`}>
          
          {/* HEADER LUÔN NẰM TRÊN CÙNG */}
          <header className="h-20 px-8 flex items-center justify-between border-b border-zinc-800/50 flex-shrink-0 w-full">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input type="text" placeholder="Tìm kiếm..." className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
          </header>

          {/* KHU VỰC BÊN DƯỚI HEADER (CHIA ĐÔI MÀN HÌNH) */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* CỘT TRÁI: DANH SÁCH BÀI HÁT / PLAYLIST (Sát với thanh Sidebar) */}
            <div className="flex-1 flex flex-col overflow-y-auto p-8 relative">
              {/* VIEW: BÀI HÁT */}
              {activeView === 'songs' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-white">Danh sách bài hát</h2>
                    <span className="text-zinc-500 text-sm">{libraryTracks.length} bài hát gốc</span>
                  </div>
                  {libraryPath ? renderTrackTable(libraryTracks) : <p className="text-zinc-500">Vui lòng vào Cài đặt để chọn Thư mục nhạc.</p>}
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
                  
                  {/* Thanh công cụ / Toolbar */}
                  <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl mb-6 shadow-lg">
                    <h3 className="text-emerald-400 font-semibold mb-2">Nhập liên kết thư mục</h3>
                    <p className="text-sm text-zinc-400 mb-4">Dán liên kết thư mục Drive chứa nhạc của bạn (Yêu cầu bật chế độ "Bất kỳ ai có liên kết").</p>
                    <div className="flex gap-3 items-center">
                      <div className="relative flex-1">
                        <Link size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input 
                          type="text" 
                          value={driveLink}
                          onChange={(e) => setDriveLink(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/..." 
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <button 
                        onClick={handleDriveSubmit} 
                        disabled={!driveLink || isFetchingDrive}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                      >
                        {isFetchingDrive ? <span className="animate-pulse">Đang quét...</span> : 'Quét dữ liệu'}
                      </button>
                    </div>
                  </div>

                  {/* Kết quả / Danh sách file đã tìm thấy */}
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
                            <button 
                              onClick={handleDriveStream}
                              className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-4 py-2 rounded-lg text-sm font-medium transition"
                            >
                              <Wifi size={16} /> Stream tất cả
                            </button>
                            <button 
                              onClick={handleDriveDownload}
                              disabled={isDownloading}
                              className="flex items-center gap-2 bg-zinc-800 text-white hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                            >
                              {isDownloading ? <span className="animate-pulse">Đang xử lý...</span> : <><Download size={16} /> Tải về Thư viện (Lossless)</>}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 overflow-y-auto pr-2">
                          {driveFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-4 p-3 bg-zinc-900/40 hover:bg-zinc-800/80 rounded-lg border border-zinc-800/50 transition">
                              <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center flex-shrink-0 text-emerald-500">
                                <ListMusic size={18} />
                              </div>
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
                    
                    {/* --- KHU VỰC 1: THƯ MỤC GỐC --- */}
                    <div>
                      <h3 className="text-emerald-400 font-semibold mb-2">Thư mục gốc (Thư viện)</h3>
                      <p className="text-sm text-zinc-400 mb-4">Chọn thư mục chứa nhạc. Ứng dụng sẽ tự động quét bài hát...</p>
                      <div className="flex gap-3 items-center">
                        <input type="text" readOnly value={libraryPath || 'Chưa thiết lập'} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-300" />
                        <button onClick={handleSelectLibrary} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Thay đổi</button>
                      </div>
                    </div>

                    {/* --- KHU VỰC 2: CROSSFADE --- */}
                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Crossfade (Chuyển bài mượt mà)</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 text-sm">Bật hiệu ứng Crossfade</span>
                        <input type="checkbox" checked={crossfadeEnabled} onChange={e => setCrossfadeEnabled(e.target.checked)} className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                      </div>
                      {crossfadeEnabled && (
                        <div className="mt-4 flex items-center gap-4">
                          <span className="text-zinc-400 text-sm">Thời gian làm mờ:</span>
                          <input type="number" min="1" max="10" value={crossfadeDuration} onChange={e => setCrossfadeDuration(Number(e.target.value))} className="w-16 bg-zinc-950 border border-zinc-700 rounded p-1 text-center text-white" />
                          <span className="text-zinc-400 text-sm">giây</span>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* VIEW: PLAYLISTS */}
              {activeView === 'playlists' && !activePlaylist && (
                <>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-bold text-white">Playlist của tôi</h2>
                    <button onClick={handleAutoGeneratePlaylists} className="flex items-center gap-2 bg-zinc-800 hover:bg-emerald-600/20 hover:text-emerald-400 border border-zinc-700 hover:border-emerald-500/50 px-4 py-2 rounded-lg text-sm font-medium transition">
                      <Sparkles size={16} /> Tự động phân loại Album
                    </button>
                  </div>
                  
                  {playlists.length === 0 ? (
                    <p className="text-zinc-500">Chưa có danh sách phát nào. Hãy tạo các thư mục con trong Thư viện gốc.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-6">
                    {playlists.map(pl => (
                      <div key={pl.name} className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50 hover:bg-zinc-800/50 transition group cursor-pointer" onClick={() => setActivePlaylist(pl)}>
                        <div className="aspect-square bg-zinc-800 rounded-lg mb-4 overflow-hidden relative">
                          {pl.thumbnail ? <img src={pl.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={40} /></div>}
                          
                          {/* Nút 1: Đổi ảnh từ máy tính (Mặc định cũ) */}
                          <button onClick={(e) => { e.stopPropagation(); handleChangePlaylistImage(pl.name) }} className="absolute bottom-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-emerald-500 transition" title="Chọn ảnh từ máy tính"><ImageIcon size={16}/></button>
                          
                          {/* Nút 2: Tự động lấy ảnh từ bài hát đầu tiên */}
                          <button onClick={(e) => { e.stopPropagation(); handleExtractPlaylistImage(pl.name) }} className="absolute bottom-2 right-10 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-emerald-500 transition" title="Tự động tạo ảnh"><Sparkles size={16}/></button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-white truncate max-w-[140px]">{pl.name}</h3>
                            <p className="text-xs text-zinc-500">{pl.tracks.length} bài hát</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleRenamePlaylist(pl.name) }} className="text-zinc-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition p-1"><Edit2 size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </>
              )}

              {/* VIEW: CHI TIẾT PLAYLIST */}
              {activeView === 'playlists' && activePlaylist && (
                <>
                  <div className="flex items-end gap-6 mb-8">
                    <div className="w-40 h-40 bg-zinc-800 rounded-xl overflow-hidden shadow-2xl relative group">
                      {activePlaylist.thumbnail ? <img src={activePlaylist.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600"><FolderPlus size={48} /></div>}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-2">Playlist</p>
                      <h2 className="text-5xl font-extrabold text-white mb-4">{activePlaylist.name}</h2>
                      <p className="text-zinc-400">{activePlaylist.tracks.length} bài hát</p>
                    </div>
                  </div>
                  {renderTrackTable(activePlaylist.tracks)}
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

      {/* PLAYER BAR */}
      <footer className="h-24 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-6 z-20 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        {showEQ && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
              
              {/* Header Modal */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
                <div className="flex items-center gap-2">
                  <Sliders className="text-emerald-500" size={22} />
                  <h2 className="text-lg font-bold text-white">Equalizer (EQ)</h2>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddBand}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"
                  >
                    <Plus size={16} /> Thêm dải tần
                  </button>
                  
                  <button
                    onClick={handleResetEQ}
                    className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>

                  <button
                    onClick={() => setShowEQ(false)}
                    className="text-zinc-400 hover:text-white px-2 text-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Nội dung danh sách các dải EQ */}
              <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                {eqBands.length === 0 ? (
                  <p className="text-center text-zinc-500 py-8">Chưa có dải tần nào. Hãy bấm "Thêm dải tần".</p>
                ) : (
                  eqBands
                    .sort((a, b) => a.frequency - b.frequency)
                    .map((band) => (
                      <div
                        key={band.id}
                        className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex flex-wrap items-center gap-4 text-xs"
                      >
                        {/* 1. Nhập tần số (Hz) */}
                        <div className="flex flex-col gap-1 w-28">
                          <label className="text-zinc-400 font-mono">Tần số (Hz)</label>
                          <input
                            type="number"
                            min="20"
                            max="20000"
                            value={band.frequency}
                            onChange={(e) =>
                              handleUpdateBand(band.id, 'frequency', Math.max(20, Math.min(20000, Number(e.target.value))))
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* 2. Chọn loại bộ lọc Filter Type */}
                        <div className="flex flex-col gap-1 w-32">
                          <label className="text-zinc-400">Loại bộ lọc</label>
                          <select
                            value={band.type}
                            onChange={(e) =>
                              handleUpdateBand(band.id, 'type', e.target.value as BiquadFilterType)
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="peaking">Peaking</option>
                            <option value="lowshelf">Low Shelf</option>
                            <option value="highshelf">High Shelf</option>
                            <option value="lowpass">Low Pass</option>
                            <option value="highpass">High Pass</option>
                          </select>
                        </div>

                        {/* 3. Thanh trượt Gain (dB) */}
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                          <div className="flex justify-between text-zinc-400">
                            <span>Mức khuếch đại (Gain)</span>
                            <span className="font-mono text-emerald-400">{band.gain > 0 ? `+${band.gain}` : band.gain} dB</span>
                          </div>
                          <input
                            type="range"
                            min="-20"
                            max="20"
                            step="0.5"
                            value={band.gain}
                            onChange={(e) => handleUpdateBand(band.id, 'gain', Number(e.target.value))}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                          />
                        </div>

                        {/* 4. Nút Xóa dải EQ */}
                        <button
                          onClick={() => handleDeleteBand(band.id)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition mt-3"
                          title="Xóa dải EQ"
                        >
                          <Trash2 size={16} />
                        </button>
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
            
            {/* MỚI: Khôi phục lại thẻ hiển thị Lossless, Format, SampleRate và Bitrate */}
            {currentTrack && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  {currentTrack.lossless ? 'Lossless' : (currentTrack.format || 'MP3')}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {currentTrack.sampleRate ? `${currentTrack.sampleRate / 1000}kHz` : ''} 
                  {currentTrack.bitrate ? ` | ${Math.round(currentTrack.bitrate / 1000)} kbps` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 max-w-md">
          <div className="flex items-center gap-6 mb-2">
            <button onClick={toggleShuffle} className={`transition ${isShuffle ? 'text-emerald-500' : 'text-zinc-400 hover:text-white'}`}><Shuffle size={18} /></button>
            <button onClick={handlePrev} className="text-zinc-400 hover:text-white transition"><SkipBack size={20} /></button>
            <button onClick={() => { if(currentTrack) setIsPlaying(!isPlaying) }} className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${currentTrack ? 'bg-white text-black hover:scale-105' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}>
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
            </button>
            <button onClick={handleNext} className="text-zinc-400 hover:text-white transition"><SkipForward size={20} /></button>
            <button onClick={toggleRepeat} className={`transition ${repeatMode > 0 ? 'text-emerald-500' : 'text-zinc-400 hover:text-white'}`}>{repeatMode === 2 ? <Repeat1 size={18} /> : <Repeat size={18} />}</button>
          </div>
          <div className="w-full flex items-center gap-3 text-[11px] text-zinc-400 font-medium">
            <span>{formatDuration(currentTime)}</span>
            <input type="range" min={0} max={currentTrack?.duration || 100} value={currentTime} onChange={handleSeek} disabled={!currentTrack} className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400" />
            <span>{currentTrack ? formatDuration(currentTrack.duration) : '0:00'}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 w-1/3 text-zinc-400">
          {/* Nút bật/tắt Lời bài hát */}
          {/* Nút bật/tắt Lời bài hát */}
          <button 
            onClick={() => setShowLyricsPanel(!showLyricsPanel)} 
            className={`transition ${showLyricsPanel ? 'text-emerald-500' : 'hover:text-white'}`}
            title="Lời bài hát"
          >
            <Mic2 size={18} />
          </button>

          {/* Nút Equalizer */}
          <button onClick={() => setShowEQ(!showEQ)} className={`transition ${showEQ ? 'text-emerald-500' : 'hover:text-white'}`} title="Bộ chỉnh âm (Equalizer)">
            <Sliders size={18} />
          </button>

          {/* Thanh Volume */}
          <div className="flex items-center gap-2 w-32">
            <button onClick={toggleMute} className="hover:text-white transition">
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
            />
          </div>
        </div>
      </footer>
    </div>
  )
}