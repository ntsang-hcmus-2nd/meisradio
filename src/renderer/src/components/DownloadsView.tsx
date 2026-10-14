import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'
import {
  FolderDown,
  Search,
  FolderOpen,
  FolderSearch,
  User,
  Lock,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  X,
  ExternalLink,
  Sparkles,
  ArrowUpDown,
  ListFilter,
  Check,
  Music,
  Trash2
} from 'lucide-react'
import { useTranslation } from '../locales'
import { useSoulseekStore, SoulseekSearchResult, SoulseekDownload } from '../stores/soulseekStore'
import { useUIStore } from '../stores/uiStore'

interface DownloadsViewProps {
  onPlayTrack?: (track: any) => void
}

// Module-level helper formatters to avoid recreation on every render
const formatBytes = (bytes?: number) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSec?: number) => {
  if (!bytesPerSec || bytesPerSec === 0) return '0 KB/s'
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s'
  }
  return (bytesPerSec / 1024).toFixed(0) + ' KB/s'
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

// Memoized Search Result Row component to prevent cascading re-renders during active download progress
interface SearchResultRowProps {
  item: SoulseekSearchResult
  download?: SoulseekDownload
  onDownload: (item: SoulseekSearchResult) => void
  onCancel: (id: string) => void
  onPlay?: (track: any) => void
  t: (key: string) => string
}

const SearchResultRow = React.memo<SearchResultRowProps>(
  ({ item, download, onDownload, onCancel, onPlay, t }) => {
    const isCompleted = download?.status === 'complete'
    const isBeingDownloaded = download !== undefined && !isCompleted

    return (
      <div className="pb-2.5">
        <div className="bg-zinc-900/50 hover:bg-zinc-800/60 border border-zinc-800/80 hover:border-zinc-700/80 p-3.5 rounded-2xl flex items-center justify-between gap-4 transition group">
          {/* FILE INFO */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              {/* AUDIO FORMAT BADGES */}
              {item.isLossless ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold tracking-wider uppercase shrink-0">
                  {item.ext} {item.bitDepth ? `${item.bitDepth}-BIT` : ''}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-bold tracking-wider uppercase shrink-0">
                  {item.ext} {item.bitrate ? `${item.bitrate}k` : ''}
                </span>
              )}

              {item.sampleRate && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {(item.sampleRate / 1000).toFixed(1)} kHz
                </span>
              )}

              <h3 className="text-xs font-semibold text-white truncate" title={item.filename}>
                {item.filename}
              </h3>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-zinc-400 truncate">
              {item.folderArtist && (
                <span className="truncate max-w-[200px] text-zinc-300 font-medium">
                  {item.folderArtist}
                </span>
              )}
              {item.folderAlbum && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="truncate max-w-[200px] text-zinc-400">{item.folderAlbum}</span>
                </>
              )}
              <span className="text-zinc-600">•</span>
              <span>{formatBytes(item.size)}</span>
              {item.duration && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span>{formatDuration(item.duration)}</span>
                </>
              )}
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">Peer: {item.user}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">{formatSpeed(item.speed)}</span>
            </div>
          </div>

          {/* STATUS & ACTION BUTTON */}
          <div className="flex items-center gap-3 shrink-0">
            {/* SLOTS BADGE */}
            {item.slots ? (
              <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
                {t('downloads.freeSlot')}
              </span>
            ) : (
              <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium">
                {t('downloads.queued').replace('{place}', String(item.queueLength || 1))}
              </span>
            )}

            {isCompleted ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Check size={14} /> {t('downloads.completed')}
                </span>
                {onPlay && download && (
                  <button
                    type="button"
                    onClick={() =>
                      onPlay({
                        id: download.destinationPath,
                        title: download.filename,
                        artist: item.folderArtist || item.user || 'Soulseek',
                        album: item.folderAlbum || 'Downloads',
                        filePath: download.destinationPath,
                        isLocal: true,
                        duration: item.duration || 0,
                        format: item.ext
                      })
                    }
                    className="p-2 rounded-xl bg-theme-10 hover:bg-theme-10/90 text-white transition cursor-pointer"
                    title={t('downloads.playNow')}
                  >
                    <Play size={14} className="fill-current" />
                  </button>
                )}
              </div>
            ) : isBeingDownloaded && download ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-theme-10 font-medium">
                  {Math.round((download.progress || 0) * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => onCancel(download.id)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                  title={t('downloads.cancel')}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onDownload(item)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-theme-10 hover:bg-theme-10/90 text-white text-xs font-semibold shadow-md shadow-theme-10/20 transition cursor-pointer"
              >
                <Download size={14} />
                <span>{t('downloads.downloadNow')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
)
SearchResultRow.displayName = 'SearchResultRow'

export const DownloadsView: React.FC<DownloadsViewProps> = ({ onPlayTrack }) => {
  const { t } = useTranslation()
  const showToast = useUIStore((s) => s.showToast)

  // Soulseek Store States
  const connected = useSoulseekStore((s) => s.connected)
  const isConnecting = useSoulseekStore((s) => s.isConnecting)
  const username = useSoulseekStore((s) => s.username)
  const downloadFolder = useSoulseekStore((s) => s.downloadFolder)
  const searchQuery = useSoulseekStore((s) => s.searchQuery)
  const isSearching = useSoulseekStore((s) => s.isSearching)
  const searchResults = useSoulseekStore((s) => s.searchResults)
  const searchError = useSoulseekStore((s) => s.searchError)
  const filterMode = useSoulseekStore((s) => s.filterMode)
  const onlyFreeSlots = useSoulseekStore((s) => s.onlyFreeSlots)
  const sortBy = useSoulseekStore((s) => s.sortBy)
  const downloads = useSoulseekStore((s) => s.downloads)
  const activeTab = useSoulseekStore((s) => s.activeTab)

  const setConnected = useSoulseekStore((s) => s.setConnected)
  const setIsConnecting = useSoulseekStore((s) => s.setIsConnecting)
  const setUsername = useSoulseekStore((s) => s.setUsername)
  const setDownloadFolder = useSoulseekStore((s) => s.setDownloadFolder)
  const setSearchQuery = useSoulseekStore((s) => s.setSearchQuery)
  const setIsSearching = useSoulseekStore((s) => s.setIsSearching)
  const setSearchResults = useSoulseekStore((s) => s.setSearchResults)
  const setSearchError = useSoulseekStore((s) => s.setSearchError)
  const setFilterMode = useSoulseekStore((s) => s.setFilterMode)
  const setOnlyFreeSlots = useSoulseekStore((s) => s.setOnlyFreeSlots)
  const setSortBy = useSoulseekStore((s) => s.setSortBy)
  const setActiveTab = useSoulseekStore((s) => s.setActiveTab)
  const updateDownload = useSoulseekStore((s) => s.updateDownload)
  const setDownloads = useSoulseekStore((s) => s.setDownloads)
  const clearCompletedDownloads = useSoulseekStore((s) => s.clearCompletedDownloads)

  // Local component form states
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [rememberLogin, setRememberLogin] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch initial status and register IPC event listeners
  useEffect(() => {
    let unmounted = false

    const fetchStatus = async () => {
      try {
        if (!window.api?.soulseekGetStatus) return
        const status = await window.api.soulseekGetStatus()
        if (unmounted) return
        setConnected(status.connected)
        setIsConnecting(status.isConnecting)
        setUsername(status.username)
        if (status.downloadFolder) {
          setDownloadFolder(status.downloadFolder)
        }
        if (status.activeDownloads && Array.isArray(status.activeDownloads)) {
          setDownloads(status.activeDownloads)
        }
      } catch (err) {
        console.error('[DownloadsView] Error fetching status:', err)
      }
    }

    fetchStatus()

    const unsubStatus = window.api?.onSoulseekStatusChanged?.((status: any) => {
      setConnected(status.connected)
      setIsConnecting(status.isConnecting)
      setUsername(status.username)
      if (status.downloadFolder) {
        setDownloadFolder(status.downloadFolder)
      }
      if (status.activeDownloads && Array.isArray(status.activeDownloads)) {
        setDownloads(status.activeDownloads)
      }
    })

    const unsubProgress = window.api?.onSoulseekDownloadProgress?.((data: any) => {
      updateDownload(data)
    })

    const unsubCompleted = window.api?.onSoulseekDownloadCompleted?.((data: any) => {
      showToast(t('downloads.completed') + ': ' + data.filename, 'success')
    })

    return () => {
      unmounted = true
      if (unsubStatus) unsubStatus()
      if (unsubProgress) unsubProgress()
      if (unsubCompleted) unsubCompleted()
    }
  }, [setConnected, setIsConnecting, setUsername, setDownloadFolder, setDownloads, updateDownload, showToast, t])

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUser.trim() || !loginPass.trim()) {
      setLoginError(t('common.error') + ': ' + t('downloads.username') + ' / ' + t('downloads.password'))
      return
    }

    setIsLoggingIn(true)
    setLoginError(null)

    try {
      const res = await window.api.soulseekLogin({
        user: loginUser.trim(),
        pass: loginPass.trim(),
        remember: rememberLogin
      })

      if (res.success) {
        setConnected(true)
        setUsername(res.username || loginUser.trim())
        setLoginUser('')
        setLoginPass('')
        showToast(
          t('common.success') + '! ' + t('downloads.connectedAs').replace('{username}', res.username || loginUser.trim()),
          'success'
        )
      } else {
        setLoginError(res.error || t('common.error'))
      }
    } catch (err: any) {
      setLoginError(err.message || t('common.error'))
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Logout handler
  const handleLogout = async () => {
    try {
      await window.api.soulseekLogout()
      setConnected(false)
      setUsername(null)
      showToast(t('downloads.disconnected'), 'info')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  // Select download folder
  const handleSelectFolder = async () => {
    try {
      const selected = await window.api.soulseekSelectDownloadFolder()
      if (selected) {
        setDownloadFolder(selected)
        showToast(t('common.success'), 'success')
      }
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // Open download folder in Explorer
  const handleOpenFolder = async () => {
    try {
      await window.api.soulseekOpenDownloadFolder()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // Search handler
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return

    if (!connected) {
      showToast(t('downloads.disconnected') + '. ' + t('downloads.loginOrRegister'), 'error')
      return
    }

    setIsSearching(true)
    setSearchError(null)

    try {
      const res = await window.api.soulseekSearch(query, 5000)
      if (res.success && res.results) {
        setSearchResults(res.results)
        if (res.results.length === 0) {
          setSearchError(t('downloads.noResults'))
        }
      } else {
        setSearchError(res.error || t('downloads.noResults'))
      }
    } catch (err: any) {
      setSearchError(err.message || t('common.error'))
    } finally {
      setIsSearching(false)
    }
  }

  // Memoized Download handler
  const handleDownload = useCallback(
    async (item: SoulseekSearchResult) => {
      try {
        const res = await window.api.soulseekDownload(item)
        if (res.success) {
          showToast(t('downloads.downloading') + ': ' + item.filename, 'info')
        } else {
          showToast(res.error || t('common.error'), 'error')
        }
      } catch (err: any) {
        showToast(err.message || t('common.error'), 'error')
      }
    },
    [showToast, t]
  )

  // Memoized Cancel download handler
  const handleCancelDownload = useCallback(
    async (id: string) => {
      try {
        await window.api.soulseekCancelDownload(id)
        showToast(t('downloads.cancel'), 'info')
      } catch (err: any) {
        showToast(err.message || t('common.error'), 'error')
      }
    },
    [showToast, t]
  )

  // Filter and Sort results
  const filteredAndSortedResults = useMemo(() => {
    let list = [...searchResults]

    // 1. Format / Quality Filters
    if (filterMode === 'lossless') {
      list = list.filter((r) => r.isLossless)
    } else if (filterMode === '320k') {
      list = list.filter((r) => !r.isLossless && (r.bitrate || 0) >= 319)
    } else if (filterMode === 'free_slots') {
      list = list.filter((r) => r.slots)
    }

    // 2. Only Free Slots Toggle (can be combined with lossless or 320k)
    if (onlyFreeSlots) {
      list = list.filter((r) => r.slots)
    }

    // 3. Sorters
    list.sort((a, b) => {
      if (sortBy === 'speed') {
        return (b.speed || 0) - (a.speed || 0)
      }
      if (sortBy === 'bitrate') {
        const rankA = a.isLossless ? 10000 + (a.bitrate || 1000) : (a.bitrate || 0)
        const rankB = b.isLossless ? 10000 + (b.bitrate || 1000) : (b.bitrate || 0)
        return rankB - rankA
      }
      if (sortBy === 'size') {
        return (b.size || 0) - (a.size || 0)
      }
      // default (relevance): free slots first, then lossless first, then speed
      if (a.slots !== b.slots) return a.slots ? -1 : 1
      if (a.isLossless !== b.isLossless) return a.isLossless ? -1 : 1
      return (b.speed || 0) - (a.speed || 0)
    })

    return list
  }, [searchResults, filterMode, onlyFreeSlots, sortBy])

  // Downloads array
  const downloadsList = useMemo(() => {
    return Object.values(downloads).sort((a, b) => b.startedAt - a.startedAt)
  }, [downloads])

  const activeDownloadsCount = useMemo(() => {
    return downloadsList.filter(
      (d) =>
        d.status === 'downloading' ||
        d.status === 'requested' ||
        d.status === 'queued' ||
        d.status === 'queued_peer' ||
        d.status === 'connected'
    ).length
  }, [downloadsList])

  return (
    <div
      className={`flex flex-col h-full space-y-4 select-none animate-fade-in text-zinc-100 ${
        !connected ? 'overflow-y-auto pr-1' : 'overflow-hidden'
      }`}
    >
      {/* 1. HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-theme-30/40 pb-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-theme-10/15 border border-theme-10/30 text-theme-10 flex items-center justify-center shadow-lg shadow-theme-10/10 shrink-0">
            <FolderDown size={24} className="text-theme-10" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white flex items-center gap-2">
              <span>{t('downloads.title')}</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-theme-10/20 text-theme-10 border border-theme-10/30 tracking-wider uppercase">
                Soulseek P2P
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">{t('downloads.subtitle')}</p>
          </div>
        </div>

        {/* CONNECTION STATUS & ACCOUNT BUTTON */}
        <div className="flex items-center gap-3">
          {connected ? (
            <div className="flex items-center gap-3 bg-zinc-900/70 border border-emerald-500/30 px-3.5 py-2 rounded-xl backdrop-blur-md">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-emerald-400">
                {t('downloads.connectedAs').replace('{username}', username || 'User')}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-zinc-700/60 transition cursor-pointer"
              >
                {t('downloads.logout')}
              </button>
            </div>
          ) : isConnecting ? (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 rounded-xl text-amber-400 text-xs font-medium">
              <Loader2 size={14} className="animate-spin" />
              <span>{t('downloads.connecting')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/60 px-3.5 py-2 rounded-xl text-zinc-400 text-xs font-medium">
              <User size={14} />
              <span>{t('downloads.disconnected')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. DOWNLOAD FOLDER SELECTION BAR */}
      <div className="bg-zinc-900/60 border border-theme-30/40 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
            <FolderOpen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              {t('downloads.downloadFolder')}
            </div>
            <div className="text-xs font-mono text-zinc-200 truncate mt-0.5" title={downloadFolder}>
              {downloadFolder || 'Chưa thiết lập'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSelectFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition cursor-pointer"
            title={t('downloads.changeFolder')}
          >
            <FolderSearch size={14} />
            <span>{t('downloads.changeFolder')}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition cursor-pointer"
            title={t('downloads.openFolder')}
          >
            <ExternalLink size={14} />
            <span>{t('downloads.openFolder')}</span>
          </button>
        </div>
      </div>

      {/* 3. NOT CONNECTED CALLOUT / LOGIN HERO (IF NOT LOGGED IN) */}
      {!connected && (
        <div className="bg-gradient-to-br from-theme-10/10 via-zinc-900/80 to-zinc-950 border border-theme-10/30 rounded-3xl p-6 lg:p-8 backdrop-blur-xl relative overflow-hidden">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-theme-10/20 text-theme-10 text-xs font-semibold border border-theme-10/30">
              <Sparkles size={14} />
              <span>Soulseek Lossless Music Network</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{t('downloads.loginOrRegister')}</h2>
            <p className="text-xs lg:text-sm text-zinc-300 leading-relaxed">{t('downloads.loginSubtitle')}</p>

            <form onSubmit={handleLogin} className="space-y-4 pt-2 max-w-md">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">{t('downloads.username')}</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    placeholder="VD: audiolover99"
                    className="w-full bg-zinc-950/80 border border-zinc-700/70 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-theme-10 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">{t('downloads.password')}</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-950/80 border border-zinc-700/70 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-theme-10 transition"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rememberLogin"
                  checked={rememberLogin}
                  onChange={(e) => setRememberLogin(e.target.checked)}
                  className="rounded border-zinc-700 text-theme-10 focus:ring-theme-10 cursor-pointer"
                />
                <label htmlFor="rememberLogin" className="text-xs text-zinc-400 cursor-pointer">
                  {t('downloads.autoLogin')}
                </label>
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 rounded-xl bg-theme-10 hover:bg-theme-10/90 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-theme-10/20 transition cursor-pointer disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>{isLoggingIn ? t('downloads.connecting') : t('downloads.loginButton')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. MAIN INTERFACE (TABS & CONTENT) */}
      {connected && (
        <div className="flex flex-col space-y-4 flex-1 min-h-0">
          {/* TAB SWITCHER */}
          <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-theme-10 text-white shadow-md shadow-theme-10/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Search size={15} />
                <span>{t('downloads.tabSearch')}</span>
                {searchResults.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                    {filteredAndSortedResults.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transfers')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer relative ${
                  activeTab === 'transfers'
                    ? 'bg-theme-10 text-white shadow-md shadow-theme-10/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Download size={15} />
                <span>{t('downloads.tabTransfers')}</span>
                {downloadsList.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeDownloadsCount > 0 ? 'bg-emerald-500 text-white font-bold' : 'bg-white/20 text-zinc-200'
                    }`}
                  >
                    {activeDownloadsCount > 0 ? activeDownloadsCount : downloadsList.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'transfers' && downloadsList.length > 0 && (
              <button
                type="button"
                onClick={clearCompletedDownloads}
                className="text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{t('downloads.clearFinished')}</span>
              </button>
            )}
          </div>

          {/* TAB 1: SEARCH & RESULTS */}
          {activeTab === 'search' && (
            <div className="flex flex-col space-y-3.5 flex-1 min-h-0">
              {/* SEARCH BAR */}
              <form onSubmit={handleSearch} className="flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('downloads.searchPlaceholder')}
                    className="w-full bg-zinc-900/80 border border-zinc-700/60 rounded-2xl py-2.5 pl-11 pr-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-theme-10 focus:ring-1 focus:ring-theme-10 transition"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-2.5 rounded-2xl bg-theme-10 hover:bg-theme-10/90 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-theme-10/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>{isSearching ? t('downloads.searching') : t('downloads.searchButton')}</span>
                </button>
              </form>

              {/* FILTERS & SORTERS BAR */}
              {searchResults.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-zinc-900/40 p-2 rounded-xl border border-zinc-800/80 shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mr-1 flex items-center gap-1">
                      <ListFilter size={12} /> Lọc:
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        filterMode === 'all'
                          ? 'bg-zinc-800 text-white font-medium shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t('downloads.filterAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('lossless')}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        filterMode === 'lossless'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t('downloads.filterLossless')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('320k')}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        filterMode === '320k'
                          ? 'bg-zinc-800 text-white font-medium shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t('downloads.filter320k')}
                    </button>

                    <div className="w-[1px] h-4 bg-zinc-700/60 mx-1" />

                    {/* Toggle button to combine free slots with format filter */}
                    <button
                      type="button"
                      onClick={() => setOnlyFreeSlots(!onlyFreeSlots)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                        onlyFreeSlots
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${onlyFreeSlots ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      {t('downloads.filterFreeSlots')}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {filteredAndSortedResults.length} / {searchResults.length}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider flex items-center gap-1">
                        <ArrowUpDown size={12} /> Sắp xếp:
                      </span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-zinc-800 border border-zinc-700/60 text-zinc-300 text-xs rounded-lg py-1 px-2.5 focus:outline-none cursor-pointer"
                      >
                        <option value="relevance">{t('downloads.sortRelevance')}</option>
                        <option value="speed">{t('downloads.sortSpeed')}</option>
                        <option value="bitrate">{t('downloads.sortBitrate')}</option>
                        <option value="size">{t('downloads.sortSize')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SEARCH RESULTS LIST (VIRTUALIZED WITH REACT-VIRTUOSO) */}
              <div className="flex-1 min-h-0 w-full">
                {isSearching ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 text-zinc-500 space-y-3">
                    <Loader2 size={32} className="animate-spin text-theme-10" />
                    <p className="text-sm font-medium">{t('downloads.searching')}</p>
                    <p className="text-xs text-zinc-600">Đang quét các peer trên mạng P2P Soulseek...</p>
                  </div>
                ) : searchError ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-500 space-y-2">
                    <AlertCircle size={28} className="text-zinc-600" />
                    <p className="text-sm">{searchError}</p>
                  </div>
                ) : filteredAndSortedResults.length === 0 ? (
                  searchResults.length > 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-500 space-y-3">
                      <AlertCircle size={32} className="text-zinc-600" />
                      <p className="text-sm font-medium">{t('downloads.noFilterMatches')}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterMode('all')
                          setOnlyFreeSlots(false)
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-theme-10 font-medium border border-zinc-700/60 transition cursor-pointer"
                      >
                        {t('downloads.resetFilter')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-zinc-500 space-y-3">
                      <Music size={40} className="text-zinc-700" />
                      <p className="text-sm">{t('downloads.registerTip')}</p>
                    </div>
                  )
                ) : (
                  <Virtuoso
                    style={{ height: '100%', width: '100%' }}
                    data={filteredAndSortedResults}
                    increaseViewportBy={{ top: 200, bottom: 200 }}
                    itemContent={(_index, item) => (
                      <SearchResultRow
                        key={item.id}
                        item={item}
                        download={downloads[item.id]}
                        onDownload={handleDownload}
                        onCancel={handleCancelDownload}
                        onPlay={onPlayTrack}
                        t={t}
                      />
                    )}
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TRANSFERS & QUEUE */}
          {activeTab === 'transfers' && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {downloadsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-20 text-zinc-500 space-y-3">
                  <Download size={40} className="text-zinc-700" />
                  <p className="text-sm font-medium">{t('downloads.noDownloads')}</p>
                </div>
              ) : (
                downloadsList.map((dl: SoulseekDownload) => {
                  const percent = Math.round((dl.progress || 0) * 100)
                  const isDone = dl.status === 'complete'
                  const isErr = dl.status === 'error' || dl.status === 'failed'
                  const isCancelled = dl.status === 'cancelled'

                  return (
                    <div
                      key={dl.id}
                      className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-2xl space-y-2.5 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate" title={dl.filename}>
                            {dl.filename}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                            <span>Từ: {dl.user}</span>
                            <span>•</span>
                            <span>
                              {formatBytes(dl.receivedBytes)} / {formatBytes(dl.size)}
                            </span>
                            {dl.speed > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-400 font-mono font-medium">
                                  {formatSpeed(dl.speed)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* STATUS BADGE & ACTIONS */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isDone ? (
                            <span className="text-xs text-emerald-400 font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                              {t('downloads.completed')}
                            </span>
                          ) : isErr ? (
                            <span className="text-xs text-red-400 font-semibold px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30">
                              {dl.error || 'Lỗi'}
                            </span>
                          ) : isCancelled ? (
                            <span className="text-xs text-zinc-400 px-2.5 py-1 rounded-full bg-zinc-800">
                              Đã hủy
                            </span>
                          ) : dl.status === 'queued_peer' ? (
                            <span className="text-xs text-amber-400 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                              {t('downloads.queued').replace('{place}', String(dl.queuePlace || 1))}
                            </span>
                          ) : (
                            <span className="text-xs text-theme-10 font-semibold px-2.5 py-1 rounded-full bg-theme-10/15 border border-theme-10/30">
                              {dl.status === 'downloading' ? `${percent}%` : 'Đang chuẩn bị...'}
                            </span>
                          )}

                          {/* ACTIONS */}
                          {isDone && (
                            <>
                              {onPlayTrack && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPlayTrack({
                                      id: dl.destinationPath,
                                      title: dl.filename,
                                      artist: dl.user || 'Soulseek',
                                      filePath: dl.destinationPath,
                                      isLocal: true
                                    })
                                  }
                                  className="p-2 rounded-xl bg-theme-10 hover:bg-theme-10/90 text-white transition cursor-pointer"
                                  title={t('downloads.playNow')}
                                >
                                  <Play size={14} className="fill-current" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => window.api.showInFolder(dl.destinationPath)}
                                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
                                title={t('downloads.showInFolder')}
                              >
                                <FolderOpen size={14} />
                              </button>
                            </>
                          )}

                          {!isDone && !isErr && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleCancelDownload(dl.id)}
                              className="p-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                              title={t('downloads.cancel')}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* PROGRESS BAR */}
                      {!isDone && !isErr && !isCancelled && (
                        <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-theme-10 h-full rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
