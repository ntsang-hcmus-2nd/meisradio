import React, { useMemo } from 'react'
import { X, BarChart3, Clock, Disc3, Mic2, Music2, Sparkles, Headphones } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { splitArtistString } from '../../utils/textUtils'
import { isDsdTrack } from '../../utils/formatUtils'

export const MusicInsightsModal: React.FC = () => {
  const show = useUIStore((s) => s.showInsightsModal)
  const setShow = useUIStore((s) => s.setShowInsightsModal)

  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed)

  // Compute insights
  const stats = useMemo(() => {
    const totalTracks = libraryTracks.length

    // 1. Format distribution
    let flacCount = 0
    let dsdCount = 0
    let mp3Count = 0
    let otherCount = 0
    let onlineCount = 0

    // 2. Artist counts
    const artistCounts = new Map<string, number>()
    // 3. Genre counts
    const genreCounts = new Map<string, number>()

    let totalDurationSec = 0

    for (const t of libraryTracks) {
      const fmt = (t.format || '').toUpperCase()
      const ext = (t.filePath || '').toLowerCase()
      if (t.isOnline || t.isCloud) onlineCount++
      else if (isDsdTrack(t)) dsdCount++
      else if (t.lossless || fmt.includes('FLAC') || ext.endsWith('.flac') || ext.endsWith('.wav') || ext.endsWith('.alac') || ext.endsWith('.aiff')) flacCount++
      else if (fmt.includes('MP3') || ext.endsWith('.mp3')) mp3Count++
      else otherCount++

      if (t.duration && !isNaN(t.duration)) {
        totalDurationSec += t.duration
      }

      // Artists
      const rawArtists = (Array.isArray(t.artists) && t.artists.length > 0)
        ? t.artists
        : splitArtistString(t.artist || '')

      for (const a of rawArtists) {
        const cleanA = (a || '').trim()
        if (cleanA && cleanA.toLowerCase() !== 'unknown' && cleanA.toLowerCase() !== 'unknown artist') {
          artistCounts.set(cleanA, (artistCounts.get(cleanA) || 0) + 1)
        }
      }

      // Genre
      const g = (t.genre || '').trim()
      if (g && g.toLowerCase() !== 'unknown') {
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1)
      }
    }

    const sortedArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const sortedGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const totalHours = Math.floor(totalDurationSec / 3600)
    const totalMinutes = Math.floor((totalDurationSec % 3600) / 60)

    const totalLosslessCount = flacCount + dsdCount
    const losslessPercent = totalTracks > 0 ? Math.round((totalLosslessCount / totalTracks) * 100) : 0
    const mp3Percent = totalTracks > 0 ? Math.round((mp3Count / totalTracks) * 100) : 0
    const otherPercent = Math.max(0, 100 - losslessPercent - mp3Percent)

    return {
      totalTracks,
      totalHours,
      totalMinutes,
      sortedArtists,
      sortedGenres,
      losslessPercent,
      mp3Percent,
      otherPercent,
      flacCount,
      dsdCount,
      totalLosslessCount,
      recentCount: recentlyPlayed.length
    }
  }, [libraryTracks, recentlyPlayed])

  if (!show) return null

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={() => setShow(false)}
    >
      <div 
        className="w-[680px] max-w-full bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
              <BarChart3 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Mei's Music Insights
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Thống kê cá nhân
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Tổng quan về thói quen thưởng thức và thư viện âm nhạc của bạn</p>
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
        <div className="py-5 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Music2 size={15} className="text-emerald-400" />
                <span>Thư viện nhạc</span>
              </div>
              <p className="text-2xl font-black text-white">{stats.totalTracks.toLocaleString()}</p>
              <p className="text-[11px] text-zinc-500 mt-1">bài hát sẵn sàng</p>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Clock size={15} className="text-amber-400" />
                <span>Tổng thời lượng</span>
              </div>
              <p className="text-2xl font-black text-white">{stats.totalHours}h {stats.totalMinutes}m</p>
              <p className="text-[11px] text-zinc-500 mt-1">nghe nhạc không ngừng</p>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Headphones size={15} className="text-purple-400" />
                <span>Lossless Hi-Res</span>
              </div>
              <p className="text-2xl font-black text-white">{stats.losslessPercent}%</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {stats.flacCount} tệp FLAC/WAV{stats.dsdCount > 0 ? ` • ${stats.dsdCount} tệp DSD` : ''}
              </p>
            </div>
          </div>

          {/* Lossless Quality Progress Bar */}
          <div className="bg-zinc-950/40 border border-zinc-800/60 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-yellow-400" />
                Chất lượng âm thanh thư viện
              </span>
              <span className="text-zinc-500 text-[11px] font-mono">
                {stats.losslessPercent}% Lossless • {stats.mp3Percent}% MP3 • {stats.otherPercent}% Định dạng khác
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden flex bg-zinc-800">
              <div 
                style={{ width: `${stats.losslessPercent}%` }} 
                className="bg-emerald-500 h-full transition-all" 
                title={`Lossless (${stats.flacCount} FLAC/WAV${stats.dsdCount > 0 ? `, ${stats.dsdCount} DSD` : ''})`} 
              />
              <div style={{ width: `${stats.mp3Percent}%` }} className="bg-sky-500 h-full transition-all" title="MP3 / Compressed" />
              <div style={{ width: `${stats.otherPercent}%` }} className="bg-zinc-600 h-full transition-all" title="Định dạng khác" />
            </div>
          </div>

          {/* Top Artists & Top Genres */}
          <div className="grid grid-cols-2 gap-4">
            {/* Top Artists */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 p-4 rounded-2xl">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Mic2 size={14} className="text-rose-400" />
                Top Nghệ sĩ phổ biến nhất
              </h3>
              {stats.sortedArtists.length === 0 ? (
                <p className="text-zinc-600 text-xs py-4 text-center">Chưa đủ dữ liệu nghệ sĩ</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.sortedArtists.map(([artist, count], i) => (
                    <div key={artist} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-zinc-700 text-zinc-300' :
                          i === 2 ? 'bg-orange-800/30 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-zinc-300 font-medium truncate">{artist}</span>
                      </div>
                      <span className="text-zinc-500 text-[11px] font-mono shrink-0">{count} bài</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Genres */}
            <div className="bg-zinc-950/40 border border-zinc-800/60 p-4 rounded-2xl">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Disc3 size={14} className="text-cyan-400" />
                Top Thể loại yêu thích
              </h3>
              {stats.sortedGenres.length === 0 ? (
                <p className="text-zinc-600 text-xs py-4 text-center">Chưa có thông tin thể loại</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.sortedGenres.map(([genre, count], i) => (
                    <div key={genre} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-zinc-300 font-medium truncate">{genre}</span>
                      </div>
                      <span className="text-zinc-500 text-[11px] font-mono shrink-0">{count} bài</span>
                    </div>
                  ))}
                </div>
              )}
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
