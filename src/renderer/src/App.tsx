import React, { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from 'react'
import { ArrowLeft, Search, X, LayoutGrid, Rows3, List, Sparkles, Cloud } from 'lucide-react'

// Modals & Panels (Lazy loaded for optimized bundle size & fast startup)
const PlaylistRenameModal = React.lazy(() =>
  import('./components/modals/PlaylistRenameModal').then((m) => ({
    default: m.PlaylistRenameModal
  }))
)
const EditPlaylistModal = React.lazy(() =>
  import('./components/modals/EditPlaylistModal').then((m) => ({ default: m.EditPlaylistModal }))
)
const CloudActionModal = React.lazy(() =>
  import('./components/modals/CloudActionModal').then((m) => ({ default: m.CloudActionModal }))
)
const TagEditorModal = React.lazy(() =>
  import('./components/modals/TagEditorModal').then((m) => ({ default: m.TagEditorModal }))
)
const TrackInfoModal = React.lazy(() =>
  import('./components/modals/TrackInfoModal').then((m) => ({ default: m.TrackInfoModal }))
)
const CreatePlaylistModal = React.lazy(() =>
  import('./components/modals/CreatePlaylistModal').then((m) => ({
    default: m.CreatePlaylistModal
  }))
)
const AddSongsModal = React.lazy(() =>
  import('./components/modals/AddSongsModal').then((m) => ({ default: m.AddSongsModal }))
)
const SpectrogramModal = React.lazy(() =>
  import('./components/SpectrogramModal').then((m) => ({ default: m.SpectrogramModal }))
)
const CommandPaletteModal = React.lazy(() =>
  import('./components/modals/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal
  }))
)
const MusicInsightsModal = React.lazy(() =>
  import('./components/modals/MusicInsightsModal').then((m) => ({ default: m.MusicInsightsModal }))
)
const BackupModal = React.lazy(() =>
  import('./components/modals/BackupModal').then((m) => ({ default: m.BackupModal }))
)
const DuplicateFinderModal = React.lazy(() =>
  import('./components/modals/DuplicateFinderModal').then((m) => ({
    default: m.DuplicateFinderModal
  }))
)
const SmartPlaylistModal = React.lazy(() =>
  import('./components/modals/SmartPlaylistModal').then((m) => ({ default: m.SmartPlaylistModal }))
)
const EQPanel = React.lazy(() =>
  import('./components/EQPanel').then((m) => ({ default: m.EQPanel }))
)

// Views
import {
  HomeView,
  YtmHomeView,
  SoundCloudView,
  SongsView,
  ArtistsView,
  GenresView,
  UserPlaylistsView,
  FolderPlaylistsView,
  SettingsView,
  DriveView,
  DownloadsView,
  AnalyticsView
} from './views'

// Components
import { Sidebar } from './components/Sidebar'
import { BatchActionBar } from './components/BatchActionBar'
import { DownloadProgressToast } from './components/TrackListComponents'
import { DragDropOverlay } from './components/DragDropOverlay'
import { ContextMenu } from './components/ContextMenu'
import { CustomDialogModal } from './components/modals/CustomDialogModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MiniPlayerView } from './components/MiniPlayerView'
import { QueuePanel } from './components/QueuePanel'
import { SideLyricsPanel } from './components/SideLyricsPanel'
import { FullscreenLyrics } from './components/FullscreenLyrics'
import { PlayerBar } from './components/PlayerBar'

// Custom Hooks
import {
  useNavigationHistory,
  useMemoryOptimization,
  useTheming,
  useLyrics,
  useSleepTimer,
  useMediaSession,
  useAppShortcuts,
  useAudioEngine,
  useLibraryOperations,
  useDiscordRpc,
  useListeningTracker
} from './hooks'

// Stores, Locales & Utils
import {
  usePlayerStore,
  useUIStore,
  useLibraryStore,
  useSettingsStore,
  useAudioStore,
  loadPlaybackSession,
  scheduleSavePlaybackSession
} from './stores'
import { useTranslation, useLanguage } from './locales'
import { formatAudioSource, extractRawFilePath } from './utils/urlUtils'
import { sliderToGain } from './utils/audioUtils'
import { isDsdTrack, formatDuration } from './utils/formatUtils'
import { splitArtistString, removeAccents, matchesQuery } from './utils/textUtils'
import {
  filterTracksByQuickFilter,
  getFilteredTracks,
  getSortedTracks
} from './utils/trackFilterUtils'
import { fisherYatesShuffle } from './utils/arrayUtils'

export interface EQBand {
  id: string
  frequency: number
  gain: number
  type: BiquadFilterType
  q?: number
}

export default function App() {
  const { t } = useTranslation()
  const { language } = useLanguage()

  // 1. ZUSTAND STORES
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const setPlayQueue = usePlayerStore((s) => s.setPlayQueue)
  const setOriginalQueue = usePlayerStore((s) => s.setOriginalQueue)
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled)
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration)
  const setCrossfadeEnabled = usePlayerStore((s) => s.setCrossfadeEnabled)
  const setCrossfadeDuration = usePlayerStore((s) => s.setCrossfadeDuration)
  const setBitPerfectEnabled = usePlayerStore((s) => s.setBitPerfectEnabled)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setBassOutParams = usePlayerStore((s) => s.setBassOutParams)
  const setIsShuffle = usePlayerStore((s) => s.setIsShuffle)

  const {
    activeView,
    setActiveView,
    viewMode,
    setViewMode,
    themeColor,
    toast,
    hideToast,
    customDialog,
    setCustomDialog,
    showQueuePanel,
    setShowQueuePanel,
    showLyricsPanel,
    setShowLyricsPanel,
    isLyricsMaximized,
    setIsLyricsMaximized,
    isMiniPlayer,
    setIsMiniPlayer,
    showCreateUserPlaylistModal,
    setShowCreateUserPlaylistModal,
    showAddSongsToUserPlaylistModal,
    setShowAddSongsToUserPlaylistModal,
    editingUserPlaylist,
    setEditingUserPlaylist,
    showEditUserPlaylistModal,
    setShowEditUserPlaylistModal,
    showCreateModal,
    setShowCreateModal,
    showAddSongsModal,
    setShowAddSongsModal,
    playlistRename,
    setPlaylistRename,
    showEQ,
    setShowEQ,
    showSpectrogramModal,
    setShowSpectrogramModal,
    setShowBackupModal,
    setShowInsightsModal,
    showToast,
    showVisualizer,
    setShowVisualizer
  } = useUIStore()

  const {
    libraryPath,
    libraryTracks,
    playlists,
    userPlaylists,
    favoriteTrackIds,
    setFavoriteTrackIds,
    activeAlbum,
    setActiveAlbum,
    activeArtist,
    setActiveArtist,
    activeGenre,
    setActiveGenre,
    activePlaylist,
    setActivePlaylist,
    activeUserPlaylist,
    setActiveUserPlaylist,
    searchQuery,
    setSearchQuery,
    searchInput,
    setSearchInput,
    quickFilter,
    sortField,
    sortOrder,
    playlistsRenderLimit,
    setPlaylistsRenderLimit,
    preAggregatedData,
    dashboardData,
    setDashboardData,
    isAlbumLoading,
    setIsAlbumLoading,
    scDashboardData,
    setScDashboardData,
    isScLoading,
    setIsScLoading,
    scUser,
    setScUser,
    selectedScGenre,
    setSelectedScGenre,
    isYtmLoggedIn,
    setIsYtmLoggedIn,
    clearSelectedTracks,
    setTrackLyricOffsets,
    setSmartPlaylists
  } = useLibraryStore()

  const {
    appMode,
    setAppMode,
    uiStyle,
    setUiStyle,
    customBgImage,
    setCustomBgImage,
    customBgOpacity,
    setCustomBgOpacity,
    customBgBlur,
    setCustomBgBlur,
    useTrackCoverAsBg,
    setUseTrackCoverAsBg,
    accentColorMode,
    setAccentColorMode,
    customAccentColor,
    setCustomAccentColor,
    streamPort,
    setStreamPort,
    cloudActionTrack,
    setCloudActionTrack,
    isDownloading,
    setIsDownloading,
    setDownloadProgress,
    googleDriveApiKey,
    setGoogleDriveApiKey,
    driveLink,
    setDriveLink,
    minimizeToTray,
    setMinimizeToTray,
    closeToTray,
    setCloseToTray,
    loudnessNormalization,
    setLoudnessNormalization,
    replayGainMode,
    setReplayGainMode,
    crossfeedEnabled,
    setCrossfeedEnabled,
    gaplessEnabled,
    setGaplessEnabled,
    waveformSeekbarEnabled,
    setWaveformSeekbarEnabled,
    setDiscordRpcEnabled,
    setDiscordClientId,
    setDiscordShowDetails,
    setDiscordShowTime,
    setDiscordShowCover,
    setDiscordShowQuality,
    setDiscordShowButtons,
    setDiscordShowIdle
  } = useSettingsStore()

  const {
    isEqEnabled,
    setIsEqEnabled,
    eqBands,
    setEqBands,
    preampGain,
    setPreampGain,
    selectedDeviceId,
    setSelectedDeviceId,
    bitPerfectType,
    setBitPerfectType
  } = useAudioStore()

  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Local State
  const [showDuplicateFinder, setShowDuplicateFinder] = useState(false)
  const [showSmartPlaylists, setShowSmartPlaylists] = useState(false)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
  const [updaterStatus, setUpdaterStatus] = useState<any>(null)

  // 2. HEADLESS HOOKS
  const audioEngine = useAudioEngine()

  const libraryOps = useLibraryOperations({
    handleRowClick: audioEngine.handleRowClick,
    handleStartRadio: audioEngine.handleStartRadio
  })

  const theming = useTheming()
  const lyricsData = useLyrics()
  const sleepTimer = useSleepTimer({ audioRef: audioEngine.audioRef })

  useMediaSession({
    audioRef: audioEngine.audioRef,
    handlePlayPause: audioEngine.handlePlayPause,
    handlePrev: audioEngine.handlePrev,
    handleNext: audioEngine.handleNext
  })

  useMemoryOptimization()
  useListeningTracker()

  // 3. ONLINE SERVICES & DASHBOARD HANDLERS
  const fetchDashboard = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.getHomeDashboard?.()
    if (res?.success) {
      setDashboardData(res.data)
      setIsYtmLoggedIn(true)
    } else {
      setIsYtmLoggedIn(false)
      if (res?.error && res.error !== 'Chưa đăng nhập') {
        console.warn('Lỗi Dashboard YTM:', res.error)
      }
    }
  }, [setDashboardData, setIsYtmLoggedIn])

  const handleYtmLogin = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.ytmLogin?.()
    if (res?.success) {
      setIsYtmLoggedIn(true)
      showToast(t('toasts.ytmLoginSuccess'), 'success')
      fetchDashboard()
    } else if (res?.error) {
      libraryOps.showAlert({ title: t('common.error'), message: 'Error: ' + res.error })
    }
  }, [t, showToast, fetchDashboard, setIsYtmLoggedIn, libraryOps])

  const handleYtmLogout = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.ytmLogout?.()
    if (res?.success) {
      setIsYtmLoggedIn(false)
      setDashboardData([])
      showToast(t('toasts.ytmLogout'), 'info')
    }
  }, [t, showToast, setIsYtmLoggedIn, setDashboardData])

  const fetchScDashboard = useCallback(
    async (genre?: string) => {
      setIsScLoading(true)
      const targetGenre = genre || selectedScGenre
      // @ts-ignore
      const res = await window.api?.getScDashboard?.(targetGenre)
      if (res?.success) {
        setScDashboardData(res.data)
      }
      // @ts-ignore
      const userRes = await window.api?.getScUser?.()
      if (userRes?.success) {
        setScUser(userRes.user)
      } else {
        setScUser(null)
      }
      setIsScLoading(false)
    },
    [selectedScGenre, setIsScLoading, setScDashboardData, setScUser]
  )

  const handleScLogin = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.scLogin?.()
    if (res?.success) {
      showToast(t('toasts.scLoginSuccess'), 'success')
      if (res.user) setScUser(res.user)
      fetchScDashboard()
    } else if (res?.error) {
      libraryOps.showAlert({ title: t('common.error'), message: 'Error: ' + res.error })
    }
  }, [t, showToast, fetchScDashboard, setScUser, libraryOps])

  const handleScLogout = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.scLogout?.()
    if (res?.success) {
      setScUser(null)
      showToast(t('toasts.scLogout'), 'info')
      fetchScDashboard()
    }
  }, [t, showToast, fetchScDashboard, setScUser])

  const playAndGenerateRadio = useCallback(
    (track: any) => {
      setOriginalQueue([track])
      setPlayQueue([track])
      audioEngine.handlePlayTrack(track)

      if (
        track.platform === 'youtube' ||
        (!track.platform && !String(track.id).startsWith('sc-'))
      ) {
        // @ts-ignore
        window.api
          ?.getUpNext?.(track.originalId)
          ?.then((res: any) => {
            if (res?.success && res.tracks && res.tracks.length > 0) {
              const nextTracks = res.tracks.filter(
                (trk: any) => trk.originalId !== track.originalId
              )
              setPlayQueue((prev) => {
                const currentIds = new Set(prev.map((p) => p.originalId || p.id))
                const unique = nextTracks.filter((t: any) => !currentIds.has(t.originalId || t.id))
                return [...prev, ...unique]
              })
            }
          })
          ?.catch(() => {})
      }
    },
    [setOriginalQueue, setPlayQueue, audioEngine]
  )

  /**
   * Stream All (DriveView): phát trực tiếp toàn bộ file Google Drive vừa quét.
   * KHÔNG nối tạm tracks vào libraryTracks — chỉ đẩy vào hàng đợi và stream bài đầu tiên
   * (getStreamUrl hỗ trợ platform 'drive' qua proxy /play của stream server).
   */
  const handleDriveStreamAll = useCallback(
    (tracks: any[]) => {
      if (!tracks || tracks.length === 0) return
      const queue = usePlayerStore.getState().isShuffle ? fisherYatesShuffle(tracks) : tracks
      setOriginalQueue(queue)
      setPlayQueue(queue)
      audioEngine.handlePlayTrack(queue[0])
    },
    [setOriginalQueue, setPlayQueue, audioEngine]
  )

  const handleDashboardItemClick = useCallback(
    async (item: any) => {
      if (item.videoId && !item.isArtist) {
        const track = {
          id: `yt-${item.videoId}`,
          originalId: item.videoId,
          title: item.title,
          artist: item.subtitle,
          album: 'YouTube Music',
          duration: 0,
          format: 'STREAM',
          isCloud: true,
          isOnline: true,
          platform: 'youtube',
          coverArt: item.thumbnails?.[0]?.url || null,
          coverArtHighRes: item.coverArtHighRes || null
        }
        playAndGenerateRadio(track)
      } else if (item.isArtist) {
        setActiveAlbum({ title: item.title, tracks: [] })
        setIsAlbumLoading(true)
        // @ts-ignore
        const res = await window.api?.getYtmArtist?.(item.playlistId)
        if (res?.success) setActiveAlbum({ title: item.title, tracks: res.tracks })
        else {
          libraryOps.showAlert({ title: t('common.error'), message: res?.error || 'Error' })
          setActiveAlbum(null)
        }
        setIsAlbumLoading(false)
      } else if (item.playlistId) {
        setActiveAlbum({ title: item.title, tracks: [] })
        setIsAlbumLoading(true)
        // @ts-ignore
        const res = await window.api?.getYtmPlaylist?.(item.playlistId)
        if (res?.success) setActiveAlbum({ title: item.title, tracks: res.tracks })
        else {
          libraryOps.showAlert({ title: t('common.error'), message: res?.error || 'Error' })
          setActiveAlbum(null)
        }
        setIsAlbumLoading(false)
      }
    },
    [playAndGenerateRadio, setActiveAlbum, setIsAlbumLoading, libraryOps, t]
  )

  const handleScItemClick = useCallback(
    async (item: any) => {
      if (item.isPlaylist || item.playlistId) {
        setActiveAlbum({ title: item.title, tracks: [] })
        setIsAlbumLoading(true)
        // @ts-ignore
        const res = await window.api?.getScPlaylist?.(item.playlistId)
        if (res?.success) setActiveAlbum({ title: item.title, tracks: res.tracks })
        else {
          libraryOps.showAlert({ title: t('common.error'), message: res?.error || 'Error' })
          setActiveAlbum(null)
        }
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
          coverArt: item.coverArt || item.thumbnails?.[0]?.url || null,
          coverArtHighRes: item.coverArtHighRes || null
        }
        playAndGenerateRadio(track)
      }
    },
    [setActiveAlbum, setIsAlbumLoading, playAndGenerateRadio, libraryOps, t]
  )

  const handleDashboardItemDownload = useCallback(
    async (item: any) => {
      if (item.videoId || item.platform === 'soundcloud' || (item.originalId && !item.isPlaylist)) {
        const track = {
          originalId: item.originalId || item.videoId,
          title: item.title,
          artist: item.artist || item.subtitle,
          album: item.album || item.subtitle || 'Singles',
          platform: item.platform || 'youtube',
          permalinkUrl: item.permalinkUrl
        }

        setIsDownloading(true)
        setDownloadProgress({
          current: 0,
          total: 1,
          fileName: `${t('toasts.downloadProgress')} ${item.title}`
        })

        // @ts-ignore
        const res = await window.api?.downloadOnline?.(track)
        setIsDownloading(false)
        setDownloadProgress(null)

        if (res?.success) {
          showToast(t('toasts.downloadFinished', { title: item.title }), 'success')
          libraryOps.loadLibrary()
        } else if (!res?.canceled) {
          libraryOps.showAlert({
            title: t('common.error'),
            message: 'Download Error: ' + res?.error
          })
        }
      }
    },
    [t, setIsDownloading, setDownloadProgress, showToast, libraryOps]
  )

  const handleCloudAction = useCallback(
    async (action: 'stream' | 'download') => {
      if (!cloudActionTrack) return
      if (action === 'stream') {
        audioEngine.handlePlayTrack(cloudActionTrack)
        setCloudActionTrack(null)
      } else {
        setIsDownloading(true)
        try {
          const ext = cloudActionTrack.format ? cloudActionTrack.format.toLowerCase() : 'mp3'
          // @ts-ignore
          const result = await window.api?.downloadCloudFile?.(
            cloudActionTrack.url,
            `${cloudActionTrack.title}.${ext}`,
            libraryTracks
          )
          if (result?.success) {
            libraryOps.showAlert({
              title: t('common.notice'),
              message:
                language === 'vi'
                  ? 'Tải về thành công! Nhạc sẽ bắt đầu phát từ máy tính.'
                  : 'Download complete! Playback will begin from your computer.'
            })
            audioEngine.handlePlayTrack({
              ...cloudActionTrack,
              filePath: result.localPath,
              isCloud: false
            })
            libraryOps.loadLibrary()
          } else if (!result?.canceled) {
            libraryOps.showAlert({
              title: t('common.error'),
              message:
                (language === 'vi' ? 'Lỗi tải tệp: ' : 'File download error: ') + result?.error
            })
          }
        } catch (e) {
          console.error('Lỗi tải tệp cloud:', e)
        }
        setIsDownloading(false)
        setCloudActionTrack(null)
      }
    },
    [
      cloudActionTrack,
      libraryTracks,
      language,
      t,
      audioEngine,
      libraryOps,
      setIsDownloading,
      setCloudActionTrack
    ]
  )

  // 4. NAVIGATION & TOGGLES
  const nav = useNavigationHistory({
    fetchDashboard: () => fetchDashboard(),
    fetchScDashboard: () => fetchScDashboard()
  })

  useDiscordRpc({ audioRef: audioEngine.audioRef, isConfigLoaded })

  const handleToggleMiniPlayer = useCallback(() => {
    const nextState = !isMiniPlayer
    if (nextState) {
      setIsLyricsMaximized(false)
    }
    setIsMiniPlayer(nextState)
    // @ts-ignore
    window.api?.toggleMiniPlayer?.(nextState)
  }, [isMiniPlayer, setIsMiniPlayer, setIsLyricsMaximized])

  // Chia sẻ với Command Palette: cùng luồng chuyển Bit-Perfect như SettingsView
  // (giữ pendingSeek, pause <audio> khi bật, dọn WebAudio pipeline khi tắt PCM)
  const handleToggleBitPerfect = useCallback(async () => {
    const val = !bitPerfectEnabled
    const prevTrack = currentTrack
    // Chuẩn hóa về thời gian TƯƠNG ĐỐI của bài (pendingSeek/BASS seek đều cộng
    // startTime CUE sau; HTML5 currentTime là tuyệt đối nên phải trừ đi).
    const startOffset = prevTrack?.startTime || 0
    const currentPlaybackTime = val
      ? Math.max(0, (audioEngine.audioRef.current?.currentTime || 0) - startOffset)
      : ((audioEngine.audioRef.current as any)?._currentTime ??
        Math.max(0, (audioEngine.audioRef.current?.currentTime || 0) - startOffset))
    const wasPlaying = isPlaying

    try {
      // @ts-ignore
      await window.api.setBitPerfect(val, volume, bitPerfectType)
    } catch (err: any) {
      showToast(
        `${language === 'vi' ? 'Không thể cấu hình Bit-perfect' : 'Could not configure Bit-perfect'}: ${err?.message || err}`,
        'error'
      )
      return
    }

    if (currentPlaybackTime > 0) {
      audioEngine.pendingSeekTimeRef.current = currentPlaybackTime
    }
    setBitPerfectEnabled(val)

    if (prevTrack && prevTrack.filePath) {
      if (val) {
        if (audioEngine.audioRef.current) audioEngine.audioRef.current.pause()
      } else {
        if (isDsdTrack(prevTrack)) {
          // @ts-ignore
          await window.api.bassStop().catch(() => {})
          setIsPlaying(false)
          setBassOutParams(null)
          showToast(
            language === 'vi'
              ? 'Đã dừng phát vì định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO)!'
              : 'Stopped playback because DSD format requires Bit-Perfect mode (WASAPI / ASIO)!',
            'error'
          )
        } else {
          // Nhạc PCM: Dừng BASS và giải phóng thiết bị độc quyền ngay lập tức
          // @ts-ignore
          await window.api.bassStop().catch(() => {})
          await audioEngine.resetWebAudioPipeline()
          setTimeout(() => {
            if (audioEngine.audioRef.current) {
              audioEngine.audioRef.current.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
              audioEngine.audioRef.current.currentTime = startOffset + currentPlaybackTime
              audioEngine.pendingSeekTimeRef.current = null
              if (wasPlaying) {
                if (
                  audioEngine.audioCtxRef.current &&
                  audioEngine.audioCtxRef.current.state === 'suspended'
                ) {
                  audioEngine.audioCtxRef.current.resume().catch(() => {})
                }
                audioEngine.audioRef.current.play().catch(console.warn)
              }
            }
          }, 100)
        }
      }
    }
  }, [
    bitPerfectEnabled,
    currentTrack,
    isPlaying,
    volume,
    bitPerfectType,
    audioEngine,
    setBitPerfectEnabled,
    setIsPlaying,
    setBassOutParams,
    showToast,
    language
  ])

  const handleToggleLyrics = useCallback(() => {
    if (showLyricsPanel) {
      setShowLyricsPanel(false)
      setIsLyricsMaximized(false)
    } else {
      setShowLyricsPanel(true)
      setShowQueuePanel(false)
    }
  }, [showLyricsPanel, setShowLyricsPanel, setIsLyricsMaximized, setShowQueuePanel])

  const handleToggleQueue = useCallback(() => {
    if (showQueuePanel) {
      setShowQueuePanel(false)
    } else {
      setShowQueuePanel(true)
      setShowLyricsPanel(false)
      setIsLyricsMaximized(false)
    }
  }, [showQueuePanel, setShowQueuePanel, setShowLyricsPanel, setIsLyricsMaximized])

  // 5. MEMOS: AGGREGATED ARTISTS & GENRES
  const uniqueArtistsCount = useMemo(() => {
    const set = new Set<string>()
    for (const track of libraryTracks) {
      const trackArtists =
        Array.isArray(track.artists) && track.artists.length > 0
          ? track.artists
          : splitArtistString(track.artist || '')
      for (const a of trackArtists) {
        if (a && a.trim() && a.toLowerCase() !== 'unknown') {
          set.add(a.trim().toLowerCase())
        }
      }
    }
    return set.size
  }, [libraryTracks])

  const artistsData = useMemo(() => {
    const unknownArtistLabel = language === 'vi' ? 'Nghệ sĩ chưa rõ' : 'Unknown Artist'

    if (preAggregatedData?.artistsList && preAggregatedData.artistsList.length > 0) {
      const artistsList = preAggregatedData.artistsList.map((a: any) => {
        const displayName =
          a.name === 'Unknown Artist' || a.name === 'Unknown' ? unknownArtistLabel : a.name
        const tracks = Array.isArray(a.trackIds)
          ? a.trackIds.map((id: string) => libraryOps.libraryTrackMap.get(id)).filter(Boolean)
          : a.tracks || []
        const albums = (a.albums || []).map((alb: any) => ({
          title: alb.title,
          tracks: Array.isArray(alb.trackIds)
            ? alb.trackIds.map((id: string) => libraryOps.libraryTrackMap.get(id)).filter(Boolean)
            : alb.tracks || [],
          coverArt:
            alb.coverArt ||
            (alb.trackIds?.[0]
              ? libraryOps.libraryTrackMap.get(alb.trackIds[0])?.coverArt
              : null) ||
            a.coverArt,
          year: alb.year
        }))
        return {
          ...a,
          name: displayName,
          tracks,
          albums
        }
      })

      const alphabetGroups = (preAggregatedData.alphabetGroups || []).map((grp: any) => ({
        ...grp,
        artists: (grp.artists || []).map((a: any) => {
          const found = artistsList.find(
            (x: any) =>
              x.name === a.name || (a.name === 'Unknown Artist' && x.name === unknownArtistLabel)
          )
          return found || a
        })
      }))

      return { artistsList, alphabetGroups }
    }

    const artistMap = new Map<
      string,
      {
        name: string
        tracks: any[]
        trackKeys: Set<string>
        albums: Map<string, { tracks: any[]; trackKeys: Set<string> }>
        coverArt: string | null
      }
    >()

    for (const track of libraryTracks) {
      const trackArtists =
        Array.isArray(track.artists) && track.artists.length > 0
          ? track.artists
          : splitArtistString(track.artist || '')

      const effectiveArtists = trackArtists.length > 0 ? trackArtists : [unknownArtistLabel]
      const trackKey = track.id || track.filePath

      for (const rawArtist of effectiveArtists) {
        const artistName =
          rawArtist && rawArtist.trim() && rawArtist.toLowerCase() !== 'unknown'
            ? rawArtist.trim()
            : unknownArtistLabel
        if (!artistMap.has(artistName)) {
          artistMap.set(artistName, {
            name: artistName,
            tracks: [],
            trackKeys: new Set(),
            albums: new Map(),
            coverArt: null
          })
        }
        const item = artistMap.get(artistName)!
        if (!item.trackKeys.has(trackKey)) {
          item.trackKeys.add(trackKey)
          item.tracks.push(track)
        }
        if (!item.coverArt && track.coverArt) {
          item.coverArt = track.coverArt
        }
        const albumName =
          track.album && track.album.trim() && track.album.toLowerCase() !== 'unknown'
            ? track.album.trim()
            : null
        if (albumName) {
          let alb = item.albums.get(albumName)
          if (!alb) {
            alb = { tracks: [], trackKeys: new Set() }
            item.albums.set(albumName, alb)
          }
          if (!alb.trackKeys.has(trackKey)) {
            alb.trackKeys.add(trackKey)
            alb.tracks.push(track)
          }
        }
      }
    }

    const artistsList = Array.from(artistMap.values()).map((a) => ({
      name: a.name,
      tracks: a.tracks,
      albums: Array.from(a.albums.entries()).map(([title, alb]) => ({
        title,
        tracks: alb.tracks,
        coverArt: alb.tracks.find((t) => t.coverArt)?.coverArt || a.coverArt,
        year: alb.tracks.find((t) => t.year)?.year || null
      })),
      albumCount: a.albums.size,
      trackCount: a.tracks.length,
      coverArt: a.coverArt,
      _sortKey: a.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    }))

    artistsList.sort((a, b) => (a._sortKey < b._sortKey ? -1 : a._sortKey > b._sortKey ? 1 : 0))

    const letterMap = new Map<string, typeof artistsList>()
    for (const artist of artistsList) {
      const trimmed = (artist.name || '').trim()
      const firstChar = trimmed.charAt(0).toUpperCase()
      const normalized = firstChar
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[Đđ]/g, 'D')
      const groupKey = /[A-Z]/.test(normalized) ? normalized : /[0-9]/.test(firstChar) ? '0-9' : '#'
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
  }, [preAggregatedData, libraryTracks, libraryOps.libraryTrackMap, language])

  const genresData = useMemo(() => {
    const unknownGenreLabel = language === 'vi' ? 'Chưa phân loại' : 'Unknown'

    if (preAggregatedData?.genresList && preAggregatedData.genresList.length > 0) {
      return preAggregatedData.genresList.map((g: any) => {
        const tracks = Array.isArray(g.trackIds)
          ? g.trackIds.map((id: string) => libraryOps.libraryTrackMap.get(id)).filter(Boolean)
          : Array.isArray(g.tracks)
            ? g.tracks
            : []

        const artists: string[] =
          Array.isArray(g.artists) && g.artists.length > 0
            ? g.artists
            : Array.from(
                new Set(
                  tracks
                    .map((t: any) => t?.artist)
                    .filter((a: any) => a && a !== 'Unknown' && a !== unknownGenreLabel)
                )
              )

        const coverArts: string[] =
          Array.isArray(g.coverArts) && g.coverArts.length > 0
            ? g.coverArts
            : Array.from(new Set(tracks.map((t: any) => t?.coverArt).filter(Boolean))).slice(0, 4)

        return {
          ...g,
          name: g.name === 'Unknown' || g.name === 'Chưa phân loại' ? unknownGenreLabel : g.name,
          tracks,
          artists,
          coverArts,
          artistCount: typeof g.artistCount === 'number' ? g.artistCount : artists.length,
          trackCount: typeof g.trackCount === 'number' ? g.trackCount : tracks.length
        }
      })
    }

    const genreMap = new Map<
      string,
      {
        name: string
        tracks: any[]
        artists: Set<string>
        albums: Set<string>
        coverArts: string[]
      }
    >()

    for (const track of libraryTracks) {
      const rawGenre = track.genre || 'Unknown'
      const splitGenres = String(rawGenre)
        .split(/[,;/|]+/)
        .map((g) => g.trim())
        .filter(Boolean)

      const effectiveGenres = splitGenres.length > 0 ? splitGenres : [unknownGenreLabel]
      for (const g of effectiveGenres) {
        const genreName = g.toLowerCase() === 'unknown' ? unknownGenreLabel : g
        if (!genreMap.has(genreName)) {
          genreMap.set(genreName, {
            name: genreName,
            tracks: [],
            artists: new Set(),
            albums: new Set(),
            coverArts: []
          })
        }
        const item = genreMap.get(genreName)!
        item.tracks.push(track)
        if (track.artist && track.artist !== 'Unknown') item.artists.add(track.artist)
        if (track.album && track.album !== 'Unknown') item.albums.add(track.album)
        if (
          track.coverArt &&
          item.coverArts.length < 4 &&
          !item.coverArts.includes(track.coverArt)
        ) {
          item.coverArts.push(track.coverArt)
        }
      }
    }

    const genresList = Array.from(genreMap.values()).map((g) => ({
      name: g.name,
      tracks: g.tracks,
      artistCount: g.artists.size,
      albumCount: g.albums.size,
      trackCount: g.tracks.length,
      coverArts: g.coverArts,
      artists: Array.from(g.artists)
    }))

    genresList.sort((a, b) => {
      const isAUnknown = a.name === 'Unknown' || a.name === 'Chưa phân loại'
      const isBUnknown = b.name === 'Unknown' || b.name === 'Chưa phân loại'
      if (isAUnknown && !isBUnknown) return 1
      if (!isAUnknown && isBUnknown) return -1
      return b.trackCount - a.trackCount
    })

    return genresList
  }, [preAggregatedData, libraryTracks, libraryOps.libraryTrackMap, language])

  const navigateToArtist = useCallback(
    (artistName: string) => {
      if (!artistName) return
      const cleanName = artistName.trim()
      if (!cleanName) return

      const found = artistsData.artistsList.find(
        (a) => a.name.toLowerCase() === cleanName.toLowerCase()
      )
      if (found) {
        setActiveArtist(found)
      } else {
        const matchingTracks = libraryTracks.filter((t) => {
          const arts =
            Array.isArray(t.artists) && t.artists.length > 0
              ? t.artists
              : splitArtistString(t.artist || '')
          return arts.some((a: string) => a.toLowerCase() === cleanName.toLowerCase())
        })
        setActiveArtist({
          name: cleanName,
          tracks: matchingTracks,
          albums: [],
          albumCount: 0,
          trackCount: matchingTracks.length,
          coverArt: matchingTracks.find((t) => t.coverArt)?.coverArt || null
        })
      }
      setActiveView('artists')
      setActiveAlbum(null)
      setActiveGenre(null)
      setActivePlaylist(null)
      setActiveUserPlaylist(null)
    },
    [
      artistsData.artistsList,
      libraryTracks,
      setActiveArtist,
      setActiveView,
      setActiveAlbum,
      setActiveGenre,
      setActivePlaylist,
      setActiveUserPlaylist
    ]
  )

  // 6. MEMOS: FILTERED & SORTED TRACKS
  const processedLibraryTracks = useMemo(() => {
    const filteredQuick = filterTracksByQuickFilter(libraryTracks, quickFilter, favoriteTrackIds)
    const filteredSearch = getFilteredTracks(filteredQuick, deferredSearchQuery)
    return getSortedTracks(filteredSearch, sortField, sortOrder)
  }, [libraryTracks, quickFilter, favoriteTrackIds, deferredSearchQuery, sortField, sortOrder])

  const processedPlaylistTracks = useMemo(() => {
    if (!activePlaylist) return []
    const tracks = activePlaylist.tracks || []
    const filteredQuick = filterTracksByQuickFilter(tracks, quickFilter, favoriteTrackIds)
    const filteredSearch = getFilteredTracks(filteredQuick, deferredSearchQuery)
    return getSortedTracks(filteredSearch, sortField, sortOrder)
  }, [activePlaylist, quickFilter, favoriteTrackIds, deferredSearchQuery, sortField, sortOrder])

  const matchedPlaylists = useMemo(() => {
    const rawQuery = (deferredSearchQuery || searchQuery || '').trim()
    if (!rawQuery) return playlists || []
    const normalizedQuery = removeAccents(rawQuery)
    return (playlists || []).filter((pl) => matchesQuery(pl.name, normalizedQuery))
  }, [playlists, deferredSearchQuery, searchQuery])

  const visiblePlaylists = useMemo(() => {
    return (matchedPlaylists || []).slice(0, playlistsRenderLimit)
  }, [matchedPlaylists, playlistsRenderLimit])

  const activeUserPlaylistTracks = useMemo(() => {
    if (!activeUserPlaylist) return []
    const resolved = libraryOps.getResolvedUserPlaylistTracks(activeUserPlaylist)
    const filtered = getFilteredTracks(resolved, deferredSearchQuery)
    return getSortedTracks(filtered, sortField, sortOrder)
  }, [activeUserPlaylist, libraryOps, deferredSearchQuery, sortField, sortOrder])

  // Drag and Drop Files
  const handleDropFiles = useCallback(
    async (files: any[]) => {
      // Đồng bộ với SUPPORTED_AUDIO_EXTS ở backend (sharedContext.ts)
      const audioExtensions = [
        '.mp3',
        '.flac',
        '.wav',
        '.m4a',
        '.opus',
        '.ogg',
        '.aac',
        '.alac',
        '.aiff',
        '.wma',
        '.dsf',
        '.dff',
        '.dsd',
        '.bin',
        '.ape'
      ]
      const audioFiles = files.filter((file) => {
        const name = file.path || file.name || (typeof file === 'string' ? file : '')
        const lower = name.toLowerCase()
        return audioExtensions.some((ext) => lower.endsWith(ext))
      })

      const droppedPaths: string[] = audioFiles
        .map(
          (f: any) =>
            f.path || (window as any).api?.getFilePath?.(f) || (typeof f === 'string' ? f : '')
        )
        .filter(Boolean)

      if (droppedPaths.length === 0) {
        showToast(
          language === 'vi'
            ? 'Không tìm thấy tệp âm thanh hợp lệ'
            : 'No supported audio files found',
          'error'
        )
        return
      }

      await (window as any).api?.registerDroppedFiles?.(droppedPaths)

      const newTracks = droppedPaths.map((p) => {
        const fileName = p.split(/[\\/]/).pop() || 'Unknown'
        const title = fileName.replace(/\.[^/.]+$/, '')
        const ext = p.split('.').pop()?.toLowerCase() || ''
        const isDsd = ext === 'dsf' || ext === 'dff' || ext === 'dsd'
        return {
          id: p,
          title,
          artist: 'Unknown Artist',
          album: 'Local Drops',
          filePath: p,
          duration: 0,
          format: isDsd ? ext.toUpperCase() : ext.toUpperCase() || 'AUDIO',
          bitDepth: isDsd ? 1 : undefined,
          sampleRate: isDsd ? 2822400 : undefined,
          lossless: isDsd || ['flac', 'wav', 'alac', 'aiff'].includes(ext)
        }
      })

      setPlayQueue((prev) => [...prev, ...newTracks])
      showToast(
        language === 'vi'
          ? `Đã thêm ${newTracks.length} bài hát vào hàng đợi`
          : `Added ${newTracks.length} tracks to queue`,
        'success'
      )
    },
    [language, showToast, setPlayQueue]
  )

  const { isDraggingFile } = useAppShortcuts({
    audioRef: audioEngine.audioRef,
    handlePlayPause: audioEngine.handlePlayPause,
    handleNext: audioEngine.handleNext,
    handlePrev: audioEngine.handlePrev,
    handleVolumeUp: audioEngine.handleVolumeUp,
    handleVolumeDown: audioEngine.handleVolumeDown,
    toggleMute: audioEngine.toggleMute,
    toggleShuffle: audioEngine.toggleShuffle,
    toggleRepeat: audioEngine.toggleRepeat,
    onFilesDropped: handleDropFiles
  })

  // 7. EFFECTS: LIFECYCLE & STARTUP
  const playlistsLoadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeView !== 'playlists' || activePlaylist) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPlaylistsRenderLimit((prev) => Math.min(prev + 36, matchedPlaylists.length))
        }
      },
      { rootMargin: '300px' }
    )
    if (playlistsLoadMoreRef.current) observer.observe(playlistsLoadMoreRef.current)
    return () => observer.disconnect()
  }, [activeView, activePlaylist, matchedPlaylists.length, setPlaylistsRenderLimit])

  // Get stream port
  useEffect(() => {
    window.api?.getStreamPort?.()?.then((port: number) => {
      if (port) setStreamPort(port)
    })
  }, [setStreamPort])

  // Startup config and library load
  useEffect(() => {
    // @ts-ignore
    window.api?.getConfig?.()?.then((cfg: any) => {
      if (!cfg) return
      if (cfg.volume !== undefined) setVolume(cfg.volume)
      if (cfg.crossfadeEnabled !== undefined) setCrossfadeEnabled(cfg.crossfadeEnabled)
      if (cfg.bitPerfectEnabled !== undefined) setBitPerfectEnabled(cfg.bitPerfectEnabled)
      if (cfg.bitPerfectType) setBitPerfectType(cfg.bitPerfectType)
      if (cfg.crossfadeDuration !== undefined) setCrossfadeDuration(cfg.crossfadeDuration)
      if (cfg.eqBands) setEqBands(cfg.eqBands)
      if (cfg.isEqEnabled !== undefined) setIsEqEnabled(cfg.isEqEnabled)
      if (cfg.googleDriveApiKey) setGoogleDriveApiKey(cfg.googleDriveApiKey)
      if (cfg.driveLink) setDriveLink(cfg.driveLink)
      if (cfg.selectedDeviceId)
        setSelectedDeviceId(cfg.selectedDeviceId === '0' ? 'auto' : cfg.selectedDeviceId)
      // Tôn trọng giá trị showVisualizer người dùng đã lưu (kể cả false).
      // Chỉ bật mặc định visualizer cho chế độ Default khi config chưa từng
      // lưu giá trị này, tránh ghi đè lựa chọn của người dùng mỗi lần khởi động.
      if (cfg.showVisualizer !== undefined && !cfg.bitPerfectEnabled)
        setShowVisualizer(cfg.showVisualizer)
      else if (cfg.showVisualizer === undefined && !cfg.bitPerfectEnabled) {
        const isDefaultMode = cfg.appMode === 'default' || (!cfg.appMode && !cfg.liteMode)
        if (isDefaultMode) setShowVisualizer(true)
      }
      if (cfg.minimizeToTray !== undefined) setMinimizeToTray(cfg.minimizeToTray)
      if (cfg.closeToTray !== undefined) setCloseToTray(cfg.closeToTray)
      if (cfg.loudnessNormalization !== undefined)
        setLoudnessNormalization(cfg.loudnessNormalization)
      if (cfg.replayGainMode !== undefined) setReplayGainMode(cfg.replayGainMode)
      if (cfg.crossfeedEnabled !== undefined) setCrossfeedEnabled(cfg.crossfeedEnabled)
      if (cfg.gaplessEnabled !== undefined) setGaplessEnabled(cfg.gaplessEnabled)
      if (cfg.waveformSeekbarEnabled !== undefined)
        setWaveformSeekbarEnabled(cfg.waveformSeekbarEnabled)
      if (cfg.appMode !== undefined) setAppMode(cfg.appMode)
      else if (cfg.liteMode !== undefined) setAppMode(cfg.liteMode ? 'lite' : 'default')
      if (cfg.uiStyle !== undefined) setUiStyle(cfg.uiStyle)
      if (cfg.customBgImage !== undefined) {
        setCustomBgImage(extractRawFilePath(cfg.customBgImage) || cfg.customBgImage)
      }
      if (cfg.useTrackCoverAsBg !== undefined) setUseTrackCoverAsBg(cfg.useTrackCoverAsBg)
      if (cfg.accentColorMode !== undefined) setAccentColorMode(cfg.accentColorMode)
      if (cfg.customAccentColor !== undefined) setCustomAccentColor(cfg.customAccentColor)
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
        if (cfg.discordRpc.showDetails !== undefined)
          setDiscordShowDetails(cfg.discordRpc.showDetails)
        if (cfg.discordRpc.showTime !== undefined) setDiscordShowTime(cfg.discordRpc.showTime)
        if (cfg.discordRpc.showCover !== undefined) setDiscordShowCover(cfg.discordRpc.showCover)
        if (cfg.discordRpc.showQuality !== undefined)
          setDiscordShowQuality(cfg.discordRpc.showQuality)
        if (cfg.discordRpc.showButtons !== undefined)
          setDiscordShowButtons(cfg.discordRpc.showButtons)
        if (cfg.discordRpc.showIdle !== undefined) setDiscordShowIdle(cfg.discordRpc.showIdle)
      }
      fetchScDashboard()
      setIsConfigLoaded(true)
      libraryOps.loadLibrary()

      if (!usePlayerStore.getState().currentTrack) {
        const session = loadPlaybackSession()
        // Chỉ giữ lại vị trí phát nếu có bài hát khôi phục và bài đó có thể phát
        // (file DSD cần Bit-Perfect bật sẵn), tránh để tồn đọng gây nhảy thời gian.
        const restoredTrack = session?.currentTrack
        const canRestoreSeek =
          restoredTrack && restoredTrack.filePath
            ? usePlayerStore.getState().bitPerfectEnabled || !isDsdTrack(restoredTrack)
            : false
        if (session && session.currentTime > 0 && canRestoreSeek) {
          audioEngine.pendingSeekTimeRef.current = session.currentTime
        }
      }

      if (window.api?.getFavorites) {
        window.api
          .getFavorites()
          .then((favs: any) => {
            if (Array.isArray(favs)) setFavoriteTrackIds(favs)
          })
          .catch(() => {})
      }
      if (window.api?.getLyricOffsets) {
        window.api
          .getLyricOffsets()
          .then((offsets: any) => {
            if (offsets && typeof offsets === 'object') setTrackLyricOffsets(offsets)
          })
          .catch(() => {})
      }
      if (window.api?.getSmartPlaylists) {
        window.api
          .getSmartPlaylists()
          .then((spls: any) => {
            if (Array.isArray(spls)) setSmartPlaylists(spls)
          })
          .catch(() => {})
      }
    })
    // Chạy 1 lần khi mount: libraryOps/fetchDashboard đổi identity mỗi render,
    // đưa vào deps sẽ lặp vô hạn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save Config & Update Tray
  useEffect(() => {
    if (!isConfigLoaded) return
    // @ts-ignore
    window.api?.saveConfig?.({
      volume,
      crossfadeEnabled,
      crossfadeDuration,
      bitPerfectEnabled,
      bitPerfectType,
      eqBands,
      isEqEnabled,
      loudnessNormalization,
      replayGainMode,
      crossfeedEnabled,
      gaplessEnabled,
      waveformSeekbarEnabled,
      googleDriveApiKey,
      driveLink,
      selectedDeviceId,
      showVisualizer,
      minimizeToTray,
      closeToTray,
      appMode,
      uiStyle,
      customBgImage,
      customBgOpacity,
      customBgBlur,
      useTrackCoverAsBg,
      accentColorMode,
      customAccentColor
    })
    // @ts-ignore
    window.api?.updateTrayConfig?.({ minimizeToTray, closeToTray })
  }, [
    volume,
    crossfadeEnabled,
    crossfadeDuration,
    bitPerfectEnabled,
    bitPerfectType,
    loudnessNormalization,
    replayGainMode,
    crossfeedEnabled,
    gaplessEnabled,
    waveformSeekbarEnabled,
    eqBands,
    isEqEnabled,
    googleDriveApiKey,
    driveLink,
    selectedDeviceId,
    showVisualizer,
    minimizeToTray,
    closeToTray,
    appMode,
    uiStyle,
    customBgImage,
    customBgOpacity,
    customBgBlur,
    useTrackCoverAsBg,
    accentColorMode,
    customAccentColor,
    isConfigLoaded
  ])

  // Library FS changes & playback session scheduling
  useEffect(() => {
    const unlistenFs = window.api?.onLibraryFsChanged?.(() => {
      libraryOps.loadLibrary(true, false)
    })
    return () => {
      if (typeof unlistenFs === 'function') unlistenFs()
    }
  }, [libraryOps])

  useEffect(() => {
    scheduleSavePlaybackSession()
  }, [currentTrack, volume])

  // Auto-updater status check & listener
  useEffect(() => {
    window.api
      ?.updaterGetStatus?.()
      ?.then((st: any) => {
        if (st) setUpdaterStatus(st)
      })
      ?.catch(() => {})

    const unlisten = window.api?.onUpdaterStatusChanged?.((st: any) => {
      setUpdaterStatus(st)
    })
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  // Download progress listener & cleanup
  useEffect(() => {
    const unlisten = window.api?.onDownloadProgress?.((data: any) => {
      setDownloadProgress(data)
    })
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [setDownloadProgress])

  // ==========================================
  // 8. RENDER
  // ==========================================
  return (
    <>
      {!theming.isCore && (
        <div className="custom-bg-container">
          <div
            className={`custom-bg-layer ${!theming.isLite ? 'transition-all' : ''}`}
            style={{
              backgroundImage: theming.bgLayerA
                ? `url("${theming.bgLayerA.replace(/"/g, '\\"')}")`
                : 'none',
              opacity: theming.activeBgLayer === 'A' && theming.bgLayerA ? customBgOpacity : 0
            }}
          />
          <div
            className={`custom-bg-layer ${!theming.isLite ? 'transition-all' : ''}`}
            style={{
              backgroundImage: theming.bgLayerB
                ? `url("${theming.bgLayerB.replace(/"/g, '\\"')}")`
                : 'none',
              opacity: theming.activeBgLayer === 'B' && theming.bgLayerB ? customBgOpacity : 0
            }}
          />
        </div>
      )}

      {/* AUDIO ELEMENT */}
      <audio
        key={`${audioEngine.currentSampleRate}_${audioEngine.audioRemountCount}`}
        ref={(el) => {
          ;(audioEngine.audioRef as any).current = el
          if (el) {
            el.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
          }
        }}
        crossOrigin="anonymous"
        preload="auto"
        autoPlay={!bitPerfectEnabled && !isDsdTrack(currentTrack) && isPlaying}
        src={
          currentTrack && !isDsdTrack(currentTrack)
            ? formatAudioSource(currentTrack.filePath, streamPort)
            : undefined
        }
        onPlay={audioEngine.handleAudioPlay}
        onLoadedMetadata={() => {
          const audio = audioEngine.audioRef.current
          if (!audio) return
          // Chế độ WebAudio (chuẩn): khôi phục vị trí phát cũ của phiên nghe
          // và giải phóng giá trị tồn đọng (pendingSeekTimeRef) ngay khi bài đã load,
          // tránh nhảy thời gian sai nếu người dùng bật Bit-Perfect sau đó.
          const pendingSeek = audioEngine.pendingSeekTimeRef.current
          if (pendingSeek !== null && pendingSeek > 0) {
            audio.currentTime = (currentTrack?.startTime || 0) + pendingSeek
            audioEngine.pendingSeekTimeRef.current = null
          } else if (
            currentTrack?.startTime &&
            currentTrack.startTime > 0 &&
            audio.currentTime < currentTrack.startTime
          ) {
            audio.currentTime = currentTrack.startTime
          }
        }}
        onEnded={audioEngine.handleAudioEnded}
        onTimeUpdate={audioEngine.handleAudioTimeUpdate}
        onError={audioEngine.handleAudioError}
      />

      {isMiniPlayer ? (
        <MiniPlayerView
          handleToggleMiniPlayer={handleToggleMiniPlayer}
          handlePlayPause={audioEngine.handlePlayPause}
          handleNext={audioEngine.handleNext}
          handlePrev={audioEngine.handlePrev}
        />
      ) : (
        <div
          data-mode={appMode}
          className={`flex flex-col h-screen text-zinc-200 font-sans overflow-hidden relative ${theming.isLite ? '' : 'transition-colors duration-1000'}`}
          style={{
            backgroundColor: theming.effectiveBgImage
              ? 'transparent'
              : theming.isCore
                ? '#121212'
                : themeColor
          }}
        >
          {!theming.isLite && !theming.effectiveBgImage && (
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 to-zinc-950 pointer-events-none -z-10" />
          )}

          {/* TOAST NOTIFICATION */}
          {toast.visible && (
            <div
              onClick={hideToast}
              className="fixed top-10 right-10 z-[100] animate-fade-in flex items-center gap-3 bg-theme-60/95 backdrop-blur-md border border-zinc-700 shadow-2xl py-3 px-5 rounded-xl cursor-pointer select-none hover:bg-zinc-800/80 transition-all duration-200"
              title={language === 'vi' ? 'Nhấn để đóng thông báo' : 'Click to dismiss'}
            >
              {toast.type === 'success' && (
                <Sparkles size={18} className="text-theme-10 flex-shrink-0" />
              )}
              {toast.type === 'error' && <X size={18} className="text-red-400 flex-shrink-0" />}
              {toast.type === 'info' && <Cloud size={18} className="text-blue-400 flex-shrink-0" />}
              <span className="text-sm font-medium text-white">{toast.message}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  hideToast()
                }}
                className="ml-2 text-zinc-400 hover:text-white transition p-0.5 rounded-full hover:bg-white/10"
                title={language === 'vi' ? 'Đóng' : 'Close'}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <DownloadProgressToast t={t} />

          <BatchActionBar
            onPlaySelected={(ids) => {
              const idSet = new Set(ids)
              const selectedTracks = libraryTracks.filter(
                (trk) => idSet.has(trk.id) || (trk.filePath && idSet.has(trk.filePath))
              )
              if (selectedTracks.length > 0) {
                audioEngine.handleRowClick(selectedTracks[0], selectedTracks)
              }
            }}
            onAddToQueue={(ids) => {
              const idSet = new Set(ids)
              const selectedTracks = libraryTracks.filter(
                (trk) => idSet.has(trk.id) || (trk.filePath && idSet.has(trk.filePath))
              )
              if (selectedTracks.length > 0) {
                setPlayQueue((prev) => [...prev, ...selectedTracks])
                showToast(
                  t('toasts.addedToQueue', {
                    title: `${selectedTracks.length} ${t('common.tracks')}`
                  }),
                  'success'
                )
              }
            }}
            onAddToFavorites={async (ids) => {
              const nextFavs = Array.from(new Set([...favoriteTrackIds, ...ids]))
              setFavoriteTrackIds(nextFavs)
              if (window.api?.toggleFavorite) {
                for (const id of ids) {
                  await window.api.toggleFavorite(id, true).catch(() => {})
                }
              }
              showToast(
                `${t('favorites.addToFavorites') || 'Đã thêm vào yêu thích'}: +${ids.length}`,
                'success'
              )
            }}
            onDeleteSelected={async (ids) => {
              const idSet = new Set(ids)
              const matched = libraryTracks.filter(
                (trk) => idSet.has(trk.id) || (trk.filePath && idSet.has(trk.filePath))
              )
              const paths = matched.map((trk) => trk.id || trk.filePath).filter(Boolean) as string[]
              if (paths.length === 0) return
              const confirmed = window.confirm(
                `${t('batchActions.deleteSelected') || 'Xóa các bài đã chọn'} (${paths.length} ${t('common.tracks') || 'bài'})?`
              )
              if (!confirmed) return
              if (window.api?.deleteTrack) {
                for (const p of paths) {
                  try {
                    await window.api.deleteTrack(p, false)
                  } catch {}
                }
                showToast(
                  t('toasts.movedToTrash', { title: `${paths.length} ${t('common.tracks')}` }),
                  'info'
                )
                clearSelectedTracks()
                await (await import('./utils/trackStateUtils')).removeTrackKeysFromStores(paths)
                libraryOps.loadLibrary(true, false)
              }
            }}
            onClearSelection={clearSelectedTracks}
          />

          <ErrorBoundary fallback={null}>
            <React.Suspense fallback={null}>
              <DuplicateFinderModal
                isOpen={showDuplicateFinder}
                onPlayTrack={audioEngine.handlePlayTrack}
                onClose={() => setShowDuplicateFinder(false)}
                onDeleteTracks={async (trackPaths) => {
                  if (window.api?.deleteTrack) {
                    for (const p of trackPaths) {
                      try {
                        await window.api.deleteTrack(p, false)
                      } catch {}
                    }
                    showToast(
                      t('toasts.movedToTrash', {
                        title: `${trackPaths.length} ${t('common.tracks')}`
                      }),
                      'info'
                    )
                    await (
                      await import('./utils/trackStateUtils')
                    ).removeTrackKeysFromStores(trackPaths)
                    await libraryOps.loadLibrary(true, false)
                  }
                }}
              />

              <SmartPlaylistModal
                isOpen={showSmartPlaylists}
                onClose={() => setShowSmartPlaylists(false)}
                onPlayPlaylist={(tracks) => {
                  if (tracks && tracks.length > 0) {
                    audioEngine.handleRowClick(tracks[0], tracks)
                  }
                }}
              />

              <CloudActionModal
                track={cloudActionTrack}
                isDownloading={isDownloading}
                onClose={() => setCloudActionTrack(null)}
                onAction={handleCloudAction}
              />

              {libraryOps.infoTrack && (
                <TrackInfoModal
                  track={libraryOps.infoTrack}
                  onClose={() => libraryOps.setInfoTrack(null)}
                  onEditTags={libraryOps.openTagEditor}
                  onPlayTrack={audioEngine.handlePlayTrack}
                />
              )}

              {libraryOps.editingTrack && (
                <TagEditorModal
                  track={libraryOps.editingTrack}
                  tags={libraryOps.editTags}
                  imagePath={libraryOps.editImagePath}
                  setTags={libraryOps.setEditTags}
                  onSelectImage={libraryOps.handleSelectTagImage}
                  onSave={libraryOps.saveTags}
                  onClose={() => libraryOps.setEditingTrack(null)}
                />
              )}

              <PlaylistRenameModal
                isOpen={playlistRename.isOpen}
                newName={playlistRename.newName}
                setNewName={(name) => setPlaylistRename({ ...playlistRename, newName: name })}
                onCancel={() => setPlaylistRename({ isOpen: false, oldName: '', newName: '' })}
                onSubmit={libraryOps.handleRenameSubmit}
              />

              <EditPlaylistModal
                isOpen={showEditUserPlaylistModal}
                playlist={editingUserPlaylist}
                onClose={() => {
                  setShowEditUserPlaylistModal(false)
                  setEditingUserPlaylist(null)
                }}
                onSave={libraryOps.handleSaveEditUserPlaylist}
              />

              <CreatePlaylistModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreate={libraryOps.handleCreatePlaylistSubmit}
              />

              <CreatePlaylistModal
                isOpen={showCreateUserPlaylistModal}
                onClose={() => setShowCreateUserPlaylistModal(false)}
                onCreate={libraryOps.handleCreateUserPlaylist}
              />

              <AddSongsModal
                isOpen={showAddSongsModal}
                tracks={libraryTracks}
                playlistName={activePlaylist?.name || ''}
                onClose={() => setShowAddSongsModal(false)}
                onAddTracks={libraryOps.handleAddTracksToActivePlaylist}
              />

              <AddSongsModal
                isOpen={showAddSongsToUserPlaylistModal}
                tracks={libraryTracks}
                playlistName={activeUserPlaylist?.name || ''}
                onClose={() => setShowAddSongsToUserPlaylistModal(false)}
                onAddTracks={libraryOps.handleAddSongsToUserPlaylist}
              />

              <EQPanel
                showEQ={showEQ}
                setShowEQ={setShowEQ}
                isEqEnabled={isEqEnabled}
                setIsEqEnabled={setIsEqEnabled}
                eqBands={eqBands}
                setEqBands={setEqBands}
                filterNodesRef={audioEngine.filterNodesRef}
                preampGain={preampGain}
                setPreampGain={setPreampGain}
              />

              <SpectrogramModal
                isOpen={showSpectrogramModal}
                onClose={() => setShowSpectrogramModal(false)}
                analyserNodeRef={audioEngine.analyserNodeRef}
                isPlaying={isPlaying}
                isLite={theming.isLite}
                currentTrack={currentTrack}
                audioRef={audioEngine.audioRef}
              />

              <CustomDialogModal dialog={customDialog} onClose={() => setCustomDialog(null)} />

              <CommandPaletteModal
                onPlayTrack={audioEngine.handlePlayTrack}
                onStartRadio={() => audioEngine.handleStartRadio()}
                onTogglePlay={audioEngine.handlePlayPause}
                onNext={audioEngine.handleNext}
                onPrev={audioEngine.handlePrev}
                onToggleShuffle={audioEngine.toggleShuffle}
                onToggleRepeat={audioEngine.toggleRepeat}
                onVolumeUp={audioEngine.handleVolumeUp}
                onVolumeDown={audioEngine.handleVolumeDown}
                onToggleMute={audioEngine.toggleMute}
                onSeekForward={audioEngine.handleSeekForward}
                onSeekBackward={audioEngine.handleSeekBackward}
                onReloadLibrary={libraryOps.handleReloadLibrary}
                onAddLibraryFolder={libraryOps.handleAddLibraryFolder}
                onNavigateToArtist={navigateToArtist}
                onToggleBitPerfect={handleToggleBitPerfect}
                onToggleMiniPlayer={handleToggleMiniPlayer}
              />
              <MusicInsightsModal />
              <BackupModal />
            </React.Suspense>
          </ErrorBoundary>

          <DragDropOverlay isDragging={isDraggingFile} />

          {libraryOps.contextMenu && (
            <ContextMenu
              x={libraryOps.contextMenu.x}
              y={libraryOps.contextMenu.y}
              items={libraryOps.contextMenu.items}
              onClose={() => libraryOps.setContextMenu(null)}
            />
          )}

          {/* TOP DRAGGABLE TITLE BAR */}
          <div
            className="w-full h-8 flex-shrink-0 z-[100] flex items-center px-3 gap-2"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center gap-2 text-zinc-400 text-sm font-semibold opacity-70">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
              <span
                className="font-whisper text-xl"
                style={{ letterSpacing: '1px', marginTop: '2px' }}
              >
                Mei&apos;s Radio
              </span>
            </div>
          </div>

          {/* MAIN SHELL */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              activeView={activeView}
              setActiveView={setActiveView}
              setSearchQuery={setSearchQuery}
              setSearchInput={setSearchInput}
              setActiveAlbum={setActiveAlbum}
              setActivePlaylist={setActivePlaylist}
              setActiveArtist={setActiveArtist}
              setActiveGenre={setActiveGenre}
              setActiveUserPlaylist={setActiveUserPlaylist}
              fetchDashboard={fetchDashboard}
              fetchScDashboard={fetchScDashboard}
              isCore={theming.isCore}
            />

            <main
              className={`flex-1 flex flex-col min-w-0 bg-transparent relative z-10 overflow-hidden ${
                isLyricsMaximized && showLyricsPanel ? 'hidden' : ''
              }`}
            >
              {/* HEADER SEARCH & NAVIGATION */}
              <div className="flex items-center justify-between p-4 sm:px-6 lg:px-8 border-b border-theme-30/30 gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-zinc-400">
                    <button
                      onClick={nav.handleNavBack}
                      className="p-1.5 rounded-full hover:bg-theme-30/50 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title={language === 'vi' ? 'Quay lại (Chuột 4)' : 'Back (Mouse 4)'}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      onClick={nav.handleNavForward}
                      className="p-1.5 rounded-full hover:bg-theme-30/50 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title={language === 'vi' ? 'Tiến tới (Chuột 5)' : 'Forward (Mouse 5)'}
                    >
                      <ArrowLeft size={18} className="rotate-180" />
                    </button>
                  </div>

                  <div className="relative flex-1 max-w-md">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    />
                    <input
                      id="global-search-input"
                      type="text"
                      placeholder={
                        activeView === 'home' || activeView === 'home-ytm'
                          ? t('header.searchYtm')
                          : activeView === 'home-soundcloud'
                            ? t('header.searchSc')
                            : t('header.searchLocal')
                      }
                      value={searchInput}
                      onChange={(e) => {
                        const val = e.target.value
                        setSearchInput(val)
                        setSearchQuery(val)
                        if (!val) {
                          if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard()
                          if (activeView === 'home-soundcloud') fetchScDashboard()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (activeView === 'home' || activeView === 'home-ytm') {
                            // @ts-ignore
                            window.api?.searchOnline?.(searchInput)?.then((res: any) => {
                              if (res?.success) {
                                setDashboardData(res.data)
                              } else {
                                libraryOps.showAlert({
                                  title: t('common.error'),
                                  message: res?.error || 'Lỗi tìm kiếm YouTube Music'
                                })
                              }
                            })
                          } else if (activeView === 'home-soundcloud') {
                            // @ts-ignore
                            window.api?.searchScOnline?.(searchInput)?.then((res: any) => {
                              if (res?.success) {
                                const sections = [
                                  {
                                    title: `${t('header.searchSc')}: "${searchInput}"`,
                                    contents: res.tracks
                                  }
                                ]
                                setScDashboardData(sections)
                              } else {
                                libraryOps.showAlert({
                                  title: t('common.error'),
                                  message: res?.error || 'Lỗi tìm kiếm SoundCloud'
                                })
                              }
                            })
                          }
                        }
                      }}
                      className="w-full bg-theme-60/80 border border-zinc-700/50 rounded-full py-1.5 pl-9 pr-8 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-theme-10 transition shadow-inner"
                    />
                    {searchInput && (
                      <button
                        onClick={() => {
                          setSearchInput('')
                          setSearchQuery('')
                          if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard()
                          if (activeView === 'home-soundcloud') fetchScDashboard()
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 rounded transition cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {(activeView === 'songs' ||
                  activeView === 'playlists' ||
                  activeView === 'artists' ||
                  activeView === 'genres' ||
                  activeView === 'user-playlists') && (
                  <div className="flex items-center bg-theme-60/50 p-1 rounded-full border border-zinc-700/50">
                    <button
                      onClick={() => setViewMode('table')}
                      className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'table' ? 'bg-theme-10 text-white' : 'text-zinc-400 hover:text-white'}`}
                      title={t('viewOptions.table')}
                    >
                      <Rows3 size={15} />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-theme-10 text-white' : 'text-zinc-400 hover:text-white'}`}
                      title={t('viewOptions.grid')}
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      onClick={() => setViewMode('compact')}
                      className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'compact' ? 'bg-theme-10 text-white' : 'text-zinc-400 hover:text-white'}`}
                      title={t('viewOptions.compact')}
                    >
                      <List size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* CONTENT VIEW ROUTING */}
              <div className="flex flex-1 overflow-hidden relative">
                <div
                  key={`${activeView}-${activeAlbum ? (activeAlbum as any).browseId || activeAlbum.title || 'album' : ''}-${activeArtist?.name || ''}-${activeGenre?.name || ''}-${activePlaylist?.id || activePlaylist?.name || ''}-${activeUserPlaylist?.id || activeUserPlaylist?.name || ''}`}
                  className={`${theming.isLite ? '' : 'animate-fade-in'} flex-1 flex flex-col p-4 sm:p-6 lg:p-8 relative ${
                    activeView === 'analytics'
                      ? 'overflow-y-auto no-scrollbar'
                      : activeView === 'settings' ||
                          activeView === 'drive' ||
                          activeView === 'home' ||
                          (activeView === 'playlists' && !activePlaylist) ||
                          activeView === 'artists' ||
                          (activeView === 'genres' && !activeGenre) ||
                          (activeView === 'user-playlists' && !activeUserPlaylist)
                        ? 'overflow-y-auto'
                        : 'overflow-hidden'
                  }`}
                >
                  {activeView === 'home' && (
                    <HomeView
                      handleRowClick={audioEngine.handleRowClick}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      navigateToArtist={navigateToArtist}
                      uniqueArtistsCount={uniqueArtistsCount}
                      formatDuration={formatDuration}
                    />
                  )}

                  {activeView === 'home-ytm' && (
                    <YtmHomeView
                      activeAlbum={activeAlbum}
                      setActiveAlbum={setActiveAlbum}
                      handleRowClick={audioEngine.handleRowClick}
                      isAlbumLoading={isAlbumLoading}
                      searchInput={searchInput}
                      setSearchInput={setSearchInput}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      fetchDashboard={fetchDashboard}
                      isYtmLoggedIn={isYtmLoggedIn}
                      handleYtmLogin={handleYtmLogin}
                      handleYtmLogout={handleYtmLogout}
                      dashboardData={dashboardData}
                      handleDashboardItemClick={handleDashboardItemClick}
                      handleDashboardItemDownload={handleDashboardItemDownload}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'home-soundcloud' && (
                    <SoundCloudView
                      activeAlbum={activeAlbum}
                      setActiveAlbum={setActiveAlbum}
                      handleRowClick={audioEngine.handleRowClick}
                      isAlbumLoading={isAlbumLoading}
                      searchInput={searchInput}
                      setSearchInput={setSearchInput}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      fetchScDashboard={fetchScDashboard}
                      isScLoading={isScLoading}
                      scUser={scUser}
                      handleScLogin={handleScLogin}
                      handleScLogout={handleScLogout}
                      selectedScGenre={selectedScGenre}
                      setSelectedScGenre={setSelectedScGenre}
                      scDashboardData={scDashboardData}
                      handleScItemClick={handleScItemClick}
                      handleDashboardItemDownload={handleDashboardItemDownload}
                      setContextMenu={libraryOps.setContextMenu}
                      setPlayQueue={setPlayQueue}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'songs' && (
                    <SongsView
                      searchQuery={searchQuery}
                      libraryPath={libraryPath}
                      processedLibraryTracks={processedLibraryTracks}
                      handleRowClick={audioEngine.handleRowClick}
                      handleImportFiles={libraryOps.handleImportFiles}
                      setShowDuplicateFinder={setShowDuplicateFinder}
                      setShowSmartPlaylists={setShowSmartPlaylists}
                      setIsShuffle={setIsShuffle}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'artists' && (
                    <ArtistsView
                      searchQuery={searchQuery}
                      deferredSearchQuery={deferredSearchQuery}
                      artistsData={artistsData}
                      activeArtist={activeArtist}
                      setActiveArtist={setActiveArtist}
                      handleRowClick={audioEngine.handleRowClick}
                      handleArtistContextMenu={libraryOps.handleArtistContextMenu}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'genres' && (
                    <GenresView
                      searchQuery={searchQuery}
                      deferredSearchQuery={deferredSearchQuery}
                      genresData={genresData}
                      activeGenre={activeGenre}
                      setActiveGenre={setActiveGenre}
                      handleRowClick={audioEngine.handleRowClick}
                      navigateToArtist={navigateToArtist}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                    />
                  )}

                  {activeView === 'user-playlists' && (
                    <UserPlaylistsView
                      searchQuery={searchQuery}
                      deferredSearchQuery={deferredSearchQuery}
                      userPlaylists={userPlaylists}
                      activeUserPlaylist={activeUserPlaylist}
                      setActiveUserPlaylist={setActiveUserPlaylist}
                      activeUserPlaylistTracks={activeUserPlaylistTracks}
                      getResolvedUserPlaylistTracks={libraryOps.getResolvedUserPlaylistTracks}
                      handleRowClick={audioEngine.handleRowClick}
                      handleUserPlaylistContextMenu={libraryOps.handleUserPlaylistContextMenu}
                      handleChangeUserPlaylistCover={libraryOps.handleChangeUserPlaylistCover}
                      setShowCreateUserPlaylistModal={setShowCreateUserPlaylistModal}
                      setShowAddSongsToUserPlaylistModal={setShowAddSongsToUserPlaylistModal}
                      setShowEditUserPlaylistModal={setShowEditUserPlaylistModal}
                      setEditingUserPlaylist={setEditingUserPlaylist}
                      handleDeleteUserPlaylist={libraryOps.handleDeleteUserPlaylist}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'playlists' && (
                    <FolderPlaylistsView
                      searchQuery={searchQuery}
                      playlists={playlists}
                      matchedPlaylists={matchedPlaylists}
                      visiblePlaylists={visiblePlaylists}
                      activePlaylist={activePlaylist}
                      setActivePlaylist={setActivePlaylist}
                      processedPlaylistTracks={processedPlaylistTracks}
                      processedLibraryTracks={processedLibraryTracks}
                      handleRowClick={audioEngine.handleRowClick}
                      handleOpenPlaylist={(pl) => {
                        setActivePlaylist(pl)
                        setSearchQuery('')
                      }}
                      handlePlayPlaylistTracks={(plOrTracks) => {
                        const tracks = Array.isArray(plOrTracks) ? plOrTracks : plOrTracks?.tracks
                        if (tracks && tracks.length > 0) {
                          audioEngine.handleRowClick(tracks[0], tracks)
                        }
                      }}
                      handlePlaylistContextMenu={libraryOps.handlePlaylistContextMenu}
                      handleChangePlaylistImage={libraryOps.handleChangePlaylistImage}
                      handleExtractPlaylistImage={libraryOps.handleExtractPlaylistImage}
                      handleOpenPlaylistRename={(plOrName) => {
                        const name = typeof plOrName === 'string' ? plOrName : plOrName?.name || ''
                        const id = typeof plOrName === 'object' ? plOrName?.id : undefined
                        setPlaylistRename({
                          isOpen: true,
                          oldName: name,
                          newName: name,
                          id
                        })
                      }}
                      setShowCreateModal={setShowCreateModal}
                      handleAutoGeneratePlaylists={libraryOps.handleAutoGeneratePlaylists}
                      playlistsLoadMoreRef={playlistsLoadMoreRef}
                      setPlaylistsRenderLimit={setPlaylistsRenderLimit}
                      setShowAddSongsModal={setShowAddSongsModal}
                      handleImportFiles={libraryOps.handleImportFiles}
                      setShowDuplicateFinder={setShowDuplicateFinder}
                      setShowSmartPlaylists={setShowSmartPlaylists}
                      handleTrackContextMenu={libraryOps.handleTrackContextMenu}
                      openTagEditor={libraryOps.openTagEditor}
                      openTrackInfo={libraryOps.openTrackInfo}
                      navigateToArtist={navigateToArtist}
                    />
                  )}

                  {activeView === 'drive' && (
                    <DriveView
                      loadLibrary={libraryOps.loadLibrary}
                      processedLibraryTracks={processedLibraryTracks}
                      onStreamAll={handleDriveStreamAll}
                      showAlert={libraryOps.showAlert}
                    />
                  )}

                  {activeView === 'downloads' && (
                    <React.Suspense
                      fallback={
                        <div className="flex-1 flex items-center justify-center text-zinc-500">
                          <Cloud size={32} className="animate-spin text-theme-10" />
                        </div>
                      }
                    >
                      <DownloadsView onPlayTrack={audioEngine.handlePlayTrack} />
                    </React.Suspense>
                  )}

                  {activeView === 'analytics' && (
                    <AnalyticsView onPlayTrack={audioEngine.handlePlayTrack} />
                  )}

                  {activeView === 'settings' && (
                    <SettingsView
                      handleUpdateLibraryFolder={libraryOps.handleUpdateLibraryFolder}
                      handleRemoveLibraryFolder={libraryOps.handleRemoveLibraryFolder}
                      handleAddLibraryFolder={libraryOps.handleAddLibraryFolder}
                      handleReloadLibrary={libraryOps.handleReloadLibrary}
                      showToast={showToast}
                      audioRef={audioEngine.audioRef}
                      audioCtxRef={audioEngine.audioCtxRef}
                      pendingSeekTimeRef={audioEngine.pendingSeekTimeRef}
                      resetWebAudioPipeline={audioEngine.resetWebAudioPipeline}
                      setShowBackupModal={setShowBackupModal}
                      setShowInsightsModal={setShowInsightsModal}
                      updaterStatus={updaterStatus}
                      setUpdaterStatus={setUpdaterStatus}
                    />
                  )}
                </div>

                {/* SIDE LYRICS DRAWER */}
                {showLyricsPanel && !isLyricsMaximized && (
                  <SideLyricsPanel
                    lyrics={lyricsData.lyrics}
                    audioRef={audioEngine.audioRef}
                    analyserNodeRef={audioEngine.analyserNodeRef}
                    changeLyricOffset={lyricsData.changeLyricOffset}
                    resetLyricOffset={lyricsData.resetLyricOffset}
                  />
                )}

                {/* PLAY QUEUE DRAWER */}
                {showQueuePanel && (
                  <QueuePanel
                    onPlayTrack={audioEngine.handlePlayTrack}
                    onTrackContextMenu={libraryOps.handleTrackContextMenu}
                    onArtistClick={navigateToArtist}
                  />
                )}
              </div>
            </main>

            {/* FULLSCREEN VINYL LYRICS */}
            {isLyricsMaximized && showLyricsPanel && (
              <FullscreenLyrics
                lyrics={lyricsData.lyrics}
                originalCover={lyricsData.originalCover}
                audioRef={audioEngine.audioRef}
                analyserNodeRef={audioEngine.analyserNodeRef}
                navigateToArtist={navigateToArtist}
                changeLyricOffset={lyricsData.changeLyricOffset}
                resetLyricOffset={lyricsData.resetLyricOffset}
              />
            )}
          </div>

          {/* BOTTOM PLAYER BAR */}
          <PlayerBar
            audioRef={audioEngine.audioRef}
            handlePlayPause={audioEngine.handlePlayPause}
            handleNext={audioEngine.handleNext}
            handlePrev={audioEngine.handlePrev}
            toggleShuffle={audioEngine.toggleShuffle}
            toggleRepeat={audioEngine.toggleRepeat}
            handleToggleLyrics={handleToggleLyrics}
            handleToggleQueue={handleToggleQueue}
            handleToggleMiniPlayer={handleToggleMiniPlayer}
            handleSetSleepTimer={sleepTimer.handleSetSleepTimer}
            navigateToArtist={navigateToArtist}
          />
        </div>
      )}
    </>
  )
}
