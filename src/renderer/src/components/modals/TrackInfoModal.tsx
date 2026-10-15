import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  X, Info, Music, Disc3, Clock, Calendar, FileText, HardDrive, 
  FolderOpen, Edit3, Play, Copy, Check, Waves, Cpu, Sparkles, 
  Mic2, Tag, Layers, ShieldCheck, Loader2
} from 'lucide-react'
import { useTranslation } from '../../locales'
import { DynamicCoverArt } from '../DynamicCoverArt'
import { 
  isDsdTrack, 
  formatAudioSampleRate, 
  formatDuration, 
  formatFileSize, 
  formatBitrate, 
  formatDate,
  getTrackFormatDisplay 
} from '../../utils/formatUtils'
import { useUIStore } from '../../stores/uiStore'

interface TrackInfoModalProps {
  track: any | null
  onClose: () => void
  onEditTags?: (track: any) => void
  onPlayTrack?: (track: any) => void
}

export const TrackInfoModal: React.FC<TrackInfoModalProps> = ({
  track,
  onClose,
  onEditTags,
  onPlayTrack
}) => {
  const { t } = useTranslation()
  const showToast = useUIStore((s) => s.showToast)

  const [activeTab, setActiveTab] = useState<'overview' | 'audio' | 'lyrics'>('overview')
  const [fetchedDetails, setFetchedDetails] = useState<{ trackId: string; data: any } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const [copiedLyrics, setCopiedLyrics] = useState(false)
  const [copiedInfo, setCopiedInfo] = useState(false)

  const trackId = (track?.id || track?.filePath || '') as string
  const details = fetchedDetails?.trackId === trackId ? fetchedDetails.data : null

  // Fetch detailed technical metadata from disk / backend
  useEffect(() => {
    if (!trackId || track?.isCloud || track?.isOnline) {
      return
    }

    let isMounted = true
    setLoading(true)

    window.api.getTrackDetails(trackId)
      .then((res: any) => {
        if (isMounted && res?.success) {
          setFetchedDetails({ trackId, data: res })
        }
      })
      .catch((err: any) => {
        console.warn('Failed to load track details:', err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [trackId, track?.isCloud, track?.isOnline])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Merged info from track prop + fetched detailed data
  const merged = useMemo(() => {
    const isDsd = isDsdTrack(track) || details?.isDsd
    const format = details?.format || track?.format || (isDsd ? 'DSD' : 'AUDIO')
    const sampleRate = details?.sampleRate || track?.sampleRate
    const bitDepth = details?.bitDepth || track?.bitDepth
    const bitrate = details?.bitrate || track?.bitrate
    const duration = details?.duration || track?.duration || 0
    const title = details?.title || track?.title || 'Unknown'
    const artist = details?.artist || track?.artist || 'Unknown'
    const artists = details?.artists || track?.artists || (track?.artist ? [track?.artist] : [])
    const album = details?.album || track?.album || 'Unknown'
    const albumArtist = details?.albumArtist || track?.albumArtist
    const genre = details?.genre || track?.genre || 'Unknown'
    const year = details?.year || track?.year
    const trackNo = details?.trackNo ?? track?.trackNo
    const trackOf = details?.trackOf
    const diskNo = details?.diskNo
    const diskOf = details?.diskOf
    const composer = details?.composer
    const lyricist = details?.lyricist
    const copyright = details?.copyright
    const comment = details?.comment
    const lyrics = details?.lyrics || track?.lyrics
    const fileName = details?.fileName || (track?.filePath ? track?.filePath.split('/').pop()?.split('\\').pop() : '')
    const directory = details?.directory
    const fileSizeBytes = details?.fileSizeBytes
    const createdTime = details?.createdTime
    const modifiedTime = details?.modifiedTime
    const container = details?.container
    const codec = details?.codec
    const codecProfile = details?.codecProfile
    const numberOfChannels = details?.numberOfChannels
    const lossless = details?.lossless ?? track?.lossless ?? (isDsd || ['FLAC', 'WAV', 'ALAC', 'AIFF'].includes(format.toUpperCase()))

    return {
      isDsd,
      format,
      sampleRate,
      bitDepth,
      bitrate,
      duration,
      title,
      artist,
      artists,
      album,
      albumArtist,
      genre,
      year,
      trackNo,
      trackOf,
      diskNo,
      diskOf,
      composer,
      lyricist,
      copyright,
      comment,
      lyrics,
      fileName,
      directory,
      fileSizeBytes,
      createdTime,
      modifiedTime,
      container,
      codec,
      codecProfile,
      numberOfChannels,
      lossless
    }
  }, [track, details])

  const formatDisplay = getTrackFormatDisplay({
    ...(track || {}),
    ...merged
  })

  // Format channels string
  const channelsText = useMemo(() => {
    if (!merged.numberOfChannels) return ''
    if (merged.numberOfChannels === 2) return t('modals.trackInfo.channelsStereo')
    if (merged.numberOfChannels === 1) return t('modals.trackInfo.channelsMono')
    return t('modals.trackInfo.channelsSurround', { count: merged.numberOfChannels })
  }, [merged.numberOfChannels, t])

  // Copy full path
  const handleCopyPath = useCallback(() => {
    const p = details?.rawPath || track?.id || track?.filePath || ''
    if (!p) return
    navigator.clipboard.writeText(p)
    setCopiedPath(true)
    showToast(t('modals.trackInfo.copyPathSuccess'), 'success')
    setTimeout(() => setCopiedPath(false), 2000)
  }, [details, track, showToast, t])

  // Copy lyrics
  const handleCopyLyrics = useCallback(() => {
    if (!merged.lyrics) return
    navigator.clipboard.writeText(merged.lyrics)
    setCopiedLyrics(true)
    showToast(t('modals.trackInfo.copyLyricsSuccess'), 'success')
    setTimeout(() => setCopiedLyrics(false), 2000)
  }, [merged.lyrics, showToast, t])

  // Copy all track info summary
  const handleCopyAllInfo = useCallback(() => {
    const lines = [
      `--- ${t('modals.trackInfo.title')} ---`,
      `${t('modals.trackInfo.titleLabel')}: ${merged.title}`,
      `${t('modals.trackInfo.artist')}: ${merged.artist}`,
      `${t('modals.trackInfo.album')}: ${merged.album}`,
      merged.year ? `${t('modals.trackInfo.year')}: ${merged.year}` : null,
      merged.genre && merged.genre !== 'Unknown' ? `${t('modals.trackInfo.genre')}: ${merged.genre}` : null,
      merged.trackNo ? `${t('modals.trackInfo.trackNumber')}: ${merged.trackNo}${merged.trackOf ? `/${merged.trackOf}` : ''}` : null,
      `${t('modals.trackInfo.duration')}: ${formatDuration(merged.duration)}`,
      '',
      `--- ${t('modals.trackInfo.technicalDetails')} ---`,
      `${t('modals.trackInfo.format')}: ${merged.format}`,
      merged.codec ? `${t('modals.trackInfo.codec')}: ${merged.codec}` : null,
      merged.container ? `${t('modals.trackInfo.container')}: ${merged.container}` : null,
      merged.sampleRate ? `${t('modals.trackInfo.sampleRate')}: ${formatAudioSampleRate(merged.sampleRate)}` : null,
      merged.bitDepth ? `${t('modals.trackInfo.bitDepth')}: ${merged.isDsd ? '1-bit DSD' : `${merged.bitDepth}-bit`}` : null,
      merged.bitrate ? `${t('modals.trackInfo.bitrate')}: ${formatBitrate(merged.bitrate)}` : null,
      channelsText ? `${t('modals.trackInfo.channels')}: ${channelsText}` : null,
      `${t('modals.trackInfo.quality')}: ${merged.isDsd ? t('modals.trackInfo.dsdNative') : merged.lossless ? t('modals.trackInfo.losslessYes') : t('modals.trackInfo.lossy')}`,
      '',
      `--- ${t('modals.trackInfo.fileDetails')} ---`,
      details?.rawPath ? `${t('modals.trackInfo.filePath')}: ${details.rawPath}` : null,
      merged.fileSizeBytes ? `${t('modals.trackInfo.fileSize')}: ${formatFileSize(merged.fileSizeBytes)}` : null,
      merged.modifiedTime ? `${t('modals.trackInfo.modifiedDate')}: ${formatDate(merged.modifiedTime)}` : null
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(lines)
    setCopiedInfo(true)
    showToast(t('modals.trackInfo.copySuccess'), 'success')
    setTimeout(() => setCopiedInfo(false), 2000)
  }, [merged, details, channelsText, showToast, t])

  if (!track) return null

  const isLocalTrack = !track?.isCloud && !track?.isOnline

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-[740px] max-w-full max-h-[92vh] bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-theme-10/15 text-theme-10 border border-theme-10/20 shadow-inner">
              <Info size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  {t('modals.trackInfo.title')}
                  {loading && <Loader2 size={13} className="animate-spin text-theme-10" />}
                </h2>
                {/* Badges */}
                {merged.isDsd ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono tracking-wider">
                    {formatDisplay.dsdRateLabel} 1-BIT
                  </span>
                ) : formatDisplay.isHiRes ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tracking-wider">
                    HI-RES AUDIO
                  </span>
                ) : merged.lossless ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 tracking-wider">
                    LOSSLESS
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 tracking-wider uppercase">
                    {merged.format}
                  </span>
                )}
                {isLocalTrack ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 hidden sm:inline">
                    {t('modals.trackInfo.sourceLocal')}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {t('modals.trackInfo.sourceOnline')}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-[420px]">
                {merged.title} • {merged.artist}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            title={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero Section */}
        <div className="p-6 bg-gradient-to-b from-zinc-900 via-zinc-900/60 to-zinc-950/80 border-b border-zinc-800/80 flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          {/* Cover Art */}
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 shadow-2xl relative group">
            <DynamicCoverArt
              track={track}
              tier="lg"
              className="w-full h-full object-cover"
            />
            {merged.isDsd && (
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/80 backdrop-blur-md text-amber-950 uppercase shadow">
                {formatDisplay.dsdRateLabel}
              </div>
            )}
          </div>

          {/* Quick Details */}
          <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col justify-between h-full py-1">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white leading-tight truncate" title={merged.title}>
                {merged.title}
              </h3>
              <p className="text-sm font-semibold text-theme-10 mt-1 truncate" title={merged.artist}>
                {merged.artist}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5 truncate" title={merged.album}>
                {merged.album}
              </p>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4 pt-3 border-t border-zinc-800/60 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300">
                <Clock size={13} className="text-zinc-500" />
                <span className="font-mono">{formatDuration(merged.duration)}</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono uppercase">
                <Music size={13} className="text-zinc-500" />
                <span>{merged.format}</span>
              </span>

              {merged.year && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300">
                  <Calendar size={13} className="text-zinc-500" />
                  <span>{merged.year}</span>
                </span>
              )}

              {merged.trackNo && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">
                  <Tag size={13} className="text-zinc-500" />
                  <span>#{merged.trackNo}{merged.trackOf ? `/${merged.trackOf}` : ''}</span>
                </span>
              )}

              {merged.genre && merged.genre !== 'Unknown' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300 truncate max-w-[150px]">
                  <Disc3 size={13} className="text-zinc-500" />
                  <span className="truncate">{merged.genre}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-zinc-800/80 bg-zinc-950/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'overview'
                ? 'border-theme-10 text-theme-10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>{t('modals.trackInfo.tabOverview')}</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'audio'
                ? 'border-theme-10 text-theme-10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Waves size={14} />
            <span>{t('modals.trackInfo.tabAudioSpecs')}</span>
          </button>

          <button
            onClick={() => setActiveTab('lyrics')}
            className={`pb-3 px-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'lyrics'
                ? 'border-theme-10 text-theme-10'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Mic2 size={14} />
            <span>{t('modals.trackInfo.tabLyrics')}</span>
            {Boolean(merged.lyrics) && (
              <span className="w-1.5 h-1.5 rounded-full bg-theme-10" />
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[46vh]">
          {/* TAB 1: OVERVIEW & FILE */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* File Storage Details */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <HardDrive size={14} className="text-theme-10" />
                  {t('modals.trackInfo.fileDetails')}
                </h4>
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-4 divide-y divide-zinc-800/60 text-xs">
                  {/* Full Path */}
                  <div className="pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-zinc-500 font-medium shrink-0">
                      {t('modals.trackInfo.filePath')}:
                    </span>
                    <div className="flex items-center gap-2 max-w-full min-w-0">
                      <span className="text-zinc-200 font-mono text-[11px] truncate select-all" title={details?.rawPath || track?.filePath}>
                        {details?.rawPath || track?.filePath || 'N/A'}
                      </span>
                      <button
                        onClick={handleCopyPath}
                        className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition shrink-0 cursor-pointer"
                        title={t('modals.trackInfo.copyPath')}
                      >
                        {copiedPath ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* File Name */}
                  <div className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-zinc-500 font-medium">{t('modals.trackInfo.format')}:</span>
                    <span className="text-zinc-200 font-mono uppercase font-bold">
                      {merged.format} {merged.container ? `(${merged.container})` : ''}
                    </span>
                  </div>

                  {/* File Size */}
                  {merged.fileSizeBytes && (
                    <div className="py-2.5 flex items-center justify-between gap-2">
                      <span className="text-zinc-500 font-medium">{t('modals.trackInfo.fileSize')}:</span>
                      <span className="text-zinc-200 font-mono">
                        {formatFileSize(merged.fileSizeBytes)} ({merged.fileSizeBytes.toLocaleString()} bytes)
                      </span>
                    </div>
                  )}

                  {/* Modified Date */}
                  {merged.modifiedTime && (
                    <div className="py-2.5 flex items-center justify-between gap-2">
                      <span className="text-zinc-500 font-medium">{t('modals.trackInfo.modifiedDate')}:</span>
                      <span className="text-zinc-300">
                        {formatDate(merged.modifiedTime)}
                      </span>
                    </div>
                  )}

                  {/* Source */}
                  <div className="pt-2.5 flex items-center justify-between gap-2">
                    <span className="text-zinc-500 font-medium">{t('modals.trackInfo.source')}:</span>
                    <span className="text-zinc-300 font-medium">
                      {isLocalTrack 
                        ? t('modals.trackInfo.sourceLocal') 
                        : track?.isCloud 
                          ? t('modals.trackInfo.sourceCloud') 
                          : t('modals.trackInfo.sourceOnline')}
                    </span>
                  </div>
                </div>
              </div>

              {/* General Track Information */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText size={14} className="text-theme-10" />
                  {t('modals.trackInfo.generalDetails')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                    <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.titleLabel')}</span>
                    <p className="text-white font-semibold truncate" title={merged.title}>{merged.title}</p>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                    <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.artist')}</span>
                    <p className="text-white font-semibold truncate" title={merged.artist}>{merged.artist}</p>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                    <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.album')}</span>
                    <p className="text-white font-semibold truncate" title={merged.album}>{merged.album}</p>
                  </div>

                  {merged.albumArtist && (
                    <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                      <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.albumArtist')}</span>
                      <p className="text-white font-semibold truncate" title={merged.albumArtist}>{merged.albumArtist}</p>
                    </div>
                  )}

                  <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                    <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.genre')}</span>
                    <p className="text-white font-semibold truncate">{merged.genre || 'Unknown'}</p>
                  </div>

                  {merged.composer && (
                    <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                      <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.composer')}</span>
                      <p className="text-white font-semibold truncate" title={merged.composer}>{merged.composer}</p>
                    </div>
                  )}

                  {merged.lyricist && (
                    <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl">
                      <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.lyricist')}</span>
                      <p className="text-white font-semibold truncate" title={merged.lyricist}>{merged.lyricist}</p>
                    </div>
                  )}

                  {merged.copyright && (
                    <div className="bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-2xl sm:col-span-2">
                      <span className="text-zinc-500 block text-[11px] mb-1">{t('modals.trackInfo.copyright')}</span>
                      <p className="text-zinc-300 font-medium truncate" title={merged.copyright}>{merged.copyright}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AUDIO TECHNICAL SPECS */}
          {activeTab === 'audio' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {/* Format / Container */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <Music size={13} className="text-theme-10" />
                    <span>{t('modals.trackInfo.format')}</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono uppercase">
                    {merged.format}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1 truncate">
                    {merged.codec || merged.container || 'Standard Audio'}
                  </p>
                </div>

                {/* Sample Rate */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <Waves size={13} className="text-amber-400" />
                    <span>{t('modals.trackInfo.sampleRate')}</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">
                    {formatAudioSampleRate(merged.sampleRate) || '44.1 kHz'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {merged.isDsd 
                      ? 'Direct Stream Digital' 
                      : merged.sampleRate && merged.sampleRate >= 88200 
                        ? 'High-Resolution Audio' 
                        : 'Standard Rate'}
                  </p>
                </div>

                {/* Bit Depth */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <Cpu size={13} className="text-emerald-400" />
                    <span>{t('modals.trackInfo.bitDepth')}</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">
                    {merged.isDsd ? '1-BIT' : merged.bitDepth ? `${merged.bitDepth}-BIT` : '16-BIT'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {merged.isDsd 
                      ? '1-bit Delta-Sigma Stream' 
                      : merged.bitDepth && merged.bitDepth >= 24 
                        ? 'Studio Master Depth' 
                        : 'CD Quality Depth'}
                  </p>
                </div>

                {/* Bitrate */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <Sparkles size={13} className="text-purple-400" />
                    <span>{t('modals.trackInfo.bitrate')}</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">
                    {formatBitrate(merged.bitrate) || (merged.isDsd ? '5.64 Mbps' : 'N/A')}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {merged.lossless ? 'Variable / Constant' : 'Compressed Bitrate'}
                  </p>
                </div>

                {/* Channels */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <Disc3 size={13} className="text-blue-400" />
                    <span>{t('modals.trackInfo.channels')}</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">
                    {merged.numberOfChannels ? `${merged.numberOfChannels} CH` : '2 CH'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1 truncate">
                    {channelsText || t('modals.trackInfo.channelsStereo')}
                  </p>
                </div>

                {/* Quality Tier */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 p-4 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-medium mb-1.5">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span>{t('modals.trackInfo.quality')}</span>
                  </div>
                  <p className="text-lg font-black text-white truncate">
                    {merged.isDsd ? 'DSD Native' : merged.lossless ? 'Lossless' : 'Lossy'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1 truncate">
                    {merged.isDsd ? 'Bit-Perfect 1-bit' : merged.lossless ? 'Bit-Perfect PCM' : 'Lossy Codec'}
                  </p>
                </div>
              </div>

              {/* Engine Recommendation Card */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-theme-10/10 text-theme-10 mt-0.5 shrink-0">
                  <Info size={16} />
                </div>
                <div className="text-xs">
                  <h5 className="font-bold text-white mb-0.5">
                    {merged.isDsd 
                      ? 'Audiophile DSD Stream (BASS DSD Engine)' 
                      : merged.lossless 
                        ? 'Lossless Audio Stream (Bit-Perfect WASAPI / ASIO)' 
                        : 'Standard Audio Stream'}
                  </h5>
                  <p className="text-zinc-400 leading-relaxed">
                    {merged.isDsd
                      ? 'Bản nhạc này chứa luồng bit 1-bit Direct Stream Digital. Mei\'s Radio tự động định tuyến qua BASS Audio Library (ASIO DSD Native hoặc WASAPI DSD-to-PCM 176.4kHz) để bảo toàn chất âm analog chân thực nhất.'
                      : merged.lossless
                        ? 'Bản nhạc này là dạng không nén Lossless nguyên bản. Khuyến nghị bật chế độ Bit-Perfect (WASAPI Exclusive hoặc ASIO) để thưởng thức âm thanh trung thực không qua bộ trộn Windows.'
                        : 'Bản nhạc này ở định dạng nén có tổn hao. Hỗ trợ đầy đủ bộ cân bằng âm thanh Parametric EQ và visualizer thời gian thực.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LYRICS */}
          {activeTab === 'lyrics' && (
            <div className="space-y-4 animate-fade-in h-full flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Mic2 size={14} className="text-theme-10" />
                  {t('modals.trackInfo.lyricsTitle')}
                </span>
                {Boolean(merged.lyrics) && (
                  <button
                    onClick={handleCopyLyrics}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {copiedLyrics ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copiedLyrics ? t('common.copied') : t('modals.trackInfo.copyLyrics')}</span>
                  </button>
                )}
              </div>

              {merged.lyrics ? (
                <div className="flex-1 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[36vh] select-text">
                  {merged.lyrics}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 bg-zinc-950/40 border border-zinc-800/60 rounded-2xl text-center">
                  <Mic2 size={32} className="text-zinc-600 mb-2" />
                  <p className="text-sm font-semibold text-zinc-400">
                    {t('modals.trackInfo.noLyrics')}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                    {isLocalTrack && 'Bạn có thể chỉnh sửa metadata hoặc thêm file .lrc cùng thư mục để nhúng lời bài hát.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions: Đơn giản hóa thành các nút icon, hiển thị text khi hover */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 text-xs shrink-0">
          {/* Left: Copy all details */}
          <div className="relative group/btn">
            <button
              onClick={handleCopyAllInfo}
              className="w-9 h-9 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition flex items-center justify-center cursor-pointer shadow-sm"
              title={copiedInfo ? t('common.copied') : t('modals.trackInfo.copyInfo')}
            >
              {copiedInfo ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
            <div className="absolute bottom-full mb-2 left-0 px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none shadow-xl z-50">
              {copiedInfo ? t('common.copied') : t('modals.trackInfo.copyInfo')}
            </div>
          </div>

          {/* Right: Functional actions */}
          <div className="flex items-center gap-2">
            {isLocalTrack && (
              <div className="relative group/btn">
                <button
                  onClick={() => {
                    const rawTrackPath = details?.rawPath || track?.id || track?.filePath
                    window.api.showInFolder(rawTrackPath)
                  }}
                  className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition flex items-center justify-center cursor-pointer"
                  title={t('modals.trackInfo.showInFolder')}
                >
                  <FolderOpen size={16} />
                </button>
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none shadow-xl z-50">
                  {t('modals.trackInfo.showInFolder')}
                </div>
              </div>
            )}

            {isLocalTrack && onEditTags && (
              <div className="relative group/btn">
                <button
                  onClick={() => {
                    onClose()
                    onEditTags(track)
                  }}
                  className="w-9 h-9 rounded-xl bg-theme-10/15 hover:bg-theme-10/25 border border-theme-10/30 text-theme-10 hover:text-white transition flex items-center justify-center cursor-pointer"
                  title={t('modals.trackInfo.editTags')}
                >
                  <Edit3 size={16} />
                </button>
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none shadow-xl z-50">
                  {t('modals.trackInfo.editTags')}
                </div>
              </div>
            )}

            {onPlayTrack && (
              <div className="relative group/btn">
                <button
                  onClick={() => {
                    onPlayTrack(track)
                    onClose()
                  }}
                  className="w-9 h-9 rounded-xl bg-theme-10 hover:bg-theme-10/90 text-white font-semibold transition shadow-lg shadow-theme-10/20 flex items-center justify-center cursor-pointer"
                  title={t('modals.trackInfo.playTrack')}
                >
                  <Play size={16} className="ml-0.5" />
                </button>
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none shadow-xl z-50">
                  {t('modals.trackInfo.playTrack')}
                </div>
              </div>
            )}

            <div className="relative group/btn">
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition flex items-center justify-center cursor-pointer"
                title={t('modals.trackInfo.close')}
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-full mb-2 right-0 px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none shadow-xl z-50">
                {t('modals.trackInfo.close')}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
