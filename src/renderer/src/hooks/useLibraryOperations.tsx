import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLibraryStore, usePlayerStore, useUIStore, useSettingsStore } from '../stores'
import { useTranslation, useLanguage } from '../locales'
import { splitArtistString } from '../utils/textUtils'
import type { ContextMenuItem } from '../components/ContextMenu'
import React from 'react'
import {
  Play,
  Plus,
  ListPlus,
  Disc,
  FolderPlus,
  Info,
  Edit2,
  FolderOpen,
  RefreshCw,
  Music,
  Trash2,
  Radio,
  ImageIcon,
  Sparkles
} from 'lucide-react'

interface UseLibraryOperationsProps {
  handleRowClick: (track: any, contextList?: any[]) => void
  handleStartRadio: (seedTrack?: any) => void
}

export function useLibraryOperations({
  handleRowClick,
  handleStartRadio
}: UseLibraryOperationsProps) {
  const { t } = useTranslation()
  const { language } = useLanguage()

  const {
    setLibraryPath,
    libraryPaths,
    setLibraryPaths,
    libraryTracks,
    setLibraryTracks,
    playlists,
    setPlaylists,
    userPlaylists,
    setUserPlaylists,
    activePlaylist,
    setActivePlaylist,
    activeUserPlaylist,
    setActiveUserPlaylist,
    setPreAggregatedData
  } = useLibraryStore()

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlayQueue = usePlayerStore((s) => s.setPlayQueue)

  const {
    activeView,
    setActiveView,
    showToast,
    setCustomDialog,
    setShowCreateModal,
    setShowAddSongsModal,
    setShowCreateUserPlaylistModal,
    setShowAddSongsToUserPlaylistModal,
    setEditingUserPlaylist,
    setShowEditUserPlaylistModal,
    playlistRename,
    setPlaylistRename
  } = useUIStore()

  const setIsReloading = useSettingsStore((s) => s.setIsReloading)

  // Tag Editor & Track Info States
  const [editingTrack, setEditingTrack] = useState<any | null>(null)
  const [infoTrack, setInfoTrack] = useState<any | null>(null)
  const [editTags, setEditTags] = useState<{
    title: string
    artist: string
    album: string
    albumArtist?: string
    genre?: string
    year?: string | number
    trackNumber?: string | number
    discNumber?: string | number
    lyrics: string
    [key: string]: any
  }>({
    title: '',
    artist: '',
    album: '',
    albumArtist: '',
    genre: '',
    year: '',
    trackNumber: '',
    discNumber: '',
    lyrics: ''
  })
  const [editImagePath, setEditImagePath] = useState<string | null>(null)

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const showConfirm = useCallback(
    (options: {
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
    },
    [setCustomDialog]
  )

  const showAlert = useCallback(
    (options: {
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
    },
    [setCustomDialog]
  )

  // --- Library Management ---
  const loadLibrary = useCallback(
    async (forceRefresh: boolean = false, hardRescan: boolean = false) => {
      // @ts-ignore
      const res = await window.api?.getLibrary?.(forceRefresh, hardRescan)
      if (res?.success) {
        setLibraryPath(res.libraryPath)
        setLibraryPaths(res.libraryPaths || (res.libraryPath ? [res.libraryPath] : []))
        setLibraryTracks(res.tracks || [])
        setPlaylists(res.playlists || [])
        setUserPlaylists(res.userPlaylists || [])
        if (res.preAggregated) {
          setPreAggregatedData(res.preAggregated)
        }
      }
    },
    [
      setLibraryPath,
      setLibraryPaths,
      setLibraryTracks,
      setPlaylists,
      setUserPlaylists,
      setPreAggregatedData
    ]
  )

  // Đồng bộ Active Playlist
  useEffect(() => {
    if (activePlaylist) {
      const updated = playlists.find((p) => p.name === activePlaylist.name)
      if (updated && updated.tracks.length !== activePlaylist.tracks.length) {
        setActivePlaylist(updated)
      }
    }
  }, [playlists, activePlaylist, setActivePlaylist])

  // Đồng bộ Active User Playlist
  useEffect(() => {
    if (activeUserPlaylist) {
      const updated = userPlaylists.find((p) => p.id === activeUserPlaylist.id)
      if (updated) {
        setActiveUserPlaylist(updated)
      }
    }
  }, [userPlaylists, activeUserPlaylist, setActiveUserPlaylist])

  const handleReloadLibrary = useCallback(
    async (hardRescan?: boolean | any) => {
      const isHard = typeof hardRescan === 'boolean' ? hardRescan : false
      setIsReloading(true)
      try {
        await loadLibrary(true, isHard)
      } catch (e) {
        console.error(e)
      } finally {
        setTimeout(() => setIsReloading(false), 500)
      }
    },
    [loadLibrary, setIsReloading]
  )

  const handleAddLibraryFolder = useCallback(async () => {
    // @ts-ignore
    const res = await window.api?.addLibraryFolder?.()
    if (res?.success) {
      setLibraryPaths(res.libraryPaths)
      showToast(t('toasts.librarySavedSuccess'), 'success')
      loadLibrary(true)
    }
  }, [setLibraryPaths, showToast, t, loadLibrary])

  const handleRemoveLibraryFolder = useCallback(
    async (folderPath: string) => {
      if (libraryPaths.length <= 1) {
        showConfirm({
          title: t('common.warning'),
          message: t('settings.library.removeFolder') + '?',
          danger: true,
          onConfirm: async () => {
            // @ts-ignore
            const res = await window.api?.removeLibraryFolder?.(folderPath)
            if (res?.success) {
              setLibraryPaths(res.libraryPaths)
              showToast(t('toasts.removedFromPlaylist'), 'success')
              loadLibrary(true)
            }
          }
        })
        return
      }
      // @ts-ignore
      const res = await window.api?.removeLibraryFolder?.(folderPath)
      if (res?.success) {
        setLibraryPaths(res.libraryPaths)
        showToast(t('toasts.removedFromPlaylist'), 'success')
        loadLibrary(true)
      }
    },
    [libraryPaths.length, showConfirm, t, setLibraryPaths, showToast, loadLibrary]
  )

  const handleUpdateLibraryFolder = useCallback(
    async (oldPath: string) => {
      // @ts-ignore
      const res = await window.api?.updateLibraryFolder?.(oldPath)
      if (res?.success) {
        setLibraryPaths(res.libraryPaths)
        showToast(t('toasts.librarySavedSuccess'), 'success')
        loadLibrary(true)
      }
    },
    [setLibraryPaths, showToast, t, loadLibrary]
  )

  // --- Playlists Management ---
  const handleCreatePlaylistSubmit = useCallback(
    async (name: string) => {
      // @ts-ignore
      const res = await window.api?.createPlaylist?.(name)
      if (res?.success) {
        showToast(t('toasts.playlistCreated'), 'success')
        setShowCreateModal(false)
        loadLibrary()
      } else {
        showAlert({ title: t('common.error'), message: 'Error: ' + res?.error })
      }
    },
    [showToast, t, setShowCreateModal, loadLibrary, showAlert]
  )

  const handleAddTracksToActivePlaylist = useCallback(
    async (tracksToAdd: any[]) => {
      if (!activePlaylist) return
      for (const track of tracksToAdd) {
        const rawTrackPath = track.id || track.filePath
        if (rawTrackPath) {
          // @ts-ignore
          await window.api?.addTrackToPlaylist?.(activePlaylist.name, rawTrackPath)
        }
      }
      showToast(t('toasts.tracksAddedToPlaylist', { count: tracksToAdd.length }), 'success')
      setShowAddSongsModal(false)
      loadLibrary()
    },
    [activePlaylist, showToast, t, setShowAddSongsModal, loadLibrary]
  )

  // --- Virtual User Playlists Handlers ---
  const handleCreateUserPlaylist = useCallback(
    async (name: string) => {
      // @ts-ignore
      const res = await window.api?.createUserPlaylist?.(name)
      if (res?.success) {
        setUserPlaylists(res.playlists)
        setShowCreateUserPlaylistModal(false)
        showToast(t('toasts.playlistCreated', { name }), 'success')
        setActiveUserPlaylist(res.playlist)
        setActiveView('user-playlists')
      } else if (res?.error) {
        showAlert({ title: t('common.error'), message: res.error })
      }
    },
    [
      setUserPlaylists,
      setShowCreateUserPlaylistModal,
      showToast,
      t,
      setActiveUserPlaylist,
      setActiveView,
      showAlert
    ]
  )

  const handleDeleteUserPlaylist = useCallback(
    async (playlist: any) => {
      showConfirm({
        title: t('userPlaylistsView.deletePlaylist'),
        message: t('userPlaylistsView.confirmDelete', { name: playlist.name }),
        danger: true,
        onConfirm: async () => {
          // @ts-ignore
          const res = await window.api?.deleteUserPlaylist?.(playlist.id)
          if (res?.success) {
            setUserPlaylists(res.playlists)
            if (activeUserPlaylist?.id === playlist.id) {
              setActiveUserPlaylist(null)
            }
            showToast(t('toasts.playlistDeleted', { name: playlist.name }), 'success')
          }
        }
      })
    },
    [showConfirm, t, setUserPlaylists, activeUserPlaylist?.id, setActiveUserPlaylist, showToast]
  )

  const handleChangeUserPlaylistCover = useCallback(
    async (playlistId: string) => {
      // @ts-ignore
      const res = await window.api?.setUserPlaylistThumbnail?.(playlistId)
      if (res?.success) {
        setUserPlaylists(res.playlists)
        if (activeUserPlaylist && activeUserPlaylist.id === playlistId && res.playlist) {
          setActiveUserPlaylist(res.playlist)
        }
        showToast(t('toasts.coverChangedSuccess'), 'success')
      }
    },
    [setUserPlaylists, activeUserPlaylist, setActiveUserPlaylist, showToast, t]
  )

  const handleSaveEditUserPlaylist = useCallback(
    async (
      playlistId: string,
      updates: {
        name: string
        description: string
        thumbnail?: string | null
        customImagePath?: string
      }
    ) => {
      // @ts-ignore
      const res = await window.api?.updateUserPlaylist?.(playlistId, updates)
      if (res?.success) {
        setUserPlaylists(res.playlists)
        if (activeUserPlaylist && activeUserPlaylist.id === playlistId) {
          setActiveUserPlaylist(res.playlist)
        }
        showToast(t('toasts.playlistUpdatedSuccess'), 'success')
      } else {
        showAlert({
          title: t('common.error'),
          message: res?.error || t('toasts.deletePlaylistError')
        })
      }
    },
    [setUserPlaylists, activeUserPlaylist, setActiveUserPlaylist, showToast, t, showAlert]
  )

  const handleAddSongsToUserPlaylist = useCallback(
    async (selectedTracks: any[]) => {
      if (!activeUserPlaylist) return
      const trackPaths = selectedTracks.map((trk) => trk.id || trk.filePath)
      // @ts-ignore
      const res = await window.api?.addTracksToUserPlaylist?.(activeUserPlaylist.id, trackPaths)
      if (res?.success) {
        setUserPlaylists(res.playlists)
        if (res.playlist) {
          setActiveUserPlaylist(res.playlist)
        }
        setShowAddSongsToUserPlaylistModal(false)
        showToast(t('toasts.tracksAddedToPlaylist', { count: selectedTracks.length }), 'success')
      }
    },
    [
      activeUserPlaylist,
      setUserPlaylists,
      setActiveUserPlaylist,
      setShowAddSongsToUserPlaylistModal,
      showToast,
      t
    ]
  )

  const handleAutoGeneratePlaylists = useCallback(async () => {
    showConfirm({
      title: t('settings.library.autoCategorize'),
      message: t('toasts.autoCategorizeConfirm'),
      onConfirm: async () => {
        // @ts-ignore
        const res = await window.api?.autoGeneratePlaylists?.()
        if (res?.success) {
          showToast(t('toasts.autoCategorizeSuccess', { count: res.movedCount }), 'success')
          loadLibrary()
        }
      }
    })
  }, [showConfirm, t, showToast, loadLibrary])

  const handleImportFiles = useCallback(async () => {
    const targetFolder =
      activeView === 'playlists' && activePlaylist ? activePlaylist.name : undefined
    // @ts-ignore
    const res = await window.api?.importLocalFiles?.(targetFolder, libraryTracks)
    if (res?.success) {
      if (res.tracks.length > 0) {
        showToast(t('toasts.tracksAddedToPlaylist', { count: res.tracks.length }), 'success')
        loadLibrary()
      }
    } else if (res?.error) {
      showAlert({ title: t('common.error'), message: res.error })
    }
  }, [activeView, activePlaylist, libraryTracks, showToast, t, loadLibrary, showAlert])

  const handleRenameSubmit = useCallback(async () => {
    const cleanNewName = playlistRename.newName
      .trim()
      .replace(/[\s.]+$/, '')
      .trim()
    if (!cleanNewName || cleanNewName === playlistRename.oldName) {
      setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
      return
    }
    if (playlistRename.id) {
      // @ts-ignore
      const res = await window.api?.renameUserPlaylist?.(playlistRename.id, cleanNewName)
      if (res?.success) {
        setUserPlaylists(res.playlists)
        setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
        showToast(t('toasts.playlistRenamedSuccess'), 'success')
      } else {
        showAlert({ title: t('common.error'), message: res?.error || 'Error renaming playlist' })
      }
    } else {
      // @ts-ignore
      const res = await window.api?.renamePlaylist?.(playlistRename.oldName, cleanNewName)
      if (res?.success) {
        setPlaylistRename({ isOpen: false, oldName: '', newName: '', id: undefined })
        loadLibrary()
      } else {
        showAlert({ title: t('common.error'), message: 'Error renaming playlist: ' + res?.error })
      }
    }
  }, [playlistRename, setPlaylistRename, setUserPlaylists, showToast, t, showAlert, loadLibrary])

  const handleExtractPlaylistImage = useCallback(
    async (playlistName: string) => {
      // @ts-ignore
      const res = await window.api?.extractPlaylistThumbnail?.(playlistName)
      if (res?.success) {
        showToast(t('toasts.coverUpdatedSuccess'), 'success')
        loadLibrary()
      } else {
        showAlert({ title: t('common.error'), message: res?.error || 'Error' })
      }
    },
    [showToast, t, loadLibrary, showAlert]
  )

  const handleChangePlaylistImage = useCallback(
    async (playlistName: string) => {
      // @ts-ignore
      const res = await window.api?.setPlaylistThumbnail?.(playlistName)
      if (res?.success) {
        showToast(t('toasts.coverChangeSuccess'), 'success')
        loadLibrary()
      }
    },
    [showToast, t, loadLibrary]
  )

  // Track Info Modal
  const openTrackInfo = useCallback((track: any, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setInfoTrack(track)
  }, [])

  // Tag Editor
  const openTagEditor = useCallback((track: any, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!track) return
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
      albumArtist: track.albumArtist || '',
      genre:
        track.genre && track.genre !== 'Unknown' && track.genre !== 'Chưa phân loại'
          ? track.genre
          : '',
      year: track.year || '',
      trackNumber: track.trackNumber || '',
      discNumber: track.discNumber || '',
      lyrics: rawLyrics
    })
    setEditImagePath(null)

    if (!rawLyrics && (window as any).api?.readLrcFile) {
      const targetPath = track.filePath || track.id
      if (targetPath) {
        ;(window as any).api
          .readLrcFile(targetPath)
          .then((lrc: string | null) => {
            if (lrc) {
              setEditTags((prev) => ({ ...prev, lyrics: lrc }))
            }
          })
          .catch(() => {})
      }
    }
  }, [])

  const handleSelectTagImage = useCallback(async () => {
    // @ts-ignore
    const path = await window.api?.selectImageFile?.()
    if (path) setEditImagePath(path)
  }, [])

  const saveTags = useCallback(async () => {
    if (!editingTrack) return
    const targetPath = editingTrack.filePath || editingTrack.id
    if (!targetPath) return
    // @ts-ignore
    const res = await window.api?.updateTags?.(targetPath, editTags, editImagePath)
    if (res?.success) {
      showToast(res.note || t('toasts.tagSavedSuccess'), 'success')
      const newCover = res.coverUrl || currentTrack?.coverArt
      const newParsedArtists = splitArtistString(editTags.artist)
      const effectiveArtists = newParsedArtists.length > 0 ? newParsedArtists : [editTags.artist]
      setLibraryTracks((prev) =>
        prev.map((trk) => {
          if (trk.id === editingTrack.id || trk.filePath === editingTrack.filePath) {
            return {
              ...trk,
              title: editTags.title,
              artist: editTags.artist,
              artists: effectiveArtists,
              album: editTags.album,
              albumArtist: editTags.albumArtist,
              genre: editTags.genre,
              year: editTags.year,
              trackNumber: editTags.trackNumber,
              discNumber: editTags.discNumber,
              lyrics: editTags.lyrics,
              coverArt: newCover || trk.coverArt
            }
          }
          return trk
        })
      )
      if (
        currentTrack &&
        (currentTrack.id === editingTrack.id || currentTrack.filePath === editingTrack.filePath)
      ) {
        setCurrentTrack({
          ...currentTrack,
          title: editTags.title,
          artist: editTags.artist,
          artists: effectiveArtists,
          album: editTags.album,
          albumArtist: editTags.albumArtist,
          genre: editTags.genre,
          year: editTags.year,
          trackNumber: editTags.trackNumber,
          discNumber: editTags.discNumber,
          lyrics: editTags.lyrics,
          coverArt: newCover || currentTrack.coverArt
        })
      }
      setEditingTrack(null)
      loadLibrary()
    } else {
      showToast('Error: ' + res?.error, 'error')
    }
  }, [
    editingTrack,
    editTags,
    editImagePath,
    showToast,
    t,
    currentTrack,
    setLibraryTracks,
    setCurrentTrack,
    loadLibrary
  ])

  // Context Menu Handlers
  const libraryTrackMap = useMemo(() => {
    const map = new Map<string, any>()
    for (const trk of libraryTracks) {
      if (trk.id) {
        map.set(trk.id, trk)
        map.set(String(trk.id).replace(/\\/g, '/'), trk)
        map.set(String(trk.id).replace(/\//g, '\\'), trk)
      }
      if (trk.filePath) {
        map.set(trk.filePath, trk)
        map.set(String(trk.filePath).replace(/\\/g, '/'), trk)
        map.set(String(trk.filePath).replace(/\//g, '\\'), trk)
      }
    }
    return map
  }, [libraryTracks])

  const getResolvedUserPlaylistTracks = useCallback(
    (upl: any) => {
      const rawTrackIds = Array.isArray(upl?.trackIds)
        ? upl.trackIds
        : Array.isArray(upl?.tracks)
          ? upl.tracks
          : []
      if (!rawTrackIds || rawTrackIds.length === 0) return []
      const resolved: any[] = []
      for (const item of rawTrackIds) {
        const trackId = typeof item === 'string' ? item : item?.id || item?.filePath
        if (!trackId) continue
        const found =
          libraryTrackMap.get(trackId) ||
          libraryTrackMap.get(String(trackId).replace(/\\/g, '/')) ||
          libraryTrackMap.get(String(trackId).replace(/\//g, '\\'))
        if (found) {
          resolved.push(found)
        } else if (typeof item === 'object' && item.title) {
          resolved.push(item)
        } else {
          const title = String(trackId).split('/').pop()?.split('\\').pop() || trackId
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
    },
    [libraryTrackMap]
  )

  const handleTrackContextMenu = useCallback(
    (track: any, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const isInsidePlaylist = activeView === 'playlists' && activePlaylist
      const isInsideUserPlaylist = activeView === 'user-playlists' && activeUserPlaylist

      const userPlaylistSubItems = userPlaylists.map((upl) => ({
        id: `upl-${upl.id}`,
        label: upl.name,
        icon: <ListPlus size={14} />,
        onClick: async () => {
          const rawTrackPath = track.id || track.filePath
          // @ts-ignore
          const res = await window.api?.addTracksToUserPlaylist?.(upl.id, [rawTrackPath])
          if (res?.success) {
            setUserPlaylists(res.playlists)
            if (activeUserPlaylist?.id === upl.id && res.playlist) {
              setActiveUserPlaylist(res.playlist)
            }
            showToast(t('toasts.addedToPlaylist', { name: upl.name }), 'success')
          }
        }
      }))

      const folderPlaylistSubItems = playlists.map((pl) => ({
        id: `pl-${pl.name}`,
        label: pl.name,
        icon: <Disc size={14} />,
        onClick: async () => {
          const rawTrackPath = track.id || track.filePath
          // @ts-ignore
          await window.api?.addTrackToPlaylist?.(pl.name, rawTrackPath)
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
        ...(userPlaylistSubItems.length > 0
          ? [{ id: 'div-upl', label: '', divider: true }, ...userPlaylistSubItems]
          : []),
        ...(folderPlaylistSubItems.length > 0
          ? [{ id: 'div-fpl', label: '', divider: true }, ...folderPlaylistSubItems]
          : [])
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
            setPlayQueue((prev) => [...prev, track])
            showToast(t('toasts.addedToQueue', { title: track.title }), 'success')
          }
        },
        {
          id: 'start-radio',
          label:
            language === 'vi'
              ? 'Khởi tạo Smart Radio từ bài này'
              : 'Start Smart Radio from this track',
          icon: <Radio size={14} />,
          onClick: () => handleStartRadio(track)
        },
        {
          id: 'add-to-playlist',
          label: t('contextMenu.addToPlaylist'),
          icon: <FolderPlus size={14} />,
          subItems: playlistSubItems
        },
        { id: 'div-1', label: '', divider: true },
        {
          id: 'view-info',
          label: t('contextMenu.viewInfo'),
          icon: <Info size={14} />,
          onClick: () => openTrackInfo(track, e)
        },
        {
          id: 'edit-tags',
          label: t('contextMenu.editTags'),
          icon: <Edit2 size={14} />,
          disabled: track.isCloud || track.isCueTrack,
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
            await window.api?.showInFolder?.(rawTrackPath)
          }
        },
        {
          id: 'convert-format',
          label:
            language === 'vi'
              ? 'Chuyển đổi định dạng / Trích xuất (FFmpeg)'
              : 'Convert Format / Extract',
          icon: <RefreshCw size={14} />,
          disabled: track.isCloud,
          subItems: [
            {
              id: 'convert-flac',
              label: 'FLAC (Lossless)',
              icon: <Music size={14} />,
              onClick: async () => {
                showToast(
                  language === 'vi'
                    ? `Đang chuyển đổi "${track.title}" sang FLAC...`
                    : `Converting "${track.title}" to FLAC...`,
                  'info'
                )
                try {
                  // @ts-ignore
                  const res = await window.api?.convertAudioTrack?.(
                    {
                      filePath: track.filePath || track.id,
                      title: track.title,
                      artist: track.artist,
                      album: track.album,
                      startTime: track.startTime,
                      endTime: track.endTime
                    },
                    'flac'
                  )
                  if (res?.success) {
                    showToast(
                      language === 'vi'
                        ? `Chuyển đổi thành công: ${res.outputPath}`
                        : `Conversion completed: ${res.outputPath}`,
                      'success'
                    )
                  } else if (res && !res.canceled) {
                    showAlert({
                      title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                      message: res.error || 'Failed to convert audio'
                    })
                  }
                } catch (err: any) {
                  showAlert({
                    title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                    message: err?.message || String(err)
                  })
                }
              }
            },
            {
              id: 'convert-mp3',
              label: 'MP3 (320kbps)',
              icon: <Music size={14} />,
              onClick: async () => {
                showToast(
                  language === 'vi'
                    ? `Đang chuyển đổi "${track.title}" sang MP3...`
                    : `Converting "${track.title}" to MP3...`,
                  'info'
                )
                try {
                  // @ts-ignore
                  const res = await window.api?.convertAudioTrack?.(
                    {
                      filePath: track.filePath || track.id,
                      title: track.title,
                      artist: track.artist,
                      album: track.album,
                      startTime: track.startTime,
                      endTime: track.endTime
                    },
                    'mp3'
                  )
                  if (res?.success) {
                    showToast(
                      language === 'vi'
                        ? `Chuyển đổi thành công: ${res.outputPath}`
                        : `Conversion completed: ${res.outputPath}`,
                      'success'
                    )
                  } else if (res && !res.canceled) {
                    showAlert({
                      title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                      message: res.error || 'Failed to convert audio'
                    })
                  }
                } catch (err: any) {
                  showAlert({
                    title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                    message: err?.message || String(err)
                  })
                }
              }
            },
            {
              id: 'convert-wav',
              label: 'WAV (PCM 16-bit)',
              icon: <Music size={14} />,
              onClick: async () => {
                showToast(
                  language === 'vi'
                    ? `Đang chuyển đổi "${track.title}" sang WAV...`
                    : `Converting "${track.title}" to WAV...`,
                  'info'
                )
                try {
                  // @ts-ignore
                  const res = await window.api?.convertAudioTrack?.(
                    {
                      filePath: track.filePath || track.id,
                      title: track.title,
                      artist: track.artist,
                      album: track.album,
                      startTime: track.startTime,
                      endTime: track.endTime
                    },
                    'wav'
                  )
                  if (res?.success) {
                    showToast(
                      language === 'vi'
                        ? `Chuyển đổi thành công: ${res.outputPath}`
                        : `Conversion completed: ${res.outputPath}`,
                      'success'
                    )
                  } else if (res && !res.canceled) {
                    showAlert({
                      title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                      message: res.error || 'Failed to convert audio'
                    })
                  }
                } catch (err: any) {
                  showAlert({
                    title: language === 'vi' ? 'Lỗi chuyển đổi' : 'Conversion Error',
                    message: err?.message || String(err)
                  })
                }
              }
            }
          ]
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
                const res = await window.api?.removeTrackFromUserPlaylist?.(
                  activeUserPlaylist.id,
                  rawTrackPath
                )
                if (res?.success) {
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
              message: t('contextMenu.confirmRemoveFromPlaylist', {
                title: track.title,
                name: activePlaylist.name
              }),
              danger: true,
              onConfirm: async () => {
                const rawTrackPath = track.id || track.filePath
                // @ts-ignore
                await window.api?.deleteTrack?.(rawTrackPath, false)
                await (
                  await import('../utils/trackStateUtils')
                ).removeTrackKeysFromStores([rawTrackPath])
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
              const res = await window.api?.deleteTrack?.(rawTrackPath, true)
              if (res?.success) {
                await (
                  await import('../utils/trackStateUtils')
                ).removeTrackKeysFromStores([rawTrackPath])
                showToast(t('toasts.movedToTrash', { title: track.title }), 'success')
                loadLibrary()
              } else {
                showAlert({
                  title: t('common.error'),
                  message: 'Error deleting track: ' + res?.error
                })
              }
            }
          })
        }
      })

      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [
      activeView,
      activePlaylist,
      activeUserPlaylist,
      userPlaylists,
      playlists,
      libraryTracks,
      handleRowClick,
      handleStartRadio,
      openTrackInfo,
      openTagEditor,
      showConfirm,
      showAlert,
      showToast,
      t,
      language,
      loadLibrary,
      setPlayQueue,
      setUserPlaylists,
      setActiveUserPlaylist,
      setShowCreateUserPlaylistModal
    ]
  )

  const handlePlaylistContextMenu = useCallback(
    (pl: any, e: React.MouseEvent) => {
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
          onClick: () =>
            setPlaylistRename({ isOpen: true, oldName: pl.name, newName: pl.name, id: undefined })
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
            await window.api?.showInFolder?.(pl.path)
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
                const res = await window.api?.deletePlaylist?.(pl.name)
                if (res?.success) {
                  showToast(t('toasts.playlistDeleted', { name: pl.name }), 'success')
                  if (activePlaylist?.name === pl.name) setActivePlaylist(null)
                  loadLibrary()
                } else {
                  showAlert({
                    title: t('common.error'),
                    message: 'Error deleting playlist: ' + res?.error
                  })
                }
              }
            })
          }
        }
      ]

      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [
      t,
      handleRowClick,
      setActivePlaylist,
      setShowAddSongsModal,
      setPlaylistRename,
      handleChangePlaylistImage,
      handleExtractPlaylistImage,
      showConfirm,
      activePlaylist?.name,
      loadLibrary,
      showToast,
      showAlert
    ]
  )

  const handleUserPlaylistContextMenu = useCallback(
    (upl: any, e: React.MouseEvent) => {
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
    },
    [
      getResolvedUserPlaylistTracks,
      t,
      handleRowClick,
      setActiveUserPlaylist,
      setShowAddSongsToUserPlaylistModal,
      setEditingUserPlaylist,
      setShowEditUserPlaylistModal,
      handleDeleteUserPlaylist
    ]
  )

  const handleArtistContextMenu = useCallback(
    (artist: any, e: React.MouseEvent) => {
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
          id: 'start-radio',
          label:
            language === 'vi'
              ? `Khởi tạo Smart Radio từ ${artist.name}`
              : `Start Smart Radio from ${artist.name}`,
          icon: <Radio size={14} />,
          disabled: !artist.tracks || artist.tracks.length === 0,
          onClick: () => {
            if (artist.tracks && artist.tracks.length > 0) {
              handleStartRadio(artist.tracks[0])
            }
          }
        }
      ]

      setContextMenu({ x: e.clientX, y: e.clientY, items })
    },
    [t, language, handleRowClick, handleStartRadio]
  )

  return {
    editingTrack,
    setEditingTrack,
    infoTrack,
    setInfoTrack,
    editTags,
    setEditTags,
    editImagePath,
    setEditImagePath,
    contextMenu,
    setContextMenu,
    loadLibrary,
    handleReloadLibrary,
    handleAddLibraryFolder,
    handleRemoveLibraryFolder,
    handleUpdateLibraryFolder,
    handleCreatePlaylistSubmit,
    handleAddTracksToActivePlaylist,
    handleCreateUserPlaylist,
    handleDeleteUserPlaylist,
    handleChangeUserPlaylistCover,
    handleSaveEditUserPlaylist,
    handleAddSongsToUserPlaylist,
    handleAutoGeneratePlaylists,
    handleImportFiles,
    handleRenameSubmit,
    handleExtractPlaylistImage,
    handleChangePlaylistImage,
    openTagEditor,
    saveTags,
    handleSelectTagImage,
    openTrackInfo,
    handleTrackContextMenu,
    handlePlaylistContextMenu,
    handleUserPlaylistContextMenu,
    handleArtistContextMenu,
    libraryTrackMap,
    getResolvedUserPlaylistTracks,
    showConfirm,
    showAlert
  }
}
