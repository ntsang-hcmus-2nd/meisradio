import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3,
  Clock,
  PlayCircle,
  Sparkles,
  Zap,
  Award,
  Disc3,
  Mic2,
  Tag,
  RefreshCw,
  Flame,
  Play,
  Calendar,
  Layers,
  TrendingUp,
  Headphones
} from 'lucide-react'
import { useTranslation } from '../locales'
import { useLibraryStore } from '../stores/libraryStore'

export interface AnalyticsOverview {
  totalPlays: number
  totalListenSeconds: number
  uniqueTracks: number
  uniqueArtists: number
  uniqueAlbums: number
  losslessRatio: number
  hiResRatio: number
  dsdPlays: number
  bitPerfectRatio: number
}

export interface AdvancedListeningStats {
  overview: AnalyticsOverview
  hourlyDistribution: number[]
  weekdayDistribution: number[]
  dailyActivity: { date: string; plays: number; minutes: number }[]
  topArtists: { name: string; plays: number; totalSeconds: number }[]
  topAlbums: { name: string; artist: string; plays: number; totalSeconds: number }[]
  topGenres: { name: string; plays: number; percentage: number }[]
  formatBreakdown: { format: string; count: number; percentage: number }[]
  topTracks: {
    filePath: string
    title: string
    artist: string
    album: string
    format: string
    plays: number
    totalSeconds: number
    lastPlayed: number
  }[]
}

interface AnalyticsViewProps {
  onPlayTrack?: (track: any) => void
}

type TimeRangeKey = '7d' | '30d' | '90d' | 'all'

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onPlayTrack }) => {
  const { t, language } = useTranslation()
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)

  const [activeRange, setActiveRange] = useState<TimeRangeKey>('30d')
  const [stats, setStats] = useState<AdvancedListeningStats | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  const rangeDaysMap: Record<TimeRangeKey, number> = useMemo(
    () => ({
      '7d': 7,
      '30d': 30,
      '90d': 90,
      all: 0
    }),
    []
  )

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const days = rangeDaysMap[activeRange]
      // @ts-ignore
      const result = await window.api?.getAdvancedStats?.(days)
      if (result && result.overview) {
        setStats(result)
      } else {
        setStats(null)
      }
    } catch (err) {
      console.error('[AnalyticsView] Failed to fetch stats:', err)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [activeRange, rangeDaysMap])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const formatDurationText = (seconds: number): string => {
    if (!seconds || seconds <= 0) return language === 'vi' ? '0 phút' : '0 min'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) {
      return language === 'vi' ? `${hrs} Giờ ${mins} Phút` : `${hrs} hrs ${mins} mins`
    }
    return language === 'vi' ? `${mins} Phút` : `${mins} mins`
  }

  const formatTimeOnly = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0m'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  // Peak hour calculations
  const { peakHourIndex, maxHourCount } = useMemo(() => {
    if (!stats || !stats.hourlyDistribution) return { peakHourIndex: 0, maxHourCount: 0 }
    let max = 0
    let index = 0
    stats.hourlyDistribution.forEach((cnt, i) => {
      if (cnt > max) {
        max = cnt
        index = i
      }
    })
    return { peakHourIndex: index, maxHourCount: max }
  }, [stats])

  // Weekday max
  const maxWeekdayCount = useMemo(() => {
    if (!stats || !stats.weekdayDistribution) return 0
    return Math.max(...stats.weekdayDistribution, 0)
  }, [stats])

  const weekdayLabels = useMemo(() => {
    return language === 'vi'
      ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  }, [language])

  const weekdayFullLabels = useMemo(() => {
    return language === 'vi'
      ? ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  }, [language])

  // Top artists max for relative progress bar
  const maxArtistPlays = useMemo(() => {
    if (!stats || !stats.topArtists || stats.topArtists.length === 0) return 1
    return stats.topArtists[0].plays || 1
  }, [stats])

  // Top albums max
  const maxAlbumPlays = useMemo(() => {
    if (!stats || !stats.topAlbums || stats.topAlbums.length === 0) return 1
    return stats.topAlbums[0].plays || 1
  }, [stats])

  const handleTrackClick = (trackItem: any) => {
    if (!onPlayTrack) return
    const match = libraryTracks.find(
      (t) =>
        t.filePath === trackItem.filePath ||
        (t.title === trackItem.title && t.artist === trackItem.artist)
    )
    if (match) {
      onPlayTrack(match)
    } else {
      onPlayTrack({
        id: trackItem.filePath,
        filePath: trackItem.filePath,
        title: trackItem.title,
        artist: trackItem.artist,
        album: trackItem.album,
        format: trackItem.format,
        duration: trackItem.totalSeconds / (trackItem.plays || 1)
      })
    }
  }

  const getFormatBadgeStyle = (fmt: string) => {
    const f = (fmt || '').toUpperCase()
    if (f.includes('DSD') || f.includes('DSF')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    }
    if (f.includes('FLAC')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    }
    if (f.includes('HI-RES') || f.includes('WAV')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    }
    if (f.includes('ONLINE')) {
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    }
    return 'bg-zinc-700/40 text-zinc-300 border-zinc-600/30'
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24 text-zinc-100 select-none no-scrollbar">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-theme-60/80 via-theme-60/50 to-theme-10/10 border border-theme-30/40 backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-theme-10/20 border border-theme-10/40 text-theme-10 flex items-center justify-center shadow-lg shadow-theme-10/20 shrink-0">
            <BarChart3 size={28} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <span>{t('analytics.title')}</span>
            </h1>
          </div>
        </div>

        {/* TIME RANGE FILTER TABS & REFRESH */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center p-1 rounded-xl bg-theme-60/90 border border-theme-30/60 shadow-inner">
            {(['7d', '30d', '90d', 'all'] as TimeRangeKey[]).map((rangeKey) => {
              const labelMap: Record<TimeRangeKey, string> = {
                '7d': t('analytics.range7d'),
                '30d': t('analytics.range30d'),
                '90d': t('analytics.range90d'),
                all: t('analytics.rangeAll')
              }
              const isActive = activeRange === rangeKey
              return (
                <button
                  key={rangeKey}
                  onClick={() => setActiveRange(rangeKey)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? 'bg-theme-10 text-white shadow-md shadow-theme-10/30'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {labelMap[rangeKey]}
                </button>
              )
            })}
          </div>

          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-theme-60/80 hover:bg-theme-10/20 text-zinc-300 hover:text-theme-10 border border-theme-30/60 transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium"
            title={t('analytics.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-theme-10' : ''} />
            <span className="hidden sm:inline">{t('analytics.refresh')}</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: TOTAL LISTENING TIME */}
        <div className="p-5 rounded-2xl bg-theme-60/50 border border-theme-30/40 backdrop-blur-md hover:border-theme-30/80 transition shadow-md relative overflow-hidden group">
          <div className="absolute -right-3 -top-3 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t('analytics.totalListeningTime')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {stats ? formatDurationText(stats.overview.totalListenSeconds) : '0h 00m'}
          </div>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
            <span className="text-emerald-400 font-medium">
              {stats && stats.dailyActivity.length > 0
                ? `${Math.round(stats.overview.totalListenSeconds / 60 / Math.max(1, stats.dailyActivity.length))}m`
                : '0m'}
            </span>
            <span>{language === 'vi' ? 'trung bình / ngày' : 'avg / day'}</span>
          </p>
        </div>

        {/* CARD 2: TOTAL PLAYS & UNIQUE TRACKS */}
        <div className="p-5 rounded-2xl bg-theme-60/50 border border-theme-30/40 backdrop-blur-md hover:border-theme-30/80 transition shadow-md relative overflow-hidden group">
          <div className="absolute -right-3 -top-3 w-20 h-20 bg-sky-500/10 rounded-full blur-xl group-hover:bg-sky-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t('analytics.totalPlays')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center">
              <PlayCircle size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {stats ? stats.overview.totalPlays.toLocaleString() : '0'}{' '}
            <span className="text-sm font-normal text-zinc-400">
              {language === 'vi' ? 'lượt' : 'plays'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate">
            <span className="text-sky-400 font-medium">{stats?.overview.uniqueTracks || 0}</span>{' '}
            {t('analytics.uniqueTracks')} •{' '}
            <span className="text-sky-400 font-medium">{stats?.overview.uniqueArtists || 0}</span>{' '}
            {t('analytics.uniqueArtists')}
          </p>
        </div>

        {/* CARD 3: AUDIOPHILE QUALITY SCORE */}
        <div className="p-5 rounded-2xl bg-theme-60/50 border border-theme-30/40 backdrop-blur-md hover:border-theme-30/80 transition shadow-md relative overflow-hidden group">
          <div className="absolute -right-3 -top-3 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t('analytics.audiophileQuality')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300 tracking-tight flex items-baseline gap-2">
            <span>
              {stats ? `${Math.round(stats.overview.losslessRatio * 100)}%` : '0%'}
            </span>
            <span className="text-xs font-medium text-amber-400/90 uppercase tracking-wide">
              Lossless
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate flex items-center gap-1.5">
            <span className="text-amber-400 font-medium">
              {stats ? `${Math.round(stats.overview.hiResRatio * 100)}%` : '0%'}
            </span>
            <span>Hi-Res</span>
            <span>•</span>
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
              {stats?.overview.dsdPlays || 0} DSD
            </span>
          </p>
        </div>

        {/* CARD 4: BIT-PERFECT RATIO */}
        <div className="p-5 rounded-2xl bg-theme-60/50 border border-theme-30/40 backdrop-blur-md hover:border-theme-30/80 transition shadow-md relative overflow-hidden group">
          <div className="absolute -right-3 -top-3 w-20 h-20 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t('analytics.bitPerfectRatio')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center">
              <Zap size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-300 tracking-tight">
            {stats ? `${Math.round(stats.overview.bitPerfectRatio * 100)}%` : '0%'}
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate">
            WASAPI Exclusive / ASIO Direct
          </p>
        </div>
      </div>

      {/* EMPTY DATA NOTICE IF NO PLAYS RECORDED */}
      {!loading && stats && stats.overview.totalPlays === 0 && (
        <div className="p-8 rounded-2xl bg-theme-60/40 border border-theme-30/40 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-theme-10/10 border border-theme-10/20 text-theme-10 flex items-center justify-center mx-auto">
            <Headphones size={24} />
          </div>
          <h3 className="text-base font-bold text-white">{t('analytics.noData')}</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">{t('analytics.noDataDesc')}</p>
        </div>
      )}

      {/* VISUAL CHARTS SECTION 1: 24-HOUR RHYTHM & 7-DAY WEEKDAY ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART 1: 24-HOUR LISTENING RHYTHM (2 COLS) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-theme-10" />
                <span>{t('analytics.hourlyRhythm')}</span>
              </h2>
            </div>
            {maxHourCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-theme-10/15 border border-theme-10/30 text-theme-10 text-xs font-semibold">
                <Flame size={13} className="text-theme-10" />
                <span>
                  {t('analytics.peakHour')}: {peakHourIndex}:00 - {peakHourIndex + 1}:00
                </span>
              </div>
            )}
          </div>

          {/* 24-BAR INTERACTIVE CHART */}
          <div className="h-44 pt-6 pb-2 flex items-end gap-1 sm:gap-1.5 w-full relative">
            {stats &&
              stats.hourlyDistribution.map((count, hr) => {
                const heightPercent =
                  maxHourCount > 0 ? Math.max(6, Math.round((count / maxHourCount) * 100)) : 6
                const isPeak = hr === peakHourIndex && maxHourCount > 0
                const isHovered = hoveredHour === hr

                return (
                  <div
                    key={hr}
                    onMouseEnter={() => setHoveredHour(hr)}
                    onMouseLeave={() => setHoveredHour(null)}
                    className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                  >
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div className="absolute -top-11 z-30 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-semibold text-white whitespace-nowrap shadow-xl pointer-events-none">
                        {hr}h00 - {hr}h59: <span className="text-theme-10">{count}</span>{' '}
                        {t('analytics.playsCount')}
                      </div>
                    )}

                    {/* Bar container */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isPeak
                          ? 'bg-gradient-to-t from-theme-10 to-amber-400 shadow-md shadow-theme-10/30'
                          : isHovered
                            ? 'bg-theme-10/90'
                            : count > 0
                              ? 'bg-theme-10/40 hover:bg-theme-10/70'
                              : 'bg-zinc-800/40'
                      }`}
                    />
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 mt-1 font-mono">
                      {hr % 3 === 0 ? `${hr}h` : ''}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>

        {/* CHART 2: WEEKDAY DISTRIBUTION (1 COL) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar size={18} className="text-sky-400" />
              <span>{t('analytics.weekdayActivity')}</span>
            </h2>
          </div>

          <div className="h-44 pt-6 pb-2 flex items-end gap-2.5 w-full relative">
            {stats &&
              stats.weekdayDistribution.map((count, dayIdx) => {
                const heightPercent =
                  maxWeekdayCount > 0
                    ? Math.max(8, Math.round((count / maxWeekdayCount) * 100))
                    : 8
                const isHovered = hoveredDay === dayIdx
                return (
                  <div
                    key={dayIdx}
                    onMouseEnter={() => setHoveredDay(dayIdx)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                  >
                    {isHovered && (
                      <div className="absolute -top-11 z-30 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-semibold text-white whitespace-nowrap shadow-xl pointer-events-none">
                        {weekdayFullLabels[dayIdx]}:{' '}
                        <span className="text-sky-400">{count}</span> {t('analytics.playsCount')}
                      </div>
                    )}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isHovered
                          ? 'bg-sky-400'
                          : count > 0
                            ? 'bg-sky-500/40 hover:bg-sky-400/70'
                            : 'bg-zinc-800/40'
                      }`}
                    />
                    <span className="text-[11px] text-zinc-400 mt-1 font-semibold">
                      {weekdayLabels[dayIdx]}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* VISUAL CHARTS SECTION 2: FORMAT BREAKDOWN & DAILY ACTIVITY TREND */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORMAT BREAKDOWN LIST (1 COL) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers size={18} className="text-amber-400" />
              <span>{t('analytics.formatBreakdown')}</span>
            </h2>
          </div>

          <div className="space-y-3">
            {stats && stats.formatBreakdown && stats.formatBreakdown.length > 0 ? (
              stats.formatBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getFormatBadgeStyle(
                        item.format
                      )}`}
                    >
                      {item.format}
                    </span>
                    <span className="text-zinc-400">
                      <strong className="text-white">{item.count}</strong> (
                      {item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, item.percentage)}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-theme-10 to-amber-400 transition-all duration-500"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 italic py-4 text-center">
                {language === 'vi' ? 'Chưa có phân bố định dạng' : 'No format data'}
              </p>
            )}
          </div>
        </div>

        {/* DAILY ACTIVITY TREND (2 COLS) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-400" />
                <span>{t('analytics.dailyTrend')}</span>
              </h2>
            </div>
          </div>

          {/* DAILY ACTIVITY BARS */}
          <div className="h-44 pt-6 pb-2 flex items-end gap-1 sm:gap-1.5 w-full relative overflow-x-auto no-scrollbar">
            {stats && stats.dailyActivity && stats.dailyActivity.length > 0 ? (
              (() => {
                const maxDailyPlays = Math.max(...stats.dailyActivity.map((d) => d.plays), 1)
                return stats.dailyActivity.map((dItem, idx) => {
                  const heightPercent = Math.max(6, Math.round((dItem.plays / maxDailyPlays) * 100))
                  const dayLabel = typeof dItem?.date === 'string' ? dItem.date.split('-').slice(1).join('/') : ''
                  return (
                    <div
                      key={idx}
                      className="flex-1 min-w-[12px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
                    >
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-30 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-semibold text-white whitespace-nowrap shadow-xl pointer-events-none">
                        {dItem.date}: <span className="text-emerald-400">{dItem.plays}</span> lượt (
                        {dItem.minutes} phút)
                      </div>
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          dItem.plays > 0
                            ? 'bg-gradient-to-t from-emerald-600/60 to-emerald-400 hover:from-emerald-500 hover:to-emerald-300'
                            : 'bg-zinc-800/40'
                        }`}
                      />
                      <span className="text-[9px] text-zinc-500 mt-1 font-mono truncate w-full text-center">
                        {idx % 4 === 0 ? dayLabel : ''}
                      </span>
                    </div>
                  )
                })
              })()
            ) : (
              <p className="text-xs text-zinc-500 italic py-8 text-center w-full">
                {language === 'vi' ? 'Chưa có hoạt động ngày' : 'No daily activity'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* LEADERBOARDS ROW: TOP ARTISTS & TOP ALBUMS & TOP GENRES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* TOP 10 ARTISTS */}
        <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Mic2 size={18} className="text-theme-10" />
              <span>{t('analytics.topArtists')}</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {stats && stats.topArtists && stats.topArtists.length > 0 ? (
              stats.topArtists.map((artist, idx) => {
                const widthPercent = Math.max(10, Math.round((artist.plays / maxArtistPlays) * 100))
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                            idx === 0
                              ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20'
                              : idx === 1
                                ? 'bg-zinc-300 text-black'
                                : idx === 2
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-zinc-200 truncate">{artist.name}</span>
                      </div>
                      <span className="text-zinc-400 shrink-0 text-[11px]">
                        <strong className="text-white">{artist.plays}</strong> lượt •{' '}
                        {formatTimeOnly(artist.totalSeconds)}
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${widthPercent}%` }}
                        className="h-full rounded-full bg-theme-10 transition-all duration-300"
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-zinc-500 italic py-6 text-center">
                {language === 'vi' ? 'Chưa có thông tin nghệ sĩ' : 'No artist data'}
              </p>
            )}
          </div>
        </div>

        {/* TOP 10 ALBUMS */}
        <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Disc3 size={18} className="text-sky-400" />
              <span>{t('analytics.topAlbums')}</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {stats && stats.topAlbums && stats.topAlbums.length > 0 ? (
              stats.topAlbums.map((album, idx) => {
                const widthPercent = Math.max(10, Math.round((album.plays / maxAlbumPlays) * 100))
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                            idx === 0
                              ? 'bg-sky-400 text-black'
                              : idx === 1
                                ? 'bg-zinc-300 text-black'
                                : idx === 2
                                  ? 'bg-zinc-400 text-black'
                                  : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 truncate">
                          <p className="font-semibold text-zinc-200 truncate">{album.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">{album.artist}</p>
                        </div>
                      </div>
                      <span className="text-zinc-400 shrink-0 text-[11px]">
                        <strong className="text-white">{album.plays}</strong> lượt
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${widthPercent}%` }}
                        className="h-full rounded-full bg-sky-400 transition-all duration-300"
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-zinc-500 italic py-6 text-center">
                {language === 'vi' ? 'Chưa có thông tin album' : 'No album data'}
              </p>
            )}
          </div>
        </div>

        {/* TOP 8 GENRES */}
        <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tag size={18} className="text-purple-400" />
              <span>{t('analytics.topGenres')}</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {stats && stats.topGenres && stats.topGenres.length > 0 ? (
              stats.topGenres.map((genre, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200 truncate pr-2">
                      {genre.name}
                    </span>
                    <span className="text-zinc-400 shrink-0 text-[11px]">
                      <strong className="text-white">{genre.plays}</strong> ({genre.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, genre.percentage)}%` }}
                      className="h-full rounded-full bg-purple-400 transition-all duration-300"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 italic py-6 text-center">
                {language === 'vi' ? 'Chưa có thông tin thể loại' : 'No genre data'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* TOP 15 MOST PLAYED TRACKS LEADERBOARD */}
      <div className="p-5 sm:p-6 rounded-2xl bg-theme-60/40 border border-theme-30/40 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award size={18} className="text-amber-400" />
            <span>{t('analytics.mostPlayedTracks')}</span>
          </h2>
          <span className="text-xs text-zinc-400">
            {language === 'vi' ? 'Nhấn để phát ngay' : 'Click to play track'}
          </span>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead>
              <tr className="border-b border-theme-30/30 text-zinc-500 uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">{language === 'vi' ? 'TÊN BÀI HÁT' : 'TITLE'}</th>
                <th className="py-2.5 px-3 hidden sm:table-cell">{language === 'vi' ? 'ALBUM' : 'ALBUM'}</th>
                <th className="py-2.5 px-3 text-center">{language === 'vi' ? 'ĐỊNH DẠNG' : 'FORMAT'}</th>
                <th className="py-2.5 px-3 text-right">{language === 'vi' ? 'LƯỢT PHÁT' : 'PLAYS'}</th>
                <th className="py-2.5 px-3 text-right hidden md:table-cell">{language === 'vi' ? 'THỜI LƯỢNG' : 'DURATION'}</th>
                <th className="py-2.5 px-3 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {stats && stats.topTracks && stats.topTracks.length > 0 ? (
                stats.topTracks.map((track, idx) => (
                  <tr
                    key={idx}
                    onClick={() => handleTrackClick(track)}
                    className="border-b border-theme-30/15 hover:bg-theme-10/10 cursor-pointer transition group"
                  >
                    <td className="py-2.5 px-3 text-center font-bold text-zinc-400 group-hover:text-theme-10">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 min-w-[160px] max-w-[260px]">
                      <p className="font-semibold text-white truncate group-hover:text-theme-10 transition">
                        {track.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell text-zinc-400 truncate max-w-[180px]">
                      {track.album || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getFormatBadgeStyle(
                          track.format
                        )}`}
                      >
                        {track.format}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-white">
                      {track.plays}
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-400 hidden md:table-cell font-mono">
                      {formatTimeOnly(track.totalSeconds)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTrackClick(track)
                        }}
                        className="w-7 h-7 rounded-full bg-theme-10/20 text-theme-10 hover:bg-theme-10 hover:text-white flex items-center justify-center transition shadow-sm cursor-pointer ml-auto"
                        title="Phát bài này"
                      >
                        <Play size={12} className="fill-current translate-x-0.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-500 italic">
                    {language === 'vi' ? 'Chưa có dữ liệu bài hát nghe nhiều nhất' : 'No track data'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsView
