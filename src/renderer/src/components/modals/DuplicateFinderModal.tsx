import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  Copy,
  Trash2,
  Sparkles,
  Play,
  CheckSquare,
  Square,
  CheckCircle2,
  FolderOpen
} from 'lucide-react'
import { useTranslation } from '../../locales'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useUIStore } from '../../stores/uiStore'
import {
  isDsdTrack,
  formatAudioSampleRate,
  formatBitrate,
  formatDuration,
  formatFileSize,
  getTrackFormatDisplay
} from '../../utils/formatUtils'

export interface DuplicateFinderModalProps {
  isOpen?: boolean
  onClose: () => void
  onDeleteTracks?: (trackPaths: string[]) => Promise<void> | void
  onPlayTrack?: (track: any) => void
}

interface DuplicateGroup {
  id: string
  title: string
  artist: string
  tracks: any[]
}

function normalizeString(str?: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^\w\s]/gi, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// Calculate an audio fidelity score to cleanly sort duplicates
function getAudioQualityScore(track: any): number {
  if (isDsdTrack(track)) {
    const rate = track.sampleRate || 2822400
    return 30000000 + rate
  }
  const fmt = (track.format || '').toUpperCase()
  const isLossless = track.lossless || ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes(fmt)
  const sampleRate = track.sampleRate || 44100
  const bitDepth = track.bitDepth || 16
  const bitrate = track.bitrate || 0

  if (isLossless) {
    // 24-bit 192kHz > 24-bit 96kHz > 16-bit 44.1kHz
    return 10000000 + bitDepth * 100000 + sampleRate
  }

  // Lossy formats: 320k > 256k > 128k
  return bitrate > 0 ? bitrate : 128000
}

export const DuplicateFinderModal: React.FC<DuplicateFinderModalProps> = ({
  isOpen = true,
  onClose,
  onDeleteTracks,
  onPlayTrack
}) => {
  const { t } = useTranslation()
  const showToast = useUIStore((s) => s.showToast)
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const setLibraryTracks = useLibraryStore((s) => s.setLibraryTracks)

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Group duplicate tracks
  const duplicateGroups: DuplicateGroup[] = useMemo(() => {
    const map = new Map<string, any[]>()

    for (const track of libraryTracks) {
      if (!track.filePath && !track.id) continue

      const normTitle = normalizeString(track.title)
      const normArtist = normalizeString(track.artist)

      let key = ''
      if (normTitle && normTitle !== 'unknown') {
        key = normArtist ? `${normTitle}:::${normArtist}` : `title:::${normTitle}`
      } else {
        const filename = (track.filePath || track.id || '').split(/[/\\]/).pop() || ''
        const baseName = normalizeString(filename.replace(/\.[^/.]+$/, ''))
        key = `file:::${baseName}`
      }

      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(track)
    }

    const groups: DuplicateGroup[] = []
    map.forEach((tracks, key) => {
      if (tracks.length > 1) {
        // Sort tracks within the group: highest quality first
        const sorted = [...tracks].sort(
          (a, b) => getAudioQualityScore(b) - getAudioQualityScore(a)
        )
        groups.push({
          id: key,
          title: sorted[0].title || sorted[0].filePath?.split(/[/\\]/).pop() || 'Untitled',
          artist: sorted[0].artist || 'Unknown Artist',
          tracks: sorted
        })
      }
    })

    return groups
  }, [libraryTracks])

  // Select all lower quality duplicates in each group (keeping index 0 unchecked)
  const handleSelectLowerQuality = () => {
    const nextSelected = new Set<string>()
    duplicateGroups.forEach((group) => {
      // Keep tracks[0] unchecked (it is the highest quality), check all others
      for (let i = 1; i < group.tracks.length; i++) {
        const path = group.tracks[i].filePath || group.tracks[i].id
        if (path) {
          nextSelected.add(path)
        }
      }
    })
    setSelectedPaths(nextSelected)
    showToast(
      `${t('duplicateFinder.keepHighestQuality') || 'Selected lower quality duplicates'}: ${nextSelected.size} files`,
      'info'
    )
  }

  const handleToggleTrack = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedPaths(new Set())
  }

  const handleDeleteSelected = async () => {
    if (selectedPaths.size === 0) return

    const pathsToDelete = Array.from(selectedPaths)
    const confirmed = window.confirm(
      `${t('duplicateFinder.deleteDuplicates') || 'Move selected duplicates to Trash'} (${pathsToDelete.length} files)?`
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      if (onDeleteTracks) {
        await onDeleteTracks(pathsToDelete)
      } else if (window.api?.deleteTrack) {
        for (const p of pathsToDelete) {
          try {
            await window.api.deleteTrack(p, false)
          } catch {
            /* ignore */
          }
        }
      }

      // Remove deleted tracks from library in-memory
      const pathSet = new Set(pathsToDelete)
      setLibraryTracks((prev) =>
        prev.filter((t) => !pathSet.has(t.filePath) && !pathSet.has(t.id))
      )
      setSelectedPaths(new Set())
      showToast(t('toasts.movedToTrash') || 'Moved selected duplicates to trash', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete tracks', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePlay = (track: any) => {
    if (onPlayTrack) {
      onPlayTrack(track)
    } else {
      usePlayerStore.getState().setCurrentTrack(track)
      usePlayerStore.getState().setIsPlaying(true)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-[860px] max-w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in text-zinc-200">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Copy size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('duplicateFinder.duplicateFinder') || 'Duplicate Track Finder'}</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {duplicateGroups.length} groups
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                {t('duplicateFinder.duplicateFinderDesc') ||
                  'Scan your library for duplicate songs by title, artist, duration, or audio quality'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 bg-zinc-950/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectLowerQuality}
              disabled={duplicateGroups.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer disabled:opacity-40"
            >
              <Sparkles size={14} />
              <span>
                {t('duplicateFinder.keepHighestQuality') || 'Select Lower Quality Duplicates'}
              </span>
            </button>

            {selectedPaths.size > 0 && (
              <button
                onClick={handleClearSelection}
                className="px-2.5 py-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                {t('batchActions.clearSelection') || 'Clear'}
              </button>
            )}
          </div>

          <div className="text-zinc-400 font-medium">
            {selectedPaths.size > 0 ? (
              <span className="text-amber-400 font-bold">
                {selectedPaths.size} {t('batchActions.selectedCount') || 'selected for removal'}
              </span>
            ) : (
              <span>
                {duplicateGroups.reduce((acc, g) => acc + g.tracks.length, 0)} total duplicates
              </span>
            )}
          </div>
        </div>

        {/* Body / Groups List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
              <CheckCircle2 size={44} className="text-emerald-400 opacity-80" />
              <p className="text-sm font-semibold text-white">
                {t('duplicateFinder.noDuplicatesFound') || 'No duplicate tracks found in your library!'}
              </p>
              <p className="text-xs text-zinc-500 max-w-sm">
                Your music library is clean and well-organized. No songs with identical titles or matching file hashes were found.
              </p>
            </div>
          ) : (
            duplicateGroups.map((group) => (
              <div
                key={group.id}
                className="bg-zinc-950/70 border border-zinc-800 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Group Title */}
                <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/60 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white">{group.title}</h3>
                    <p className="text-[11px] text-zinc-400">{group.artist}</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                    {group.tracks.length} copies
                  </span>
                </div>

                {/* Group Tracks */}
                <div className="divide-y divide-zinc-800/40 text-xs">
                  {group.tracks.map((track, idx) => {
                    const path = track.filePath || track.id || ''
                    const isSelected = selectedPaths.has(path)
                    const isHighest = idx === 0
                    const fmtDisplay = getTrackFormatDisplay(track)

                    return (
                      <div
                        key={path || idx}
                        className={`px-4 py-2.5 flex items-center justify-between gap-3 transition ${
                          isSelected
                            ? 'bg-amber-500/10'
                            : isHighest
                            ? 'bg-zinc-900/30'
                            : 'hover:bg-zinc-900/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Checkbox */}
                          <button
                            onClick={() => handleToggleTrack(path)}
                            className="text-zinc-400 hover:text-white cursor-pointer shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-amber-400 fill-amber-400/20" />
                            ) : (
                              <Square size={16} className="text-zinc-600 hover:text-zinc-400" />
                            )}
                          </button>

                          {/* Highest Quality Badge */}
                          {isHighest ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0">
                              Highest Quality
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/50 text-[10px] shrink-0 font-mono">
                              Duplicate #{idx}
                            </span>
                          )}

                          {/* Format Badge */}
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase shrink-0 border ${
                              fmtDisplay.isDsd
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : fmtDisplay.isHiRes
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : fmtDisplay.isLossless
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700/50'
                            }`}
                          >
                            {fmtDisplay.badgeLabel}
                          </span>

                          {/* Track Details */}
                          <div className="min-w-0 flex-1 text-zinc-400 text-[11px] truncate flex items-center gap-2">
                            {track.sampleRate && (
                              <span className="font-mono">{formatAudioSampleRate(track.sampleRate)}</span>
                            )}
                            {track.bitDepth && !fmtDisplay.isDsd && (
                              <span className="font-mono">{track.bitDepth}-bit</span>
                            )}
                            {track.bitrate && !fmtDisplay.isLossless && (
                              <span className="font-mono">{formatBitrate(track.bitrate)}</span>
                            )}
                            {track.duration && (
                              <span className="tabular-nums">({formatDuration(track.duration)})</span>
                            )}
                            {track.fileSize && (
                              <span className="text-zinc-500">[{formatFileSize(track.fileSize)}]</span>
                            )}
                            <span
                              className="text-zinc-500 truncate text-[10px] font-mono"
                              title={track.filePath}
                            >
                              {track.filePath}
                            </span>
                          </div>
                        </div>

                        {/* Play preview button */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {window.api?.showInFolder && track.filePath && (
                            <button
                              onClick={() => window.api.showInFolder(track.filePath)}
                              title="Show in Folder"
                              className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                            >
                              <FolderOpen size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handlePlay(track)}
                            title="Play Track"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                          >
                            <Play size={12} className="fill-current" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/40">
          <div className="text-xs text-zinc-500">
            {selectedPaths.size > 0 && (
              <span>
                {selectedPaths.size} {t('common.files') || 'files'} will be moved to Recycle Bin
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedPaths.size === 0 || isDeleting}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              <span>
                {t('duplicateFinder.deleteDuplicates') || 'Move Selected Duplicates to Trash'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
