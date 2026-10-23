import { usePlayerStore } from '../stores/playerStore'

/**
 * Tua tương thích cho stream online không seekable.
 *
 * Bối cảnh: YTM nhiều khi trả về HLS (.m3u8), server phải dùng ffmpeg transcode
 * sang MP3 pipe (`Accept-Ranges: none`). Thẻ <audio> không tua native được trên
 * luồng này (đặt currentTime bị lờ đi hoặc kẹt) — cách duy nhất là nạp lại
 * endpoint /play kèm ?seek=<giây> (server -ss rồi transcode tiếp).
 * SoundCloud trả về progressive MP3 nên tua native bình thường, không đụng tới.
 *
 * Vì sau reload currentTime đếm lại từ 0, module giữ offset theo track để các
 * nơi đọc thời gian (progress bar, store, lyrics, spectrogram) cộng bù.
 */

const hlsReloadTracks = new Set<string>()
const reloadOffsets = new Map<string, number>()
let seekWatchdog: ReturnType<typeof setTimeout> | null = null

export const getOnlineSeekKey = (t: any): string => String(t?.id ?? t?.filePath ?? '')

export const isOnlineStreamTrack = (t: any): boolean => {
  if (!t) return false
  if (t.isOnline || t.isCloud) return true
  if (t.platform === 'youtube' || t.platform === 'soundcloud') return true
  const id = String(t.id || '')
  return id.startsWith('sc-') || id.startsWith('yt-')
}

export const getReloadSeekOffset = (t: any): number => {
  if (!t) return 0
  return reloadOffsets.get(getOnlineSeekKey(t)) || 0
}

export const clearOnlineSeekState = (t?: any): void => {
  if (seekWatchdog) {
    clearTimeout(seekWatchdog)
    seekWatchdog = null
  }
  if (!t) {
    reloadOffsets.clear()
    return
  }
  const key = getOnlineSeekKey(t)
  reloadOffsets.delete(key)
  hlsReloadTracks.delete(key)
}

/** Bỏ tham số ?seek= cũ để tránh cộng dồn khi tua nhiều lần. */
export const stripOnlineSeekParam = (url: string): string =>
  url.replace(/([?&])seek=[^&#]*/g, '$1').replace(/[?&]$/, '')

const buildSeekReloadUrl = (src: string, targetSec: number): string | null => {
  if (!src.includes('/play?')) return null
  const base = stripOnlineSeekParam(src.split('#')[0])
  if (!base.includes('/play?')) return null
  return `${base}${base.includes('?') ? '&' : '?'}seek=${Math.max(0, Math.floor(targetSec))}`
}

const reloadWithSeek = (audio: HTMLAudioElement, key: string, targetSec: number): boolean => {
  const src = audio.currentSrc || audio.src || ''
  const url = buildSeekReloadUrl(src, targetSec)
  if (!url) return false
  const wasPlaying = !audio.paused && !audio.ended
  try {
    audio.src = url
  } catch {
    return false
  }
  reloadOffsets.set(key, Math.max(0, targetSec))
  if (wasPlaying) {
    void audio.play().catch(() => {})
  }
  return true
}

/**
 * Tua WebAudio: thử native trước, nếu stream HLS không nhúc nhích thì reload
 * /play kèm ?seek=. targetRelSec là mốc tương đối của track (0..duration).
 * Trả về 'reloaded' khi đã nạp lại luồng (currentTime đếm lại từ 0 + offset).
 */
export function seekWebAudioCompatible(
  audio: HTMLAudioElement | null,
  track: any,
  targetRelSec: number,
  startOffset: number = 0
): 'native' | 'reloaded' | null {
  if (!audio) return null
  const key = getOnlineSeekKey(track)
  const target = Math.max(0, targetRelSec)
  const wantAbs = Math.max(0, (startOffset || 0) + target)

  if (key && hlsReloadTracks.has(key)) {
    return reloadWithSeek(audio, key, target) ? 'reloaded' : null
  }

  try {
    audio.currentTime = wantAbs
  } catch {
    return null
  }

  // Chỉ stream online qua /play mới cần watchdog (file local tua native luôn được)
  if (!key || !isOnlineStreamTrack(track)) return 'native'
  const src = audio.currentSrc || audio.src || ''
  if (!src.includes('/play?')) return 'native'

  if (seekWatchdog) clearTimeout(seekWatchdog)
  seekWatchdog = setTimeout(() => {
    try {
      const cur = usePlayerStore.getState().currentTrack
      if (!cur || getOnlineSeekKey(cur) !== key) return
      if (!audio.isConnected) return
      const now = audio.currentTime
      if (audio.seeking || Math.abs(now - wantAbs) > 2.5) {
        hlsReloadTracks.add(key)
        reloadWithSeek(audio, key, target)
      }
    } catch {
      // Bỏ qua: lần tua sau sẽ thử lại
    }
  }, 1200)
  return 'native'
}
