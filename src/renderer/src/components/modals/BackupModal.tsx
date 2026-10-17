import React, { useState } from 'react'
import { X, Download, Upload, FileText, ShieldCheck, Database } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useAudioStore } from '../../stores/audioStore'

// Chuẩn hóa danh sách bài hát của playlist: hỗ trợ cả `trackIds` lẫn `tracks`.
// Item có thể là string (id/filePath) hoặc object track đầy đủ; key tra cứu
// được so khớp ở cả 2 dạng dấu \ và / giống useLibraryOperations.
const resolvePlaylistTracks = (pl: any, libraryTracks: any[]): any[] => {
  const rawItems = Array.isArray(pl?.trackIds)
    ? pl.trackIds
    : Array.isArray(pl?.tracks)
      ? pl.tracks
      : []
  if (!rawItems || rawItems.length === 0) return []

  // Map tra cứu bài trong thư viện theo id/filePath
  const libraryMap = new Map<string, any>()
  for (const t of libraryTracks) {
    if (t.id) {
      libraryMap.set(t.id, t)
      libraryMap.set(String(t.id).replace(/\\/g, '/'), t)
      libraryMap.set(String(t.id).replace(/\//g, '\\'), t)
    }
    if (t.filePath) {
      libraryMap.set(t.filePath, t)
      libraryMap.set(String(t.filePath).replace(/\\/g, '/'), t)
      libraryMap.set(String(t.filePath).replace(/\//g, '\\'), t)
    }
  }

  const seen = new Set<string>()
  const resolved: any[] = []
  for (const item of rawItems) {
    const trackKey = typeof item === 'string' ? item : item?.id || item?.filePath
    if (!trackKey) continue
    const key = String(trackKey).replace(/\\/g, '/')
    if (seen.has(key)) continue
    seen.add(key)

    const found =
      libraryMap.get(trackKey) ||
      libraryMap.get(key) ||
      libraryMap.get(String(trackKey).replace(/\//g, '\\'))
    if (found) {
      resolved.push(found)
    } else if (typeof item === 'object' && item.title) {
      resolved.push(item)
    } else {
      // Bài ngoài thư viện vẫn xuất đường dẫn gốc để phần mềm khác mở được
      const fileName = String(trackKey).split('/').pop()?.split('\\').pop() || trackKey
      resolved.push({
        id: trackKey,
        filePath: trackKey,
        title: fileName.replace(/\.[^/.]+$/, ''),
        artist: 'Unknown Artist'
      })
    }
  }
  return resolved
}

export const BackupModal: React.FC = () => {
  const show = useUIStore((s) => s.showBackupModal)
  const setShow = useUIStore((s) => s.setShowBackupModal)
  const showToast = useUIStore((s) => s.showToast)

  const userPlaylists = useLibraryStore((s) => s.userPlaylists)
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const eqBands = useAudioStore((s) => s.eqBands)
  const preampGain = useAudioStore((s) => s.preampGain)

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('')

  if (!show) return null

  // 1. Xuất Playlist sang .m3u8
  const handleExportM3U8 = () => {
    const pl = userPlaylists.find(p => p.id === selectedPlaylistId) || userPlaylists[0]
    if (!pl) {
      showToast('Chưa chọn danh sách phát để xuất', 'error')
      return
    }

    const tracksToExport = resolvePlaylistTracks(pl, libraryTracks)
    if (tracksToExport.length === 0) {
      showToast(`Danh sách "${pl.name}" không có bài hát nào để xuất (.m3u8)`, 'error')
      return
    }

    let m3uContent = '#EXTM3U\n'
    m3uContent += `#PLAYLIST:${pl.name}\n\n`

    for (const t of tracksToExport) {
      const duration = Math.round(t.duration || 0)
      const artist = t.artist || 'Unknown Artist'
      const title = t.title || 'Unknown Title'
      const cleanPath = (t.filePath || '').replace(/^file:\/\/\/?/, '')
      m3uContent += `#EXTINF:${duration},${artist} - ${title}\n`
      m3uContent += `${cleanPath}\n\n`
    }

    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pl.name.replace(/[<>:"/\\|?*]/g, '_')}_playlist.m3u8`
    a.click()
    URL.revokeObjectURL(url)

    showToast(`Đã xuất danh sách "${pl.name}" (${tracksToExport.length} bài) sang tệp .m3u8 thành công`, 'success')
  }

  // 2. Nhập Playlist từ .m3u8
  const handleImportM3U8 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        if (!text) return

        const lines = text.split(/\r?\n/)
        const trackPaths: string[] = []
        let playlistName = file.name.replace(/\.m3u8?$/i, '')

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed.startsWith('#PLAYLIST:')) {
            playlistName = trimmed.replace('#PLAYLIST:', '').trim() || playlistName
          } else if (!trimmed.startsWith('#')) {
            trackPaths.push(trimmed)
          }
        }

        if (trackPaths.length === 0) {
          showToast('Tệp .m3u8 không chứa đường dẫn bài hát hợp lệ', 'error')
          return
        }

        // Tạo User Playlist mới
        const newPl = await window.api.createUserPlaylist(playlistName, 'Nhập từ tệp .m3u8', null)
        if (newPl && newPl.id) {
          await window.api.addTracksToUserPlaylist(newPl.id, trackPaths)
          const updated = await window.api.getUserPlaylists()
          useLibraryStore.getState().setUserPlaylists(updated)
          showToast(`Đã nhập danh sách "${playlistName}" (${trackPaths.length} bài) thành công`, 'success')
        }
      } catch (err: any) {
        showToast('Lỗi khi nhập tệp m3u8: ' + err.message, 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // 3. Sao lưu toàn bộ cấu hình (JSON Backup)
  const handleExportFullBackup = () => {
    const backupData = {
      version: '0.5.0',
      timestamp: Date.now(),
      date: new Date().toISOString(),
      userPlaylists,
      eqPreset: {
        preampGain,
        bands: eqBands
      },
      recentlyPlayed: useLibraryStore.getState().recentlyPlayed,
      smartAutoplay: usePlayerStore.getState().smartAutoplay,
      lyricOffset: usePlayerStore.getState().lyricOffset
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MeisRadio_Full_Backup_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast('Đã xuất bản sao lưu cấu hình toàn bộ thành công', 'success')
  }

  // 4. Khôi phục cấu hình từ file JSON Backup
  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        if (!text) return
        const data = JSON.parse(text)

        if (Array.isArray(data.userPlaylists)) {
          // Lưu lại vào backend
          for (const pl of data.userPlaylists) {
            const existing = userPlaylists.find(p => p.id === pl.id)
            if (!existing) {
              const created = await window.api.createUserPlaylist(pl.name, pl.description, pl.thumbnail)
              if (created) {
                // Fallback: bản sao lưu cũ có thể chỉ chứa `tracks` thay vì `trackIds`
                const trackIds = Array.isArray(pl.trackIds)
                  ? pl.trackIds
                  : Array.isArray(pl.tracks)
                    ? pl.tracks
                        .map((tr: any) => (typeof tr === 'string' ? tr : tr?.id || tr?.filePath))
                        .filter(Boolean)
                    : []
                if (trackIds.length > 0) {
                  await window.api.addTracksToUserPlaylist(created.id, trackIds)
                }
              }
            }
          }
          const updated = await window.api.getUserPlaylists()
          useLibraryStore.getState().setUserPlaylists(updated)
        }

        if (data.eqPreset && Array.isArray(data.eqPreset.bands)) {
          useAudioStore.getState().setEqBands(data.eqPreset.bands)
          useAudioStore.getState().setPreampGain(data.eqPreset.preampGain || 0)
        }

        showToast('Đã khôi phục dữ liệu từ tệp sao lưu thành công!', 'success')
        setShow(false)
      } catch (err: any) {
        showToast('Lỗi khi khôi phục bản sao lưu: ' + err.message, 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={() => setShow(false)}
    >
      <div 
        className="w-[580px] max-w-full bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <Database size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Sao lưu & Quản lý Playlist</h2>
              <p className="text-xs text-zinc-400">Xuất/nhập danh sách chuẩn .m3u8 và sao lưu an toàn toàn bộ dữ liệu</p>
            </div>
          </div>
          <button 
            onClick={() => setShow(false)}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-6">
          {/* Section 1: M3U8 Playlist Export / Import */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <FileText size={15} className="text-emerald-400" />
              Định dạng Playlist Tiêu chuẩn (.m3u8)
            </h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tương thích hoàn toàn với các phần mềm âm nhạc phổ biến khác (Foobar2000, VLC, MusicBee).
            </p>

            <div className="flex gap-2 items-center pt-1">
              <select 
                value={selectedPlaylistId} 
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {userPlaylists.length === 0 ? (
                  <option value="">Chưa có Playlist người dùng nào</option>
                ) : (
                  userPlaylists.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.trackIds?.length || p.tracks?.length || 0} bài)</option>
                  ))
                )}
              </select>

              <button
                onClick={handleExportM3U8}
                disabled={userPlaylists.length === 0}
                className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                <Download size={14} /> Xuất .m3u8
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-900 flex justify-between items-center">
              <span className="text-[11px] text-zinc-500">Nhập playlist có sẵn từ máy tính:</span>
              <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition">
                <Upload size={13} /> Nhập tệp .m3u8
                <input type="file" accept=".m3u,.m3u8" onChange={handleImportM3U8} className="hidden" />
              </label>
            </div>
          </div>

          {/* Section 2: Full System Config Backup */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <ShieldCheck size={15} className="text-purple-400" />
              Bản sao lưu Toàn bộ Cấu hình (.json)
            </h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Lưu giữ toàn bộ User Playlists, cấu hình Equalizer tùy biến, lịch sử nghe và thiết lập cá nhân.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleExportFullBackup}
                className="flex-1 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download size={15} /> Sao lưu toàn bộ cấu hình
              </button>

              <label className="flex-1 cursor-pointer py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/80 text-zinc-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition">
                <Upload size={15} /> Khôi phục từ bản sao lưu
                <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={() => setShow(false)}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
