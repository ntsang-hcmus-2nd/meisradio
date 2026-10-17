import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  SlidersHorizontal,
  Plus,
  Trash2,
  Play,
  Save,
  CheckCircle2,
  FolderPlus
} from 'lucide-react'
import { useTranslation } from '../../locales'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useUIStore } from '../../stores/uiStore'
import { isDsdTrack, formatDuration, getTrackFormatDisplay } from '../../utils/formatUtils'

export type SmartPlaylistField =
  | 'format'
  | 'sampleRate'
  | 'bitDepth'
  | 'genre'
  | 'artist'
  | 'album'
  | 'title'
  | 'year'
  | 'isFavorite'

export type SmartPlaylistOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'does_not_contain'
  | 'equals'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_true'
  | 'is_false'

export interface SmartPlaylistRule {
  id: string
  field: SmartPlaylistField
  operator: SmartPlaylistOperator
  value: string
}

export interface SmartPlaylist {
  id: string
  name: string
  matchAll: boolean // true = AND, false = OR
  rules: SmartPlaylistRule[]
  createdAt?: number
}

export interface SmartPlaylistModalProps {
  isOpen?: boolean
  onClose: () => void
  onPlayPlaylist?: (tracks: any[]) => void
}

export function evaluateRule(
  track: any,
  rule: SmartPlaylistRule,
  favSet: Set<string>
): boolean {
  switch (rule.field) {
    case 'format': {
      const isDsd = isDsdTrack(track)
      const trackFmt = (track.format || '').toUpperCase()
      const targetFmt = rule.value.toUpperCase()
      let match = false
      if (targetFmt === 'DSD') {
        match = isDsd
      } else {
        match =
          trackFmt === targetFmt ||
          Boolean(track.filePath && track.filePath.toUpperCase().endsWith(`.${targetFmt}`))
      }
      return rule.operator === 'is_not' ? !match : match
    }
    case 'sampleRate': {
      const rate = track.sampleRate || 0
      const target = Number(rule.value) || 0
      if (rule.operator === 'greater_than_or_equal') return rate >= target
      if (rule.operator === 'less_than_or_equal') return rate <= target
      return rate === target
    }
    case 'bitDepth': {
      const depth = track.bitDepth || 0
      const target = Number(rule.value) || 0
      if (rule.operator === 'greater_than_or_equal') return depth >= target
      return depth === target
    }
    case 'genre': {
      const genre = (track.genre || '').toLowerCase()
      const target = (rule.value || '').toLowerCase()
      if (rule.operator === 'equals') return genre === target
      if (rule.operator === 'does_not_contain') return !genre.includes(target)
      return genre.includes(target)
    }
    case 'artist': {
      const artist = (track.artist || '').toLowerCase()
      const target = (rule.value || '').toLowerCase()
      if (rule.operator === 'equals') return artist === target
      return artist.includes(target)
    }
    case 'album': {
      const album = (track.album || '').toLowerCase()
      const target = (rule.value || '').toLowerCase()
      if (rule.operator === 'equals') return album === target
      return album.includes(target)
    }
    case 'title': {
      const title = (track.title || '').toLowerCase()
      const target = (rule.value || '').toLowerCase()
      if (rule.operator === 'equals') return title === target
      return title.includes(target)
    }
    case 'year': {
      const year = Number(track.year) || 0
      const target = Number(rule.value) || 0
      if (rule.operator === 'greater_than_or_equal') return year >= target
      if (rule.operator === 'less_than_or_equal') return year <= target
      return year === target
    }
    case 'isFavorite': {
      const isFav =
        favSet.has(track.id) || Boolean(track.filePath && favSet.has(track.filePath))
      return rule.operator === 'is_false' ? !isFav : isFav
    }
    default:
      return true
  }
}

export function filterTracksByRules(
  tracks: any[],
  rules: SmartPlaylistRule[],
  matchAll: boolean,
  favSet: Set<string>
): any[] {
  if (!rules || rules.length === 0) return tracks

  return tracks.filter((track) => {
    if (matchAll) {
      return rules.every((rule) => evaluateRule(track, rule, favSet))
    } else {
      return rules.some((rule) => evaluateRule(track, rule, favSet))
    }
  })
}

export const SmartPlaylistModal: React.FC<SmartPlaylistModalProps> = ({
  isOpen = true,
  onClose,
  onPlayPlaylist
}) => {
  const { t } = useTranslation()
  const showToast = useUIStore((s) => s.showToast)
  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const favoriteTrackIds = useLibraryStore((s) => s.favoriteTrackIds)
  const smartPlaylists = useLibraryStore((s) => s.smartPlaylists)
  const setSmartPlaylists = useLibraryStore((s) => s.setSmartPlaylists)

  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [playlistName, setPlaylistName] = useState('')
  const [matchAll, setMatchAll] = useState(true)
  const [rules, setRules] = useState<SmartPlaylistRule[]>([
    {
      id: 'rule-1',
      field: 'format',
      operator: 'is',
      value: 'FLAC'
    }
  ])

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

  const favSet = useMemo(() => new Set(favoriteTrackIds), [favoriteTrackIds])

  // Live evaluation of current rules
  const matchingTracks = useMemo(() => {
    return filterTracksByRules(libraryTracks, rules, matchAll, favSet)
  }, [libraryTracks, rules, matchAll, favSet])

  // Add rule row
  const handleAddRule = () => {
    const newRule: SmartPlaylistRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      field: 'genre',
      operator: 'contains',
      value: ''
    }
    setRules((prev) => [...prev, newRule])
  }

  // Update rule row
  const handleUpdateRule = (
    ruleId: string,
    field: SmartPlaylistField,
    operator: SmartPlaylistOperator,
    value: string
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, field, operator, value } : r))
    )
  }

  // Delete rule row
  const handleDeleteRule = (ruleId: string) => {
    if (rules.length <= 1) {
      showToast('A smart playlist must have at least one rule', 'info')
      return
    }
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
  }

  // Save Smart Playlist
  const handleSave = async () => {
    const trimmedName = playlistName.trim()
    if (!trimmedName) {
      showToast('Please enter a name for the smart playlist', 'error')
      return
    }

    const playlistObj: SmartPlaylist = {
      id: editingId || `smart-${Date.now()}`,
      name: trimmedName,
      matchAll,
      rules,
      createdAt: Date.now()
    }

    if (window.api?.saveSmartPlaylist) {
      try {
        await window.api.saveSmartPlaylist(playlistObj)
      } catch {
        /* ignore */
      }
    }

    setSmartPlaylists((prev) => {
      const filtered = prev.filter((p) => p.id !== playlistObj.id)
      return [playlistObj, ...filtered]
    })

    showToast(`Smart Playlist "${trimmedName}" saved!`, 'success')
    setActiveTab('list')
    setEditingId(null)
    setPlaylistName('')
  }

  // Play matching tracks
  const handlePlayMatching = (tracksToPlay: any[]) => {
    if (tracksToPlay.length === 0) {
      showToast('No tracks matched this smart playlist', 'info')
      return
    }

    if (onPlayPlaylist) {
      onPlayPlaylist(tracksToPlay)
    } else {
      usePlayerStore.getState().setPlayQueue(tracksToPlay)
      usePlayerStore.getState().setCurrentTrack(tracksToPlay[0])
      usePlayerStore.getState().setIsPlaying(true)
    }
    showToast(`Playing ${tracksToPlay.length} tracks`, 'success')
    onClose()
  }

  // Edit existing smart playlist
  const handleEditPlaylist = (p: SmartPlaylist) => {
    setEditingId(p.id)
    setPlaylistName(p.name)
    setMatchAll(p.matchAll ?? true)
    setRules(p.rules || [])
    setActiveTab('create')
  }

  // Delete existing smart playlist
  const handleDeletePlaylist = async (id: string, name: string) => {
    if (!window.confirm(`Delete smart playlist "${name}"?`)) return

    if (window.api?.deleteSmartPlaylist) {
      try {
        await window.api.deleteSmartPlaylist(id)
      } catch {
        /* ignore */
      }
    }

    setSmartPlaylists((prev) => prev.filter((p) => p.id !== id))
    showToast(`Deleted smart playlist "${name}"`, 'info')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-[860px] max-w-full max-h-[92vh] flex flex-col shadow-2xl animate-fade-in text-zinc-200">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-theme-10/10 border border-theme-10/20 flex items-center justify-center text-theme-10">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('smartPlaylists.smartPlaylists') || 'Smart Playlists'}</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {smartPlaylists.length}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Rule-based dynamic playlists that update automatically as your library changes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
              <button
                onClick={() => {
                  setActiveTab('create')
                  if (!editingId) {
                    setPlaylistName('')
                    setRules([
                      {
                        id: 'rule-1',
                        field: 'format',
                        operator: 'is',
                        value: 'FLAC'
                      }
                    ])
                  }
                }}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'create'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {editingId ? 'Edit Playlist' : t('smartPlaylists.createSmartPlaylist') || 'Create New'}
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'list'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Saved ({smartPlaylists.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'create' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Playlist Name & Match All Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 font-medium mb-1 block">
                  {t('smartPlaylists.smartPlaylistName') || 'Playlist Name'}
                </label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="e.g. Hi-Res FLAC Collection, 80s Rock, Favorites..."
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-theme-10 font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium mb-1 block">
                  {t('smartPlaylists.matchAllRules') || 'Rule Matching'}
                </label>
                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-700/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setMatchAll(true)}
                    className={`flex-1 py-1 rounded-lg font-semibold transition cursor-pointer text-center ${
                      matchAll ? 'bg-theme-10 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Match All (AND)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchAll(false)}
                    className={`flex-1 py-1 rounded-lg font-semibold transition cursor-pointer text-center ${
                      !matchAll ? 'bg-theme-10 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Match Any (OR)
                  </button>
                </div>
              </div>
            </div>

            {/* Dynamic Rules Builder */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Rules ({rules.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="flex items-center gap-1 text-xs font-semibold text-theme-10 hover:brightness-110 bg-theme-10/10 border border-theme-10/30 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>{t('smartPlaylists.addRule') || 'Add Rule'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-zinc-950/70 border border-zinc-800 p-2.5 rounded-xl text-xs"
                  >
                    {/* Field Selector */}
                    <select
                      value={rule.field}
                      onChange={(e) => {
                        const newField = e.target.value as SmartPlaylistField
                        let defaultOp: SmartPlaylistOperator = 'contains'
                        let defaultVal = ''
                        if (newField === 'format') {
                          defaultOp = 'is'
                          defaultVal = 'FLAC'
                        } else if (newField === 'sampleRate') {
                          defaultOp = 'greater_than_or_equal'
                          defaultVal = '88200'
                        } else if (newField === 'bitDepth') {
                          defaultOp = 'greater_than_or_equal'
                          defaultVal = '24'
                        } else if (newField === 'year') {
                          defaultOp = 'greater_than_or_equal'
                          defaultVal = '2000'
                        } else if (newField === 'isFavorite') {
                          defaultOp = 'is_true'
                          defaultVal = 'true'
                        }
                        handleUpdateRule(rule.id, newField, defaultOp, defaultVal)
                      }}
                      className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 font-medium cursor-pointer"
                    >
                      <option value="format">Format (FLAC, DSD, MP3...)</option>
                      <option value="sampleRate">Sample Rate (Hz)</option>
                      <option value="bitDepth">Bit Depth</option>
                      <option value="genre">Genre</option>
                      <option value="artist">Artist</option>
                      <option value="album">Album</option>
                      <option value="title">Song Title</option>
                      <option value="year">Release Year</option>
                      <option value="isFavorite">Favorites Status</option>
                    </select>

                    {/* Operator Selector */}
                    <select
                      value={rule.operator}
                      onChange={(e) =>
                        handleUpdateRule(
                          rule.id,
                          rule.field,
                          e.target.value as SmartPlaylistOperator,
                          rule.value
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 font-medium cursor-pointer"
                    >
                      {rule.field === 'format' ? (
                        <>
                          <option value="is">is</option>
                          <option value="is_not">is not</option>
                        </>
                      ) : rule.field === 'sampleRate' ||
                        rule.field === 'bitDepth' ||
                        rule.field === 'year' ? (
                        <>
                          <option value="greater_than_or_equal">≥</option>
                          <option value="less_than_or_equal">≤</option>
                          <option value="equals">=</option>
                        </>
                      ) : rule.field === 'isFavorite' ? (
                        <>
                          <option value="is_true">is in Favorites</option>
                          <option value="is_false">is not in Favorites</option>
                        </>
                      ) : (
                        <>
                          <option value="contains">contains</option>
                          <option value="equals">equals</option>
                          <option value="does_not_contain">does not contain</option>
                        </>
                      )}
                    </select>

                    {/* Value Input */}
                    {rule.field === 'format' ? (
                      <select
                        value={rule.value}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, rule.field, rule.operator, e.target.value)
                        }
                        className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 flex-1 font-mono font-bold cursor-pointer"
                      >
                        <option value="FLAC">FLAC</option>
                        <option value="DSD">DSD (.dsf / .dff)</option>
                        <option value="WAV">WAV</option>
                        <option value="MP3">MP3</option>
                        <option value="M4A">M4A / AAC</option>
                        <option value="OGG">OGG</option>
                        <option value="OPUS">OPUS</option>
                      </select>
                    ) : rule.field === 'sampleRate' ? (
                      <select
                        value={rule.value}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, rule.field, rule.operator, e.target.value)
                        }
                        className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 flex-1 font-mono cursor-pointer"
                      >
                        <option value="44100">44.1 kHz (CD Quality)</option>
                        <option value="48000">48.0 kHz</option>
                        <option value="88200">88.2 kHz (Hi-Res)</option>
                        <option value="96000">96.0 kHz (Hi-Res Studio)</option>
                        <option value="176400">176.4 kHz (Hi-Res)</option>
                        <option value="192000">192.0 kHz (Ultra Hi-Res)</option>
                        <option value="2822400">2.8224 MHz (DSD64)</option>
                        <option value="5644800">5.6448 MHz (DSD128)</option>
                      </select>
                    ) : rule.field === 'bitDepth' ? (
                      <select
                        value={rule.value}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, rule.field, rule.operator, e.target.value)
                        }
                        className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 flex-1 font-mono cursor-pointer"
                      >
                        <option value="16">16-bit (Standard)</option>
                        <option value="24">24-bit (Hi-Res Master)</option>
                        <option value="32">32-bit Floating Point</option>
                        <option value="1">1-bit (DSD Direct Stream)</option>
                      </select>
                    ) : rule.field === 'isFavorite' ? (
                      <div className="flex-1 text-zinc-500 italic px-2">
                        {rule.operator === 'is_true' ? 'Hearted songs' : 'Unhearted songs'}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, rule.field, rule.operator, e.target.value)
                        }
                        placeholder="Search value..."
                        className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-theme-10 flex-1 font-medium"
                      />
                    )}

                    {/* Delete Rule Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Matches Count & Preview */}
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-theme-10" />
                  <span className="text-xs font-bold text-white">
                    {matchingTracks.length} tracks matched in library
                  </span>
                </div>
                {matchingTracks.length > 0 && (
                  <button
                    onClick={() => handlePlayMatching(matchingTracks)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-theme-10 text-white hover:brightness-110 transition cursor-pointer"
                  >
                    <Play size={12} className="fill-white" />
                    <span>Play Now</span>
                  </button>
                )}
              </div>

              {/* Preview Track List */}
              {matchingTracks.length > 0 ? (
                <div className="max-h-40 overflow-y-auto divide-y divide-zinc-800/40 pr-1 text-[11px]">
                  {matchingTracks.slice(0, 15).map((track, i) => {
                    const fmtDisplay = getTrackFormatDisplay(track)
                    return (
                      <div
                        key={track.id || track.filePath || i}
                        className="py-1.5 flex items-center justify-between gap-3 text-zinc-400"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-mono text-zinc-600 text-[10px] w-5 text-right">
                            {i + 1}
                          </span>
                          <span className="text-white font-medium truncate">{track.title}</span>
                          <span className="truncate text-zinc-500">— {track.artist}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-1.5 py-0.2 rounded font-mono text-[9px] bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                            {fmtDisplay.badgeLabel}
                          </span>
                          <span className="tabular-nums font-mono text-[10px]">
                            {formatDuration(track.duration)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {matchingTracks.length > 15 && (
                    <div className="pt-1.5 text-center text-zinc-500 text-[10px] italic">
                      + {matchingTracks.length - 15} more matching tracks
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic py-2">
                  No tracks currently match all the specified criteria.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* List Tab: Saved Smart Playlists */
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {smartPlaylists.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <FolderPlus size={44} className="text-zinc-600" />
                <p className="text-sm font-semibold text-white">No smart playlists created yet</p>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Smart playlists automatically gather songs from your library based on high resolution audio formats, genres, years, or favorite ratings.
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 rounded-xl bg-theme-10 text-white font-semibold text-xs transition hover:brightness-110 cursor-pointer shadow-md shadow-theme-10/20"
                >
                  Create First Smart Playlist
                </button>
              </div>
            ) : (
              smartPlaylists.map((playlist: SmartPlaylist) => {
                const tracks = filterTracksByRules(
                  libraryTracks,
                  playlist.rules || [],
                  playlist.matchAll ?? true,
                  favSet
                )
                return (
                  <div
                    key={playlist.id}
                    className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between gap-4 hover:border-zinc-700 transition"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white truncate">{playlist.name}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-theme-10/15 text-theme-10 border border-theme-10/30">
                          {tracks.length} tracks
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                        <span>{playlist.matchAll ? 'Matches all:' : 'Matches any:'}</span>
                        {(playlist.rules || []).map((r, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300"
                          >
                            {r.field} {r.operator} {r.value || '""'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handlePlayMatching(tracks)}
                        disabled={tracks.length === 0}
                        title="Play Playlist"
                        className="p-2 rounded-lg bg-theme-10 text-white hover:brightness-110 transition cursor-pointer disabled:opacity-40"
                      >
                        <Play size={14} className="fill-current" />
                      </button>
                      <button
                        onClick={() => handleEditPlaylist(playlist)}
                        title="Edit Rules"
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        onClick={() => handleDeletePlaylist(playlist.id, playlist.name)}
                        title="Delete"
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Footer */}
        {activeTab === 'create' && (
          <div className="p-4 border-t border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/40">
            <span className="text-xs text-zinc-500">
              {matchingTracks.length} tracks will be included in this smart playlist
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 bg-theme-10 hover:brightness-110 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-lg shadow-theme-10/20 transition cursor-pointer"
              >
                <Save size={13} />
                <span>Save Smart Playlist</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
