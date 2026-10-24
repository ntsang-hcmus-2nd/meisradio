import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Volume1,
  Sliders,
  Radio,
  Activity,
  BarChart3,
  Download,
  Settings,
  Music,
  Home,
  Disc,
  Clock,
  ShieldCheck,
  Mic2,
  ListPlus,
  Layers,
  FolderDown,
  Cloud,
  X,
  Plus,
  Compass,
  Palette,
  RotateCcw,
  FolderSearch,
  Sparkles,
  LayoutGrid,
  Table,
  AlignJustify,
  Cpu,
  Feather,
  Monitor,
  Sun,
  Moon
} from 'lucide-react'
import { useTranslation } from '../../locales'
import { useUIStore } from '../../stores/uiStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAudioStore } from '../../stores/audioStore'
import { useSoulseekStore } from '../../stores/soulseekStore'
import { AnimatePresence, motion } from 'motion/react'
import { dialogScale, overlayFade, useMotionReduced } from '../motion'
import { removeAccents } from '../../utils/textUtils'
import { DynamicCoverArt } from '../DynamicCoverArt'

export interface TrackItem {
  id?: string
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  genre?: string
  duration?: number
  coverArt?: string
  filePath?: string
  format?: string
  isOnline?: boolean
  isCloud?: boolean
  isDsd?: boolean
  bitsPerSample?: number
  sampleRate?: number
  [key: string]: unknown
}

interface ElectronAPI {
  setBitPerfect?: (
    enabled: boolean,
    currentVol?: number,
    outputType?: 'wasapi' | 'asio'
  ) => Promise<unknown>
  saveConfig?: (cfg: Record<string, unknown>) => Promise<unknown>
  soulseekSearch?: (query: string, timeout?: number) => Promise<unknown>
  searchOnline?: (query: string) => Promise<any>
  searchScOnline?: (query: string) => Promise<any>
  toggleMiniPlayer?: (isMini: boolean) => Promise<unknown>
}

const getElectronApi = (): ElectronAPI | undefined => {
  return typeof window !== 'undefined'
    ? (window as unknown as { api?: ElectronAPI }).api
    : undefined
}

export interface CommandPaletteModalProps {
  onPlayTrack: (track: TrackItem) => void
  onStartRadio: (seedTrack?: TrackItem) => void
  onTogglePlay?: () => void
  onNext?: () => void
  onPrev?: () => void
  onToggleShuffle?: () => void
  onToggleRepeat?: () => void
  onVolumeUp?: () => void
  onVolumeDown?: () => void
  onToggleMute?: () => void
  onSeekForward?: () => void
  onSeekBackward?: () => void
  onReloadLibrary?: () => void
  onAddLibraryFolder?: () => void
  onNavigateToArtist?: (artistName: string) => void
  onToggleBitPerfect?: () => void | Promise<void>
  onToggleMiniPlayer?: () => void
}

type TabCategory = 'all' | 'tracks' | 'artists' | 'albums' | 'playlists' | 'commands'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  category:
    | 'action'
    | 'navigation'
    | 'playback'
    | 'track'
    | 'artist'
    | 'album'
    | 'playlist'
    | 'online'
    | 'recent'
  badge?: string
  formatBadge?: string
  data?: TrackItem
  action: () => void
  secondaryAction?: () => void
  secondaryActionLabel?: string
}

const PRESET_COLORS = [
  { name: 'Emerald', color: '#10b981' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Orange', color: '#f97316' }
]

const formatDuration = (sec?: number): string => {
  if (!sec || isNaN(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

const getTrackBadge = (t: TrackItem): string | null => {
  if (t.isOnline) return 'ONLINE'
  const ext = (t.filePath || '').split('.').pop()?.toUpperCase()
  if (t.isDsd || ext === 'DSF' || ext === 'DFF') {
    return 'DSD'
  }
  if (t.bitsPerSample && t.bitsPerSample >= 24) {
    return `${ext || 'FLAC'} ${t.bitsPerSample}-BIT`
  }
  if (ext) return ext
  return null
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  onPlayTrack,
  onStartRadio,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onToggleRepeat,
  onVolumeUp,
  onVolumeDown,
  onToggleMute,
  onSeekForward,
  onSeekBackward,
  onReloadLibrary,
  onAddLibraryFolder,
  onNavigateToArtist,
  onToggleBitPerfect,
  onToggleMiniPlayer
}) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabCategory>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // UI Store
  const show = useUIStore((s) => s.showCommandPalette)
  const setShow = useUIStore((s) => s.setShowCommandPalette)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const setShowEQ = useUIStore((s) => s.setShowEQ)
  const setShowSpectrogram = useUIStore((s) => s.setShowSpectrogramModal)
  const setIsMiniPlayer = useUIStore((s) => s.setIsMiniPlayer)
  const setShowInsights = useUIStore((s) => s.setShowInsightsModal)
  const setShowBackup = useUIStore((s) => s.setShowBackupModal)
  const setShowLyricsPanel = useUIStore((s) => s.setShowLyricsPanel)
  const showLyricsPanel = useUIStore((s) => s.showLyricsPanel)
  const setIsLyricsMaximized = useUIStore((s) => s.setIsLyricsMaximized)
  const isLyricsMaximized = useUIStore((s) => s.isLyricsMaximized)
  const showToast = useUIStore((s) => s.showToast)

  // Player Store
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const volume = usePlayerStore((s) => s.volume)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const setBitPerfectEnabled = usePlayerStore((s) => s.setBitPerfectEnabled)
  const setSleepTimerMode = usePlayerStore((s) => s.setSleepTimerMode)
  const setPlayQueue = usePlayerStore((s) => s.setPlayQueue)

  // Settings Store
  const loudnessNormalization = useSettingsStore((s) => s.loudnessNormalization)
  const setLoudnessNormalization = useSettingsStore((s) => s.setLoudnessNormalization)
  const setUiStyle = useSettingsStore((s) => s.setUiStyle)
  const setAppMode = useSettingsStore((s) => s.setAppMode)
  const setAccentColorMode = useSettingsStore((s) => s.setAccentColorMode)
  const setCustomAccentColor = useSettingsStore((s) => s.setCustomAccentColor)
  const setColorScheme = useSettingsStore((s) => s.setColorScheme)
  const streamPort = useSettingsStore((s) => s.streamPort)

  // Library Store
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const playlists = useLibraryStore((s) => s.playlists)
  const userPlaylists = useLibraryStore((s) => s.userPlaylists)
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed)
  const preAggregatedData = useLibraryStore((s) => s.preAggregatedData)
  const setActivePlaylist = useLibraryStore((s) => s.setActivePlaylist)
  const setActiveUserPlaylist = useLibraryStore((s) => s.setActiveUserPlaylist)
  const setActiveArtist = useLibraryStore((s) => s.setActiveArtist)
  const setActiveAlbum = useLibraryStore((s) => s.setActiveAlbum)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)
  const setSearchInput = useLibraryStore((s) => s.setSearchInput)
  const setDashboardData = useLibraryStore((s) => s.setDashboardData)
  const setScDashboardData = useLibraryStore((s) => s.setScDashboardData)

  // Audio Store (fallback cho Bit-Perfect khi không có onToggleBitPerfect)
  const bitPerfectType = useAudioStore((s) => s.bitPerfectType)

  // Soulseek Store
  const setSlskSearchQuery = useSoulseekStore((s) => s.setSearchQuery)
  const setSlskIsSearching = useSoulseekStore((s) => s.setIsSearching)
  const setSlskSearchResults = useSoulseekStore((s) => s.setSearchResults)
  const setSlskSearchError = useSoulseekStore((s) => s.setSearchError)
  const reduceMotion = useMotionReduced()

  // Focus input and reset state on open
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        setQuery('')
        setActiveTab('all')
        setSelectedIndex(0)
        inputRef.current?.focus()
      }, 10)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [show])

  // Extract memoized unique artists list
  const allArtists = useMemo(() => {
    if (preAggregatedData?.artistsList && preAggregatedData.artistsList.length > 0) {
      return preAggregatedData.artistsList
    }
    const map = new Map<string, { name: string; trackCount: number; coverArt?: string }>()
    for (const track of libraryTracks) {
      const arts =
        Array.isArray(track.artists) && track.artists.length > 0
          ? track.artists
          : [track.artist || '']
      for (const rawArt of arts) {
        const art = (rawArt || '').trim()
        if (!art) continue
        const existing = map.get(art.toLowerCase())
        if (existing) {
          existing.trackCount++
          if (!existing.coverArt && track.coverArt) existing.coverArt = track.coverArt
        } else {
          map.set(art.toLowerCase(), {
            name: art,
            trackCount: 1,
            coverArt: track.coverArt
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.trackCount - a.trackCount)
  }, [preAggregatedData, libraryTracks])

  // Extract memoized albums list
  const allAlbums = useMemo(() => {
    const map = new Map<
      string,
      { title: string; artist: string; trackCount: number; coverArt?: string; tracks: TrackItem[] }
    >()
    for (const track of libraryTracks) {
      const albumTitle = (track.album || '').trim()
      if (!albumTitle) continue
      const key = `${albumTitle.toLowerCase()}___${(track.artist || '').toLowerCase()}`
      const existing = map.get(key)
      if (existing) {
        existing.trackCount++
        existing.tracks.push(track)
        if (!existing.coverArt && track.coverArt) existing.coverArt = track.coverArt
      } else {
        map.set(key, {
          title: albumTitle,
          artist: track.artist || '',
          trackCount: 1,
          coverArt: track.coverArt,
          tracks: [track]
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.trackCount - a.trackCount)
  }, [libraryTracks])

  // Add track to queue helper
  const handleAddToQueue = useCallback(
    (track: TrackItem): void => {
      setPlayQueue((prev) => [...prev, track])
      showToast(t('spotlight.addedToQueue', { title: track.title || 'bài hát' }), 'success')
    },
    [setPlayQueue, showToast, t]
  )

  // Navigate to Artist helper
  const handleGoToArtist = useCallback(
    (artistName: string): void => {
      if (onNavigateToArtist) {
        onNavigateToArtist(artistName)
      } else {
        const found = allArtists.find((a) => a.name.toLowerCase() === artistName.toLowerCase())
        if (found) {
          setActiveArtist(found)
        } else {
          setActiveArtist({ name: artistName, tracks: [], trackCount: 0 })
        }
        setActiveView('artists')
      }
      setShow(false)
    },
    [onNavigateToArtist, allArtists, setActiveArtist, setActiveView, setShow]
  )

  // Navigate to Album helper
  const handleGoToAlbum = useCallback(
    (album: { title: string; tracks: TrackItem[] }): void => {
      setActiveView('songs')
      setSearchQuery(album.title)
      setSearchInput(album.title)
      setActiveAlbum(album)
      setShow(false)
    },
    [setActiveView, setSearchQuery, setSearchInput, setActiveAlbum, setShow]
  )

  // Accent Color Picker handler
  const handleSetAccentColor = useCallback(
    (colorHex: string): void => {
      setAccentColorMode('custom')
      setCustomAccentColor(colorHex)
      try {
        localStorage.setItem('meis_accent_color_mode', 'custom')
        localStorage.setItem('meis_custom_accent_color', colorHex)
        const api = getElectronApi()
        if (api?.saveConfig) {
          void api.saveConfig({ accentColorMode: 'custom', customAccentColor: colorHex })
        }
      } catch {
        // Ignore persistence error
      }
      showToast(t('spotlight.cmdAccentColor', { color: colorHex }), 'success')
      setShow(false)
    },
    [setAccentColorMode, setCustomAccentColor, showToast, setShow, t]
  )

  // Built-in commands list
  const builtInCommands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // PLAYBACK COMMANDS
      {
        id: 'cmd-smart-radio',
        title: t('spotlight.cmdSmartRadio'),
        subtitle: currentTrack
          ? `${t('common.tracks')}: "${currentTrack.title}"`
          : t('spotlight.cmdSmartRadioDesc'),
        icon: <Radio size={16} className="text-emerald-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          onStartRadio()
          setShow(false)
        }
      },
      {
        id: 'cmd-play-pause',
        title: isPlaying ? t('spotlight.cmdPause') : t('spotlight.cmdPlay'),
        subtitle: isPlaying
          ? currentTrack
            ? `${currentTrack.title} • ${currentTrack.artist || ''}`
            : ''
          : '',
        icon: isPlaying ? (
          <Pause size={16} className="text-amber-400" />
        ) : (
          <Play size={16} className="text-emerald-400" />
        ),
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onTogglePlay) onTogglePlay()
          else setIsPlaying(!isPlaying)
          setShow(false)
        }
      },
      {
        id: 'cmd-next-track',
        title: t('spotlight.cmdNext'),
        icon: <SkipForward size={16} className="text-emerald-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onNext) onNext()
          setShow(false)
        }
      },
      {
        id: 'cmd-prev-track',
        title: t('spotlight.cmdPrev'),
        icon: <SkipBack size={16} className="text-emerald-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onPrev) onPrev()
          setShow(false)
        }
      },
      {
        id: 'cmd-toggle-shuffle',
        title: isShuffle ? t('spotlight.cmdShuffleOff') : t('spotlight.cmdShuffleOn'),
        icon: <Shuffle size={16} className={isShuffle ? 'text-emerald-400' : 'text-zinc-400'} />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onToggleShuffle) onToggleShuffle()
          setShow(false)
        }
      },
      {
        id: 'cmd-cycle-repeat',
        title:
          repeatMode === 0
            ? t('spotlight.cmdRepeatAll')
            : repeatMode === 1
              ? t('spotlight.cmdRepeatOne')
              : t('spotlight.cmdRepeatOff'),
        icon: (
          <Repeat size={16} className={repeatMode > 0 ? 'text-emerald-400' : 'text-zinc-400'} />
        ),
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onToggleRepeat) onToggleRepeat()
          setShow(false)
        }
      },
      {
        id: 'cmd-vol-up',
        title: t('spotlight.cmdVolumeUp'),
        icon: <Volume2 size={16} className="text-sky-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onVolumeUp) onVolumeUp()
          setShow(false)
        }
      },
      {
        id: 'cmd-vol-down',
        title: t('spotlight.cmdVolumeDown'),
        icon: <Volume1 size={16} className="text-sky-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onVolumeDown) onVolumeDown()
          setShow(false)
        }
      },
      {
        id: 'cmd-toggle-mute',
        title: t('spotlight.cmdMute'),
        icon: <VolumeX size={16} className="text-rose-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onToggleMute) onToggleMute()
          setShow(false)
        }
      },
      {
        id: 'cmd-seek-fwd',
        title: t('spotlight.cmdSeekForward'),
        icon: <SkipForward size={16} className="text-blue-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onSeekForward) onSeekForward()
          setShow(false)
        }
      },
      {
        id: 'cmd-seek-bwd',
        title: t('spotlight.cmdSeekBackward'),
        icon: <SkipBack size={16} className="text-blue-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onSeekBackward) onSeekBackward()
          setShow(false)
        }
      },
      {
        id: 'cmd-clear-queue',
        title: t('spotlight.cmdClearQueue'),
        icon: <X size={16} className="text-rose-400" />,
        category: 'playback',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setPlayQueue([])
          showToast(t('player.queueCleared'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-toggle-lyrics',
        title: t('spotlight.cmdToggleLyrics'),
        icon: <Mic2 size={16} className="text-pink-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShowLyricsPanel(!showLyricsPanel)
          setShow(false)
        }
      },
      {
        id: 'cmd-toggle-vinyl',
        title: t('spotlight.cmdToggleVinyl'),
        icon: <Disc size={16} className="text-indigo-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (!isLyricsMaximized) {
            setShowLyricsPanel(true)
            setIsLyricsMaximized(true)
          } else {
            setIsLyricsMaximized(false)
          }
          setShow(false)
        }
      },

      // AUDIO & DSP COMMANDS
      {
        id: 'cmd-bitperfect-toggle',
        title: bitPerfectEnabled ? t('spotlight.cmdBitPerfectOff') : t('spotlight.cmdBitPerfectOn'),
        subtitle: t('spotlight.cmdBitPerfectDesc'),
        icon: <ShieldCheck size={16} className="text-purple-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: async () => {
          setShow(false)
          if (onToggleBitPerfect) {
            await onToggleBitPerfect()
            return
          }
          // Fallback: đồng bộ volume + output type như SettingsView
          const nextVal = !bitPerfectEnabled
          try {
            const api = getElectronApi()
            if (api?.setBitPerfect) {
              await api.setBitPerfect(nextVal, volume, bitPerfectType)
            }
          } catch {
            // Ignore hardware lock toggle error
          }
          setBitPerfectEnabled(nextVal)
        }
      },
      {
        id: 'cmd-loudness-toggle',
        title: loudnessNormalization ? t('spotlight.cmdLoudnessOff') : t('spotlight.cmdLoudnessOn'),
        subtitle: t('spotlight.cmdLoudnessDesc'),
        icon: <Volume2 size={16} className="text-teal-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setLoudnessNormalization(!loudnessNormalization)
          setShow(false)
        }
      },
      {
        id: 'cmd-eq',
        title: t('spotlight.cmdEQ'),
        subtitle: t('spotlight.cmdEQDesc'),
        icon: <Sliders size={16} className="text-blue-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShow(false)
          setShowEQ(true)
        }
      },
      {
        id: 'cmd-spectrogram',
        title: t('spotlight.cmdSpectrogram'),
        subtitle: t('spotlight.cmdSpectrogramDesc'),
        icon: <Activity size={16} className="text-cyan-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShow(false)
          setShowSpectrogram(true)
        }
      },

      // SLEEP TIMERS
      {
        id: 'cmd-timer-15',
        title: t('spotlight.cmdSleepTimer15'),
        icon: <Clock size={16} className="text-orange-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('15')
          showToast(t('spotlight.cmdSleepTimer15'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-timer-30',
        title: t('spotlight.cmdSleepTimer30'),
        icon: <Clock size={16} className="text-orange-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('30')
          showToast(t('spotlight.cmdSleepTimer30'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-timer-45',
        title: t('spotlight.cmdSleepTimer45'),
        icon: <Clock size={16} className="text-orange-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('45')
          showToast(t('spotlight.cmdSleepTimer45'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-timer-60',
        title: t('spotlight.cmdSleepTimer60'),
        icon: <Clock size={16} className="text-orange-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('60')
          showToast(t('spotlight.cmdSleepTimer60'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-timer-end',
        title: t('spotlight.cmdSleepTimerEnd'),
        icon: <Clock size={16} className="text-amber-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('end_of_track')
          showToast(t('spotlight.cmdSleepTimerEnd'), 'info')
          setShow(false)
        }
      },
      {
        id: 'cmd-timer-off',
        title: t('spotlight.cmdSleepTimerCancel'),
        icon: <Clock size={16} className="text-zinc-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setSleepTimerMode('off')
          showToast(t('spotlight.cmdSleepTimerCancel'), 'info')
          setShow(false)
        }
      },

      // INSIGHTS & BACKUP
      {
        id: 'cmd-insights',
        title: t('spotlight.cmdInsights'),
        subtitle: t('spotlight.cmdInsightsDesc'),
        icon: <BarChart3 size={16} className="text-violet-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShow(false)
          setShowInsights(true)
        }
      },
      {
        id: 'cmd-backup',
        title: t('spotlight.cmdBackup'),
        subtitle: t('spotlight.cmdBackupDesc'),
        icon: <Download size={16} className="text-cyan-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShow(false)
          setShowBackup(true)
        }
      },
      {
        id: 'cmd-mini-player',
        title: t('spotlight.cmdMiniPlayer'),
        subtitle: t('spotlight.cmdMiniPlayerDesc'),
        icon: <Monitor size={16} className="text-rose-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setShow(false)
          if (onToggleMiniPlayer) {
            onToggleMiniPlayer()
            return
          }
          // Fallback: thu nhỏ cửa sổ Electron như handleToggleMiniPlayer trong App
          setIsLyricsMaximized(false)
          setIsMiniPlayer(true)
          const api = getElectronApi() as unknown as {
            toggleMiniPlayer?: (isMini: boolean) => Promise<unknown>
          }
          void api?.toggleMiniPlayer?.(true)
        }
      },

      // NAVIGATION COMMANDS
      {
        id: 'nav-home',
        title: t('spotlight.cmdNavHome'),
        icon: <Home size={16} className="text-emerald-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('home')
          setShow(false)
        }
      },
      {
        id: 'nav-ytm',
        title: t('spotlight.cmdNavYtm'),
        icon: <Compass size={16} className="text-red-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('home-ytm')
          setShow(false)
        }
      },
      {
        id: 'nav-sc',
        title: t('spotlight.cmdNavSc'),
        icon: <Compass size={16} className="text-amber-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('home-soundcloud')
          setShow(false)
        }
      },
      {
        id: 'nav-songs',
        title: t('spotlight.cmdNavSongs'),
        icon: <Music size={16} className="text-blue-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('songs')
          setShow(false)
        }
      },
      {
        id: 'nav-playlists',
        title: t('spotlight.cmdNavPlaylists'),
        icon: <Disc size={16} className="text-indigo-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('playlists')
          setShow(false)
        }
      },
      {
        id: 'nav-user-playlists',
        title: t('spotlight.cmdNavUserPlaylists'),
        icon: <ListPlus size={16} className="text-purple-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('user-playlists')
          setShow(false)
        }
      },
      {
        id: 'nav-artists',
        title: t('spotlight.cmdNavArtists'),
        icon: <Mic2 size={16} className="text-pink-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('artists')
          setShow(false)
        }
      },
      {
        id: 'nav-genres',
        title: t('spotlight.cmdNavGenres'),
        icon: <Layers size={16} className="text-teal-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('genres')
          setShow(false)
        }
      },
      {
        id: 'nav-downloads',
        title: t('spotlight.cmdNavDownloads'),
        icon: <FolderDown size={16} className="text-sky-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('downloads')
          setShow(false)
        }
      },
      {
        id: 'nav-drive',
        title: t('spotlight.cmdNavDrive'),
        icon: <Cloud size={16} className="text-cyan-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('drive')
          setShow(false)
        }
      },
      {
        id: 'nav-settings',
        title: t('spotlight.cmdNavSettings'),
        icon: <Settings size={16} className="text-zinc-400" />,
        category: 'navigation',
        badge: t('spotlight.categoryNavigation'),
        action: () => {
          setActiveView('settings')
          setShow(false)
        }
      },

      // PERSONALIZATION & UI
      {
        id: 'cmd-ui-classic',
        title: t('spotlight.cmdUiClassic'),
        icon: <Sparkles size={16} className="text-emerald-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setUiStyle('classic')
          setShow(false)
        }
      },
      {
        id: 'cmd-ui-sleek',
        title: t('spotlight.cmdUiSleek'),
        icon: <Feather size={16} className="text-teal-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setUiStyle('sleek')
          setShow(false)
        }
      },
      {
        id: 'cmd-theme-dark',
        title: 'Dark Mode',
        icon: <Moon size={16} className="text-indigo-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setColorScheme('dark')
          setShow(false)
        }
      },
      {
        id: 'cmd-theme-light',
        title: 'Light Mode',
        icon: <Sun size={16} className="text-amber-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setColorScheme('light')
          setShow(false)
        }
      },
      {
        id: 'cmd-mode-default',
        title: t('spotlight.cmdModeDefault'),
        icon: <Monitor size={16} className="text-indigo-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setAppMode('default')
          setShow(false)
        }
      },
      {
        id: 'cmd-mode-lite',
        title: t('spotlight.cmdModeLite'),
        icon: <Feather size={16} className="text-amber-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setAppMode('lite')
          setShow(false)
        }
      },
      {
        id: 'cmd-mode-core',
        title: t('spotlight.cmdModeCore'),
        icon: <Cpu size={16} className="text-red-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setAppMode('core')
          setShow(false)
        }
      },
      {
        id: 'cmd-view-table',
        title: t('spotlight.cmdViewTable'),
        icon: <Table size={16} className="text-blue-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setViewMode('table')
          setShow(false)
        }
      },
      {
        id: 'cmd-view-grid',
        title: t('spotlight.cmdViewGrid'),
        icon: <LayoutGrid size={16} className="text-violet-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setViewMode('grid')
          setShow(false)
        }
      },
      {
        id: 'cmd-view-compact',
        title: t('spotlight.cmdViewCompact'),
        icon: <AlignJustify size={16} className="text-teal-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setViewMode('compact')
          setShow(false)
        }
      },
      {
        id: 'cmd-accent-track',
        title: t('spotlight.cmdAccentTrack'),
        icon: <Palette size={16} className="text-emerald-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setAccentColorMode('track')
          try {
            localStorage.setItem('meis_accent_color_mode', 'track')
            const api = getElectronApi()
            if (api?.saveConfig) {
              void api.saveConfig({ accentColorMode: 'track' })
            }
          } catch {
            // Ignore persistence error
          }
          setShow(false)
        }
      },
      {
        id: 'cmd-accent-bg',
        title: t('spotlight.cmdAccentBg'),
        icon: <Palette size={16} className="text-blue-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          setAccentColorMode('background')
          try {
            localStorage.setItem('meis_accent_color_mode', 'background')
            const api = getElectronApi()
            if (api?.saveConfig) {
              void api.saveConfig({ accentColorMode: 'background' })
            }
          } catch {
            // Ignore persistence error
          }
          setShow(false)
        }
      },

      // LIBRARY MAINTENANCE
      {
        id: 'cmd-rescan-library',
        title: t('spotlight.cmdRescan'),
        subtitle: t('spotlight.cmdRescanDesc'),
        icon: <RotateCcw size={16} className="text-cyan-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onReloadLibrary) onReloadLibrary()
          setShow(false)
        }
      },
      {
        id: 'cmd-add-folder',
        title: t('spotlight.cmdAddFolder'),
        subtitle: t('spotlight.cmdAddFolderDesc'),
        icon: <FolderSearch size={16} className="text-emerald-400" />,
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => {
          if (onAddLibraryFolder) onAddLibraryFolder()
          setShow(false)
        }
      }
    ]

    // Inject preset accent colors into commands
    for (const preset of PRESET_COLORS) {
      list.push({
        id: `accent-${preset.name.toLowerCase()}`,
        title: t('spotlight.cmdAccentColorPreset', { color: preset.name }),
        icon: (
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm"
            style={{ backgroundColor: preset.color }}
          />
        ),
        category: 'action',
        badge: t('spotlight.categoryCommands'),
        action: () => handleSetAccentColor(preset.color)
      })
    }

    return list
  }, [
    t,
    isPlaying,
    currentTrack,
    isShuffle,
    repeatMode,
    bitPerfectEnabled,
    loudnessNormalization,
    showLyricsPanel,
    isLyricsMaximized,
    onStartRadio,
    onTogglePlay,
    onNext,
    onPrev,
    onToggleShuffle,
    onToggleRepeat,
    onVolumeUp,
    onVolumeDown,
    onToggleMute,
    onSeekForward,
    onSeekBackward,
    onReloadLibrary,
    onAddLibraryFolder,
    handleSetAccentColor,
    onToggleBitPerfect,
    onToggleMiniPlayer,
    volume,
    bitPerfectType,
    setShow,
    setIsPlaying,
    setBitPerfectEnabled,
    setLoudnessNormalization,
    setShowEQ,
    setShowSpectrogram,
    setSleepTimerMode,
    setShowInsights,
    setShowBackup,
    setIsMiniPlayer,
    setActiveView,
    setUiStyle,
    setAppMode,
    setViewMode,
    setAccentColorMode,
    setColorScheme,
    setPlayQueue,
    showToast,
    setShowLyricsPanel,
    setIsLyricsMaximized
  ])

  // Filter items based on activeTab and query
  const filteredItems: CommandItem[] = useMemo(() => {
    let rawQuery = query.trim()
    let effectiveTab: TabCategory = activeTab

    // Prefix detection
    if (rawQuery.startsWith('>')) {
      effectiveTab = 'commands'
      rawQuery = rawQuery.slice(1).trim()
    } else if (rawQuery.startsWith('#')) {
      effectiveTab = 'tracks'
      rawQuery = rawQuery.slice(1).trim()
    } else if (rawQuery.startsWith('@')) {
      effectiveTab = 'artists'
      rawQuery = rawQuery.slice(1).trim()
    } else if (rawQuery.startsWith('*')) {
      effectiveTab = 'albums'
      rawQuery = rawQuery.slice(1).trim()
    } else if (rawQuery.startsWith('$')) {
      effectiveTab = 'playlists'
      rawQuery = rawQuery.slice(1).trim()
    }

    const q = removeAccents(rawQuery.toLowerCase())

    // 1. EMPTY QUERY BEHAVIOR
    if (!q) {
      if (effectiveTab === 'commands') {
        return builtInCommands
      }

      if (effectiveTab === 'tracks') {
        const recentItems: CommandItem[] = (recentlyPlayed || []).slice(0, 20).map((trk) => ({
          id: `recent-${trk.id || trk.filePath}`,
          title: trk.title || 'Unknown Title',
          subtitle: `${trk.artist || 'Unknown Artist'} • ${trk.album || ''} • ${formatDuration(trk.duration)}`,
          icon: <Play size={14} className="text-theme-10" />,
          category: 'track',
          badge: t('spotlight.categoryRecent'),
          formatBadge: getTrackBadge(trk) || undefined,
          data: trk,
          action: () => {
            onPlayTrack(trk)
            setShow(false)
          },
          secondaryAction: () => handleAddToQueue(trk),
          secondaryActionLabel: t('spotlight.actionAddToQueue')
        }))
        return recentItems.length > 0
          ? recentItems
          : (libraryTracks || []).slice(0, 20).map((trk) => ({
              id: `track-${trk.id || trk.filePath}`,
              title: trk.title || 'Unknown Title',
              subtitle: `${trk.artist || 'Unknown Artist'} • ${trk.album || ''} • ${formatDuration(trk.duration)}`,
              icon: <Play size={14} className="text-theme-10" />,
              category: 'track',
              badge: t('spotlight.categoryTracks'),
              formatBadge: getTrackBadge(trk) || undefined,
              data: trk,
              action: () => {
                onPlayTrack(trk)
                setShow(false)
              },
              secondaryAction: () => handleAddToQueue(trk),
              secondaryActionLabel: t('spotlight.actionAddToQueue')
            }))
      }

      if (effectiveTab === 'artists') {
        return (allArtists || []).slice(0, 25).map((a) => ({
          id: `artist-${a.name}`,
          title: a.name,
          subtitle: t('spotlight.tracksCount', { count: a.trackCount || 0 }),
          icon: <Mic2 size={15} className="text-pink-400" />,
          category: 'artist',
          badge: t('spotlight.categoryArtists'),
          action: () => handleGoToArtist(a.name)
        }))
      }

      if (effectiveTab === 'albums') {
        return (allAlbums || []).slice(0, 25).map((alb) => ({
          id: `album-${alb.title}-${alb.artist}`,
          title: alb.title,
          subtitle: `${alb.artist} • ${t('spotlight.tracksCount', { count: alb.trackCount || 0 })}`,
          icon: <Disc size={15} className="text-indigo-400" />,
          category: 'album',
          badge: t('spotlight.categoryAlbums'),
          action: () => handleGoToAlbum(alb)
        }))
      }

      if (effectiveTab === 'playlists') {
        const folderItems: CommandItem[] = (playlists || []).map((pl) => ({
          id: `playlist-folder-${pl.name}`,
          title: pl.name,
          subtitle: `${t('sidebar.myPlaylists')} • ${t('spotlight.tracksCount', { count: (pl.tracks || []).length })}`,
          icon: <Disc size={15} className="text-emerald-400" />,
          category: 'playlist',
          badge: t('sidebar.myPlaylists'),
          action: () => {
            setActiveView('playlists')
            setActivePlaylist(pl)
            setShow(false)
          }
        }))

        const userItems: CommandItem[] = (userPlaylists || []).map((upl) => ({
          id: `playlist-user-${upl.id || upl.name}`,
          title: upl.name,
          subtitle: `${t('sidebar.userPlaylists')} • ${t('spotlight.tracksCount', { count: (upl.tracks || []).length })}`,
          icon: <ListPlus size={15} className="text-purple-400" />,
          category: 'playlist',
          badge: t('sidebar.userPlaylists'),
          action: () => {
            setActiveView('user-playlists')
            setActiveUserPlaylist(upl)
            setShow(false)
          }
        }))

        return [...userItems, ...folderItems]
      }

      // 'all' default view: recently played + recommended commands
      const recentTracks: CommandItem[] = (recentlyPlayed || []).slice(0, 5).map((trk) => ({
        id: `recent-${trk.id || trk.filePath}`,
        title: trk.title || 'Unknown Title',
        subtitle: `${trk.artist || 'Unknown Artist'} • ${trk.album || ''} • ${formatDuration(trk.duration)}`,
        icon: <Play size={14} className="text-theme-10" />,
        category: 'track',
        badge: t('spotlight.categoryRecent'),
        formatBadge: getTrackBadge(trk) || undefined,
        data: trk,
        action: () => {
          onPlayTrack(trk)
          setShow(false)
        },
        secondaryAction: () => handleAddToQueue(trk),
        secondaryActionLabel: t('spotlight.actionAddToQueue')
      }))

      const topCommands = (builtInCommands || []).slice(0, 10)
      return [...recentTracks, ...topCommands]
    }

    // 2. SEARCH WITH QUERY
    const matchedCommands: CommandItem[] =
      effectiveTab === 'all' || effectiveTab === 'commands'
        ? builtInCommands.filter(
            (c) =>
              removeAccents(c.title.toLowerCase()).includes(q) ||
              (c.subtitle && removeAccents(c.subtitle.toLowerCase()).includes(q))
          )
        : []

    const matchedTracks: CommandItem[] =
      effectiveTab === 'all' || effectiveTab === 'tracks'
        ? libraryTracks
            .filter(
              (trk) =>
                removeAccents((trk.title || '').toLowerCase()).includes(q) ||
                removeAccents((trk.artist || '').toLowerCase()).includes(q) ||
                removeAccents((trk.album || '').toLowerCase()).includes(q) ||
                removeAccents((trk.genre || '').toLowerCase()).includes(q)
            )
            .slice(0, effectiveTab === 'tracks' ? 40 : 8)
            .map((trk): CommandItem => ({
              id: `track-${trk.id || trk.filePath}`,
              title: trk.title || 'Unknown Title',
              subtitle: `${trk.artist || 'Unknown Artist'} • ${trk.album || ''} • ${formatDuration(trk.duration)}`,
              icon: <Play size={14} className="text-theme-10" />,
              category: 'track',
              badge: t('spotlight.categoryTracks'),
              formatBadge: getTrackBadge(trk) || undefined,
              data: trk,
              action: () => {
                onPlayTrack(trk)
                setShow(false)
              },
              secondaryAction: () => handleAddToQueue(trk),
              secondaryActionLabel: t('spotlight.actionAddToQueue')
            }))
        : []

    const matchedArtists: CommandItem[] =
      effectiveTab === 'all' || effectiveTab === 'artists'
        ? allArtists
            .filter((a) => removeAccents((a.name || '').toLowerCase()).includes(q))
            .slice(0, effectiveTab === 'artists' ? 25 : 4)
            .map((a): CommandItem => ({
              id: `artist-${a.name}`,
              title: a.name,
              subtitle: t('spotlight.tracksCount', { count: a.trackCount || 0 }),
              icon: <Mic2 size={15} className="text-pink-400" />,
              category: 'artist',
              badge: t('spotlight.categoryArtists'),
              action: () => handleGoToArtist(a.name)
            }))
        : []

    const matchedAlbums: CommandItem[] =
      effectiveTab === 'all' || effectiveTab === 'albums'
        ? allAlbums
            .filter(
              (alb) =>
                removeAccents((alb.title || '').toLowerCase()).includes(q) ||
                removeAccents((alb.artist || '').toLowerCase()).includes(q)
            )
            .slice(0, effectiveTab === 'albums' ? 25 : 4)
            .map((alb): CommandItem => ({
              id: `album-${alb.title}-${alb.artist}`,
              title: alb.title,
              subtitle: `${alb.artist} • ${t('spotlight.tracksCount', { count: alb.trackCount || 0 })}`,
              icon: <Disc size={15} className="text-indigo-400" />,
              category: 'album',
              badge: t('spotlight.categoryAlbums'),
              action: () => handleGoToAlbum(alb)
            }))
        : []

    const matchedPlaylists: CommandItem[] =
      effectiveTab === 'all' || effectiveTab === 'playlists'
        ? [
            ...(userPlaylists || [])
              .filter((upl) => removeAccents((upl.name || '').toLowerCase()).includes(q))
              .map((upl): CommandItem => ({
                id: `playlist-user-${upl.id || upl.name}`,
                title: upl.name,
                subtitle: `${t('sidebar.userPlaylists')} • ${t('spotlight.tracksCount', { count: (upl.tracks || []).length })}`,
                icon: <ListPlus size={15} className="text-purple-400" />,
                category: 'playlist',
                badge: t('sidebar.userPlaylists'),
                action: () => {
                  setActiveView('user-playlists')
                  setActiveUserPlaylist(upl)
                  setShow(false)
                }
              })),
            ...(playlists || [])
              .filter((pl) => removeAccents((pl.name || '').toLowerCase()).includes(q))
              .map((pl): CommandItem => ({
                id: `playlist-folder-${pl.name}`,
                title: pl.name,
                subtitle: `${t('sidebar.myPlaylists')} • ${t('spotlight.tracksCount', { count: (pl.tracks || []).length })}`,
                icon: <Disc size={15} className="text-emerald-400" />,
                category: 'playlist',
                badge: t('sidebar.myPlaylists'),
                action: () => {
                  setActiveView('playlists')
                  setActivePlaylist(pl)
                  setShow(false)
                }
              }))
          ].slice(0, effectiveTab === 'playlists' ? 30 : 4)
        : []

    // 3. ONLINE SEARCH FALLBACK ITEMS
    const onlineFallbacks: CommandItem[] = []
    if (rawQuery.length > 0 && (effectiveTab === 'all' || effectiveTab === 'tracks')) {
      onlineFallbacks.push(
        {
          id: `online-ytm-${rawQuery}`,
          title: t('spotlight.onlineSearchYtm', { query: rawQuery }),
          subtitle: 'YouTube Music Online',
          icon: <Compass size={15} className="text-red-400" />,
          category: 'online',
          badge: 'YouTube Music',
          action: () => {
            setSearchQuery(rawQuery)
            setSearchInput(rawQuery)
            setActiveView('home-ytm')
            setShow(false)
            const api = getElectronApi()
            void api
              ?.searchOnline?.(rawQuery)
              .then((res: any) => {
                if (res?.success) {
                  setDashboardData(res.data)
                } else {
                  showToast(res?.error || t('common.error'), 'error')
                }
              })
              .catch(() => {})
          }
        },
        {
          id: `online-sc-${rawQuery}`,
          title: t('spotlight.onlineSearchSc', { query: rawQuery }),
          subtitle: 'SoundCloud Streaming',
          icon: <Compass size={15} className="text-amber-400" />,
          category: 'online',
          badge: 'SoundCloud',
          action: () => {
            setSearchQuery(rawQuery)
            setSearchInput(rawQuery)
            setActiveView('home-soundcloud')
            setShow(false)
            const api = getElectronApi()
            void api
              ?.searchScOnline?.(rawQuery)
              .then((res: any) => {
                if (res?.success) {
                  setScDashboardData([
                    { title: `${t('header.searchSc')}: "${rawQuery}"`, contents: res.tracks }
                  ])
                } else {
                  showToast(res?.error || t('common.error'), 'error')
                }
              })
              .catch(() => {})
          }
        },
        {
          id: `online-slsk-${rawQuery}`,
          title: t('spotlight.onlineSearchSoulseek', { query: rawQuery }),
          subtitle: 'Soulseek P2P Lossless FLAC',
          icon: <FolderDown size={15} className="text-sky-400" />,
          category: 'online',
          badge: 'Soulseek',
          action: () => {
            setSlskSearchQuery(rawQuery)
            setActiveView('downloads')
            setShow(false)
            const api = getElectronApi()
            if (!api?.soulseekSearch) {
              setSlskSearchError(t('common.error'))
              return
            }
            setSlskIsSearching(true)
            setSlskSearchError(null)
            void (api.soulseekSearch(rawQuery, 5000) as Promise<any>)
              .then((res: any) => {
                if (res?.success && res?.results) {
                  setSlskSearchResults(res.results)
                  if (res.results.length === 0) {
                    setSlskSearchError(t('downloads.noResults'))
                  }
                } else {
                  setSlskSearchError(res?.error || t('downloads.noResults'))
                }
              })
              .catch((err: any) => {
                setSlskSearchError(err?.message || t('common.error'))
              })
              .finally(() => {
                setSlskIsSearching(false)
              })
          }
        }
      )
    }

    if (effectiveTab === 'tracks') return [...matchedTracks, ...onlineFallbacks]
    if (effectiveTab === 'artists') return matchedArtists
    if (effectiveTab === 'albums') return matchedAlbums
    if (effectiveTab === 'playlists') return matchedPlaylists
    if (effectiveTab === 'commands') return matchedCommands

    return [
      ...matchedTracks,
      ...matchedArtists,
      ...matchedAlbums,
      ...matchedPlaylists,
      ...matchedCommands,
      ...onlineFallbacks
    ]
  }, [
    query,
    activeTab,
    builtInCommands,
    recentlyPlayed,
    libraryTracks,
    allArtists,
    allAlbums,
    playlists,
    userPlaylists,
    t,
    onPlayTrack,
    handleAddToQueue,
    handleGoToArtist,
    handleGoToAlbum,
    setActiveView,
    setActivePlaylist,
    setActiveUserPlaylist,
    setSearchQuery,
    setSearchInput,
    setDashboardData,
    setScDashboardData,
    setSlskSearchQuery,
    setSlskIsSearching,
    setSlskSearchResults,
    setSlskSearchError,
    showToast,
    setShow
  ])

  const safeSelectedIndex = selectedIndex >= filteredItems.length ? 0 : selectedIndex

  // Auto-scroll selected item into view smoothly
  const scrollSelectedIntoView = (index: number): void => {
    if (!listRef.current) return
    const el = listRef.current.children[index] as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }

  // Handle Tab category cycling
  const tabList: TabCategory[] = ['all', 'tracks', 'artists', 'albums', 'playlists', 'commands']
  const cycleTab = (forward: boolean = true): void => {
    const curIdx = tabList.indexOf(activeTab)
    const nextIdx = forward
      ? (curIdx + 1) % tabList.length
      : (curIdx - 1 + tabList.length) % tabList.length
    setActiveTab(tabList[nextIdx])
    setSelectedIndex(0)
  }

  const handleSelectTab = (tab: TabCategory): void => {
    setActiveTab(tab)
    setSelectedIndex(0)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setShow(false)
      return
    }

    // Tab / Shift+Tab -> Cycle categories
    if (e.key === 'Tab') {
      e.preventDefault()
      cycleTab(!e.shiftKey)
      return
    }

    if (filteredItems.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (safeSelectedIndex + 1) % filteredItems.length
      setSelectedIndex(nextIndex)
      scrollSelectedIntoView(nextIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (safeSelectedIndex - 1 + filteredItems.length) % filteredItems.length
      setSelectedIndex(prevIndex)
      scrollSelectedIntoView(prevIndex)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filteredItems[safeSelectedIndex]
      if (!item) return

      // Shift + Enter on a track -> Add to queue
      if (e.shiftKey && item.secondaryAction) {
        item.secondaryAction()
      } else {
        item.action()
      }
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-20 p-4"
          initial={reduceMotion ? { opacity: 1 } : overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={reduceMotion ? { duration: 0 } : overlayFade.transition}
          onClick={() => setShow(false)}
        >
          <motion.div
            className="w-[680px] max-w-full bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-2xl"
            initial={reduceMotion ? { opacity: 1, scale: 1 } : dialogScale.initial}
            animate={dialogScale.animate}
            exit={dialogScale.exit}
            transition={reduceMotion ? { duration: 0 } : dialogScale.transition}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80 bg-zinc-950/40">
              <Search size={18} className="text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('spotlight.placeholder')}
                className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  onClick={() => {
                    setQuery('')
                    setSelectedIndex(0)
                    inputRef.current?.focus()
                  }}
                  className="text-zinc-500 hover:text-white p-1 rounded-md transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                ESC
              </span>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/50 overflow-x-auto no-scrollbar select-none">
              <button
                type="button"
                onClick={() => handleSelectTab('all')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Layers size={13} />
                <span>{t('spotlight.tabAll')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('tracks')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'tracks'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Music size={13} />
                <span>{t('spotlight.tabTracks')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('artists')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'artists'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Mic2 size={13} />
                <span>{t('spotlight.tabArtists')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('albums')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'albums'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Disc size={13} />
                <span>{t('spotlight.tabAlbums')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('playlists')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'playlists'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <ListPlus size={13} />
                <span>{t('spotlight.tabPlaylists')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('commands')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'commands'
                    ? 'bg-theme-10/20 text-theme-10 border border-theme-10/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Sliders size={13} />
                <span>{t('spotlight.tabCommands')}</span>
              </button>
            </div>

            {/* Results List */}
            <div ref={listRef} className="max-h-[420px] overflow-y-auto p-2 space-y-1 select-none">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <Search size={28} className="text-zinc-600 opacity-60" />
                  <span>{t('spotlight.noResults')}</span>
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isSelected = idx === safeSelectedIndex

                  return (
                    <div
                      key={item.id}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition text-xs relative ${
                        isSelected
                          ? 'bg-theme-10/15 border border-theme-10/35 text-white shadow-sm'
                          : 'hover:bg-zinc-800/60 border border-transparent text-zinc-300'
                      }`}
                    >
                      {/* Thumbnail / Icon container */}
                      <div
                        className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center overflow-hidden transition ${
                          isSelected ? 'bg-theme-10/20 ring-1 ring-theme-10/30' : 'bg-zinc-800'
                        }`}
                      >
                        {item.category === 'track' && item.data ? (
                          <DynamicCoverArt
                            track={item.data}
                            src={item.data.coverArt}
                            streamPort={streamPort}
                            tier="sm"
                            className="w-full h-full"
                            fallbackImageSrc=""
                          />
                        ) : item.category === 'artist' && item.icon ? (
                          item.icon
                        ) : (
                          item.icon
                        )}
                      </div>

                      {/* Title & Subtitle */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={`font-medium truncate ${
                              isSelected ? 'text-theme-10 font-semibold' : 'text-zinc-100'
                            }`}
                          >
                            {item.title}
                          </p>
                          {item.formatBadge && (
                            <span className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-theme-10 border border-theme-10/30 shrink-0">
                              {item.formatBadge}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Badges and action shortcuts */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.badge && !isSelected && (
                          <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/50">
                            {item.badge}
                          </span>
                        )}

                        {/* Quick Add to Queue button for tracks */}
                        {item.secondaryAction && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              item.secondaryAction!()
                            }}
                            className={`p-1.5 rounded-lg transition opacity-0 group-hover:opacity-100 cursor-pointer ${
                              isSelected
                                ? 'text-theme-10 hover:bg-theme-10/20 opacity-100'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                            }`}
                            title={item.secondaryActionLabel || t('spotlight.actionAddToQueue')}
                          >
                            <Plus size={14} />
                          </button>
                        )}

                        {isSelected && (
                          <span className="text-[10px] text-theme-10 font-mono font-semibold shrink-0 flex items-center gap-1">
                            Enter ↵
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer info bar */}
            <div className="px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
                    ↑
                  </kbd>{' '}
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
                    ↓
                  </kbd>{' '}
                  {t('spotlight.footerNavigate')}
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
                    ↵
                  </kbd>{' '}
                  {t('spotlight.footerSelect')}
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
                    Shift+↵
                  </kbd>{' '}
                  {t('spotlight.footerQueue')}
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
                    Tab
                  </kbd>{' '}
                  {t('spotlight.footerFilter')}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-zinc-400 font-mono text-[10px]">
                  {t('spotlight.resultsCount', { count: filteredItems.length })}
                </span>
                <span className="font-sans font-bold text-theme-10 text-sm tracking-wider">
                  {t('spotlight.title')}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
