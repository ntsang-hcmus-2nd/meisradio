/**
 * Lyrics Service - Multi-engine lyrics fetcher and scraper
 * Engines: LRCLIB (primary), NetEase Cloud Music (fallback 1), Kugou (fallback 2), Musixmatch (fallback 3)
 */

import { ipcMain } from 'electron'
import { sqliteStorage, getConfig } from './sharedContext'

export interface MxmResult {
  success: boolean
  lyrics?: string
  isSynced?: boolean
  source?: 'lrclib' | 'netease' | 'kugou' | 'musixmatch'
  error?: string
  code?: 'NO_TOKEN' | 'RATE_LIMITED' | 'NETWORK' | 'NOT_FOUND' | 'NO_LYRICS' | 'BAD_RESPONSE'
}

export interface LyricsConfig {
  lrclibBaseUrl?: string
}

let configProvider: (() => LyricsConfig | undefined) | null = () => getConfig()

export function setLyricsConfigProvider(provider: () => LyricsConfig | undefined): void {
  configProvider = provider
}

function defaultSplitArtist(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(/[,;&/]|(?:\s+(?:feat\.?|ft\.?|vs\.?)\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

let artistSplitter: (raw: string) => string[] = defaultSplitArtist

export function setArtistSplitter(fn: (raw: string) => string[]): void {
  artistSplitter = fn
}

// ==========================================
// MUSIXMATCH ENGINE & CONSTANTS
// ==========================================
let mxmToken: string | null = null
let mxmTokenPromise: Promise<string | null> | null = null
let mxmCooldownUntil = 0

const MXM_BASE = 'https://apic-desktop.musixmatch.com/ws/1.1'
const MXM_APP_ID = 'web-desktop-app-v1.0'
const MXM_TIMEOUT_MS = 8000
const MXM_COOLDOWN_MS = 2 * 60 * 1000
export const MXM_NEGATIVE_CACHE_MS = 10 * 60 * 1000
export const MXM_CACHE_MAX = 100
const MXM_DUMMY_TOKEN_COOLDOWN_MS = 30 * 60 * 1000
const MXM_DUMMY_LYRICS_ID = 35776330

const mxmHeaders = {
  'User-Agent': 'Musixmatch/3.14.4346-master-20200508',
  Accept: 'application/json'
}

export const mxmResultCache = new Map<string, { at: number; result: MxmResult }>()

export const mxmCacheSet = (key: string, result: MxmResult): void => {
  if (mxmResultCache.size >= MXM_CACHE_MAX) {
    const oldest = mxmResultCache.keys().next().value
    if (oldest !== undefined) mxmResultCache.delete(oldest)
  }
  mxmResultCache.set(key, { at: Date.now(), result })
}

export const hasLrcTimestamps = (text: string): boolean =>
  /\[\d{2,}:\d{2}(?:\.\d{1,3})?\]/.test(text)

export const mxmNormalize = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export const mxmCleanTitle = (title: string): string =>
  title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\s+-\s+.*(remaster|version|edit|live|mix|mono|stereo).*$/i, '')
    .trim()

export const mxmCleanPlainLyrics = (raw: string): string =>
  raw
    .split('*******')[0]
    .replace(/\(\d{6,}\)\s*$/, '')
    .trim()

async function mxmFetchJson(url: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MXM_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: mxmHeaders, signal: controller.signal })
    if (res.status === 429) {
      const err: any = new Error('Musixmatch giới hạn tần suất truy vấn (HTTP 429)')
      err.code = 'RATE_LIMITED'
      throw err
    }
    if (!res.ok && res.status !== 401 && res.status !== 404) {
      const err: any = new Error(`Musixmatch trả về HTTP ${res.status}`)
      err.code = 'NETWORK'
      throw err
    }
    try {
      return await res.json()
    } catch {
      const err: any = new Error('Phản hồi Musixmatch không phải JSON hợp lệ')
      err.code = 'BAD_RESPONSE'
      throw err
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err: any = new Error('Hết thời gian chờ Musixmatch')
      err.code = 'NETWORK'
      throw err
    }
    if (!e?.code) e.code = 'NETWORK'
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function getMusixmatchToken(): Promise<string | null> {
  if (mxmToken) return mxmToken
  if (Date.now() < mxmCooldownUntil) return null
  if (mxmTokenPromise) return mxmTokenPromise

  mxmTokenPromise = (async () => {
    try {
      const data = await mxmFetchJson(`${MXM_BASE}/token.get?app_id=${MXM_APP_ID}`)
      const header = data?.message?.header
      const token = data?.message?.body?.user_token
      if (header?.status_code === 200 && typeof token === 'string' && /^0+$/.test(token)) {
        mxmCooldownUntil = Date.now() + MXM_DUMMY_TOKEN_COOLDOWN_MS
        console.error(
          'Musixmatch trả về token giả (toàn số 0): API desktop không còn trả dữ liệu thật, tạm bỏ qua nguồn này'
        )
        return null
      }
      if (
        header?.status_code === 200 &&
        typeof token === 'string' &&
        token &&
        token !== 'UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly'
      ) {
        mxmToken = token
        return mxmToken
      }
      if (header?.status_code === 401 || header?.hint === 'captcha') {
        mxmCooldownUntil = Date.now() + MXM_COOLDOWN_MS
      }
      console.error('Lỗi lấy Token Musixmatch:', header?.status_code, header?.hint)
    } catch (e) {
      console.error('Lỗi lấy Token Musixmatch:', e)
    }
    return null
  })().finally(() => {
    mxmTokenPromise = null
  })

  return mxmTokenPromise
}

async function mxmCall(
  endpoint: string,
  params: Record<string, string | number>,
  canRetry = true
): Promise<{ statusCode: number; body: any }> {
  const token = await getMusixmatchToken()
  if (!token) {
    const err: any = new Error(
      Date.now() < mxmCooldownUntil
        ? 'Musixmatch tạm không khả dụng (token không hợp lệ hoặc cần xác minh captcha)'
        : 'Không thể khởi tạo token Musixmatch'
    )
    err.code = 'NO_TOKEN'
    throw err
  }

  const qs = new URLSearchParams({
    app_id: MXM_APP_ID,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    usertoken: token
  })
  const data = await mxmFetchJson(`${MXM_BASE}/${endpoint}?${qs.toString()}`)
  const header = data?.message?.header
  const statusCode = Number(header?.status_code)
  if (!Number.isFinite(statusCode)) {
    const err: any = new Error('Phản hồi Musixmatch thiếu mã trạng thái')
    err.code = 'BAD_RESPONSE'
    throw err
  }

  if (statusCode === 401) {
    mxmToken = null
    if (header?.hint === 'captcha') {
      mxmCooldownUntil = Date.now() + MXM_COOLDOWN_MS
      const err: any = new Error('Musixmatch yêu cầu xác minh (captcha)')
      err.code = 'RATE_LIMITED'
      throw err
    }
    if (canRetry) return mxmCall(endpoint, params, false)
    const err: any = new Error('Token Musixmatch bị từ chối')
    err.code = 'NO_TOKEN'
    throw err
  }

  return { statusCode, body: data?.message?.body }
}

function pickBestMxmTrack(trackList: any[], title: string, artists: string[]): any | null {
  const wantTitle = mxmNormalize(mxmCleanTitle(title))
  const wantArtists = artists.map(mxmNormalize).filter(Boolean)
  if (!wantTitle) return null

  let best: any = null
  let bestScore = 0
  for (const item of trackList) {
    const t = item?.track
    if (!t?.track_id) continue
    const gotTitle = mxmNormalize(mxmCleanTitle(String(t.track_name || '')))
    const gotArtist = mxmNormalize(String(t.artist_name || ''))

    let titleScore = 0
    if (gotTitle === wantTitle) titleScore = 3
    else if (gotTitle && (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)))
      titleScore = 1
    if (titleScore === 0) continue

    const artistOk =
      wantArtists.length === 0 ||
      wantArtists.some((a) => gotArtist.includes(a) || (gotArtist && a.includes(gotArtist)))
    if (!artistOk) continue

    const score = titleScore + (t.has_subtitles === 1 ? 1 : 0) + (t.has_lyrics === 1 ? 0.5 : 0)
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}

export async function fetchMusixmatchLyricsInternal(
  title: string,
  artist: string
): Promise<MxmResult> {
  const artists = artistSplitter(artist)
  const primaryArtist = artists[0] || artist

  const cleanTitle = mxmCleanTitle(title)
  const searches: Record<string, string | number>[] = [{ q_track: cleanTitle, q_artist: artist }]
  if (primaryArtist && primaryArtist.toLowerCase() !== artist.toLowerCase()) {
    searches.push({ q_track: cleanTitle, q_artist: primaryArtist })
  }
  searches.push({ q: `${cleanTitle} ${primaryArtist}` })

  let matched: any = null
  for (const search of searches) {
    const { statusCode, body } = await mxmCall('track.search', {
      ...search,
      f_has_lyrics: 1,
      s_track_rating: 'desc',
      page_size: 5,
      page: 1
    })
    if (statusCode !== 200) continue
    const list = Array.isArray(body?.track_list) ? body.track_list : []
    matched = pickBestMxmTrack(list, title, artists.length > 0 ? artists : [artist])
    if (matched) break
  }

  if (!matched) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Không tìm thấy bài hát khớp trên Musixmatch'
    }
  }

  const trackId = matched.track_id

  if (matched.has_subtitles !== 0) {
    const sub = await mxmCall('track.subtitle.get', { track_id: trackId, subtitle_format: 'lrc' })
    const subBody = sub.statusCode === 200 ? sub.body?.subtitle?.subtitle_body : null
    if (typeof subBody === 'string' && hasLrcTimestamps(subBody)) {
      return { success: true, lyrics: subBody, isSynced: true, source: 'musixmatch' }
    }
  }

  const lyr = await mxmCall('track.lyrics.get', { track_id: trackId })
  if (lyr.statusCode === 200) {
    const lyricsObj = lyr.body?.lyrics
    if (lyricsObj?.lyrics_id === MXM_DUMMY_LYRICS_ID) {
      return {
        success: false,
        code: 'BAD_RESPONSE',
        error: 'Musixmatch trả về lời mẫu giả (không phải lời thật của bài hát)'
      }
    }
    if (lyricsObj?.restricted === 1) {
      return {
        success: false,
        code: 'NO_LYRICS',
        error: 'Lời bài hát bị hạn chế bản quyền tại khu vực này'
      }
    }
    const rawBody = lyricsObj?.lyrics_body
    if (typeof rawBody === 'string') {
      const cleaned = mxmCleanPlainLyrics(rawBody)
      if (cleaned) return { success: true, lyrics: cleaned, isSynced: false, source: 'musixmatch' }
    }
  }

  return { success: false, code: 'NO_LYRICS', error: 'Bài hát chưa được cập nhật lời' }
}

// ==========================================
// LRCLIB ENGINE
// ==========================================
function getLrclibBase(): string {
  const cfg = configProvider ? configProvider() : undefined
  const custom = typeof cfg?.lrclibBaseUrl === 'string' ? cfg.lrclibBaseUrl.trim() : ''
  if (custom && (custom.startsWith('http://') || custom.startsWith('https://'))) {
    return custom.replace(/\/+$/, '') + (custom.includes('/api') ? '' : '/api')
  }
  return 'https://lrclib.net/api'
}

const LRCLIB_HEADERS = {
  'User-Agent': 'MeisRadio/1.0.0 (https://github.com/subzerofroze/meisradio)',
  'Lrclib-Client': 'MeisRadio/1.0.0 (https://github.com/subzerofroze/meisradio)',
  'X-User-Agent': 'MeisRadio/1.0.0 (https://github.com/subzerofroze/meisradio)',
  Accept: 'application/json'
}

let lrclibCooldownUntil = 0

async function lrclibFetch(
  endpoint: string,
  params: Record<string, string>,
  retries = 1
): Promise<{ status: number; data: any }> {
  if (Date.now() < lrclibCooldownUntil) {
    return { status: 503, data: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MXM_TIMEOUT_MS)
  try {
    const baseUrl = getLrclibBase()
    const res = await fetch(`${baseUrl}/${endpoint}?${new URLSearchParams(params).toString()}`, {
      headers: LRCLIB_HEADERS,
      signal: controller.signal
    })

    if (res.status === 503 || res.status === 429) {
      if (retries > 0) {
        const retryAfterHdr = res.headers.get('retry-after')
        const delaySec = retryAfterHdr
          ? Math.min(Math.max(parseInt(retryAfterHdr, 10) || 1, 1), 4)
          : 1.5
        await new Promise((r) => setTimeout(r, delaySec * 1000 + Math.random() * 300))
        return lrclibFetch(endpoint, params, retries - 1)
      }
      lrclibCooldownUntil = Date.now() + 2 * 60 * 1000
      console.warn(
        `[LRCLIB] Gặp mã HTTP ${res.status} (quá tải hoặc bị giới hạn), kích hoạt cooldown 2 phút và chuyển sang nguồn dự phòng`
      )
      return { status: res.status, data: null }
    }

    let data: any = null
    try {
      data = await res.json()
    } catch {
      /* body rỗng/không phải JSON */
    }
    if (!res.ok && res.status !== 404) {
      return { status: res.status, data: null }
    }
    return { status: res.status, data }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { status: 408, data: null }
    }
    return { status: 500, data: null }
  } finally {
    clearTimeout(timer)
  }
}

const lrclibToResult = (item: any): MxmResult | null => {
  if (!item) return null
  if (item.instrumental)
    return { success: false, code: 'NO_LYRICS', error: 'Bài hát không lời (instrumental)' }
  const synced = typeof item.syncedLyrics === 'string' ? item.syncedLyrics : ''
  if (synced.trim() && hasLrcTimestamps(synced))
    return { success: true, lyrics: synced, isSynced: true, source: 'lrclib' }
  const plain = typeof item.plainLyrics === 'string' ? item.plainLyrics.trim() : ''
  if (plain) return { success: true, lyrics: plain, isSynced: false, source: 'lrclib' }
  return null
}

export async function fetchLrclibLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<MxmResult> {
  const artists = artistSplitter(artist)
  const primaryArtist = artists[0] || artist
  const cleanTitle = mxmCleanTitle(title) || title
  const hasDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0

  const exactParams: Record<string, string> = { track_name: cleanTitle, artist_name: artist }
  if (album && album.toLowerCase() !== 'unknown' && album.toLowerCase() !== 'unknown album')
    exactParams.album_name = album
  if (hasDuration) exactParams.duration = String(Math.round(duration as number))
  const exact = await lrclibFetch('get', exactParams)
  if (exact.status === 200) {
    const r = lrclibToResult(exact.data)
    if (r) return r
  }

  const search = await lrclibFetch('search', {
    track_name: cleanTitle,
    artist_name: primaryArtist
  })
  const list: any[] = Array.isArray(search.data) ? search.data : []
  const wantTitle = mxmNormalize(cleanTitle)
  const wantArtists = (artists.length > 0 ? artists : [artist]).map(mxmNormalize).filter(Boolean)

  let best: any = null
  let bestScore = 0
  for (const item of list) {
    const gotTitle = mxmNormalize(mxmCleanTitle(String(item?.trackName || '')))
    const gotArtist = mxmNormalize(String(item?.artistName || ''))
    if (
      !gotTitle ||
      !(gotTitle === wantTitle || gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle))
    )
      continue
    if (!wantArtists.some((a) => gotArtist.includes(a) || (gotArtist && a.includes(gotArtist))))
      continue
    if (
      hasDuration &&
      typeof item.duration === 'number' &&
      Math.abs(item.duration - (duration as number)) > 5
    )
      continue
    if (!lrclibToResult(item)) continue

    const score = (gotTitle === wantTitle ? 3 : 1) + (item.syncedLyrics ? 2 : 0)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  const r = lrclibToResult(best)
  if (r) return r
  return { success: false, code: 'NOT_FOUND', error: 'Không tìm thấy bài hát khớp trên LRCLIB' }
}

// ==========================================
// NETEASE CLOUD MUSIC ENGINE
// ==========================================
export async function fetchNetEaseLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<MxmResult | null> {
  const cleanTitle = mxmCleanTitle(title) || title
  const artists = artistSplitter(artist)
  const primaryArtist = artists[0] || artist
  const query = `${cleanTitle} ${primaryArtist}`.trim()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const searchUrl = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1&offset=0&limit=5`
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://music.163.com/'
      },
      signal: controller.signal
    })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const songs = Array.isArray(searchData?.result?.songs) ? searchData.result.songs : []
    if (songs.length === 0) return null

    const wantTitle = mxmNormalize(cleanTitle)
    const wantArtists = (artists.length > 0 ? artists : [artist]).map(mxmNormalize).filter(Boolean)

    let bestSong: any = null
    let bestScore = 0
    for (const s of songs) {
      if (!s?.id) continue
      const gotTitle = mxmNormalize(mxmCleanTitle(String(s.name || '')))
      const songArtists = Array.isArray(s.ar)
        ? s.ar.map((a: any) => mxmNormalize(String(a.name || '')))
        : []

      let titleScore = 0
      if (gotTitle === wantTitle) titleScore = 3
      else if (gotTitle && (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)))
        titleScore = 1
      if (titleScore === 0) continue

      const artistOk =
        wantArtists.length === 0 ||
        wantArtists.some((wa) =>
          songArtists.some((sa: string) => sa.includes(wa) || wa.includes(sa))
        )
      if (!artistOk) continue

      if (
        typeof duration === 'number' &&
        Number.isFinite(duration) &&
        duration > 0 &&
        typeof s.dt === 'number'
      ) {
        const dtSec = s.dt / 1000
        if (Math.abs(dtSec - duration) > 8) continue
      }

      const score = titleScore + (s.dt ? 1 : 0)
      if (score > bestScore) {
        bestScore = score
        bestSong = s
      }
    }

    if (!bestSong?.id) return null

    const lyricUrl = `https://music.163.com/api/song/lyric?id=${bestSong.id}&lv=1&kv=1&tv=-1`
    const lyrRes = await fetch(lyricUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://music.163.com/'
      },
      signal: controller.signal
    })
    if (!lyrRes.ok) return null
    const lyrData = await lyrRes.json()
    const rawLrc = lyrData?.lrc?.lyric
    if (typeof rawLrc === 'string' && rawLrc.trim()) {
      const isSynced = hasLrcTimestamps(rawLrc)
      return {
        success: true,
        lyrics: rawLrc.trim(),
        isSynced,
        source: 'netease'
      }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ==========================================
// KUGOU MUSIC ENGINE
// ==========================================
export async function fetchKugouLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<MxmResult | null> {
  const cleanTitle = mxmCleanTitle(title) || title
  const artists = artistSplitter(artist)
  const primaryArtist = artists[0] || artist
  const query = `${cleanTitle} ${primaryArtist}`.trim()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    let searchUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(query)}`
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      searchUrl += `&duration=${Math.round(duration * 1000)}`
    }
    const searchRes = await fetch(searchUrl, { signal: controller.signal })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const candidates = Array.isArray(searchData?.candidates) ? searchData.candidates : []
    if (candidates.length === 0) return null

    const wantTitle = mxmNormalize(cleanTitle)
    const wantArtists = (artists.length > 0 ? artists : [artist]).map(mxmNormalize).filter(Boolean)

    let bestCand: any = null
    let bestScore = 0
    for (const c of candidates) {
      if (!c?.id || !c?.accesskey) continue
      const gotSong = mxmNormalize(mxmCleanTitle(String(c.song || '')))
      const gotSinger = mxmNormalize(String(c.singer || ''))

      let titleScore = 0
      if (gotSong === wantTitle) titleScore = 3
      else if (gotSong && (gotSong.includes(wantTitle) || wantTitle.includes(gotSong)))
        titleScore = 1
      if (titleScore === 0) continue

      const artistOk =
        wantArtists.length === 0 ||
        wantArtists.some((wa) => gotSinger.includes(wa) || wa.includes(gotSinger))
      if (!artistOk) continue

      const score = titleScore + (c.score || 0)
      if (score > bestScore) {
        bestScore = score
        bestCand = c
      }
    }

    if (!bestCand?.id || !bestCand?.accesskey) return null

    const dlUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${bestCand.id}&accesskey=${bestCand.accesskey}&fmt=lrc&charset=utf8`
    const dlRes = await fetch(dlUrl, { signal: controller.signal })
    if (!dlRes.ok) return null
    const dlData = await dlRes.json()
    if (typeof dlData?.content === 'string' && dlData.content.trim()) {
      const decoded = Buffer.from(dlData.content, 'base64').toString('utf-8')
      if (decoded.trim()) {
        const isSynced = hasLrcTimestamps(decoded)
        return {
          success: true,
          lyrics: decoded.trim(),
          isSynced,
          source: 'kugou'
        }
      }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ==========================================
// MULTI-ENGINE LYRICS AGGREGATOR
// LRCLIB (priority 1) -> NetEase (fallback 1) -> Kugou (fallback 2) -> Musixmatch (fallback 3)
// ==========================================
export async function fetchOnlineLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<MxmResult> {
  // 1. Thử LRCLIB (nguồn chính)
  try {
    const lrclibRes = await fetchLrclibLyrics(title, artist, album, duration)
    if (lrclibRes && lrclibRes.success && lrclibRes.lyrics) {
      return lrclibRes
    }
  } catch (e: any) {
    console.warn('[Lyrics] Lỗi khi gọi LRCLIB, chuyển sang nguồn dự phòng:', e?.message || e)
  }

  // 2. Thử NetEase Cloud Music (nguồn dự phòng cấp 1 - kho dữ liệu khổng lồ, đồng bộ LRC chính xác)
  try {
    const neteaseRes = await fetchNetEaseLyrics(title, artist, duration)
    if (neteaseRes && neteaseRes.success && neteaseRes.lyrics) {
      return neteaseRes
    }
  } catch (e: any) {
    console.warn('[Lyrics] Lỗi khi gọi NetEase:', e?.message || e)
  }

  // 3. Thử Kugou Music (nguồn dự phòng cấp 2)
  try {
    const kugouRes = await fetchKugouLyrics(title, artist, duration)
    if (kugouRes && kugouRes.success && kugouRes.lyrics) {
      return kugouRes
    }
  } catch (e: any) {
    console.warn('[Lyrics] Lỗi khi gọi Kugou:', e?.message || e)
  }

  // 4. Thử Musixmatch (nguồn dự phòng cuối cùng)
  try {
    const mxmRes = await fetchMusixmatchLyricsInternal(title, artist)
    if (mxmRes && mxmRes.success && mxmRes.lyrics) {
      return mxmRes
    }
  } catch {
    /* ignore */
  }

  return {
    success: false,
    code: 'NOT_FOUND',
    error: 'Không tìm thấy lời bài hát trên các nguồn online (LRCLIB, NetEase, Kugou, Musixmatch)'
  }
}

// ==========================================
// IPC HANDLERS CHO LYRICS SERVICE
// ==========================================
export function registerLyricsIpc(): void {
  ipcMain.handle(
    'music:fetchMusixmatchLyrics',
    async (
      _,
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ): Promise<MxmResult> => {
      if (
        typeof title !== 'string' ||
        typeof artist !== 'string' ||
        !title.trim() ||
        !artist.trim()
      ) {
        return { success: false, code: 'NOT_FOUND', error: 'Thiếu tên bài hát hoặc nghệ sĩ' }
      }

      const cacheKey = `${mxmNormalize(title)}|${mxmNormalize(artist)}`

      // 1. Kiểm tra cache RAM
      const cached = mxmResultCache.get(cacheKey)
      if (cached) {
        if (cached.result.success || Date.now() - cached.at < MXM_NEGATIVE_CACHE_MS)
          return cached.result
        mxmResultCache.delete(cacheKey)
      }

      // 2. Kiểm tra cache SQLite nhúng
      const dbCached = sqliteStorage.getOnlineLyric(cacheKey)
      if (dbCached && dbCached.lyrics) {
        const res: MxmResult = {
          success: true,
          lyrics: dbCached.lyrics,
          isSynced: dbCached.isSynced,
          source: dbCached.source as any
        }
        mxmCacheSet(cacheKey, res)
        return res
      }

      // 3. Tra cứu đa nguồn online
      const result = await fetchOnlineLyrics(
        title,
        artist,
        typeof album === 'string' ? album : undefined,
        typeof duration === 'number' ? duration : undefined
      )

      if (result.success && result.lyrics) {
        sqliteStorage.setOnlineLyric(
          cacheKey,
          title,
          artist,
          result.lyrics,
          Boolean(result.isSynced),
          result.source || 'lrclib'
        )
        mxmCacheSet(cacheKey, result)
      } else if (result.code === 'NOT_FOUND' || result.code === 'NO_LYRICS') {
        mxmCacheSet(cacheKey, result)
      }
      return result
    }
  )

  ipcMain.handle(
    'music:fetchLrclibLyrics',
    async (
      _,
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ): Promise<MxmResult> => {
      if (
        typeof title !== 'string' ||
        typeof artist !== 'string' ||
        !title.trim() ||
        !artist.trim()
      ) {
        return { success: false, code: 'NOT_FOUND', error: 'Thiếu tên bài hát hoặc nghệ sĩ' }
      }

      const cacheKey = `${mxmNormalize(title)}|${mxmNormalize(artist)}`

      const cached = mxmResultCache.get(cacheKey)
      if (cached) {
        if (cached.result.success || Date.now() - cached.at < MXM_NEGATIVE_CACHE_MS)
          return cached.result
        mxmResultCache.delete(cacheKey)
      }

      const dbCached = sqliteStorage.getOnlineLyric(cacheKey)
      if (dbCached && dbCached.lyrics) {
        const res: MxmResult = {
          success: true,
          lyrics: dbCached.lyrics,
          isSynced: dbCached.isSynced,
          source: dbCached.source as any
        }
        mxmCacheSet(cacheKey, res)
        return res
      }

      const result = await fetchOnlineLyrics(
        title,
        artist,
        typeof album === 'string' ? album : undefined,
        typeof duration === 'number' ? duration : undefined
      )

      if (result.success && result.lyrics) {
        sqliteStorage.setOnlineLyric(
          cacheKey,
          title,
          artist,
          result.lyrics,
          Boolean(result.isSynced),
          result.source || 'lrclib'
        )
        mxmCacheSet(cacheKey, result)
      } else if (result.code === 'NOT_FOUND' || result.code === 'NO_LYRICS') {
        mxmCacheSet(cacheKey, result)
      }
      return result
    }
  )
}
