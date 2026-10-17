import { matchesTrackQuery, removeAccents } from './textUtils'
import { isDsdTrack } from './formatUtils'

/**
 * Sắp xếp danh sách bài hát theo trường và thứ tự (Sử dụng Schwartzian Transform để tối ưu hiệu năng O(n log n))
 */
export function getSortedTracks<T = any>(
  tracks: T[],
  sortField: string | null,
  sortOrder: 'asc' | 'desc' = 'asc'
): T[] {
  if (!sortField || !tracks || tracks.length <= 1) return tracks
  const isAsc = sortOrder === 'asc'
  const field = sortField

  const mapped = tracks.map((t: any, idx) => {
    const raw = t[field]
    const val = typeof raw === 'string' ? raw.toLowerCase() : (raw ?? '')
    return { idx, val }
  })

  mapped.sort((a, b) => {
    if (a.val < b.val) return isAsc ? -1 : 1
    if (a.val > b.val) return isAsc ? 1 : -1
    return 0
  })

  return mapped.map((m) => tracks[m.idx])
}

/**
 * Lọc danh sách bài hát theo từ khóa tìm kiếm (so khớp thông minh qua chỉ mục _searchKey)
 */
export function getFilteredTracks<T = any>(tracks: T[], query: string): T[] {
  const rawQuery = (query || '').trim()
  if (!rawQuery || !tracks || tracks.length === 0) return tracks
  const normalizedQuery = removeAccents(rawQuery)
  return tracks.filter((t) => matchesTrackQuery(t, normalizedQuery))
}

/**
 * Lọc bài hát theo bộ lọc nhanh (Quick Filter Chips: All, Favorites, Lossless, Hi-Res, DSD, CUE)
 */
export function filterTracksByQuickFilter<T = any>(
  tracks: T[],
  quickFilter: string,
  favoriteTrackIds: string[]
): T[] {
  if (!tracks || tracks.length === 0 || quickFilter === 'all') return tracks
  const favSet = new Set(favoriteTrackIds)

  return tracks.filter((t: any) => {
    const isDsd = isDsdTrack(t)
    const fmt = (t.format || '').toUpperCase()
    if (quickFilter === 'favorites') {
      return favSet.has(t.id) || (t.filePath && favSet.has(t.filePath))
    }
    if (quickFilter === 'lossless') {
      return isDsd || t.lossless || ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes(fmt)
    }
    if (quickFilter === 'hires') {
      return (
        isDsd ||
        (t.sampleRate && t.sampleRate >= 88200) ||
        (t.bitDepth && t.bitDepth >= 24)
      )
    }
    if (quickFilter === 'dsd') {
      return isDsd
    }
    if (quickFilter === 'cue') {
      return t.isCueTrack || t.cueFilePath
    }
    return true
  })
}
