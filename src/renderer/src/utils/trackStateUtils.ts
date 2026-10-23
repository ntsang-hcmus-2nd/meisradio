/**
 * Đồng bộ định danh & trạng thái track giữa các store (library / player / queue).
 *
 * Bối cảnh: nhiều bài hát trong app không có `id` (bài từ thư mục quét nhanh, CUE sheet cũ...),
 * nên so sánh `a.id === b.id` sẽ khớp SAI khi cả hai đều là undefined.
 * Các helper dưới đây ép cả hai vế phải có giá trị trước khi so sánh,
 * và dùng `filePath` (chuẩn hóa dấu /) làm định danh dự phòng.
 */

/** Chỉ so khớp khi CẢ HAI vế đều có truthy value — chống undefined === undefined */
export function isSameTrack(a?: any, b?: any): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.id && b.id) return String(a.id) === String(b.id)
  if (a.filePath && b.filePath)
    return String(a.filePath).replace(/\\/g, '/') === String(b.filePath).replace(/\\/g, '/')
  return false
}

/** Khóa định danh của track: ưu tiên id (giữ hậu tố #track-N của CUE Sheet), sau đó filePath */
export function getTrackKey(track?: any): string | undefined {
  if (!track) return undefined
  return track.id || track.filePath || undefined
}

const normalizeKey = (key?: string): string =>
  String(key || '')
    .replace(/\\/g, '/')
    .toLowerCase()

/** Track có trùng với tập khóa cần xóa không (id hoặc filePath) */
export function trackMatchesKeys(track: any, keys: Set<string> | string[]): boolean {
  if (!track) return false
  const set = keys instanceof Set ? keys : new Set(keys)
  if (track.id && set.has(track.id)) return true
  if (track.filePath) return set.has(track.filePath) || set.has(normalizeKey(track.filePath))
  return false
}

/**
 * Xóa đồng bộ các track (đã bị xóa khỏi đĩa) khỏi các state phát nhạc của renderer:
 * - playQueue / originalQueue (cập nhật lại queueIndex)
 * - currentTrack (dừng phát nếu bài đang phát bị xóa)
 * - recentlyPlayed (persist localStorage qua setRecentlyPlayed)
 * - playlists (danh sách phát nội bộ từ scan thư viện, tracks dạng object)
 * - userPlaylists (lọc trong memory + gọi API removeTrackFromUserPlaylist để persist file JSON)
 *
 * Gọi SAU KHI window.api.deleteTrack() xong cho từng track.
 */
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'

export async function removeTrackKeysFromStores(keys: string[]): Promise<void> {
  const keySet = new Set((keys || []).filter(Boolean))
  if (keySet.size === 0) return

  // 1. playQueue + originalQueue + currentTrack
  const player = usePlayerStore.getState()
  const queueFilter = (arr: any[]) => (arr || []).filter((trk) => !trackMatchesKeys(trk, keySet))

  const prevCurrentTrack = player.currentTrack
  player.setPlayQueue(queueFilter)
  player.setOriginalQueue(queueFilter)
  if (trackMatchesKeys(prevCurrentTrack, keySet)) {
    player.setCurrentTrack(null)
    player.setIsPlaying(false)
  } else {
    // Cập nhật lại queueIndex sau khi lọc để phiên phát (playback session) không trôi
    const nextQueue = usePlayerStore.getState().playQueue || []
    const nextIndex = nextQueue.findIndex((trk) => isSameTrack(trk, prevCurrentTrack))
    player.setQueueIndex(nextIndex >= 0 ? nextIndex : 0)
  }

  // 2. recentlyPlayed
  useLibraryStore
    .getState()
    .setRecentlyPlayed((prev) => prev.filter((trk) => !trackMatchesKeys(trk, keySet)))

  // 3. Playlists nội bộ (track dạng object) — lọc trong memory, loadLibrary() sẽ refresh đè
  useLibraryStore.getState().setPlaylists((prev) =>
    (prev || []).map((pl) => {
      if (!Array.isArray(pl?.tracks) || pl.tracks.length === 0) return pl
      const tracks = pl.tracks.filter((trk: any) => !trackMatchesKeys(trk, keySet))
      if (tracks.length === pl.tracks.length) return pl
      return { ...pl, tracks }
    })
  )

  // 4. User Playlists — trackIds dạng chuỗi (id/filePath), cần persist qua IPC
  const getUserPlaylistKeys = (pl: any): string[] => {
    if (!pl) return []
    const rawIds = Array.isArray(pl.trackIds)
      ? pl.trackIds
      : Array.isArray(pl.tracks)
        ? pl.tracks
        : []
    return rawIds.map((item: any) => {
      const key = typeof item === 'string' ? item : getTrackKey(item)
      return normalizeKey(key)
    })
  }

  let persisted = false
  let lastPlaylists: any[] | null = null
  for (const pl of useLibraryStore.getState().userPlaylists || []) {
    if (!pl?.id) continue
    const playlistKeys = new Set(getUserPlaylistKeys(pl))
    for (const rawKey of keySet) {
      if (!playlistKeys.has(normalizeKey(rawKey))) continue
      try {
        // @ts-ignore — preload API có thể không được khai báo đầy đủ trong env build
        const res = await window.api?.removeTrackFromUserPlaylist?.(pl.id, rawKey)
        if (res?.success && Array.isArray(res.playlists)) {
          lastPlaylists = res.playlists
          persisted = true
          break // playlist này đã sạch các track của keySet — bỏ qua các key còn lại
        }
      } catch {
        /* ignore — sẽ dựa vào bộ lọc memory bên dưới */
      }
    }
  }

  if (persisted && lastPlaylists) {
    useLibraryStore.getState().setUserPlaylists(lastPlaylists)
  } else {
    // Fallback: sync memory khi IPC không khả dụng
    useLibraryStore.getState().setUserPlaylists((prev) =>
      (prev || []).map((pl) => {
        const raw = Array.isArray(pl?.trackIds)
          ? pl.trackIds
          : Array.isArray(pl?.tracks)
            ? pl.tracks
            : []
        if (!raw.length) return pl
        const kept = raw.filter((item: any) => {
          const key = typeof item === 'string' ? item : getTrackKey(item)
          if (!key) return true
          return !Array.from(keySet).some((k) => normalizeKey(k) === normalizeKey(key))
        })
        if (kept.length === raw.length) return pl
        return { ...pl, trackIds: kept, tracks: kept }
      })
    )
  }
}
