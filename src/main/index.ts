import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  globalShortcut,
  nativeImage,
  Tray,
  Menu,
  session
} from 'electron'
import { spawn } from 'child_process'
import crypto from 'crypto'
import { join, dirname } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import * as mm from 'music-metadata'
import { pathToFileURL, fileURLToPath } from 'url'
import NodeID3 from 'node-id3'
import ytdlpDefault, { create } from 'yt-dlp-exec' // Đã sửa lỗi import yt-dlp
import axios from 'axios'
import http from 'http'
import { BassManager } from './BassManager'
import { updateFlacTags, writeFlacMetadata, FlacTagUpdate } from './flacMetadata'
import { updateDsdTags, readDsdTags, DsdTagUpdate } from './dsdMetadata'
import { parseCueFile, resolveCueSheetDurations, type CueTrackInfo } from './cueParser'
export { writeFlacMetadata, readDsdTags }
export type { CueTrackInfo, FlacTagUpdate, DsdTagUpdate }
import {
  DiscordRpcManager,
  DiscordRpcConfig,
  DiscordPresencePayload,
  DEFAULT_DISCORD_CLIENT_ID
} from './DiscordRpcManager'
import {
  getScUserProfile,
  getScTrendingCharts,
  getScMixedSelections,
  getScUserStream,
  getScUserLikes,
  searchSoundCloud,
  getScPlaylistTracks,
  resolveScStreamUrl
} from './soundcloud'
import { soulseekManager } from './SoulseekManager'
import { fastReadMetadata, fastExtractCover, findFolderCoverImage } from './fastAudioParser'
import { SqliteStorage, normalizePathKey } from './sqliteStorage'

export const SUPPORTED_AUDIO_EXTS = [
  '.mp3',
  '.flac',
  '.wav',
  '.m4a',
  '.opus',
  '.ogg',
  '.aac',
  '.alac',
  '.aiff',
  '.wma',
  '.dsf',
  '.dff',
  '.dsd',
  '.bin',
  '.ape'
]

/**
 * Chuẩn hóa tên thư mục, đảm bảo không kết thúc bằng dấu chấm hoặc khoảng trắng (Lỗi Windows Win32)
 * và không chứa các ký tự đặc biệt bị cấm.
 */
export function sanitizeDirectoryName(name: string): string {
  if (!name || typeof name !== 'string') return 'Untitled'
  let safe = name.replace(/[<>:"\/\\|?*\x00-\x1f]/g, '').trim()
  safe = safe.replace(/[\s.]+$/, '').trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) {
    safe += '_folder'
  }
  return safe || 'Untitled'
}

/**
 * Chuẩn hóa tên tệp, loại bỏ ký tự cấm và dấu chấm/khoảng trắng cuối tên.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'track'
  let safe = name.replace(/[<>:"\/\\|?*\x00-\x1f]/g, '').trim()
  safe = safe.replace(/[\s.]+$/, '').trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) {
    safe += '_file'
  }
  return safe || 'track'
}

/**
 * Quét đệ quy toàn bộ tệp âm thanh có định dạng hỗ trợ trong thư mục và mọi thư mục con
 */
export function getAudioFilesInDirectoryRecursive(
  dir: string,
  supportedExts: string[] = SUPPORTED_AUDIO_EXTS
): string[] {
  const audioFiles: string[] = []

  function scan(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.thumbnails' || entry.name.startsWith('.')) continue
        const fullPath = join(currentDir, entry.name)
        if (entry.isDirectory()) {
          scan(fullPath)
        } else if (entry.isFile()) {
          const lowerName = entry.name.toLowerCase()
          if (supportedExts.some((ext) => lowerName.endsWith(ext))) {
            audioFiles.push(fullPath)
          }
        }
      }
    } catch (err) {}
  }

  scan(dir)
  return audioFiles
}

/**
 * Bản bất đồng bộ, tiết kiệm tài nguyên của getAudioFilesInDirectoryRecursive:
 * - Dùng fs.promises.readdir({ withFileTypes }) nên KHÔNG cần stat từng mục để phân biệt thư mục/tệp
 * - Không đi theo symlink thư mục (tránh vòng lặp vô hạn), giới hạn độ sâu tối đa
 * - Nhường event loop định kỳ để tiến trình chính không bị đơ khi quét thư viện lớn
 * - Giữ nguyên thứ tự duyệt theo thư mục (không cần sắp xếp lại toàn bộ danh sách)
 */
const MAX_SCAN_DEPTH = 12
const SCAN_YIELD_EVERY = 16

export async function getAudioFilesInDirectoryRecursiveAsync(
  dir: string,
  supportedExts: string[] = SUPPORTED_AUDIO_EXTS,
  maxDepth: number = MAX_SCAN_DEPTH
): Promise<string[]> {
  const audioFiles: string[] = []
  let visitedDirs = 0

  const scan = async (currentDir: string, depth: number): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
    } catch (err) {
      return
    }

    if (++visitedDirs % SCAN_YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        if (depth < maxDepth) await scan(join(currentDir, entry.name), depth + 1)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const lowerName = entry.name.toLowerCase()
        if (supportedExts.some((ext) => lowerName.endsWith(ext))) {
          audioFiles.push(join(currentDir, entry.name))
        }
      }
    }
  }

  await scan(dir, 0)
  return audioFiles
}

/**
 * Trích lời bài hát nhúng trong metadata và trả về dạng chuỗi.
 * Ưu tiên lời đồng bộ thời gian (SYLT, đơn vị ms) -> chuyển sang định dạng LRC; nếu không có thì lấy lời thô (USLT).
 */
function formatLrcTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
}

export function extractEmbeddedLyrics(metadata: any): string | null {
  const tags = metadata?.common?.lyrics
  if (!Array.isArray(tags) || tags.length === 0) return null

  let plain: string | null = null
  for (const tag of tags as any[]) {
    if (!tag) continue
    if (typeof tag === 'string') {
      if (!plain && tag.trim()) plain = tag
      continue
    }
    // timeStampFormat === 2: mốc thời gian tính bằng mili giây
    if (Array.isArray(tag.syncText) && tag.syncText.length > 0 && tag.timeStampFormat === 2) {
      const lrc = tag.syncText
        .filter(
          (l: any) =>
            l && typeof l.text === 'string' && typeof l.timestamp === 'number' && l.text.trim()
        )
        .map((l: any) => `${formatLrcTimestamp(l.timestamp)}${l.text.trim()}`)
        .join('\n')
      if (lrc) return lrc
    }
    if (!plain && typeof tag.text === 'string' && tag.text.trim()) plain = tag.text
  }
  return plain
}

/**
 * Danh sách các nghệ sĩ / ban nhạc nổi tiếng có chứa ký tự đặc biệt (dấu gạch chéo, dấu phẩy, &)
 * cần được bảo vệ để không bị phân tách nhầm.
 */
export const PRESERVED_ARTIST_NAMES = [
  'AC/DC',
  'Tyler, The Creator',
  'Earth, Wind & Fire',
  'Earth Wind & Fire',
  'Simon & Garfunkel',
  'Hall & Oates',
  'Daryl Hall & John Oates',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Blood, Sweat & Tears',
  'Brooks & Dunn',
  'Bell, Book & Candle',
  'K/DA',
  'Panic! At The Disco',
  'Florence + The Machine',
  'Florence and the Machine',
  'Tom Petty and the Heartbreakers',
  'KC & The Sunshine Band',
  'K-Ci & JoJo',
  'Meg & Dia',
  'Katrina and the Waves',
  'Huey Lewis & The News',
  'Joan Jett & the Blackhearts',
  'Bob Marley & The Wailers',
  'Marina & The Diamonds',
  'Of Monsters and Men',
  'Above & Beyond',
  'Arms and Sleepers',
  'Me & My',
  'Jack & Jack',
  'Dan + Shay',
  'King & Prince',
  'Sunstroke Project & Olia Tira'
]

/**
 * Phân tách chuỗi tên nghệ sĩ thành mảng danh sách từng nghệ sĩ độc lập
 */
export function splitArtistString(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'unknown' ||
    trimmed.toLowerCase() === 'unknown artist'
  ) {
    return []
  }

  for (const preserved of PRESERVED_ARTIST_NAMES) {
    if (trimmed.toLowerCase() === preserved.toLowerCase()) {
      return [preserved]
    }
  }

  let working = trimmed
  const placeholders: { token: string; original: string }[] = []
  PRESERVED_ARTIST_NAMES.forEach((preserved, idx) => {
    const regex = new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    if (regex.test(working)) {
      const token = `__PRESERVED_ARTIST_${idx}__`
      working = working.replace(regex, token)
      placeholders.push({ token, original: preserved })
    }
  })

  // Bảo vệ hậu tố danh xưng đi kèm dấu phẩy (ví dụ: Grover Washington, Jr. hoặc Sammy Davis, Jr.)
  working = working.replace(
    /,\s*(Jr\.?|Sr\.?|III|II|IV)(?=$|[\s,;\/|)\]])/gi,
    (_, g1) => `___JRSR___${g1}`
  )

  // Chuẩn hóa định dạng feat / ft trong ngoặc: (feat. X) -> feat. X
  working = working.replace(
    /[\(\[\{]\s*(?:feat\.?|ft\.?|featuring)\s+([^()\]\}]+)[\)\]\}]/gi,
    ' feat. $1'
  )

  // Tách bằng các ký hiệu phân cách phổ biến
  const splitRegex =
    /(?:\s*;\s*|\0+|\s*[\/\\]+\s*|\s*\|\s*|\s+(?:feat\.?|ft\.?|featuring|with|vs\.?)\s+|\s+[&xX+]\s+|[，、；]|\s*,\s*)/i

  const parts = working.split(splitRegex)
  const result: string[] = []

  for (let part of parts) {
    for (const p of placeholders) {
      part = part.replace(new RegExp(p.token, 'g'), p.original)
    }
    part = part.replace(/___JRSR___/g, ', ')

    const clean = part
      .trim()
      .replace(/^[\(\[\{]/, '')
      .replace(/[\)\]\}]$/, '')
      .trim()
    if (clean && clean.toLowerCase() !== 'unknown' && clean.toLowerCase() !== 'unknown artist') {
      if (/^(jr\.?|sr\.?|iii|ii|iv)$/i.test(clean)) continue

      if (!result.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
        result.push(clean)
      }
    }
  }

  return result.length > 0 ? result : [trimmed]
}

function normalizeForComparison(name: string): string {
  return name.toLowerCase().replace(/[,.\s_-]/g, '')
}

/**
 * Trích xuất toàn diện danh sách nghệ sĩ từ music-metadata (hỗ trợ Vorbis comments nhiều ARTIST, ID3v2 TPE1, iTunes, và tiêu đề feat)
 */
export function extractArtists(
  metadata: any,
  fallbackTitle: string = ''
): { artist: string; artists: string[] } {
  const rawArtistsList: string[] = []

  // 1. Lấy từ metadata.common.artists (mảng)
  if (Array.isArray(metadata?.common?.artists) && metadata.common.artists.length > 0) {
    for (const a of metadata.common.artists) {
      if (typeof a === 'string' && a.trim()) rawArtistsList.push(a.trim())
    }
  }

  // 2. Lấy từ metadata.common.artist (chuỗi)
  if (typeof metadata?.common?.artist === 'string' && metadata.common.artist.trim()) {
    const artStr = metadata.common.artist.trim()
    if (!rawArtistsList.includes(artStr)) {
      rawArtistsList.push(artStr)
    }
  }

  // 3. Quét sâu vào metadata.native (Vorbis, ID3v2, iTunes)
  if (metadata?.native) {
    for (const tagFormat of Object.keys(metadata.native)) {
      const tagList = metadata.native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id || '').toUpperCase()
          // Vorbis / APE tags
          if (tid === 'ARTIST' || tid === 'ARTISTS') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            }
          }
          // ID3 tags
          else if (tid === 'TPE1' || tid === 'TXXX:ARTISTS' || tid === 'TXXX:ARTIST') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            } else if (Array.isArray(t.value)) {
              for (const v of t.value) {
                if (typeof v === 'string' && v.trim()) rawArtistsList.push(v.trim())
              }
            }
          }
          // iTunes / MP4 tags
          else if (tid === '©ART' || tid === '----:COM.APPLE.ITUNES:ARTISTS') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            }
          }
        }
      }
    }
  }

  // 4. Kiểm tra xem tiêu đề bài hát có chứa (feat. XYZ) hoặc [feat. XYZ] không
  const titleToCheck = metadata?.common?.title || fallbackTitle || ''
  if (titleToCheck) {
    const featMatch = titleToCheck.match(/[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+([^()\]]+)[\)\]]/i)
    if (featMatch && featMatch[1]) {
      rawArtistsList.push(featMatch[1].trim())
    }
  }

  // 5. Phân tách và làm sạch tất cả nghệ sĩ thu thập được
  const parsedArtists: string[] = []
  for (const rawItem of rawArtistsList) {
    const split = splitArtistString(rawItem)
    for (const s of split) {
      if (!s) continue
      if (/^(jr\.?|sr\.?|iii|ii|iv)$/i.test(s.trim())) continue

      // Trùng lặp chính xác
      const existingIdx = parsedArtists.findIndex((ex) => ex.toLowerCase() === s.toLowerCase())
      if (existingIdx !== -1) continue

      // Trùng lặp gần đúng
      const normS = normalizeForComparison(s)
      const nearIdx = parsedArtists.findIndex((ex) => normalizeForComparison(ex) === normS)
      if (nearIdx !== -1) {
        if (s.length > parsedArtists[nearIdx].length) {
          parsedArtists[nearIdx] = s
        }
        continue
      }

      // Kiểm tra nghệ sĩ kèm hậu tố Jr/Sr
      const isSubOfExisting = parsedArtists.some((ex) => {
        const normEx = normalizeForComparison(ex)
        return (
          normEx.startsWith(normS) &&
          (normEx.endsWith('jr') || normEx.endsWith('sr') || normEx.endsWith('iii'))
        )
      })
      if (isSubOfExisting) continue

      const subIdx = parsedArtists.findIndex((ex) => {
        const normEx = normalizeForComparison(ex)
        return (
          normS.startsWith(normEx) &&
          (normS.endsWith('jr') || normS.endsWith('sr') || normS.endsWith('iii'))
        )
      })
      if (subIdx !== -1) {
        parsedArtists[subIdx] = s
        continue
      }

      parsedArtists.push(s)
    }
  }

  // 6. Xây dựng chuỗi nghệ sĩ hiển thị chính (artist)
  let mainArtist = ''
  if (typeof metadata?.common?.artist === 'string' && metadata.common.artist.trim()) {
    const commonArt = metadata.common.artist.trim()
    if (parsedArtists.length > 1) {
      const matchesAll = parsedArtists.every((a) =>
        commonArt.toLowerCase().includes(a.toLowerCase())
      )
      if (matchesAll) {
        mainArtist = commonArt
      } else {
        mainArtist = parsedArtists.join(', ')
      }
    } else {
      mainArtist = commonArt
    }
  }

  if (!mainArtist) {
    mainArtist = parsedArtists.length > 0 ? parsedArtists.join(', ') : 'Unknown'
  }

  return {
    artist: mainArtist,
    artists: parsedArtists.length > 0 ? parsedArtists : mainArtist !== 'Unknown' ? [mainArtist] : []
  }
}

/**
 * Tính toán sẵn (Pre-aggregate) dữ liệu Nghệ sĩ và Thể loại từ danh sách bài hát.
 * Được lưu trực tiếp vào library-cache.json để Renderer mở trang Nghệ sĩ & Thể loại tức thì (0ms).
 */
export function buildPreAggregatedData(tracks: any[]) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { artistsList: [], alphabetGroups: [], genresList: [] }
  }

  const artistMap = new Map<
    string,
    {
      name: string
      trackIds: string[]
      albumMap: Map<
        string,
        { title: string; trackIds: string[]; coverArt: string | null; year: number | null }
      >
      coverArt: string | null
    }
  >()

  const genreMap = new Map<
    string,
    {
      name: string
      trackIds: string[]
      artists: Set<string>
      albumSet: Set<string>
      coverArts: string[]
    }
  >()

  for (const track of tracks) {
    const trackKey = track.id || track.filePath
    const trackArtists =
      Array.isArray(track.artists) && track.artists.length > 0
        ? track.artists
        : splitArtistString(track.artist || '')
    const effectiveArtists = trackArtists.length > 0 ? trackArtists : ['Unknown Artist']

    for (const rawArtist of effectiveArtists) {
      const artistName =
        rawArtist && rawArtist.trim() && rawArtist.toLowerCase() !== 'unknown'
          ? rawArtist.trim()
          : 'Unknown Artist'

      let a = artistMap.get(artistName)
      if (!a) {
        a = { name: artistName, trackIds: [], albumMap: new Map(), coverArt: null }
        artistMap.set(artistName, a)
      }
      a.trackIds.push(trackKey)
      if (!a.coverArt && track.coverArt) {
        a.coverArt = track.coverArt
      }

      const albumName =
        track.album && track.album.trim() && track.album.toLowerCase() !== 'unknown'
          ? track.album.trim()
          : null
      if (albumName) {
        let alb = a.albumMap.get(albumName)
        if (!alb) {
          alb = {
            title: albumName,
            trackIds: [],
            coverArt: track.coverArt || null,
            year: track.year || null
          }
          a.albumMap.set(albumName, alb)
        }
        alb.trackIds.push(trackKey)
        if (!alb.coverArt && track.coverArt) alb.coverArt = track.coverArt
        if (!alb.year && track.year) alb.year = track.year
      }
    }

    const rawGenre = track.genre || 'Unknown'
    const splitGenres = String(rawGenre)
      .split(/[,;/|]+/)
      .map((g: string) => g.trim())
      .filter(Boolean)
    const genreList = splitGenres.length > 0 ? splitGenres : ['Unknown']

    for (const g of genreList) {
      const normalizedGenre = g.toLowerCase() === 'unknown' ? 'Unknown' : g
      let gm = genreMap.get(normalizedGenre)
      if (!gm) {
        gm = {
          name: normalizedGenre,
          trackIds: [],
          artists: new Set(),
          albumSet: new Set(),
          coverArts: []
        }
        genreMap.set(normalizedGenre, gm)
      }
      gm.trackIds.push(trackKey)
      for (const art of effectiveArtists) {
        if (art && art.toLowerCase() !== 'unknown' && art.toLowerCase() !== 'unknown artist') {
          gm.artists.add(art.trim())
        }
      }
      if (track.album && track.album !== 'Unknown') gm.albumSet.add(track.album)
      if (track.coverArt && gm.coverArts.length < 4 && !gm.coverArts.includes(track.coverArt)) {
        gm.coverArts.push(track.coverArt)
      }
    }
  }

  // Chuyển artistMap sang artistsList
  const artistsList = Array.from(artistMap.values()).map((a) => ({
    name: a.name,
    trackIds: a.trackIds,
    albums: Array.from(a.albumMap.values()),
    albumCount: a.albumMap.size,
    trackCount: a.trackIds.length,
    coverArt: a.coverArt,
    _sortKey: a.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }))

  // Sắp xếp nhanh không gọi Intl collation nặng
  artistsList.sort((a, b) => (a._sortKey < b._sortKey ? -1 : a._sortKey > b._sortKey ? 1 : 0))

  // Gom nhóm theo chữ cái đầu
  const letterMap = new Map<string, typeof artistsList>()
  for (const artist of artistsList) {
    const trimmed = (artist.name || '').trim()
    const firstChar = trimmed.charAt(0).toUpperCase()
    const norm = firstChar
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[Đđ]/g, 'D')
    const groupKey = /[A-Z]/.test(norm) ? norm : /[0-9]/.test(firstChar) ? '0-9' : '#'
    let list = letterMap.get(groupKey)
    if (!list) {
      list = []
      letterMap.set(groupKey, list)
    }
    list.push(artist)
  }

  const alphabetGroups = Array.from(letterMap.entries()).map(([letter, list]) => ({
    letter,
    count: list.length,
    artists: list
  }))

  alphabetGroups.sort((a, b) => {
    if (a.letter === '#') return 1
    if (b.letter === '#') return -1
    if (a.letter === '0-9') return 1
    if (b.letter === '0-9') return -1
    return a.letter.localeCompare(b.letter)
  })

  // Chuyển genreMap sang genresList
  const genresList = Array.from(genreMap.values()).map((g) => ({
    name: g.name,
    trackIds: g.trackIds,
    artistCount: g.artists.size,
    albumCount: g.albumSet.size,
    trackCount: g.trackIds.length,
    coverArts: g.coverArts,
    artists: Array.from(g.artists)
  }))

  genresList.sort((a, b) => {
    const isAUnknown = a.name === 'Unknown' || a.name === 'Chưa phân loại'
    const isBUnknown = b.name === 'Unknown' || b.name === 'Chưa phân loại'
    if (isAUnknown && !isBUnknown) return 1
    if (!isAUnknown && isBUnknown) return -1
    return b.trackCount - a.trackCount
  })

  return { artistsList, alphabetGroups, genresList }
}

let bassManager: BassManager | null = null
let discordRpcManager: DiscordRpcManager | null = null

// Hàm tìm thư mục chứa binary (ffmpeg, ffprobe) đa môi trường (Dev, Packaged, Portable)
export function getBinaryDir(): string {
  const candidateDirs = [
    // 1. extraResources trong bản build: <resourcesPath>/bin
    join(process.resourcesPath, 'bin'),
    // 2. extraResources dạng lồng: <resourcesPath>/resources/bin
    join(process.resourcesPath, 'resources', 'bin'),
    // 3. Chế độ Dev: <projectRoot>/resources/bin
    join(app.getAppPath(), 'resources', 'bin'),
    // 4. Preview / Dev working directory
    join(process.cwd(), 'resources', 'bin'),
    // 5. asar.unpacked: <app.asar.unpacked>/resources/bin
    join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin'),
    // 6. asar.unpacked: <app.asar.unpacked>/bin
    join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'bin'),
    // 7. Thư mục chứa file exe: <exeDir>/resources/bin
    join(path.dirname(app.getPath('exe')), 'resources', 'bin'),
    // 8. Thư mục chứa file exe: <exeDir>/bin
    join(path.dirname(app.getPath('exe')), 'bin')
  ]

  for (const dir of candidateDirs) {
    if (
      fs.existsSync(dir) &&
      (fs.existsSync(join(dir, 'ffmpeg.exe')) || fs.existsSync(join(dir, 'ffmpeg')))
    ) {
      return dir
    }
  }

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) return dir
  }
  return candidateDirs[0]
}

export const ffmpegDir = getBinaryDir()

// 1. QUẢN LÝ THƯ MỤC DỮ LIỆU ĐỘC LẬP (Chống lỗi cấm ghi ổ đĩa khi Build)
const DATA_FOLDER = is.dev
  ? app.getPath('userData')
  : join(path.dirname(app.getPath('exe')), 'MeisRadioData')

if (!fs.existsSync(DATA_FOLDER)) {
  try {
    fs.mkdirSync(DATA_FOLDER, { recursive: true })
  } catch (err) {}
}

const IMAGE_CACHE_DIR = join(DATA_FOLDER, '.image_cache')
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  try {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true })
  } catch (err) {}
}

const CONFIG_PATH = join(DATA_FOLDER, 'music-config.json')
const USER_PLAYLISTS_PATH = join(DATA_FOLDER, 'user-playlists.json')

// Khởi tạo SQLite Storage Engine (koffi C-FFI) thay thế toàn bộ cache JSON
const sqliteStorage = new SqliteStorage(DATA_FOLDER)

export interface UserPlaylist {
  id: string
  name: string
  description?: string
  thumbnail?: string | null
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

function getUserPlaylists(): UserPlaylist[] {
  try {
    const sqliteLists = sqliteStorage.getUserPlaylists()
    if (sqliteLists && sqliteLists.length > 0) {
      return sqliteLists
    }
    if (fs.existsSync(USER_PLAYLISTS_PATH)) {
      const data = JSON.parse(fs.readFileSync(USER_PLAYLISTS_PATH, 'utf-8'))
      if (Array.isArray(data)) {
        for (const pl of data) {
          sqliteStorage.saveUserPlaylist(pl)
        }
        return data
      }
    }
  } catch (e) {}
  return []
}

function saveUserPlaylists(playlists: UserPlaylist[]) {
  try {
    fs.writeFileSync(USER_PLAYLISTS_PATH, JSON.stringify(playlists, null, 2))
    for (const pl of playlists) {
      sqliteStorage.saveUserPlaylist(pl)
    }
  } catch (e) {}
}

// Nạp bộ nhớ đệm từ SQLite (tự động di chuyển từ JSON cũ nếu có)
let metadataCache: Record<string, { mtime: number; data: any }> = sqliteStorage.getAllMetadata()

let metadataSaveTimer: NodeJS.Timeout | null = null
function saveMetadataCache(immediate: boolean = false) {
  if (immediate) {
    if (metadataSaveTimer) {
      clearTimeout(metadataSaveTimer)
      metadataSaveTimer = null
    }
    try {
      const items = Object.entries(metadataCache).map(([filePath, val]) => ({
        filePath,
        mtime: val.mtime,
        data: val.data
      }))
      sqliteStorage.batchSetMetadata(items)
    } catch (e) {}
    return
  }
  if (metadataSaveTimer) return
  metadataSaveTimer = setTimeout(() => {
    metadataSaveTimer = null
    try {
      const items = Object.entries(metadataCache).map(([filePath, val]) => ({
        filePath,
        mtime: val.mtime,
        data: val.data
      }))
      sqliteStorage.batchSetMetadata(items)
    } catch (e) {}
  }, 1000)
}

let themeColorsCache: Record<string, { primary60: string; secondary30: string; accent10: string }> =
  sqliteStorage.getAllThemeColors()

let themeColorsSaveTimer: NodeJS.Timeout | null = null
function saveThemeColorsCache(immediate: boolean = false) {
  if (immediate) {
    if (themeColorsSaveTimer) {
      clearTimeout(themeColorsSaveTimer)
      themeColorsSaveTimer = null
    }
    try {
      const items = Object.entries(themeColorsCache).map(([key, colors]) => ({
        key,
        colors
      }))
      sqliteStorage.batchSetThemeColors(items)
    } catch (e) {}
    return
  }
  if (themeColorsSaveTimer) return
  themeColorsSaveTimer = setTimeout(() => {
    themeColorsSaveTimer = null
    try {
      const items = Object.entries(themeColorsCache).map(([key, colors]) => ({
        key,
        colors
      }))
      sqliteStorage.batchSetThemeColors(items)
    } catch (e) {}
  }, 1000)
}

function extractThemeColorsFromImage(img: Electron.NativeImage): {
  primary60: string
  secondary30: string
  accent10: string
} {
  try {
    const small = img.resize({ width: 32, height: 32, quality: 'good' })
    const bitmap = small.toBitmap() // Buffer of 32 * 32 * 4 bytes (BGRA)
    const pixels: { r: number; g: number; b: number }[] = []

    // Electron nativeImage.toBitmap() lưu dưới dạng BGRA
    for (let i = 0; i < bitmap.length; i += 4) {
      const b = bitmap[i]
      const g = bitmap[i + 1]
      const r = bitmap[i + 2]
      const a = bitmap[i + 3]
      if (a < 128) continue
      pixels.push({ r, g, b })
    }

    if (pixels.length === 0) {
      return {
        primary60: 'rgb(24, 24, 27)',
        secondary30: 'rgb(39, 39, 42)',
        accent10: 'rgb(16, 185, 129)'
      }
    }

    // 1. Tìm pixel có độ bão hòa (saturation) cao nhất để làm màu accent 10%
    let mostVibrant = pixels[0]
    let maxSat = -1
    for (const p of pixels) {
      const max = Math.max(p.r, p.g, p.b)
      const min = Math.min(p.r, p.g, p.b)
      const sat = max === 0 ? 0 : (max - min) / max
      const score = sat * (max > 40 ? 1 : 0.3)
      if (score > maxSat) {
        maxSat = score
        mostVibrant = p
      }
    }

    // 2. Thuật toán K-Means K=3
    const step = Math.floor(pixels.length / 3)
    const centroids = [
      { ...pixels[0] },
      { ...pixels[Math.min(pixels.length - 1, step)] },
      { ...pixels[Math.min(pixels.length - 1, step * 2)] }
    ]

    for (let iter = 0; iter < 5; iter++) {
      const clusters: { r: number; g: number; b: number }[][] = [[], [], []]
      for (const p of pixels) {
        let minDist = Infinity
        let minIdx = 0
        for (let i = 0; i < 3; i++) {
          const dist = Math.sqrt(
            (p.r - centroids[i].r) ** 2 + (p.g - centroids[i].g) ** 2 + (p.b - centroids[i].b) ** 2
          )
          if (dist < minDist) {
            minDist = dist
            minIdx = i
          }
        }
        clusters[minIdx].push(p)
      }
      for (let i = 0; i < 3; i++) {
        if (clusters[i].length === 0) continue
        let r = 0,
          g = 0,
          b = 0
        for (const p of clusters[i]) {
          r += p.r
          g += p.g
          b += p.b
        }
        centroids[i] = {
          r: Math.floor(r / clusters[i].length),
          g: Math.floor(g / clusters[i].length),
          b: Math.floor(b / clusters[i].length)
        }
      }
    }

    const counts = centroids.map((c) => ({
      c,
      count: pixels.filter((p) => Math.abs(p.r - c.r) < 35).length
    }))
    counts.sort((a, b) => b.count - a.count)

    const dom = counts[0]?.c || pixels[0]
    const sec = counts[1]?.c || dom

    const enforceDark = (c: { r: number; g: number; b: number }, maxVal: number) => {
      const highest = Math.max(c.r, c.g, c.b)
      if (highest === 0) return { r: 18, g: 18, b: 24 }
      if (highest > maxVal) {
        const ratio = maxVal / highest
        return {
          r: Math.max(10, Math.floor(c.r * ratio)),
          g: Math.max(10, Math.floor(c.g * ratio)),
          b: Math.max(10, Math.floor(c.b * ratio))
        }
      }
      return { r: Math.max(10, c.r), g: Math.max(10, c.g), b: Math.max(10, c.b) }
    }

    const enforceAccent = (c: { r: number; g: number; b: number }) => {
      const highest = Math.max(c.r, c.g, c.b)
      if (highest === 0) return { r: 16, g: 185, b: 129 }
      const minVal = 190
      if (highest < minVal) {
        const ratio = minVal / highest
        return {
          r: Math.min(255, Math.floor(c.r * ratio)),
          g: Math.min(255, Math.floor(c.g * ratio)),
          b: Math.min(255, Math.floor(c.b * ratio))
        }
      }
      return c
    }

    const c60 = enforceDark(dom, 35)
    const c30 = enforceDark(sec, 65)
    const c10_raw = maxSat > 0.15 ? mostVibrant : counts[2]?.c || sec
    const c10 = enforceAccent(c10_raw)

    return {
      primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
      secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
      accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
    }
  } catch (err) {
    return {
      primary60: 'rgb(24, 24, 27)',
      secondary30: 'rgb(39, 39, 42)',
      accent10: 'rgb(16, 185, 129)'
    }
  }
}

// 2. KHỞI TẠO YT-DLP AN TOÀN (Chống lỗi không tìm thấy file .exe trong app.asar)
const ytdlp = is.dev
  ? ytdlpDefault
  : create(
      join(
        app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
        'node_modules',
        'yt-dlp-exec',
        'bin',
        process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
      )
    )

app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=512 --optimize_for_size')
app.commandLine.appendSwitch(
  'disable-features',
  'SpareRendererForSitePerProcess,VideoCaptureService'
)
app.commandLine.appendSwitch('renderer-process-limit', '1')

let tray: Tray | null = null
let isQuitting = false
let closeToTray = false
let minimizeToTray = false
let updateTrayMenu: () => void = () => {}

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (app.isReady() && safeStorage.isEncryptionAvailable()) {
        if (config.googleDriveApiKey && config.googleDriveApiKey.startsWith('ENC:')) {
          try {
            config.googleDriveApiKey = safeStorage.decryptString(
              Buffer.from(config.googleDriveApiKey.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.musixmatchApiKey && config.musixmatchApiKey.startsWith('ENC:')) {
          try {
            config.musixmatchApiKey = safeStorage.decryptString(
              Buffer.from(config.musixmatchApiKey.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.ytCookie && config.ytCookie.startsWith('ENC:')) {
          try {
            config.ytCookie = safeStorage.decryptString(
              Buffer.from(config.ytCookie.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.scOAuthToken && config.scOAuthToken.startsWith('ENC:')) {
          try {
            config.scOAuthToken = safeStorage.decryptString(
              Buffer.from(config.scOAuthToken.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
      }

      const rawPaths = Array.isArray(config.libraryPaths)
        ? config.libraryPaths
        : config.libraryPath
          ? [config.libraryPath]
          : []
      config.libraryPaths = rawPaths.filter((p: any) => typeof p === 'string' && p.trim() !== '')
      config.libraryPath = config.libraryPaths[0] || null

      if (!config.discordRpc) {
        config.discordRpc = {
          enabled: true,
          clientId: DEFAULT_DISCORD_CLIENT_ID,
          showDetails: true,
          showTime: true,
          showCover: true,
          showQuality: true,
          showButtons: true,
          showIdle: true
        }
      }

      return config
    }
  } catch (e) {}
  return {
    libraryPath: null,
    libraryPaths: [],
    crossfadeEnabled: false,
    crossfadeDuration: 3,
    volume: 1,
    eqBands: null,
    appMode: 'default',
    discordRpc: {
      enabled: true,
      clientId: DEFAULT_DISCORD_CLIENT_ID,
      showDetails: true,
      showTime: true,
      showCover: true,
      showQuality: true,
      showButtons: true,
      showIdle: true
    }
  }
}

function saveConfig(data: any) {
  const currentConfig = getConfig()
  const newConfig = { ...currentConfig, ...data }

  if (data.libraryPaths && Array.isArray(data.libraryPaths)) {
    newConfig.libraryPaths = data.libraryPaths.filter(
      (p: any) => typeof p === 'string' && p.trim() !== ''
    )
    newConfig.libraryPath = newConfig.libraryPaths[0] || null
  } else if (data.libraryPath !== undefined) {
    if (data.libraryPath) {
      if (!newConfig.libraryPaths) newConfig.libraryPaths = []
      if (!newConfig.libraryPaths.includes(data.libraryPath)) {
        newConfig.libraryPaths = [data.libraryPath, ...newConfig.libraryPaths]
      }
      newConfig.libraryPath = data.libraryPath
    }
  }

  // Mã hóa API Key trước khi ghi đè xuống file JSON
  if (app.isReady() && safeStorage.isEncryptionAvailable()) {
    // Mã hóa Google Drive API Key
    if (data.googleDriveApiKey && !data.googleDriveApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.googleDriveApiKey)
        newConfig.googleDriveApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Google Drive API Key', e)
      }
    }

    // Mã hóa Musixmatch API Key (nếu bạn có dùng)
    if (data.musixmatchApiKey && !data.musixmatchApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.musixmatchApiKey)
        newConfig.musixmatchApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Musixmatch API Key', e)
      }
    }

    // Mã hóa YouTube Music Cookie
    if (data.ytCookie && !data.ytCookie.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.ytCookie)
        newConfig.ytCookie = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa YT Cookie', e)
      }
    }

    // Mã hóa SoundCloud OAuth Token
    if (data.scOAuthToken && !data.scOAuthToken.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.scOAuthToken)
        newConfig.scOAuthToken = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa SoundCloud OAuth Token', e)
      }
    }

    // Mã hóa Soulseek Password
    if (data.soulseekPassword && !data.soulseekPassword.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.soulseekPassword)
        newConfig.soulseekPassword = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Soulseek Password', e)
      }
    }
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2))
}

let mainWindow: BrowserWindow | null = null
let isInMiniPlayer = false
let preMiniPlayerState: {
  bounds: Electron.Rectangle
  isMaximized: boolean
  isFullScreen: boolean
} | null = null
let streamPort = 0

export const getFfmpegPath = (): string => {
  return join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

export function isAllowedLocalPath(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false
  const norm = path.normalize(targetPath)
  const ext = path.extname(norm).toLowerCase()

  // Block sensitive files
  const base = path.basename(norm).toLowerCase()
  if (
    base.startsWith('.env') ||
    base === 'config.json' ||
    base === 'music-config.json' ||
    base === 'settings.json' ||
    base === 'credentials.json'
  ) {
    return false
  }

  // Allowed extensions for media, lyrics, thumbnails
  const allowedExts = [
    ...SUPPORTED_AUDIO_EXTS,
    '.cue',
    '.lrc',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.bmp',
    '.svg',
    '.avif',
    '.jfif'
  ]
  if (allowedExts.includes(ext)) {
    return true
  }

  // Allowed directories
  try {
    const config = getConfig()
    const allowedDirs = [
      ...(config.libraryPaths || []),
      config.libraryPath,
      app.getPath('userData'),
      app.getPath('temp'),
      app.getPath('downloads')
    ]
      .filter(Boolean)
      .map((d) => path.normalize(d).toLowerCase())

    const lowerTarget = norm.toLowerCase()
    return allowedDirs.some((d) => lowerTarget.startsWith(d))
  } catch {
    return false
  }
}

let activeWatchers: fs.FSWatcher[] = []
let libraryWatchDebounceTimer: NodeJS.Timeout | null = null

export function setupLibraryWatchers(paths: string[]): void {
  for (const w of activeWatchers) {
    try {
      w.close()
    } catch {}
  }
  activeWatchers = []

  const validDirs = paths.filter((p) => p && typeof p === 'string' && fs.existsSync(p))
  const relevantExts = [...SUPPORTED_AUDIO_EXTS, '.cue', '.lrc']

  for (const dir of validDirs) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        const lowerName = filename.toLowerCase()
        const isRelevant = relevantExts.some((ext) => lowerName.endsWith(ext))
        if (!isRelevant) return

        if (libraryWatchDebounceTimer) {
          clearTimeout(libraryWatchDebounceTimer)
        }
        libraryWatchDebounceTimer = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('library:fs-changed', { eventType, filename })
          }
        }, 2500)
      })

      watcher.on('error', (_err) => {
        // Safe error handling for network drive disconnects
      })

      activeWatchers.push(watcher)
    } catch (watchErr) {
      console.warn(`[LibraryWatcher] Could not watch directory ${dir}:`, watchErr)
    }
  }
}

// Lưu trạng thái cửa sổ khi thay đổi (chỉ lưu khi không ở chế độ Mini Player)
const saveWindowState = () => {
  if (!mainWindow || isInMiniPlayer) return
  const bounds = mainWindow.getBounds()
  const isMaximized = mainWindow.isMaximized()
  saveConfig({ windowState: { ...bounds, isMaximized } })
}

// TỐI ƯU HÓA BỘ NHỚ NATIVE WIN32: SetProcessWorkingSetSize(-1, -1)
let trimNativeMemory: () => void = () => {}
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi')
    const k32 = koffi.load('kernel32.dll')
    const SetProcessWorkingSetSize = k32.func(
      'int __stdcall SetProcessWorkingSetSize(void* hProcess, size_t dwMinimumWorkingSetSize, size_t dwMaximumWorkingSetSize)'
    )
    const OpenProcess = k32.func(
      'void* __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)'
    )
    const CloseHandle = k32.func('int __stdcall CloseHandle(void* hObject)')
    const GetCurrentProcess = k32.func('void* __stdcall GetCurrentProcess()')

    trimNativeMemory = () => {
      try {
        SetProcessWorkingSetSize(GetCurrentProcess(), -1, -1)
        const metrics = app.getAppMetrics()
        for (const m of metrics) {
          if (m.pid && m.pid !== process.pid) {
            const h = OpenProcess(0x0100 | 0x0400, 0, m.pid)
            if (h) {
              SetProcessWorkingSetSize(h, -1, -1)
              CloseHandle(h)
            }
          }
        }
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[MemoryTrim] Failed to initialize Win32 trim:', e)
  }
}

function createWindow(): void {
  // Đọc cấu hình khi khởi tạo cửa sổ
  const config = getConfig()
  closeToTray = config.closeToTray ?? false
  minimizeToTray = config.minimizeToTray ?? false

  const windowState = config.windowState || { width: 1200, height: 800, isMaximized: false }

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    title: "MEI'S RADIO",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#ffffff',
      height: 40
    },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  soulseekManager.setMainWindow(mainWindow)

  mainWindow.on('resized', saveWindowState)
  mainWindow.on('moved', saveWindowState)
  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)

  const performDeepMemoryTrim = async () => {
    try {
      // TỐI ƯU HÓA: Không gọi session.defaultSession.clearCache() vì hàm này xóa sạch
      // toàn bộ HTTP Disk Cache của Chromium, làm ứng dụng phải nạp và decode lại toàn bộ ảnh bìa khi mở lại.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:onDeepClean')
      }
      if (typeof (global as any).gc === 'function') {
        ;(global as any).gc()
      }
      setTimeout(() => {
        trimNativeMemory()
      }, 300)
    } catch (e) {}
  }

  // Tự động dọn dẹp bộ nhớ khi ứng dụng chạy ngầm không có tương tác
  let idleTrimTimer: NodeJS.Timeout | null = null
  const resetIdleTrim = () => {
    if (idleTrimTimer) clearTimeout(idleTrimTimer)
    idleTrimTimer = setTimeout(() => {
      if (
        mainWindow &&
        (!mainWindow.isFocused() || mainWindow.isMinimized() || !mainWindow.isVisible())
      ) {
        performDeepMemoryTrim()
      }
    }, 180000)
  }

  mainWindow.on('blur', resetIdleTrim)
  mainWindow.on('focus', () => {
    if (idleTrimTimer) {
      clearTimeout(idleTrimTimer)
      idleTrimTimer = null
    }
  })

  // MỚI: Bắt sự kiện khi bấm nút Thu nhỏ (Minimize - Dấu trừ)
  // @ts-ignore
  mainWindow.on('minimize', (event: Electron.Event) => {
    if (minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide() // Ẩn khỏi Taskbar, chỉ hiện ở System Tray
    }
    performDeepMemoryTrim()
  })

  mainWindow.on('hide', () => {
    performDeepMemoryTrim()
  })

  // MỚI: Bắt sự kiện khi bấm nút Đóng (Close - Dấu X)
  mainWindow.on('close', (event: Electron.Event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    } else {
      isQuitting = true
      if (bassManager) bassManager.killSync()
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Lắng nghe các nút chuột mở rộng điều hướng OS (Browser Backward / Forward)
  mainWindow.on('app-command', (_e: any, cmd: string) => {
    if (cmd === 'browser-backward') {
      mainWindow?.webContents.send('nav:back')
    } else if (cmd === 'browser-forward') {
      mainWindow?.webContents.send('nav:forward')
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // ==========================================
  // DISCORD RICH PRESENCE MANAGER
  // ==========================================
  const currentConfig = getConfig()
  discordRpcManager = new DiscordRpcManager()
  discordRpcManager.init(currentConfig.discordRpc)
  soulseekManager.init(currentConfig)

  ipcMain.handle('discord:updatePresence', (_, payload: DiscordPresencePayload) => {
    discordRpcManager?.updatePresence(payload)
    return { success: true }
  })

  ipcMain.handle('discord:clearPresence', () => {
    discordRpcManager?.clearPresence()
    return { success: true }
  })

  ipcMain.handle('discord:updateConfig', (_, config: Partial<DiscordRpcConfig>) => {
    const cur = getConfig()
    const updatedDiscordConfig = { ...(cur.discordRpc || {}), ...config }
    saveConfig({ discordRpc: updatedDiscordConfig })
    discordRpcManager?.updateConfig(updatedDiscordConfig)
    return { success: true, config: discordRpcManager?.getConfig() }
  })

  ipcMain.handle('discord:getStatus', () => {
    return (
      discordRpcManager?.getStatus() || { isConnected: false, isConnecting: false, enabled: false }
    )
  })

  // ==========================================
  // API CẤU HÌNH & THƯ VIỆN
  // ==========================================
  ipcMain.handle('music:getConfig', () => getConfig())
  ipcMain.handle('music:saveConfig', (_, data) => {
    saveConfig(data)
    updateTrayMenu()
    return { success: true }
  })

  // ==========================================
  // BASS AUDIO BACKEND IPC (BIT-PERFECT WASAPI & ASIO + DSD NATIVE)
  // ==========================================
  bassManager = new BassManager()
  const bitPerfectType = (currentConfig.bitPerfectType as 'wasapi' | 'asio') || 'asio'
  const rawVol = currentConfig.volume ?? 1.0
  const initialGain =
    typeof rawVol === 'number' ? Math.pow(Math.max(0, Math.min(1, rawVol)), 2) : 1.0
  bassManager
    .init(
      currentConfig.audioDevice,
      currentConfig.bitPerfectEnabled ?? false,
      initialGain,
      bitPerfectType
    )
    .catch(console.error)

  bassManager.on('time', (val) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:time', val)
    }
  })
  bassManager.on('duration', (val) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:duration', val)
    }
  })
  bassManager.on('paused', (val) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:paused', val)
    }
  })
  bassManager.on('ended', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:ended')
    }
  })
  bassManager.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:error', err)
    }
  })
  bassManager.on('audio-out-params', (params) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:audio-out-params', params)
    }
  })
  bassManager.on('gapless-transition', (nextPath, nextInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bass:gapless-transition', { nextPath, nextInfo })
    }
  })

  const handlePlayAudio = (
    _: any,
    url: string,
    deviceIdOrCrossfade?: any,
    exclusive: boolean = true,
    startTime?: number,
    endTime?: number
  ) => {
    let rawPath = url
    if (typeof rawPath === 'string') {
      if (rawPath.startsWith('file://')) {
        try {
          rawPath = fileURLToPath(rawPath)
        } catch (e) {
          rawPath = decodeURIComponent(rawPath.replace(/^file:\/\/\/?/, ''))
        }
      } else if (rawPath.includes('/local-audio?path=')) {
        try {
          const parsed = new URL(rawPath)
          const p = parsed.searchParams.get('path')
          if (p) rawPath = p
        } catch (_) {}
      }
    }

    let actualDevice = deviceIdOrCrossfade
    let actualExclusive = exclusive
    const actualStart = startTime
    const actualEnd = endTime

    // Nếu truyền crossfadeDuration dưới dạng số ở tham số 2
    if (typeof deviceIdOrCrossfade === 'number') {
      actualDevice = undefined
      actualExclusive = typeof exclusive === 'boolean' ? exclusive : true
    }

    return bassManager?.playFile(rawPath, actualDevice, actualExclusive, actualStart, actualEnd)
  }

  ipcMain.handle('bass:play', handlePlayAudio)
  ipcMain.handle('mpv:play', handlePlayAudio)
  ipcMain.handle('bass:setGapless', (_, enabled: boolean) => bassManager?.setGapless(enabled))
  ipcMain.handle('bass:preloadNext', (_, filePath: string, startTime?: number, endTime?: number) =>
    bassManager?.preloadNextTrack(filePath, startTime, endTime)
  )
  ipcMain.handle('bass:resume', () => bassManager?.play())
  ipcMain.handle('mpv:resume', () => bassManager?.play())
  ipcMain.handle('bass:pause', () => bassManager?.pause())
  ipcMain.handle('mpv:pause', () => bassManager?.pause())
  ipcMain.handle('bass:stop', () => bassManager?.stop())
  ipcMain.handle('mpv:stop', () => bassManager?.stop())
  ipcMain.handle('bass:seek', (_, pos, mode = 'absolute') => bassManager?.seek(pos, mode))
  ipcMain.handle('mpv:seek', (_, pos, mode = 'absolute') => bassManager?.seek(pos, mode))
  ipcMain.handle('bass:setVolume', (_, vol) => {
    bassManager?.setVolume(vol)
  })
  ipcMain.handle('mpv:setVolume', (_, vol) => {
    bassManager?.setVolume(vol)
  })
  ipcMain.handle('bass:setEqualizer', (_, bands, preamp = 0) =>
    bassManager?.setEqualizer(bands, preamp)
  )
  ipcMain.handle('mpv:setEqualizer', (_, bands, preamp = 0) =>
    bassManager?.setEqualizer(bands, preamp)
  )

  ipcMain.handle(
    'mpv:setBitPerfect',
    async (_, val, currentVol?: number, outputType?: 'wasapi' | 'asio') => {
      const config = getConfig()
      config.bitPerfectEnabled = val
      if (outputType) {
        config.bitPerfectType = outputType
      }
      if (typeof currentVol === 'number') {
        config.volume = currentVol
      }
      saveConfig(config)
      const effectiveVol = typeof currentVol === 'number' ? currentVol : config.volume
      const effectiveGain =
        typeof effectiveVol === 'number' ? Math.pow(Math.max(0, Math.min(1, effectiveVol)), 2) : 1.0
      await bassManager?.init(
        config.audioDevice,
        val,
        effectiveGain,
        (config.bitPerfectType as 'wasapi' | 'asio') || 'asio'
      )
      return { success: true }
    }
  )
  ipcMain.handle(
    'bass:setBitPerfect',
    async (_, val, currentVol?: number, outputType?: 'wasapi' | 'asio') => {
      const config = getConfig()
      config.bitPerfectEnabled = val
      if (outputType) {
        config.bitPerfectType = outputType
      }
      if (typeof currentVol === 'number') {
        config.volume = currentVol
      }
      saveConfig(config)
      const effectiveVol = typeof currentVol === 'number' ? currentVol : config.volume
      const effectiveGain =
        typeof effectiveVol === 'number' ? Math.pow(Math.max(0, Math.min(1, effectiveVol)), 2) : 1.0
      await bassManager?.init(
        config.audioDevice,
        val,
        effectiveGain,
        (config.bitPerfectType as 'wasapi' | 'asio') || 'asio'
      )
      return { success: true }
    }
  )

  ipcMain.handle('bass:setOutputType', async (_, type: 'wasapi' | 'asio') => {
    const config = getConfig()
    config.bitPerfectType = type
    saveConfig(config)
    bassManager?.setOutputType(type)
    return { success: true }
  })

  ipcMain.handle('music:setAudioDevice', (_, deviceId) => {
    const config = getConfig()
    config.audioDevice = deviceId
    saveConfig(config)
    bassManager?.setAudioDevice(deviceId)
    return { success: true }
  })

  ipcMain.handle('music:getAudioDevices', async (_, type?: 'wasapi' | 'asio') => {
    try {
      const config = getConfig()
      const targetType = type || (config.bitPerfectType as 'wasapi' | 'asio') || 'asio'
      const rawDevices = bassManager ? bassManager.getAudioDevices(targetType) : []
      const devices = rawDevices.map((d) => ({
        name: d.id,
        description: d.description || d.name,
        type: d.type
      }))
      return { success: true, devices }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unknown error',
        devices: []
      }
    }
  })

  // ==========================================
  // HỆ THỐNG QUẢN LÝ THƯ VIỆN & PLAYLIST
  // ==========================================

  // 1. Chọn và lưu thư mục gốc (Cài đặt)
  ipcMain.handle('music:setLibraryFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const selected = filePaths[0]
    const config = getConfig()
    const currentPaths: string[] =
      config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    if (!currentPaths.includes(selected)) {
      currentPaths.push(selected)
    }
    saveConfig({ libraryPaths: currentPaths, libraryPath: currentPaths[0] || selected })
    return { success: true, path: selected, libraryPaths: currentPaths }
  })

  // Thêm thư mục nhạc mới
  ipcMain.handle('music:addLibraryFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const selected = filePaths[0]
    const config = getConfig()
    const currentPaths: string[] =
      config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    if (!currentPaths.includes(selected)) {
      currentPaths.push(selected)
    }
    saveConfig({ libraryPaths: currentPaths, libraryPath: currentPaths[0] || selected })
    return { success: true, path: selected, libraryPaths: currentPaths }
  })

  // Xóa thư mục nhạc
  ipcMain.handle('music:removeLibraryFolder', async (_, folderPath: string) => {
    const config = getConfig()
    let currentPaths: string[] =
      config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    currentPaths = currentPaths.filter((p) => p !== folderPath)
    saveConfig({ libraryPaths: currentPaths, libraryPath: currentPaths[0] || null })
    return { success: true, libraryPaths: currentPaths }
  })

  // Cập nhật đường dẫn thư mục nhạc
  ipcMain.handle('music:updateLibraryFolder', async (_, oldPath: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const newPath = filePaths[0]
    const config = getConfig()
    let currentPaths: string[] =
      config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    const index = currentPaths.indexOf(oldPath)
    if (index !== -1) {
      currentPaths[index] = newPath
    } else {
      currentPaths.push(newPath)
    }
    saveConfig({ libraryPaths: currentPaths, libraryPath: currentPaths[0] || null })
    return { success: true, oldPath, newPath, libraryPaths: currentPaths }
  })

  // 2. Đọc toàn bộ thư viện (Tất cả bài hát + Playlists đa thư mục) với cơ chế quét gia tăng (Incremental Scan)
  ipcMain.handle(
    'music:getLibrary',
    async (_, forceRefresh: boolean = false, hardRescan: boolean = false) => {
      const isHardRescan = typeof hardRescan === 'boolean' ? hardRescan : false
      const isForceRefresh = typeof forceRefresh === 'boolean' ? forceRefresh : false
      const config = getConfig()
      const libraryPaths: string[] =
        config.libraryPaths && config.libraryPaths.length > 0
          ? config.libraryPaths
          : config.libraryPath
            ? [config.libraryPath]
            : []

      const validPaths = libraryPaths.filter((p) => typeof p === 'string' && fs.existsSync(p))
      if (validPaths.length === 0) {
        return {
          success: false,
          error: 'Chưa cài đặt thư viện',
          tracks: [],
          playlists: [],
          userPlaylists: getUserPlaylists(),
          libraryPaths: []
        }
      }

      const primaryRootPath = validPaths[0]

      // 1. NẾU MỞ APP BÌNH THƯỜNG (KHÔNG FORCE REFRESH VÀ KHÔNG HARD RESCAN): ĐỌC TRỰC TIẾP TỪ SQLITE CACHE, 0% QUÉT Ổ CỨNG
      if (!isForceRefresh && !isHardRescan) {
        try {
          const cached = sqliteStorage.getLibraryCache()
          if (cached) {
            const cachedPaths = Array.isArray(cached.libraryPaths)
              ? cached.libraryPaths
              : cached.libraryPath
                ? [cached.libraryPath]
                : []
            const isSamePaths =
              cachedPaths.length === validPaths.length &&
              cachedPaths.every((p: string, idx: number) => p === validPaths[idx])
            const hasGenreInfo =
              Array.isArray(cached.tracks) &&
              cached.tracks.length > 0 &&
              cached.tracks.some((t: any) => t.genre !== undefined && t.genre !== 'Unknown')
            const hasMultiArtistVersion = cached.multiArtistVersion === 2
            const hasDsdVersion = cached.dsdVersion === 1
            if (
              cached &&
              isSamePaths &&
              hasDsdVersion &&
              Array.isArray(cached.tracks) &&
              cached.tracks.length > 0 &&
              (hasGenreInfo || cached.tracks.length < 5 || hasMultiArtistVersion) &&
              hasMultiArtistVersion
            ) {
              const enrichedTracks = cached.tracks.map((t: any) => {
                const artists =
                  Array.isArray(t.artists) && t.artists.length > 0
                    ? t.artists
                    : splitArtistString(t.artist || '')
                return {
                  ...t,
                  artists,
                  artist:
                    artists.length > 1 &&
                    (!t.artist ||
                      t.artist === 'Unknown' ||
                      artists.every((a: string) =>
                        t.artist.toLowerCase().includes(a.toLowerCase())
                      ))
                      ? t.artist
                      : artists.length > 0
                        ? artists.join(', ')
                        : t.artist || 'Unknown'
                }
              })
              let preAggregated = cached.preAggregated
              if (!preAggregated || !preAggregated.artistsList) {
                preAggregated = buildPreAggregatedData(enrichedTracks)
                try {
                  cached.preAggregated = preAggregated
                  sqliteStorage.setLibraryCache(cached)
                } catch (e) {}
              }
              setupLibraryWatchers(validPaths)
              return {
                success: true,
                fromCache: true,
                libraryPath: primaryRootPath,
                libraryPaths: validPaths,
                tracks: enrichedTracks,
                playlists: cached.playlists || [],
                userPlaylists: getUserPlaylists(),
                preAggregated
              }
            }
          }
        } catch (e) {}
      }

      // 2. LÀM MỚI GIA TĂNG (INCREMENTAL REFRESH):
      // Nạp lại danh sách bài hát trước đó vào Memory Map để tái sử dụng ngay lập tức
      const previousTrackMap = new Map<string, any>()
      try {
        const cached = sqliteStorage.getLibraryCache()
        if (cached && Array.isArray(cached.tracks)) {
          for (const t of cached.tracks) {
            const key = t.id || t.filePath
            if (key) previousTrackMap.set(key, t)
          }
        }
      } catch (e) {}

      const tracks: any[] = []
      const playlists: any[] = []
      const supportedExts = SUPPORTED_AUDIO_EXTS
      const existingDiskPaths = new Set<string>()
      let cacheModified = false

      const parseOrGetTrack = async (
        trackPath: string,
        subItemName: string,
        stat: fs.Stats,
        currentThumbDir: string,
        folderCoverUrl?: string | null,
        folderCoverColors?: any,
        albumCoverMap?: Map<string, { coverUrl: string; themeColors?: any }>
      ) => {
        existingDiskPaths.add(trackPath)

        const trackHash = crypto.createHash('md5').update(trackPath).digest('hex')
        const thumbPath = join(currentThumbDir, `${trackHash}.jpg`)
        const centralThumbPath = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)

        let coverUrl: string | null = null
        let calculatedColors =
          themeColorsCache[trackPath] || themeColorsCache[pathToFileURL(trackPath).href] || null

        // Ưu tiên 1: Tận dụng Folder Art đã được trích xuất sẵn cho toàn bộ thư mục (Deduplication)
        if (folderCoverUrl) {
          coverUrl = folderCoverUrl
          if (!calculatedColors && folderCoverColors) {
            calculatedColors = folderCoverColors
          }
        } else if (fs.existsSync(thumbPath)) {
          coverUrl = pathToFileURL(thumbPath).href
        } else if (fs.existsSync(centralThumbPath)) {
          coverUrl = pathToFileURL(centralThumbPath).href
        }

        // KIỂM TRA CACHE: Nếu không phải hardRescan, file đã có và mtime không đổi -> TÁI SỬ DỤNG HOÀN TOÀN, KHÔNG ĐỌC LẠI FILE
        const cached = metadataCache[trackPath]
        const isMtimeMatch =
          cached && (cached.mtime === stat.mtimeMs || Math.abs(cached.mtime - stat.mtimeMs) < 1000)
        if (!isHardRescan && isMtimeMatch && cached.data && cached.data.multiArtistVersion === 2) {
          const existingTrack =
            previousTrackMap.get(trackPath) || previousTrackMap.get(cached.data.filePath)
          const finalCover = coverUrl || existingTrack?.coverArt || cached.data.coverArt || null
          const finalColors =
            calculatedColors || existingTrack?.themeColors || cached.data.themeColors || null

          // Đồng bộ vào albumCoverMap để các file cùng album/folder tái sử dụng
          if (albumCoverMap && cached.data.album && cached.data.album !== 'Unknown') {
            const albKey = `${cached.data.album.trim().toLowerCase()}:::${(cached.data.artist || '').trim().toLowerCase()}`
            if (!albumCoverMap.has(albKey) && finalCover) {
              albumCoverMap.set(albKey, { coverUrl: finalCover, themeColors: finalColors })
            }
            const dirKey = path.dirname(trackPath)
            if (!albumCoverMap.has(dirKey) && finalCover) {
              albumCoverMap.set(dirKey, { coverUrl: finalCover, themeColors: finalColors })
            }
          }

          if (existingTrack && existingTrack.multiArtistVersion === 2) {
            if (!existingTrack.artists || existingTrack.artists.length === 0) {
              existingTrack.artists = splitArtistString(existingTrack.artist || '')
            }
            const { lyrics: _discardExisting, ...existingNoLyrics } = existingTrack
            return {
              ...existingNoLyrics,
              coverArt: finalCover,
              themeColors: finalColors
            }
          }
          const { lyrics: _discardCached, ...cachedWithoutLyrics } = cached.data
          const ext = path.extname(trackPath).toLowerCase()
          const isDsd = ext === '.dsf' || ext === '.dff' || ext === '.dsd'
          if (isDsd) {
            if (!cachedWithoutLyrics.format || /dsdiff/i.test(cachedWithoutLyrics.format)) {
              cachedWithoutLyrics.format = ext === '.dsf' ? 'DSF' : ext === '.dff' ? 'DFF' : 'DSD'
            }
            cachedWithoutLyrics.lossless = true
            if (!cachedWithoutLyrics.bitDepth) cachedWithoutLyrics.bitDepth = 1
          }
          return {
            ...cachedWithoutLyrics,
            filePath: pathToFileURL(trackPath).href,
            artists:
              Array.isArray(cached.data.artists) && cached.data.artists.length > 0
                ? cached.data.artists
                : splitArtistString(cached.data.artist || ''),
            coverArt: finalCover,
            themeColors: finalColors
          }
        }

        // CHỈ ĐỌC VÀ PHÂN TÍCH METADATA VỚI CÁC FILE MỚI ĐƯỢC THÊM HOẶC BỊ SỬA ĐỔI
        try {
          const trackDir = path.dirname(trackPath)
          let knownAlbumCover = albumCoverMap ? albumCoverMap.get(trackDir) : undefined

          // Nếu đã có coverUrl từ folderArt hoặc albumCoverMap -> Bỏ qua đọc ảnh bìa (skipCovers: true)
          const hasKnownCover = Boolean(coverUrl || (knownAlbumCover && knownAlbumCover.coverUrl))
          const shouldSkipCovers = hasKnownCover

          // Header-Only Seeking: Chỉ đọc các KB đầu chứa tag/header, không nạp toàn bộ file audio 50MB
          const metadata = await fastReadMetadata(trackPath, { skipCovers: shouldSkipCovers })

          if (!calculatedColors) {
            calculatedColors =
              themeColorsCache[trackPath] || themeColorsCache[pathToFileURL(trackPath).href] || null
          }

          // Tận dụng Album Key để khử trùng lặp theo Album (Deduplication)
          const rawAlbum = (metadata.common.album || '').trim().toLowerCase()
          const rawArtist = (metadata.common.albumartist || metadata.common.artist || '')
            .trim()
            .toLowerCase()
          const albumKey = rawAlbum && rawAlbum !== 'unknown' ? `${rawAlbum}:::${rawArtist}` : null

          if (albumCoverMap && albumKey && !knownAlbumCover && albumCoverMap.has(albumKey)) {
            knownAlbumCover = albumCoverMap.get(albumKey)
          }

          if (!coverUrl && knownAlbumCover) {
            coverUrl = knownAlbumCover.coverUrl
            if (!calculatedColors && knownAlbumCover.themeColors) {
              calculatedColors = knownAlbumCover.themeColors
            }
          }

          // Nếu chưa có coverUrl và có ảnh nhúng trong metadata: trích xuất & nén thumbnail 1 lần cho cả album
          if (!coverUrl && metadata.common.picture && metadata.common.picture.length > 0) {
            try {
              const rawBuf = Buffer.from(metadata.common.picture[0].data)
              const img = nativeImage.createFromBuffer(rawBuf)
              const resized = img.resize({ width: 128, height: 128, quality: 'good' })
              const thumbBuf = resized.toJPEG(80)

              try {
                fs.writeFileSync(thumbPath, thumbBuf)
                coverUrl = pathToFileURL(thumbPath).href
              } catch (e) {}
              try {
                if (!fs.existsSync(centralThumbPath)) {
                  fs.writeFileSync(centralThumbPath, thumbBuf)
                }
                if (!coverUrl) {
                  coverUrl = pathToFileURL(centralThumbPath).href
                }
              } catch (e) {}

              if (!calculatedColors) {
                calculatedColors = extractThemeColorsFromImage(img)
                themeColorsCache[trackPath] = calculatedColors
                themeColorsCache[pathToFileURL(trackPath).href] = calculatedColors
                cacheModified = true
              }

              // Ghi nhớ vào albumCoverMap để các bài hát tiếp theo cùng Album/Folder tái sử dụng (0 lần đọc tiếp theo!)
              if (albumCoverMap) {
                const entry = { coverUrl: coverUrl!, themeColors: calculatedColors }
                if (albumKey) albumCoverMap.set(albumKey, entry)
                albumCoverMap.set(trackDir, entry)

                // Lưu một thumbnail đại diện cho album vào IMAGE_CACHE_DIR
                if (albumKey) {
                  const albumHash = crypto
                    .createHash('md5')
                    .update('album_' + albumKey)
                    .digest('hex')
                  const albumThumbPath = join(IMAGE_CACHE_DIR, `alb_${albumHash}.jpg`)
                  try {
                    if (!fs.existsSync(albumThumbPath)) {
                      fs.writeFileSync(albumThumbPath, thumbBuf)
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }

          let genreStr = ''
          if (metadata.common.genre && metadata.common.genre.length > 0) {
            genreStr = Array.isArray(metadata.common.genre)
              ? metadata.common.genre
                  .map((g: any) => String(g).trim())
                  .filter(Boolean)
                  .join(', ')
              : String(metadata.common.genre).trim()
          }
          if (!genreStr || genreStr.toLowerCase() === 'unknown') {
            if (metadata.native) {
              for (const tagFormat of Object.keys(metadata.native)) {
                const tagList = metadata.native[tagFormat]
                if (Array.isArray(tagList)) {
                  for (const t of tagList) {
                    const tid = String(t.id).toUpperCase()
                    if (
                      tid === 'TCON' ||
                      tid === 'GENRE' ||
                      tid === '©GEN' ||
                      tid === 'WM/GENRE' ||
                      tid === 'GEN'
                    ) {
                      if (t.value) {
                        const val = Array.isArray(t.value)
                          ? t.value.join(', ')
                          : String(t.value).trim()
                        if (val && val.toLowerCase() !== 'unknown') {
                          genreStr = val
                          break
                        }
                      }
                    }
                  }
                }
                if (genreStr && genreStr.toLowerCase() !== 'unknown') break
              }
            }
          }
          // Phân giải ID3v1 genre index ví dụ (17) hoặc 17
          const numMatch = genreStr.match(/^\(?(\d+)\)?$/)
          if (numMatch) {
            const idx = parseInt(numMatch[1])
            const ID3_GENRES = [
              'Blues',
              'Classic Rock',
              'Country',
              'Dance',
              'Disco',
              'Funk',
              'Grunge',
              'Hip-Hop',
              'Jazz',
              'Metal',
              'New Age',
              'Oldies',
              'Other',
              'Pop',
              'R&B',
              'Rap',
              'Reggae',
              'Rock',
              'Techno',
              'Industrial',
              'Alternative',
              'Ska',
              'Death Metal',
              'Pranks',
              'Soundtrack',
              'Euro-Techno',
              'Ambient',
              'Trip-Hop',
              'Vocal',
              'Jazz+Funk',
              'Fusion',
              'Trance',
              'Classical',
              'Instrumental',
              'Acid',
              'House',
              'Game',
              'Sound Clip',
              'Gospel',
              'Noise',
              'AlternRock',
              'Bass',
              'Soul',
              'Punk',
              'Space',
              'Meditative',
              'Instrumental Pop',
              'Instrumental Rock',
              'Ethnic',
              'Gothic',
              'Darkwave',
              'Techno-Industrial',
              'Electronic',
              'Pop-Folk',
              'Eurodance',
              'Dream',
              'Southern Rock',
              'Comedy',
              'Cult',
              'Gangsta',
              'Top 40',
              'Christian Rap',
              'Pop/Funk',
              'Jungle',
              'Native American',
              'Cabaret',
              'New Wave',
              'Psychadelic',
              'Rave',
              'Showtunes',
              'Trailer',
              'Lo-Fi',
              'Tribal',
              'Acid Punk',
              'Acid Jazz',
              'Polka',
              'Retro',
              'Musical',
              'Rock & Roll',
              'Hard Rock',
              'Folk',
              'Folk-Rock',
              'National Folk',
              'Swing',
              'Fast Fusion',
              'Bebob',
              'Latin',
              'Revival',
              'Celtic',
              'Bluegrass',
              'Avantgarde',
              'Gothic Rock',
              'Progressive Rock',
              'Psychedelic Rock',
              'Symphonic Rock',
              'Slow Rock',
              'Big Band',
              'Chorus',
              'Easy Listening',
              'Acoustic',
              'Humour',
              'Speech',
              'Chanson',
              'Opera',
              'Chamber Music',
              'Sonata',
              'Symphony',
              'Booty Bass',
              'Primus',
              'Porn Groove',
              'Satire',
              'Slow Jam',
              'Club',
              'Tango',
              'Samba',
              'Folklore',
              'Ballad',
              'Power Ballad',
              'Rhythmic Soul',
              'Freestyle',
              'Duet',
              'Punk Rock',
              'Drum Solo',
              'A capella',
              'Euro-House',
              'Dance Hall',
              'Goa',
              'Drum & Bass',
              'Club-House',
              'Hardcore',
              'Terror',
              'Indie',
              'BritPop',
              'Afro-Punk',
              'Polsk Punk',
              'Beat',
              'Christian Gangsta Rap',
              'Heavy Metal',
              'Black Metal',
              'Crossover',
              'Contemporary Christian',
              'Christian Rock',
              'Merengue',
              'Salsa',
              'Thrash Metal',
              'Anime',
              'JPop',
              'Synthpop'
            ]
            if (ID3_GENRES[idx]) {
              genreStr = ID3_GENRES[idx]
            }
          }
          if (!genreStr) genreStr = 'Unknown'

          const yearVal =
            metadata.common.year || (metadata.common.date ? parseInt(metadata.common.date) : null)

          const { artist, artists } = extractArtists(metadata, subItemName)

          const ext = path.extname(subItemName).toLowerCase()
          const isDsdExt = ext === '.dsf' || ext === '.dff' || ext === '.dsd'
          let rawFormat =
            metadata.format.container || subItemName.split('.').pop()?.toUpperCase() || 'AUDIO'
          if (isDsdExt) {
            rawFormat = ext === '.dsf' ? 'DSF' : ext === '.dff' ? 'DFF' : 'DSD'
          } else if (
            metadata.format.codec === 'DSD' ||
            (metadata.format.container && /dsd/i.test(metadata.format.container))
          ) {
            rawFormat = 'DSD'
          }

          const isLossless = Boolean(
            metadata.format.lossless ||
            isDsdExt ||
            rawFormat === 'DSF' ||
            rawFormat === 'DFF' ||
            rawFormat === 'DSD'
          )
          const effectiveBitDepth = isDsdExt
            ? 1
            : metadata.format.bitsPerSample ||
              (isLossless && metadata.format.sampleRate ? 16 : undefined)
          const effectiveSampleRate = metadata.format.sampleRate || (isDsdExt ? 2822400 : undefined)

          const trackData = {
            id: trackPath,
            filePath: pathToFileURL(trackPath).href,
            title: metadata.common.title || subItemName.replace(/\.[^/.]+$/, ''),
            artist: artist,
            artists: artists,
            multiArtistVersion: 2,
            album: metadata.common.album || 'Unknown',
            albumArtist: metadata.common.albumartist || null,
            genre: genreStr,
            year: yearVal,
            trackNo: metadata.common.track?.no || null,
            trackNumber: metadata.common.track?.no || null,
            discNumber: metadata.common.disk?.no || null,
            duration: metadata.format.duration,
            format: rawFormat,
            bitrate: metadata.format.bitrate,
            sampleRate: effectiveSampleRate,
            bitDepth: effectiveBitDepth,
            lossless: isLossless,
            isCloud: false,
            coverArt: coverUrl,
            themeColors:
              themeColorsCache[trackPath] || themeColorsCache[pathToFileURL(trackPath).href] || null
          }

          metadataCache[trackPath] = {
            mtime: stat.mtimeMs,
            data: trackData
          }
          cacheModified = true
          return trackData
        } catch (e) {
          const ext = path.extname(subItemName).toLowerCase()
          const isDsdExt = ext === '.dsf' || ext === '.dff' || ext === '.dsd'
          const fallbackTrack = {
            id: trackPath,
            filePath: pathToFileURL(trackPath).href,
            title: subItemName.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown',
            artists: ['Unknown'],
            multiArtistVersion: 2,
            album: 'Unknown',
            genre: 'Unknown',
            year: null,
            duration: 0,
            format: isDsdExt
              ? ext === '.dsf'
                ? 'DSF'
                : ext === '.dff'
                  ? 'DFF'
                  : 'DSD'
              : ext.replace('.', '').toUpperCase() || 'AUDIO',
            sampleRate: isDsdExt ? 2822400 : undefined,
            bitDepth: isDsdExt ? 1 : undefined,
            lossless: isDsdExt || ['.flac', '.wav', '.alac', '.aiff'].includes(ext),
            isCloud: false,
            coverArt: coverUrl
          }
          return fallbackTrack
        }
      }

      // Khởi tạo bộ nhớ đệm khử trùng lặp theo Album và Folder Art
      const albumCoverMap = new Map<string, { coverUrl: string; themeColors?: any }>()
      const dirFolderCoverMap = new Map<string, { coverUrl: string; themeColors?: any } | null>()

      const getOrResolveFolderCover = (
        dirPath: string
      ): { coverUrl: string; themeColors?: any } | null => {
        if (dirFolderCoverMap.has(dirPath)) {
          return dirFolderCoverMap.get(dirPath)!
        }

        const folderImg = findFolderCoverImage(dirPath)
        if (!folderImg) {
          dirFolderCoverMap.set(dirPath, null)
          return null
        }

        try {
          const folderHash = crypto
            .createHash('md5')
            .update('dir_cover_' + folderImg)
            .digest('hex')
          const centralThumbPath = join(IMAGE_CACHE_DIR, `fld_${folderHash}.jpg`)
          let coverUrl: string | null = null
          let colors: any = themeColorsCache[folderImg] || null

          if (fs.existsSync(centralThumbPath)) {
            coverUrl = pathToFileURL(centralThumbPath).href
          } else {
            const img = nativeImage.createFromPath(folderImg)
            const resized = img.resize({ width: 128, height: 128, quality: 'good' })
            const jpegBuf = resized.toJPEG(80)
            try {
              fs.writeFileSync(centralThumbPath, jpegBuf)
            } catch {}
            coverUrl = pathToFileURL(centralThumbPath).href
            if (!colors) {
              colors = extractThemeColorsFromImage(img)
              themeColorsCache[folderImg] = colors
              cacheModified = true
            }
          }

          const res = coverUrl ? { coverUrl, themeColors: colors } : null
          dirFolderCoverMap.set(dirPath, res)
          return res
        } catch {
          dirFolderCoverMap.set(dirPath, null)
          return null
        }
      }

      const discoveredCueFiles: { cuePath: string; playlistTracks?: any[]; folderCover?: any }[] = []

      // Duyệt qua tất cả các thư mục trong validPaths
      for (const folderRoot of validPaths) {
        try {
          const thumbDir = join(folderRoot, '.thumbnails')
          if (!fs.existsSync(thumbDir)) {
            try {
              fs.mkdirSync(thumbDir)
            } catch (e) {}
          }

          const dirents = await fs.promises.readdir(folderRoot, { withFileTypes: true })
          for (const dirent of dirents) {
            const item = dirent.name
            const itemPath = join(folderRoot, item)
            try {
              // Dirent đã cho biết loại mục -> không cần stat; chỉ stat khi là symlink để biết đích đến
              let isDir = dirent.isDirectory()
              if (!isDir && dirent.isSymbolicLink()) {
                isDir = (await fs.promises.stat(itemPath)).isDirectory()
              }

              if (isDir && item !== '.thumbnails') {
                const playlistTracks: any[] = []
                // Quét đệ quy (bất đồng bộ, nhường event loop) mọi file âm thanh và file CUE trong thư mục và các thư mục con
                const allFiles = await getAudioFilesInDirectoryRecursiveAsync(
                  itemPath,
                  [...supportedExts, '.cue']
                )
                const allTrackPaths = allFiles.filter((f) => !f.toLowerCase().endsWith('.cue'))
                const subCuePaths = allFiles.filter((f) => f.toLowerCase().endsWith('.cue'))

                // Ưu tiên 1: Folder Art cho playlist / thư mục
                const itemFolderCover = getOrResolveFolderCover(itemPath)

                for (const cp of subCuePaths) {
                  discoveredCueFiles.push({
                    cuePath: cp,
                    playlistTracks,
                    folderCover: itemFolderCover
                  })
                }

                let trackIndex = 0
                for (const trackPath of allTrackPaths) {
                  try {
                    // I/O Throttling & Rate Limiting: Nhường event loop định kỳ giữa các file để OS xử lý mượt mà
                    if (++trackIndex % 10 === 0) {
                      await new Promise<void>((resolve) => setImmediate(resolve))
                    }

                    const subStat = await fs.promises.stat(trackPath)
                    const fileName = path.basename(trackPath)
                    const trackDir = path.dirname(trackPath)

                    // Tìm folder cover của đúng thư mục chứa bài hát (hỗ trợ cả các subfolder)
                    const trackFolderCover =
                      trackDir === itemPath
                        ? itemFolderCover
                        : getOrResolveFolderCover(trackDir) || itemFolderCover

                    const trackData = await parseOrGetTrack(
                      trackPath,
                      fileName,
                      subStat,
                      thumbDir,
                      trackFolderCover?.coverUrl || null,
                      trackFolderCover?.themeColors || null,
                      albumCoverMap
                    )
                    playlistTracks.push(trackData)
                    tracks.push(trackData)
                  } catch (e) {}
                }

                // Thumbnail cho playlist: Ưu tiên Folder Art, fallback sang ảnh bài hát đầu tiên
                let thumbnailUrl = itemFolderCover?.coverUrl || null
                if (!thumbnailUrl && playlistTracks.length > 0 && playlistTracks[0].coverArt) {
                  thumbnailUrl = playlistTracks[0].coverArt
                }

                playlists.push({
                  name: item,
                  path: itemPath,
                  folderRoot,
                  tracks: playlistTracks,
                  thumbnail: thumbnailUrl
                })
              } else if (!isDir && item.toLowerCase().endsWith('.cue')) {
                const rootFolderCover = getOrResolveFolderCover(folderRoot)
                discoveredCueFiles.push({
                  cuePath: itemPath,
                  folderCover: rootFolderCover
                })
              } else if (!isDir && supportedExts.some((ext) => item.toLowerCase().endsWith(ext))) {
                const stat = await fs.promises.stat(itemPath)
                const rootFolderCover = getOrResolveFolderCover(folderRoot)
                const trackData = await parseOrGetTrack(
                  itemPath,
                  item,
                  stat,
                  thumbDir,
                  rootFolderCover?.coverUrl || null,
                  rootFolderCover?.themeColors || null,
                  albumCoverMap
                )
                tracks.push(trackData)
              }
            } catch (e) {}
          }
        } catch (e) {}
      }

      // XỬ LÝ CUE SHEETS: Tạo các track ảo và thay thế file ảnh đĩa gốc 60 phút
      const replacedAudioFiles = new Set<string>()

      for (const cueItem of discoveredCueFiles) {
        try {
          const cueResult = parseCueFile(cueItem.cuePath)
          if (!cueResult || cueResult.tracks.length === 0) continue

          await resolveCueSheetDurations(cueResult, async (audioPath) => {
            const normPath = normalizePathKey(audioPath)
            const matched = tracks.find(
              (t) =>
                normalizePathKey(t.id) === normPath || normalizePathKey(t.filePath) === normPath
            )
            if (matched && matched.duration) return matched.duration
            try {
              const meta = await fastReadMetadata(audioPath, { skipCovers: true })
              return meta.format.duration
            } catch {
              return undefined
            }
          })

          for (const cueTrack of cueResult.tracks) {
            if (!cueTrack.audioFilePath) continue
            const normAudio = normalizePathKey(cueTrack.audioFilePath)
            const parentTrack = tracks.find(
              (t) =>
                normalizePathKey(t.id) === normAudio || normalizePathKey(t.filePath) === normAudio
            )

            // Đánh dấu file âm thanh gốc để ẩn đi (tránh nhân đôi file 60 phút và các track con)
            replacedAudioFiles.add(normAudio)
            if (parentTrack) {
              replacedAudioFiles.add(normalizePathKey(parentTrack.id))
              replacedAudioFiles.add(normalizePathKey(parentTrack.filePath))
            }

            const parentDur = parentTrack?.duration || 0
            const cueEndTime = cueTrack.endTime || parentDur
            const cueDur = cueTrack.duration || Math.max(0, cueEndTime - cueTrack.startTime)

            const isBinFile = cueTrack.audioFilePath.toLowerCase().endsWith('.bin')
            const effectiveFormat = parentTrack?.format || (isBinFile ? 'CD-DA (BIN)' : 'AUDIO')
            const effectiveBitrate = parentTrack?.bitrate || (isBinFile ? 1411200 : undefined)
            const effectiveSampleRate = parentTrack?.sampleRate || (isBinFile ? 44100 : undefined)
            const effectiveBitDepth = parentTrack?.bitDepth || (isBinFile ? 16 : undefined)

            const cueTrackEntry = {
              id: `${pathToFileURL(cueTrack.audioFilePath).href}#track-${cueTrack.trackNumber}`,
              filePath: pathToFileURL(cueTrack.audioFilePath).href,
              cueFilePath: cueTrack.cueFilePath,
              startTime: cueTrack.startTime,
              endTime: cueEndTime,
              duration: cueDur,
              title: cueTrack.title,
              artist: cueTrack.artist,
              artists:
                cueTrack.artists && cueTrack.artists.length > 0
                  ? cueTrack.artists
                  : [cueTrack.artist],
              multiArtistVersion: 2,
              album: cueTrack.album || parentTrack?.album || 'Unknown',
              albumArtist: cueTrack.albumArtist || parentTrack?.albumArtist || null,
              genre: cueTrack.genre || parentTrack?.genre || 'Unknown',
              year: cueTrack.year
                ? parseInt(cueTrack.year) || parentTrack?.year
                : parentTrack?.year || null,
              trackNo: cueTrack.trackNumber,
              trackNumber: cueTrack.trackNumber,
              discNumber: parentTrack?.discNumber || null,
              format: effectiveFormat,
              bitrate: effectiveBitrate,
              sampleRate: effectiveSampleRate,
              bitDepth: effectiveBitDepth,
              lossless: parentTrack?.lossless ?? true,
              isDsd: parentTrack?.isDsd ?? false,
              isCloud: false,
              isCueTrack: true,
              coverArt: parentTrack?.coverArt || cueItem.folderCover?.coverUrl || null,
              themeColors: parentTrack?.themeColors || cueItem.folderCover?.themeColors || null
            }

            tracks.push(cueTrackEntry)
            if (cueItem.playlistTracks) {
              cueItem.playlistTracks.push(cueTrackEntry)
            }
          }
        } catch (cueErr) {
          console.warn('[CUE Parser] Lỗi xử lý CUE:', cueItem.cuePath, cueErr)
        }
      }

      if (replacedAudioFiles.size > 0) {
        const filteredTracks = tracks.filter((t) => {
          if (t.isCueTrack) return true
          const normId = normalizePathKey(t.id)
          const normFp = normalizePathKey(t.filePath)
          return !replacedAudioFiles.has(normId) && !replacedAudioFiles.has(normFp)
        })
        tracks.length = 0
        tracks.push(...filteredTracks)

        for (const pl of playlists) {
          if (Array.isArray(pl.tracks)) {
            pl.tracks = pl.tracks.filter((t: any) => {
              if (t.isCueTrack) return true
              const normId = normalizePathKey(t.id)
              const normFp = normalizePathKey(t.filePath)
              return !replacedAudioFiles.has(normId) && !replacedAudioFiles.has(normFp)
            })
          }
        }
      }

      // DỌN DẸP CACHE: Loại bỏ các file đã bị xóa khỏi ổ đĩa khỏi metadataCache & themeColorsCache
      for (const cachedPath of Object.keys(metadataCache)) {
        if (!existingDiskPaths.has(cachedPath)) {
          delete metadataCache[cachedPath]
          delete themeColorsCache[cachedPath]
          delete themeColorsCache[pathToFileURL(cachedPath).href]
          sqliteStorage.deleteMetadata(cachedPath)
          sqliteStorage.deleteThemeColor(cachedPath)
          sqliteStorage.deleteThemeColor(pathToFileURL(cachedPath).href)
          cacheModified = true
        }
      }

      if (cacheModified) {
        saveMetadataCache()
        saveThemeColorsCache()
      }

      const userPlaylists = getUserPlaylists()
      const preAggregated = buildPreAggregatedData(tracks)

      try {
        sqliteStorage.setLibraryCache({
          libraryPath: primaryRootPath,
          libraryPaths: validPaths,
          tracks,
          playlists,
          multiArtistVersion: 2,
          dsdVersion: 1,
          preAggregated
        })
      } catch (e) {}

      setupLibraryWatchers(validPaths)
      return {
        success: true,
        libraryPath: primaryRootPath,
        libraryPaths: validPaths,
        tracks,
        playlists,
        userPlaylists,
        preAggregated
      }
    }
  )

  // 3. Đổi tên Playlist (Thư mục & Ảnh)
  ipcMain.handle('music:renamePlaylist', async (_, oldName, newName) => {
    const config = getConfig()
    const paths: string[] = config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    try {
      const safeNewName = sanitizeDirectoryName(newName)
      if (!safeNewName || safeNewName === 'Untitled') {
        return { success: false, error: 'Tên playlist không hợp lệ!' }
      }

      let targetRoot = paths[0]
      for (const p of paths) {
        if (fs.existsSync(join(p, oldName))) {
          targetRoot = p
          break
        }
      }
      const oldDirPath = join(targetRoot, oldName)
      const newDirPath = join(targetRoot, safeNewName)
      if (oldDirPath !== newDirPath) {
        if (fs.existsSync(newDirPath)) {
          return { success: false, error: 'Playlist với tên mới đã tồn tại!' }
        }
        fs.renameSync(oldDirPath, newDirPath)
      }
      const exts = ['.jpg', '.png', '.jpeg', '.webp']
      for (const ext of exts) {
        const oldImgPath = join(newDirPath, `${oldName}${ext}`)
        if (fs.existsSync(oldImgPath))
          fs.renameSync(oldImgPath, join(newDirPath, `${safeNewName}${ext}`))
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 4. Chọn và lưu ảnh Thumbnail cho Playlist thư mục
  ipcMain.handle('music:setPlaylistThumbnail', async (_, playlistName) => {
    const config = getConfig()
    const paths: string[] = config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    })
    if (canceled || filePaths.length === 0) return { success: false }
    try {
      let targetRoot = paths[0]
      for (const p of paths) {
        if (fs.existsSync(join(p, playlistName))) {
          targetRoot = p
          break
        }
      }
      const sourcePath = filePaths[0]
      const ext = sourcePath.split('.').pop()?.toLowerCase() || 'jpg'
      const playlistPath = join(targetRoot, playlistName)
      const destPath = join(playlistPath, `${playlistName}.${ext}`)
      const exts = ['jpg', 'png', 'jpeg', 'webp']
      for (const e of exts) {
        const oldImg = join(playlistPath, `${playlistName}.${e}`)
        if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
      }
      const playlistHash = crypto
        .createHash('md5')
        .update('playlist_' + playlistPath)
        .digest('hex')
      const plCentralThumbPath = join(IMAGE_CACHE_DIR, `pl_${playlistHash}.jpg`)
      try {
        const img = nativeImage.createFromPath(sourcePath)
        const resized = img.resize({ width: 200, height: 200, quality: 'good' })
        fs.writeFileSync(plCentralThumbPath, resized.toJPEG(80))
      } catch (e) {}

      fs.copyFileSync(sourcePath, destPath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG SQLITE QOL & USER PLAYLISTS
  // ==========================================
  ipcMain.handle('music:getFavorites', () => sqliteStorage.getFavoriteTracks())
  ipcMain.handle('music:toggleFavorite', (_, filePath: string, isFavorite?: boolean) =>
    sqliteStorage.toggleFavoriteTrack(filePath, isFavorite)
  )
  ipcMain.handle('music:getLyricOffsets', () => sqliteStorage.getAllTrackLyricOffsets())
  ipcMain.handle('music:setLyricOffset', (_, filePath: string, offsetSec: number) => {
    sqliteStorage.setTrackLyricOffset(filePath, offsetSec)
    return { success: true }
  })
  ipcMain.handle('music:getSmartPlaylists', () => sqliteStorage.getSmartPlaylists())
  ipcMain.handle('music:saveSmartPlaylist', (_, playlist: any) => {
    sqliteStorage.saveSmartPlaylist(playlist)
    return { success: true }
  })
  ipcMain.handle('music:deleteSmartPlaylist', (_, id: string) => {
    sqliteStorage.deleteSmartPlaylist(id)
    return { success: true }
  })

  ipcMain.handle('music:getUserPlaylists', () => {
    const lists = getUserPlaylists()
    const res: any = lists
    res.success = true
    res.playlists = lists
    return res
  })

  ipcMain.handle('music:saveUserPlaylist', async (_, playlist: any) => {
    sqliteStorage.saveUserPlaylist(playlist)
    return { success: true }
  })

  ipcMain.handle(
    'music:createUserPlaylist',
    async (_, name: string, description?: string, thumbnail?: string | null) => {
      const trimmed = (name || '').trim()
      if (!trimmed) return { success: false, error: 'Tên playlist không được để trống' }
      const playlists = getUserPlaylists()
      const newPlaylist: UserPlaylist = {
        id: `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: trimmed,
        description: description?.trim() || '',
        thumbnail: thumbnail || null,
        trackIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      playlists.unshift(newPlaylist)
      saveUserPlaylists(playlists)
      return { success: true, playlist: newPlaylist, playlists }
    }
  )

  ipcMain.handle('music:deleteUserPlaylist', async (_, playlistId: string) => {
    let playlists = getUserPlaylists()
    playlists = playlists.filter((p) => p.id !== playlistId)
    sqliteStorage.deleteUserPlaylist(playlistId)
    saveUserPlaylists(playlists)
    return { success: true, playlists }
  })

  ipcMain.handle('music:renameUserPlaylist', async (_, playlistId: string, newName: string) => {
    const trimmed = (newName || '').trim()
    if (!trimmed) return { success: false, error: 'Tên playlist không hợp lệ' }
    const playlists = getUserPlaylists()
    const target = playlists.find((p) => p.id === playlistId)
    if (target) {
      target.name = trimmed
      target.updatedAt = Date.now()
      saveUserPlaylists(playlists)
      return { success: true, playlists, playlist: target }
    }
    return { success: false, error: 'Không tìm thấy playlist' }
  })

  ipcMain.handle(
    'music:updateUserPlaylist',
    async (
      _,
      playlistId: string,
      updates: {
        name?: string
        description?: string
        thumbnail?: string | null
        customImagePath?: string
      }
    ) => {
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (!target) return { success: false, error: 'Không tìm thấy playlist' }

      if (updates.name !== undefined) {
        const trimmed = updates.name.trim()
        if (!trimmed) return { success: false, error: 'Tên playlist không được để trống' }
        target.name = trimmed
      }

      if (updates.description !== undefined) {
        target.description = updates.description.trim()
      }

      if (updates.customImagePath) {
        const playlistHash = crypto
          .createHash('md5')
          .update('user_pl_' + playlistId)
          .digest('hex')
        const plCentralThumbPath = join(IMAGE_CACHE_DIR, `upl_${playlistHash}.jpg`)
        try {
          const img = nativeImage.createFromPath(updates.customImagePath)
          const resized = img.resize({ width: 300, height: 300, quality: 'good' })
          fs.writeFileSync(plCentralThumbPath, resized.toJPEG(85))
          target.thumbnail = `${pathToFileURL(plCentralThumbPath).href}?t=${Date.now()}`
        } catch (e) {
          target.thumbnail = `${pathToFileURL(updates.customImagePath).href}?t=${Date.now()}`
        }
      } else if (updates.thumbnail !== undefined) {
        target.thumbnail = updates.thumbnail
      }

      target.updatedAt = Date.now()
      saveUserPlaylists(playlists)
      return { success: true, playlist: target, playlists }
    }
  )

  ipcMain.handle('music:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    })
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    const imagePath = filePaths[0]
    try {
      const img = nativeImage.createFromPath(imagePath)
      const resized = img.resize({ width: 300, height: 300, quality: 'good' })
      const buffer = resized.toJPEG(85)
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
      return {
        success: true,
        filePath: imagePath,
        dataUrl,
        previewUrl: pathToFileURL(imagePath).href
      }
    } catch (e) {
      return {
        success: true,
        filePath: imagePath,
        dataUrl: pathToFileURL(imagePath).href,
        previewUrl: pathToFileURL(imagePath).href
      }
    }
  })

  ipcMain.handle(
    'music:setUserPlaylistThumbnail',
    async (_, playlistId: string, customPath?: string) => {
      let imagePath = customPath
      if (!imagePath) {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
        })
        if (canceled || filePaths.length === 0) return { success: false }
        imagePath = filePaths[0]
      }
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (target) {
        const playlistHash = crypto
          .createHash('md5')
          .update('user_pl_' + playlistId)
          .digest('hex')
        const plCentralThumbPath = join(IMAGE_CACHE_DIR, `upl_${playlistHash}.jpg`)
        try {
          const img = nativeImage.createFromPath(imagePath)
          const resized = img.resize({ width: 200, height: 200, quality: 'good' })
          fs.writeFileSync(plCentralThumbPath, resized.toJPEG(80))
          target.thumbnail = `${pathToFileURL(plCentralThumbPath).href}?t=${Date.now()}`
        } catch (e) {
          target.thumbnail = `${pathToFileURL(imagePath).href}?t=${Date.now()}`
        }
        target.updatedAt = Date.now()
        saveUserPlaylists(playlists)
        return { success: true, thumbnail: target.thumbnail, playlists, playlist: target }
      }
      return { success: false, error: 'Không tìm thấy playlist' }
    }
  )

  ipcMain.handle(
    'music:addTracksToUserPlaylist',
    async (_, playlistId: string, trackPaths: string[]) => {
      if (!Array.isArray(trackPaths) || trackPaths.length === 0)
        return { success: true, playlists: getUserPlaylists() }
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (target) {
        const set = new Set(target.trackIds)
        for (const tp of trackPaths) {
          if (tp) set.add(tp)
        }
        target.trackIds = Array.from(set)
        target.updatedAt = Date.now()
        saveUserPlaylists(playlists)
        return { success: true, playlist: target, playlists }
      }
      return { success: false, error: 'Không tìm thấy playlist' }
    }
  )

  ipcMain.handle(
    'music:removeTrackFromUserPlaylist',
    async (_, playlistId: string, trackPath: string) => {
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (target) {
        target.trackIds = target.trackIds.filter((id) => id !== trackPath)
        target.updatedAt = Date.now()
        saveUserPlaylists(playlists)
        return { success: true, playlist: target, playlists }
      }
      return { success: false, error: 'Không tìm thấy playlist' }
    }
  )

  ipcMain.handle(
    'music:reorderUserPlaylistTracks',
    async (_, playlistId: string, trackIds: string[]) => {
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (target) {
        target.trackIds = trackIds
        target.updatedAt = Date.now()
        saveUserPlaylists(playlists)
        return { success: true, playlist: target, playlists }
      }
      return { success: false, error: 'Không tìm thấy playlist' }
    }
  )

  // 5. Tự động tạo Playlist từ Album
  ipcMain.handle('music:autoGeneratePlaylists', async () => {
    const rootPath = getConfig().libraryPath
    const items = fs.readdirSync(rootPath)
    const supportedExts = SUPPORTED_AUDIO_EXTS
    let movedCount = 0
    for (const item of items) {
      const itemPath = join(rootPath, item)
      if (!fs.existsSync(itemPath)) continue
      if (
        fs.statSync(itemPath).isFile() &&
        supportedExts.some((ext) => item.toLowerCase().endsWith(ext))
      ) {
        try {
          const metadata = await mm.parseFile(itemPath)
          const albumName = metadata.common.album
          if (albumName && albumName.trim() !== '') {
            const safeAlbumName = sanitizeDirectoryName(albumName) || 'Unknown Album'
            const albumDirPath = join(rootPath, safeAlbumName)
            if (!fs.existsSync(albumDirPath)) fs.mkdirSync(albumDirPath, { recursive: true })
            if (metadata.common.picture && metadata.common.picture.length > 0) {
              const imgExt = metadata.common.picture[0].format.split('/')[1] || 'jpg'
              const imgDest = join(albumDirPath, `${safeAlbumName}.${imgExt}`)
              if (!fs.existsSync(imgDest))
                fs.writeFileSync(imgDest, Buffer.from(metadata.common.picture[0].data))
            }
            const destAudioPath = join(albumDirPath, item)
            if (!fs.existsSync(destAudioPath)) {
              try {
                fs.linkSync(itemPath, destAudioPath)
              } catch {
                fs.copyFileSync(itemPath, destAudioPath)
              }
            }
            const fileNameWithoutExt = item.replace(/\.[^/.]+$/, '')
            const lrcPath = join(rootPath, `${fileNameWithoutExt}.lrc`)
            if (fs.existsSync(lrcPath)) {
              const destLrcPath = join(albumDirPath, `${fileNameWithoutExt}.lrc`)
              if (!fs.existsSync(destLrcPath)) {
                try {
                  fs.linkSync(lrcPath, destLrcPath)
                } catch {
                  fs.copyFileSync(lrcPath, destLrcPath)
                }
              }
            }
            movedCount++
          }
        } catch (e) {}
      }
    }
    return { success: true, movedCount }
  })

  // 6. Đăng ký IPC handler để đọc lời bài hát
  ipcMain.handle('music:read-lyrics', async (_event, audioFilePath: string) => {
    try {
      if (!audioFilePath) return null
      let rawPath = audioFilePath
      if (rawPath.includes('/local-audio?path=')) {
        try {
          const parsed = new URL(rawPath)
          const p = parsed.searchParams.get('path')
          if (p) rawPath = p
        } catch (_) {}
      }
      if (rawPath.startsWith('http')) return null
      if (rawPath.startsWith('file://')) {
        const { fileURLToPath } = require('url')
        rawPath = fileURLToPath(rawPath)
      } else if (!fs.existsSync(rawPath)) {
        // Chỉ giải mã URI khi đường dẫn thô không tồn tại (tránh làm hỏng tên tệp chứa '%')
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (e) {}
      }
      const dir = path.dirname(rawPath)
      const fileNameWithoutExt = path.basename(rawPath, path.extname(rawPath))
      for (const lrcExt of ['.lrc', '.LRC']) {
        const lrcPath = path.join(dir, `${fileNameWithoutExt}${lrcExt}`)
        try {
          if (fs.existsSync(lrcPath)) {
            const content = (await fs.promises.readFile(lrcPath, 'utf-8')).replace(/^\uFEFF/, '')
            if (content.trim()) return content
          }
        } catch (e) {}
      }

      // Fallback 1: Trả về lời từ metadataCache trong RAM nếu có
      const cached = metadataCache[rawPath]
      if (
        cached?.data?.lyrics &&
        typeof cached.data.lyrics === 'string' &&
        cached.data.lyrics.trim()
      ) {
        return cached.data.lyrics
      }

      // Fallback 2: Đọc trực tiếp tag nhúng trong file âm thanh (bỏ qua cover và duration để tăng tốc 10x)
      try {
        const metadata = await mm.parseFile(rawPath, { skipCovers: true, duration: false })
        const embedded = extractEmbeddedLyrics(metadata)
        if (embedded && embedded.trim()) {
          if (cached?.data) cached.data.lyrics = embedded
          return embedded
        }
      } catch (e) {}

      return null
    } catch (error) {
      return null
    }
  })

  // Đọc buffer file âm thanh để dựng spectrogram toàn bài hát
  ipcMain.handle('music:readAudioBuffer', async (_event, audioFilePath: string) => {
    try {
      if (!audioFilePath) return { success: false, error: 'Đường dẫn rỗng' }
      let rawPath = audioFilePath
      if (rawPath.includes('/local-audio?path=')) {
        try {
          const parsed = new URL(rawPath)
          const p = parsed.searchParams.get('path')
          if (p) rawPath = p
        } catch (_) {}
      }
      if (rawPath.startsWith('http')) return { success: false, error: 'Chỉ hỗ trợ file cục bộ' }
      rawPath = rawPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (e) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }
      if (fs.existsSync(rawPath)) {
        const stat = fs.statSync(rawPath)
        let sampleRate: number | undefined = undefined
        let bitDepth: number | undefined = undefined
        try {
          const metadata = await mm.parseFile(rawPath)
          sampleRate = metadata?.format?.sampleRate
          bitDepth = metadata?.format?.bitsPerSample
        } catch (mErr) {
          // Fallback nếu không đọc được metadata
        }

        // Nếu file quá lớn (> 150MB) để tránh crash V8 OOM trên các file DSD / Hi-Res
        if (stat.size > 150 * 1024 * 1024) {
          const ffmpegExe = getFfmpegPath()
          const chunks: Buffer[] = []
          const args = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            rawPath,
            '-t',
            '60',
            '-ar',
            '44100',
            '-ac',
            '2',
            '-f',
            'wav',
            '-'
          ]
          await new Promise<void>((resolve, reject) => {
            const ff = spawn(ffmpegExe, args)
            ff.stdout.on('data', (c: Buffer) => chunks.push(c))
            ff.on('close', (code) => {
              if (code === 0 || chunks.length > 0) resolve()
              else reject(new Error(`ffmpeg exited with code ${code}`))
            })
            ff.on('error', reject)
          })

          const transcodedBuf = Buffer.concat(chunks)
          return {
            success: true,
            buffer: transcodedBuf.buffer.slice(
              transcodedBuf.byteOffset,
              transcodedBuf.byteOffset + transcodedBuf.byteLength
            ),
            sampleRate: 44100,
            bitDepth: 16
          }
        }

        const fileBuffer = fs.readFileSync(rawPath)
        return {
          success: true,
          buffer: fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
          ),
          sampleRate,
          bitDepth
        }
      }
      return { success: false, error: `Không tìm thấy file: ${rawPath}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 6b. Trích xuất đỉnh sóng âm Waveform Peaks nhanh từ luồng PCM mono qua FFmpeg (có cache SQLite)
  ipcMain.handle(
    'music:getWaveformPeaks',
    async (
      _event,
      filePath: string,
      numPeaks: number = 180,
      startTime?: number,
      endTime?: number
    ) => {
      try {
        if (!filePath) return []
        let cleanPath = filePath
        if (cleanPath.includes('#track-')) {
          cleanPath = cleanPath.split('#track-')[0]
        }
        let rawPath = cleanPath
        if (rawPath.includes('/local-audio?path=')) {
          try {
            const parsed = new URL(rawPath)
            const p = parsed.searchParams.get('path')
            if (p) rawPath = p
          } catch (_) {}
        }
        rawPath = rawPath.replace(/^file:\/\/\/?/, '')
        if (process.platform === 'win32') {
          try {
            rawPath = decodeURIComponent(rawPath)
          } catch (e) {}
          if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
          rawPath = rawPath.replace(/\//g, '\\')
        }

        if (!fs.existsSync(rawPath)) return []

        const stat = fs.statSync(rawPath)
        const cacheKey =
          startTime !== undefined || endTime !== undefined
            ? `${rawPath}#${startTime || 0}-${endTime || 0}`
            : rawPath

        const cachedPeaks = sqliteStorage.getWaveformCache(cacheKey, stat.mtimeMs)
        if (cachedPeaks && cachedPeaks.length > 0) {
          return cachedPeaks
        }

        const ffmpegExe = getFfmpegPath()
        const args: string[] = ['-hide_banner', '-loglevel', 'error']
        if (startTime !== undefined && startTime > 0) {
          args.push('-ss', startTime.toString())
        }
        if (endTime !== undefined && endTime > 0) {
          if (startTime !== undefined && startTime > 0) {
            args.push('-to', (endTime - startTime).toString())
          } else {
            args.push('-to', endTime.toString())
          }
        }
        if (rawPath.toLowerCase().endsWith('.bin')) {
          args.push('-f', 's16le', '-ar', '44100', '-ac', '2')
        }
        args.push('-i', rawPath, '-vn', '-ac', '1', '-ar', '1000', '-f', 's16le', '-')

        const chunks: Buffer[] = []
        await new Promise<void>((resolve, reject) => {
          const ff = spawn(ffmpegExe, args)
          ff.stdout.on('data', (c: Buffer) => chunks.push(c))
          ff.on('close', (code) => {
            if (code === 0 || chunks.length > 0) resolve()
            else reject(new Error(`ffmpeg exited with code ${code}`))
          })
          ff.on('error', reject)
        })

        const pcmData = Buffer.concat(chunks)
        const totalSamples = Math.floor(pcmData.length / 2)
        if (totalSamples === 0) return []

        const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, totalSamples)
        const targetPeaks = numPeaks > 0 ? numPeaks : 180
        const bucketSize = Math.max(1, Math.floor(totalSamples / targetPeaks))
        const rawPeaks: number[] = []

        for (let i = 0; i < targetPeaks; i++) {
          const start = i * bucketSize
          const end = Math.min(start + bucketSize, totalSamples)
          if (start >= totalSamples) {
            rawPeaks.push(0)
            continue
          }
          let sumSq = 0
          let maxAmp = 0
          for (let j = start; j < end; j++) {
            const val = Math.abs(samples[j])
            if (val > maxAmp) maxAmp = val
            sumSq += val * val
          }
          const rms = Math.sqrt(sumSq / (end - start))
          rawPeaks.push(rms * 0.7 + maxAmp * 0.3)
        }

        const maxPeak = Math.max(...rawPeaks, 1)
        const normalizedPeaks = rawPeaks.map((p) => {
          const norm = p / maxPeak
          return parseFloat(Math.min(1.0, Math.max(0.08, norm)).toFixed(3))
        })

        sqliteStorage.setWaveformCache(cacheKey, stat.mtimeMs, normalizedPeaks)
        return normalizedPeaks
      } catch (err) {
        console.warn('[WaveformPeaks] Error computing peaks:', err)
        return []
      }
    }
  )

  // Đọc toàn bộ thông tin chi tiết của bài hát (Kỹ thuật âm thanh, Metadata mở rộng, Thông tin tệp tin)
  ipcMain.handle('music:getTrackDetails', async (_event, trackPath: string) => {
    try {
      if (!trackPath) return { success: false, error: 'Đường dẫn rỗng' }
      let rawPath = trackPath
      if (
        rawPath.includes('/local-audio?path=') ||
        rawPath.includes('/local-file?path=') ||
        rawPath.includes('/cover?path=')
      ) {
        try {
          const parsed = new URL(rawPath)
          const p = parsed.searchParams.get('path')
          if (p) rawPath = p
        } catch (_) {}
      }
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        return { success: true, isOnline: true }
      }
      rawPath = rawPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (e) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }

      if (!fs.existsSync(rawPath)) {
        return { success: false, error: `Không tìm thấy tệp: ${rawPath}` }
      }

      const stat = fs.statSync(rawPath)
      const ext = path.extname(rawPath).toLowerCase()
      const isDsd = ext === '.dsf' || ext === '.dff' || ext === '.dsd'

      let meta: any = null
      try {
        meta = await mm.parseFile(rawPath, { skipCovers: true })
      } catch (err) {
        // Fallback nếu parser gặp lỗi cục bộ
      }

      // Đọc file .lrc cùng thư mục nếu có
      let lrcContent: string | null = null
      const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
      if (fs.existsSync(lrcPath)) {
        try {
          lrcContent = fs.readFileSync(lrcPath, 'utf-8')
        } catch (_) {}
      }

      if (!lrcContent && meta) {
        try {
          lrcContent = extractEmbeddedLyrics(meta)
        } catch (_) {}
      }

      const fmt = meta?.format || {}
      const common = meta?.common || {}

      let rawFormat = fmt.container || ext.replace('.', '').toUpperCase() || 'AUDIO'
      if (isDsd) {
        rawFormat = ext === '.dsf' ? 'DSF' : ext === '.dff' ? 'DFF' : 'DSD'
      } else if (fmt.codec === 'DSD' || (fmt.container && /dsd/i.test(fmt.container))) {
        rawFormat = 'DSD'
      }

      const isLossless =
        isDsd || Boolean(fmt.lossless || ['.flac', '.wav', '.alac', '.aiff', '.ape'].includes(ext))
      const effectiveBitDepth = isDsd
        ? 1
        : fmt.bitsPerSample || (isLossless && fmt.sampleRate ? 16 : undefined)
      const effectiveSampleRate = fmt.sampleRate || (isDsd ? 2822400 : undefined)

      return {
        success: true,
        isOnline: false,
        rawPath,
        fileName: path.basename(rawPath),
        directory: path.dirname(rawPath),
        fileSizeBytes: stat.size,
        createdTime: stat.birthtimeMs,
        modifiedTime: stat.mtimeMs,
        format: rawFormat,
        container: fmt.container,
        codec: fmt.codec,
        codecProfile: fmt.codecProfile,
        lossless: isLossless,
        sampleRate: effectiveSampleRate,
        bitDepth: effectiveBitDepth,
        bitrate: fmt.bitrate,
        numberOfChannels: fmt.numberOfChannels,
        duration: fmt.duration,
        tagTypes: fmt.tagTypes,
        title: common.title,
        artist: common.artist,
        artists: common.artists || (common.artist ? splitArtistString(common.artist) : []),
        album: common.album,
        albumArtist: common.albumartist,
        genre: Array.isArray(common.genre) ? common.genre.join(', ') : common.genre,
        year: common.year || (common.date ? parseInt(common.date) : undefined),
        trackNo: common.track?.no,
        trackOf: common.track?.of,
        diskNo: common.disk?.no,
        diskOf: common.disk?.of,
        composer: Array.isArray(common.composer) ? common.composer.join(', ') : common.composer,
        lyricist: Array.isArray(common.lyricist) ? common.lyricist.join(', ') : common.lyricist,
        copyright: common.copyright,
        comment: Array.isArray(common.comment)
          ? common.comment.map((c: any) => c.text || c).join('\n')
          : common.comment,
        lyrics: lrcContent || undefined,
        isDsd
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 7. Cập nhật Metadata (Hỗ trợ MP3, FLAC, DSD .dsf/.dff, và các định dạng qua FFmpeg)
  ipcMain.handle(
    'music:updateTags',
    async (_, filePath: string, newTags: any, newImagePath: string | null) => {
      try {
        let rawPath = filePath.replace(/^file:\/\/\/?/, '')
        if (process.platform === 'win32') {
          rawPath = decodeURIComponent(rawPath)
          if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
          rawPath = rawPath.replace(/\//g, '\\')
        }

        if (!fs.existsSync(rawPath)) {
          return { success: false, error: 'Tệp không tồn tại trên hệ thống' }
        }

        let rawImagePath =
          newImagePath ||
          (typeof newTags?.coverArt === 'string' && !newTags.coverArt.startsWith('data:')
            ? newTags.coverArt
            : null)
        if (rawImagePath && rawImagePath.startsWith('file://')) {
          try {
            rawImagePath = fileURLToPath(rawImagePath)
          } catch (e) {}
        }

        let picBuffer: Buffer | null = null
        let picMime = 'image/jpeg'
        if (rawImagePath && fs.existsSync(rawImagePath)) {
          try {
            picBuffer = fs.readFileSync(rawImagePath)
            const ext = path.extname(rawImagePath).toLowerCase()
            picMime =
              ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          } catch (e) {}
        } else if (
          newTags?.coverArt &&
          typeof newTags.coverArt === 'string' &&
          newTags.coverArt.startsWith('data:')
        ) {
          const match = newTags.coverArt.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            picMime = match[1]
            picBuffer = Buffer.from(match[2], 'base64')
          }
        }

        const targetArtists =
          Array.isArray(newTags.artists) && newTags.artists.length > 0
            ? newTags.artists
            : splitArtistString(newTags.artist || '')
        const targetArtist =
          newTags.artist || (targetArtists.length > 0 ? targetArtists.join(', ') : '')

        const ext = path.extname(rawPath).toLowerCase()

        if (ext === '.flac') {
          // Ghi trực tiếp vào file FLAC qua updateFlacTags
          const flacUpdates: FlacTagUpdate = {
            title: newTags.title,
            artist: targetArtist,
            artists: targetArtists,
            album: newTags.album,
            albumArtist: newTags.albumArtist,
            genre: newTags.genre,
            year: newTags.year ? String(newTags.year) : undefined,
            trackNumber:
              newTags.trackNumber !== undefined && newTags.trackNumber !== null
                ? String(newTags.trackNumber)
                : undefined,
            discNumber:
              newTags.discNumber !== undefined && newTags.discNumber !== null
                ? String(newTags.discNumber)
                : undefined,
            lyrics: newTags.lyrics,
            picture: picBuffer
              ? { data: picBuffer, mimeType: picMime, description: 'Front Cover' }
              : undefined
          }

          const flacRes = updateFlacTags(rawPath, flacUpdates)
          if (!flacRes.success) {
            return { success: false, error: flacRes.error }
          }
        } else if (ext === '.dsf' || ext === '.dff' || ext === '.dsd') {
          // Ghi trực tiếp vào file DSD qua updateDsdTags
          const dsdUpdates: DsdTagUpdate = {
            title: newTags.title,
            artist: targetArtist,
            artists: targetArtists,
            album: newTags.album,
            albumArtist: newTags.albumArtist,
            genre: newTags.genre,
            year: newTags.year ? String(newTags.year) : undefined,
            trackNumber:
              newTags.trackNumber !== undefined && newTags.trackNumber !== null
                ? String(newTags.trackNumber)
                : undefined,
            discNumber:
              newTags.discNumber !== undefined && newTags.discNumber !== null
                ? String(newTags.discNumber)
                : undefined,
            lyrics: newTags.lyrics,
            picture: picBuffer
              ? { data: picBuffer, mimeType: picMime, description: 'Front Cover' }
              : undefined
          }

          const success = updateDsdTags(rawPath, dsdUpdates)
          if (!success) {
            return { success: false, error: 'Không thể ghi thẻ vào file DSD' }
          }
        } else if (ext === '.mp3') {
          // Ghi trực tiếp vào file MP3 qua NodeID3
          const tags: any = {
            title: newTags.title,
            artist: targetArtist,
            album: newTags.album,
            performerInfo: newTags.albumArtist,
            genre: newTags.genre,
            year: newTags.year ? String(newTags.year) : undefined,
            trackNumber:
              newTags.trackNumber !== undefined && newTags.trackNumber !== null
                ? String(newTags.trackNumber)
                : undefined,
            partOfSet:
              newTags.discNumber !== undefined && newTags.discNumber !== null
                ? String(newTags.discNumber)
                : undefined,
            unsynchronisedLyrics: newTags.lyrics
              ? { language: 'eng', text: newTags.lyrics }
              : undefined
          }
          if (picBuffer) {
            tags.image = {
              mime: picMime,
              type: { id: 3, name: 'front cover' },
              description: 'Front Cover',
              imageBuffer: picBuffer
            }
          } else if (rawImagePath && fs.existsSync(rawImagePath)) {
            tags.image = rawImagePath
          }
          const success = NodeID3.update(tags, rawPath)
          if (!success) {
            return { success: false, error: 'Không thể ghi thẻ ID3 vào file MP3' }
          }
        } else if (['.m4a', '.mp4', '.ogg', '.opus', '.wav', '.aiff'].includes(ext)) {
          // Ghi metadata qua FFmpeg stream copy vào file tạm rồi thay thế nguyên tử
          const ffmpegExe = getFfmpegPath()
          const tempOutput = join(
            path.dirname(rawPath),
            `temp_tag_${Date.now()}_${path.basename(rawPath)}`
          )
          const args = ['-y', '-i', rawPath, '-c', 'copy']
          if (newTags.title !== undefined) args.push('-metadata', `title=${newTags.title}`)
          if (targetArtist) args.push('-metadata', `artist=${targetArtist}`)
          if (newTags.album !== undefined) args.push('-metadata', `album=${newTags.album}`)
          if (newTags.albumArtist !== undefined)
            args.push('-metadata', `album_artist=${newTags.albumArtist}`)
          if (newTags.genre !== undefined) args.push('-metadata', `genre=${newTags.genre}`)
          if (newTags.year !== undefined) args.push('-metadata', `date=${newTags.year}`)
          if (newTags.trackNumber !== undefined && newTags.trackNumber !== null)
            args.push('-metadata', `track=${newTags.trackNumber}`)
          if (newTags.discNumber !== undefined && newTags.discNumber !== null)
            args.push('-metadata', `disc=${newTags.discNumber}`)
          args.push(tempOutput)

          await new Promise<void>((resolve, reject) => {
            const ff = spawn(ffmpegExe, args)
            ff.on('close', (code) => {
              if (code === 0 && fs.existsSync(tempOutput)) {
                try {
                  fs.renameSync(tempOutput, rawPath)
                  resolve()
                } catch {
                  try {
                    fs.copyFileSync(tempOutput, rawPath)
                    fs.unlinkSync(tempOutput)
                    resolve()
                  } catch (cErr) {
                    reject(cErr)
                  }
                }
              } else {
                if (fs.existsSync(tempOutput)) {
                  try {
                    fs.unlinkSync(tempOutput)
                  } catch {}
                }
                reject(new Error(`FFmpeg exited with code ${code}`))
              }
            })
            ff.on('error', (err) => {
              if (fs.existsSync(tempOutput)) {
                try {
                  fs.unlinkSync(tempOutput)
                } catch {}
              }
              reject(err)
            })
          })
        }

        // Lưu lời bài hát đồng hành vào tệp .lrc nếu có
        if (newTags.lyrics) {
          const dir = path.dirname(rawPath)
          const fileNameWithoutExt = path.basename(rawPath, path.extname(rawPath))
          const lrcPath = path.join(dir, `${fileNameWithoutExt}.lrc`)
          try {
            fs.writeFileSync(lrcPath, newTags.lyrics, 'utf-8')
          } catch (e) {}
        }

        // Cập nhật Thumbnail Proxy nếu có ảnh mới hoặc ảnh nhúng
        const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
        const centralThumbPath = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)

        const parentDir = path.dirname(rawPath)
        const localThumbDir = join(parentDir, '.thumbnails')
        if (!fs.existsSync(localThumbDir)) {
          try {
            fs.mkdirSync(localThumbDir, { recursive: true })
          } catch (e) {}
        }
        const localThumbPath = join(localThumbDir, `${trackHash}.jpg`)

        let coverUrl: string | null = null

        if (picBuffer) {
          try {
            const img = nativeImage.createFromBuffer(picBuffer)
            const resized = img.resize({ width: 128, height: 128, quality: 'good' })
            const jpegBuf = resized.toJPEG(80)

            try {
              fs.writeFileSync(centralThumbPath, jpegBuf)
            } catch (e) {}
            try {
              fs.writeFileSync(localThumbPath, jpegBuf)
            } catch (e) {}

            coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
          } catch (e) {}
        } else if (rawImagePath && fs.existsSync(rawImagePath)) {
          try {
            const img = nativeImage.createFromPath(rawImagePath)
            const resized = img.resize({ width: 128, height: 128, quality: 'good' })
            const jpegBuf = resized.toJPEG(80)

            try {
              fs.writeFileSync(centralThumbPath, jpegBuf)
            } catch (e) {}
            try {
              fs.writeFileSync(localThumbPath, jpegBuf)
            } catch (e) {}

            coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
          } catch (e) {}
        } else {
          // Kiểm tra xem file âm thanh có ảnh nhúng mới cập nhật hay không
          try {
            const freshMeta = await mm.parseFile(rawPath)
            if (freshMeta.common.picture && freshMeta.common.picture.length > 0) {
              const img = nativeImage.createFromBuffer(
                Buffer.from(freshMeta.common.picture[0].data)
              )
              const resized = img.resize({ width: 128, height: 128, quality: 'good' })
              const jpegBuf = resized.toJPEG(80)
              try {
                fs.writeFileSync(centralThumbPath, jpegBuf)
              } catch (e) {}
              try {
                fs.writeFileSync(localThumbPath, jpegBuf)
              } catch (e) {}
              coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
            }
          } catch (err) {}
        }

        if (!coverUrl) {
          if (fs.existsSync(centralThumbPath)) {
            coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
          } else if (fs.existsSync(localThumbPath)) {
            coverUrl = `${pathToFileURL(localThumbPath).href}?t=${Date.now()}`
          }
        }

        // Cập nhật ngay vào Metadata Cache
        const stat = fs.statSync(rawPath)
        const existingCached = metadataCache[rawPath]?.data || {}
        const finalArtist = targetArtist || existingCached.artist || 'Unknown'
        const finalArtists =
          targetArtists.length > 0 ? targetArtists : existingCached.artists || [finalArtist]
        const finalAlbum = newTags.album !== undefined ? newTags.album : existingCached.album
        const finalAlbumArtist =
          newTags.albumArtist !== undefined ? newTags.albumArtist : existingCached.albumArtist
        const finalGenre = newTags.genre !== undefined ? newTags.genre : existingCached.genre
        const finalYear =
          newTags.year !== undefined
            ? Number(newTags.year) || existingCached.year
            : existingCached.year
        const finalTrackNo =
          newTags.trackNumber !== undefined && newTags.trackNumber !== null
            ? Number(newTags.trackNumber)
            : existingCached.trackNumber || existingCached.trackNo
        const finalDiscNo =
          newTags.discNumber !== undefined && newTags.discNumber !== null
            ? Number(newTags.discNumber)
            : existingCached.discNumber || existingCached.discNo
        const finalLyrics = newTags.lyrics !== undefined ? newTags.lyrics : existingCached.lyrics
        const finalTitle = newTags.title !== undefined ? newTags.title : existingCached.title

        metadataCache[rawPath] = {
          mtime: stat.mtimeMs,
          data: {
            ...existingCached,
            id: rawPath,
            filePath: pathToFileURL(rawPath).href,
            title: finalTitle,
            artist: finalArtist,
            artists: finalArtists,
            multiArtistVersion: 2,
            album: finalAlbum,
            albumArtist: finalAlbumArtist,
            genre: finalGenre,
            year: finalYear,
            trackNo: finalTrackNo,
            trackNumber: finalTrackNo,
            discNo: finalDiscNo,
            discNumber: finalDiscNo,
            lyrics: finalLyrics,
            coverArt: coverUrl || existingCached.coverArt
          }
        }
        sqliteStorage.setMetadata(rawPath, stat.mtimeMs, metadataCache[rawPath].data)
        saveMetadataCache()

        // Cập nhật ngay lập tức vào SQLite library cache
        sqliteStorage.updateSingleTrack(
          rawPath,
          (oldTrack) => ({
            ...oldTrack,
            title: finalTitle,
            artist: finalArtist,
            artists: finalArtists,
            multiArtistVersion: 2,
            album: finalAlbum,
            albumArtist: finalAlbumArtist,
            genre: finalGenre,
            year: finalYear,
            trackNo: finalTrackNo,
            trackNumber: finalTrackNo,
            discNo: finalDiscNo,
            discNumber: finalDiscNo,
            lyrics: finalLyrics,
            coverArt: coverUrl || oldTrack.coverArt
          }),
          buildPreAggregatedData
        )

        // Nếu thay đổi ảnh bìa, xóa cache themeColors cũ để nạp màu mới
        if (rawImagePath || picBuffer) {
          delete themeColorsCache[rawPath]
          delete themeColorsCache[pathToFileURL(rawPath).href]
          sqliteStorage.deleteThemeColor(rawPath)
          sqliteStorage.deleteThemeColor(pathToFileURL(rawPath).href)
          saveThemeColorsCache()
        }

        return { success: true, coverUrl }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  ipcMain.handle('music:getThemeColorsCache', () => {
    return themeColorsCache
  })

  ipcMain.handle('music:cacheThemeColors', async (_, trackPath: string, colors: any) => {
    try {
      if (!trackPath || !colors) return { success: false }
      let rawPath = trackPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') {
        rawPath = decodeURIComponent(rawPath)
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }
      themeColorsCache[rawPath] = colors
      themeColorsCache[trackPath] = colors
      sqliteStorage.setThemeColor(rawPath, colors)
      sqliteStorage.setThemeColor(trackPath, colors)
      saveThemeColorsCache()

      if (metadataCache[rawPath] && metadataCache[rawPath].data) {
        metadataCache[rawPath].data.themeColors = colors
        sqliteStorage.setMetadata(
          rawPath,
          metadataCache[rawPath].mtime,
          metadataCache[rawPath].data
        )
        saveMetadataCache()
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('app:clearMemoryCache', async () => {
    try {
      // TỐI ƯU HÓA: Chạy V8 Garbage Collection và giải phóng bộ nhớ vật lý OS
      if (typeof (global as any).gc === 'function') {
        ;(global as any).gc()
      }
      setTimeout(() => {
        trimNativeMemory()
      }, 200)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('music:selectImageFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [
        {
          name: 'Images',
          extensions: ['jpg', 'png', 'jpeg', 'webp', 'jfif', 'bmp', 'gif', 'avif', 'svg']
        }
      ]
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  // 8. Xóa bài hát an toàn (Đưa vào Recycle Bin / Thùng rác)
  ipcMain.handle(
    'music:deleteTrack',
    async (_, trackPath: string, _deletePermanently: boolean = false) => {
      try {
        let cleanPath = trackPath
        const isCueTrack = cleanPath.includes('#track-')
        if (isCueTrack) {
          cleanPath = cleanPath.split('#track-')[0]
        }
        let rawPath = cleanPath.replace(/^file:\/\/\/?/, '')
        if (process.platform === 'win32') {
          rawPath = decodeURIComponent(rawPath)
          if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
          rawPath = rawPath.replace(/\//g, '\\')
        }

        // Xử lý chuyển tệp vào Recycle Bin / Thùng rác
        if (fs.existsSync(rawPath)) {
          try {
            await shell.trashItem(rawPath)
          } catch (_err) {
            try {
              fs.unlinkSync(rawPath)
            } catch (e) {}
          }

          // Xóa file .lrc hoặc .cue đồng hành nếu có
          const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
          if (fs.existsSync(lrcPath)) {
            try {
              await shell.trashItem(lrcPath)
            } catch {
              try {
                fs.unlinkSync(lrcPath)
              } catch {}
            }
          }

          const cuePath = rawPath.replace(/\.[^/.]+$/, '.cue')
          if (fs.existsSync(cuePath)) {
            try {
              await shell.trashItem(cuePath)
            } catch {
              try {
                fs.unlinkSync(cuePath)
              } catch {}
            }
          }
        }

        // Dọn dẹp cache đồng bộ một lượt trong SQLite (library_tracks, metadata_cache, theme_colors, waveform_cache, favorite_tracks, library_cache)
        sqliteStorage.removeLibraryTracks([trackPath, cleanPath, rawPath])

        delete metadataCache[rawPath]
        delete metadataCache[cleanPath]
        delete metadataCache[trackPath]
        delete themeColorsCache[rawPath]
        delete themeColorsCache[cleanPath]
        delete themeColorsCache[trackPath]
        saveMetadataCache()
        saveThemeColorsCache()

        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  )

  // 9. Xóa Playlist (Đưa thư mục Playlist vào Recycle Bin an toàn)
  ipcMain.handle('music:deletePlaylist', async (_, playlistName: string) => {
    try {
      const config = getConfig()
      const searchDirs = [...(config.libraryPaths || []), config.libraryPath].filter(
        Boolean
      ) as string[]

      let deleted = false
      for (const dir of searchDirs) {
        const playlistFolder = join(dir, playlistName)
        if (fs.existsSync(playlistFolder)) {
          try {
            await shell.trashItem(playlistFolder)
          } catch (_err) {
            fs.rmSync(playlistFolder, { recursive: true, force: true })
          }
          deleted = true

          // Dọn dẹp chuẩn xác theo tiền tố thư mục, không bao giờ xóa nhầm các bài chứa "Pop"
          sqliteStorage.removeTracksByDirectoryPrefix(playlistFolder)

          const normDir = playlistFolder.replace(/\\/g, '/').toLowerCase()
          for (const key of Object.keys(metadataCache)) {
            const normKey = key.replace(/\\/g, '/').toLowerCase()
            if (normKey.startsWith(normDir)) {
              delete metadataCache[key]
            }
          }
          for (const key of Object.keys(themeColorsCache)) {
            const normKey = key.replace(/\\/g, '/').toLowerCase()
            if (normKey.startsWith(normDir)) {
              delete themeColorsCache[key]
            }
          }
        }
      }

      if (!deleted) {
        return { success: false, error: 'Không tìm thấy thư mục Playlist' }
      }

      saveMetadataCache()
      saveThemeColorsCache()

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 10. Mở file / thư mục trong File Explorer
  ipcMain.handle('music:showInFolder', async (_, targetPath: string) => {
    try {
      let rawPath = targetPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)
      if (fs.existsSync(rawPath)) {
        shell.showItemInFolder(rawPath)
        return { success: true }
      }
      return { success: false, error: 'Đường dẫn không tồn tại trên ổ đĩa' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG GIAO TIẾP CLOUD & TIỆN ÍCH
  // ==========================================

  // Tải nhạc cục bộ thủ công (Mục "Tải lên từ máy tính")
  ipcMain.handle('music:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return []
    const folderPath = filePaths[0]
    const supportedExtensions = SUPPORTED_AUDIO_EXTS
    const audioFiles = await getAudioFilesInDirectoryRecursiveAsync(folderPath, supportedExtensions)
    const tracks: any[] = []

    for (const filePath of audioFiles) {
      const file = path.basename(filePath)
      try {
        const metadata = await mm.parseFile(filePath)
        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          // const buffer = Buffer.from(picture.data)
          coverBase64 = null
        }
        const { artist, artists } = extractArtists(metadata, file)
        tracks.push({
          id: filePath,
          filePath: pathToFileURL(filePath).href,
          title: metadata.common.title || file.replace(/\.[^/.]+$/, ''),
          artist: artist,
          artists: artists,
          multiArtistVersion: 2,
          album: metadata.common.album || 'Unknown Album',
          duration: metadata.format.duration,
          format: metadata.format.container || file.split('.').pop()?.toUpperCase() || 'Unknown',
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          bitDepth: metadata.format.bitsPerSample,
          lossless: metadata.format.lossless,
          coverArt: coverBase64
        })
      } catch (err) {
        console.error(`Lỗi đọc file ${file}:`, err)
      }
    }
    return tracks
  })

  async function streamDownloadToFile(
    response: Response,
    destPath: string,
    url: string,
    fileName: string,
    onProgress?: (progress: {
      url: string
      fileName: string
      downloadedBytes: number
      totalBytes: number
      percent: number
    }) => void
  ): Promise<void> {
    const totalBytes = Number(response.headers.get('content-length')) || 0
    let downloadedBytes = 0
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response body is null')

    const fileStream = fs.createWriteStream(destPath)
    let lastEmit = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          downloadedBytes += value.length
          fileStream.write(value)

          const now = Date.now()
          if (now - lastEmit > 200 || downloadedBytes === totalBytes) {
            lastEmit = now
            const percent =
              totalBytes > 0
                ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                : 0
            const progressPayload = {
              url,
              fileName,
              downloadedBytes,
              totalBytes,
              percent
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download:progress', progressPayload)
            }
            if (onProgress) onProgress(progressPayload)
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: any) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch (err) {
      fileStream.destroy()
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath)
        } catch {}
      }
      throw err
    }
  }

  // Tải 1 file từ Cloud
  ipcMain.handle('music:downloadCloudFile', async (_, url, filename) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath))
      return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }

    const savePath = join(rootPath, filename)
    const tempDestPath = join(rootPath, `temp_cloud_${Date.now()}_${filename}`)
    try {
      const response = await fetch(url)

      // MỚI: Báo lỗi rõ ràng nếu bị Google Drive chặn
      if (!response.ok) {
        throw new Error(`Google Drive từ chối tải file. Mã lỗi: ${response.status}`)
      }

      await streamDownloadToFile(response, tempDestPath, url, filename)

      if (fs.existsSync(savePath)) {
        try {
          fs.unlinkSync(savePath)
        } catch {}
      }
      fs.renameSync(tempDestPath, savePath)

      // Xử lý trích xuất & nhúng Metadata (Thumbnail, Lời bài hát nếu có từ Drive API)
      try {
        const metadata = await mm.parseFile(savePath)
        const ext = savePath.toLowerCase().split('.').pop()

        // Nếu là file MP3, hỗ trợ ghi trực tiếp ID3 tag (ảnh bìa, lyrics) vào file
        if (ext === 'mp3') {
          const tags: NodeID3.Tags = {
            title: metadata.common.title || filename.replace(/\.[^/.]+$/, ''),
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album'
          }
          if (metadata.common.picture && metadata.common.picture.length > 0) {
            tags.image = {
              mime: metadata.common.picture[0].format,
              type: { id: 3, name: 'front cover' },
              description: 'Cover',
              imageBuffer: Buffer.from(metadata.common.picture[0].data)
            }
          }
          if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
            tags.unsynchronisedLyrics = {
              language: 'eng',
              text: extractEmbeddedLyrics(metadata) || '' // Lấy chuỗi lời (không String() trực tiếp vì tag có thể là object)
            }
          }
          NodeID3.update(tags, savePath)
        } else {
          // Đối với FLAC/WAV (Lossless), nếu có lyrics thì tách ra file .lrc đi kèm cùng cấp
          if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
            const fileNameWithoutExt = path.basename(savePath, path.extname(savePath))
            const lrcPath = join(rootPath, `${fileNameWithoutExt}.lrc`)
            const lyricText =
              typeof metadata.common.lyrics[0] === 'string'
                ? metadata.common.lyrics[0]
                : (metadata.common.lyrics[0] as any).text || ''
            if (lyricText) {
              fs.writeFileSync(lrcPath, lyricText, 'utf-8')
            }
          }
        }
      } catch (metaErr) {
        console.error('Lỗi nhúng metadata phụ:', metaErr)
      }

      return { success: true, localPath: pathToFileURL(savePath).href }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Quét Google Drive (Sử dụng API Key từ Cài đặt, hỗ trợ tải > 100 tệp)
  ipcMain.handle('music:fetchDriveFiles', async (_, folderId) => {
    const apiKey = getConfig().googleDriveApiKey

    if (!apiKey || apiKey.trim() === '') {
      return {
        success: false,
        error: 'Chưa cấu hình API Key! Vui lòng vào Cài đặt để thêm khóa API Google Drive của bạn.'
      }
    }

    try {
      let allFiles: any[] = []
      let pageToken = ''
      let hasNextPage = true

      // Lặp liên tục để lấy toàn bộ danh sách tệp nếu có nhiều hơn 1000 tệp
      while (hasNextPage) {
        // Thêm pageSize=1000 và nextPageToken vào cấu trúc URL
        let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)&key=${apiKey}`

        if (pageToken) {
          url += `&pageToken=${pageToken}`
        }

        const response = await fetch(url)
        const data = await response.json()

        if (data.error) return { success: false, error: data.error.message }

        if (data.files && data.files.length > 0) {
          allFiles = allFiles.concat(data.files) // Gộp tệp mới vào mảng tổng
        }

        // Kiểm tra xem Google có báo còn trang tiếp theo không
        if (data.nextPageToken) {
          pageToken = data.nextPageToken
        } else {
          hasNextPage = false // Hết tệp để tải, dừng vòng lặp
        }
      }

      // Lọc ra các file âm thanh từ mảng tổng
      const audioFiles = allFiles.filter(
        (f: any) =>
          (f.mimeType && f.mimeType.startsWith('audio/')) ||
          SUPPORTED_AUDIO_EXTS.some((ext) => (f.name || '').toLowerCase().endsWith(ext))
      )

      const tracks = audioFiles.map((file: any) => {
        const format = file.name.split('.').pop().toUpperCase()
        return {
          id: `gd-${file.id}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Google Drive',
          album: 'Cloud',
          duration: 0,
          format: format,
          isCloud: true,
          url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}&acknowledgeAbuse=true`,
          coverArt: null
        }
      })

      return { success: true, tracks }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ==========================================
  // TẢI HÀNG LOẠT TỪ CLOUD (CÓ CHECK TRÙNG LẶP & LỌC SỐ & TIẾN ĐỘ)
  // ==========================================
  ipcMain.handle(
    'music:downloadMultipleFiles',
    async (event, files: any[], existingTracks: any[] = []) => {
      const rootPath = getConfig().libraryPath
      if (!rootPath || !fs.existsSync(rootPath))
        return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }

      const downloadedTracks: any[] = []

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]

          // Gửi tiến trình về giao diện
          event.sender.send('download-progress', {
            current: i + 1,
            total: files.length,
            fileName: file.title || 'Đang tải...'
          })

          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
          }

          // Lấy tên gốc và XÓA số thứ tự cộng với dấu phân cách ở đầu (vd: "01. acb@123" -> "acb@123")
          // Lưu ý: Dùng dấu + ở cuối Regex để tránh xóa nhầm các bài hát có tên bắt đầu bằng số (vd: "1989")
          let originalTitle = (file.title || 'track').replace(/^\d+[\s\.\-\_]+/, '').trim()

          // Lọc bỏ ký tự cấm của hệ điều hành để làm tên file, nhưng vẫn giữ lại các ký tự đặc biệt hợp lệ (@, #, $)
          const safeTitle = originalTitle.replace(/[<>:"\/\\|?*]/g, '_').trim()
          const ext = file.format ? file.format.toLowerCase() : 'mp3'
          const filename = `${safeTitle}.${ext}`

          const tempPath = join(rootPath, `temp_${Date.now()}_${filename}`)
          let destPath = join(rootPath, filename)

          const response = await fetch(file.url)

          // MỚI: Nếu Google Drive từ chối tải, xóa file tạm và bỏ qua để tải bài tiếp theo
          if (!response.ok) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
            continue
          }

          await streamDownloadToFile(response, tempPath, file.url, filename)

          let title = originalTitle
          let artist = 'Unknown Artist'
          let album = 'Unknown Album'
          let metadata

          try {
            metadata = await mm.parseFile(tempPath)
            // Trích xuất trọn vẹn dữ liệu lõi
            if (metadata.common.title) {
              // Áp dụng lại Regex an toàn (+) để đảm bảo nếu thẻ tag nội bộ có dính số thứ tự thì cũng bị xóa an toàn
              title = metadata.common.title.replace(/^\d+[\s\.\-\_]+/, '').trim()
            }
            if (metadata.common.artist) artist = metadata.common.artist
            if (metadata.common.album) album = metadata.common.album
          } catch (e) {}

          const duplicate = existingTracks.find(
            (t) =>
              t.title &&
              t.artist &&
              t.title.toLowerCase() === title.toLowerCase() &&
              t.artist.toLowerCase() === artist.toLowerCase()
          )

          // Tự động bỏ qua tệp nếu phát hiện trùng lặp (không hiện thông báo hỏi)
          if (duplicate) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) // Xóa file tạm vừa tải về
            continue // Bỏ qua tệp này và chuyển sang tệp tiếp theo ngay lập tức
          }

          if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
          fs.renameSync(tempPath, destPath)

          try {
            if (ext === 'mp3') {
              // Chỉ cập nhật các Tag đã được chuẩn hóa (Bảo toàn Album & Nghệ sĩ)
              const tags: NodeID3.Tags = { title, artist, album }

              // Giữ lại thẻ ảnh trong file gốc (nhưng không nạp vào RAM)
              if (metadata?.common.picture && metadata.common.picture.length > 0) {
                tags.image = {
                  mime: metadata.common.picture[0].format,
                  type: { id: 3, name: 'front cover' },
                  description: 'Cover',
                  imageBuffer: Buffer.from(metadata.common.picture[0].data)
                }
              }
              NodeID3.update(tags, destPath)
            } else {
              if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
                const lyricText =
                  typeof metadata.common.lyrics[0] === 'string'
                    ? metadata.common.lyrics[0]
                    : (metadata.common.lyrics[0] as any).text || ''
                if (lyricText)
                  fs.writeFileSync(
                    join(rootPath, `${path.basename(destPath, `.${ext}`)}.lrc`),
                    lyricText,
                    'utf-8'
                  )
              }
            }

            const newTrackObj = {
              id: destPath,
              filePath: pathToFileURL(destPath).href,
              title,
              artist,
              album,
              duration: metadata?.format.duration || 0,
              format: metadata?.format.container || ext.toUpperCase(),
              bitrate: metadata?.format.bitrate,
              sampleRate: metadata?.format.sampleRate,
              bitDepth: metadata?.format.bitsPerSample,
              lossless: metadata?.format.lossless,
              coverArt: null,
              isCloud: false
            }
            downloadedTracks.push(newTrackObj)
            existingTracks.push(newTrackObj)
          } catch (e) {
            downloadedTracks.push({
              ...file,
              id: destPath,
              filePath: pathToFileURL(destPath).href,
              isCloud: false
            })
          }
        }
        return { success: true, tracks: downloadedTracks }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Lấy ảnh bìa từ bài hát đầu tiên trong Playlist
  ipcMain.handle('music:extractPlaylistThumbnail', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    const safePlaylistName = sanitizeDirectoryName(playlistName)
    const playlistPath = join(rootPath, safePlaylistName)

    try {
      const supportedExts = SUPPORTED_AUDIO_EXTS
      const allAudioFiles = await getAudioFilesInDirectoryRecursiveAsync(
        playlistPath,
        supportedExts
      )

      // Tìm bài hát đầu tiên có đuôi hỗ trợ (kể cả trong thư mục con)
      const firstTrack = allAudioFiles[0]
      if (!firstTrack)
        return { success: false, error: 'Playlist đang trống, không có bài hát nào!' }

      const trackPath = firstTrack
      const cover = await fastExtractCover(trackPath)

      if (cover && cover.data && cover.data.length > 0) {
        const ext = cover.format.split('/')[1] || 'jpg'
        const destPath = join(playlistPath, `${playlistName}.${ext}`)

        // Xóa tất cả ảnh bìa cũ trước khi lưu ảnh mới
        const exts = ['jpg', 'png', 'jpeg', 'webp']
        for (const e of exts) {
          const oldImg = join(playlistPath, `${playlistName}.${e}`)
          if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
        }

        // Lưu ảnh từ thẻ metadata ra file
        fs.writeFileSync(destPath, cover.data)
        return { success: true }
      }
      return { success: false, error: 'Bài hát đầu tiên trong thư mục không có thẻ ảnh bìa!' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // TÍCH HỢP MUSIXMATCH API (DESKTOP BYPASS LẤY LRC 100%)
  // ==========================================

  let mxmToken: string | null = null
  let mxmTokenPromise: Promise<string | null> | null = null
  let mxmCooldownUntil = 0 // Khi bị Musixmatch yêu cầu captcha/giới hạn, tạm ngưng gọi API để tránh bị khóa lâu hơn

  const MXM_BASE = 'https://apic-desktop.musixmatch.com/ws/1.1'
  const MXM_APP_ID = 'web-desktop-app-v1.0'
  const MXM_TIMEOUT_MS = 8000
  const MXM_COOLDOWN_MS = 2 * 60 * 1000
  const MXM_NEGATIVE_CACHE_MS = 10 * 60 * 1000
  const MXM_CACHE_MAX = 100
  // Hiện tại endpoint desktop của Musixmatch cấp token giả (toàn số 0) và trả về dữ liệu mẫu cố định
  // (lyrics_id 35776330 - văn bản vô nghĩa "Wob gopini den...") -> phải nhận diện & loại bỏ
  const MXM_DUMMY_TOKEN_COOLDOWN_MS = 30 * 60 * 1000
  const MXM_DUMMY_LYRICS_ID = 35776330

  // Header ngụy trang thành phần mềm Musixmatch Desktop thật
  const mxmHeaders = {
    'User-Agent': 'Musixmatch/3.14.4346-master-20200508',
    Accept: 'application/json'
  }

  type MxmResult = {
    success: boolean
    lyrics?: string
    isSynced?: boolean
    source?: 'lrclib' | 'netease' | 'kugou' | 'musixmatch'
    error?: string
    code?: 'NO_TOKEN' | 'RATE_LIMITED' | 'NETWORK' | 'NOT_FOUND' | 'NO_LYRICS' | 'BAD_RESPONSE'
  }
  // Cache kết quả (thành công + "không tìm thấy") để không gọi lại API mỗi lần phát lại bài hát
  const mxmResultCache = new Map<string, { at: number; result: MxmResult }>()

  const mxmCacheSet = (key: string, result: MxmResult) => {
    if (mxmResultCache.size >= MXM_CACHE_MAX) {
      const oldest = mxmResultCache.keys().next().value
      if (oldest !== undefined) mxmResultCache.delete(oldest)
    }
    mxmResultCache.set(key, { at: Date.now(), result })
  }

  // fetch có timeout, kiểm tra HTTP status và đảm bảo phản hồi là JSON hợp lệ
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
    // Gộp các yêu cầu token đồng thời thành một lần gọi duy nhất
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

  // Gọi một endpoint Musixmatch, tự làm mới token 1 lần nếu hết hạn và chuẩn hóa mã trạng thái
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

  // Chuẩn hóa chuỗi để so khớp tên bài hát/nghệ sĩ (bỏ dấu, ký tự đặc biệt, nội dung trong ngoặc)
  const mxmNormalize = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()

  const mxmCleanTitle = (title: string) =>
    title
      .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
      .replace(/\s+-\s+.*(remaster|version|edit|live|mix|mono|stereo).*$/i, '')
      .trim()

  // Chọn bản ghi khớp nhất. Bắt buộc khớp cả tên bài hát lẫn nghệ sĩ để không lấy nhầm lời bài khác
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

  // Loại bỏ phần chú thích bản quyền/pixel theo dõi mà Musixmatch gắn ở cuối lời thô
  const mxmCleanPlainLyrics = (raw: string) =>
    raw
      .split('*******')[0]
      .replace(/\(\d{6,}\)\s*$/, '')
      .trim()

  const hasLrcTimestamps = (text: string) => /\[\d{2,}:\d{2}(?:\.\d{1,3})?\]/.test(text)

  async function fetchMusixmatchLyricsInternal(title: string, artist: string): Promise<MxmResult> {
    const artists = splitArtistString(artist)
    const primaryArtist = artists[0] || artist

    // 1. Tìm bài hát: nghệ sĩ đầy đủ -> nghệ sĩ chính -> tìm tự do theo "tên + nghệ sĩ chính"
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

    // 2. Ưu tiên bản đồng bộ thời gian (LRC)
    if (matched.has_subtitles !== 0) {
      const sub = await mxmCall('track.subtitle.get', { track_id: trackId, subtitle_format: 'lrc' })
      const subBody = sub.statusCode === 200 ? sub.body?.subtitle?.subtitle_body : null
      if (typeof subBody === 'string' && hasLrcTimestamps(subBody)) {
        return { success: true, lyrics: subBody, isSynced: true, source: 'musixmatch' }
      }
    }

    // 3. Nếu không có bản đồng bộ, lấy lời thô
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
        if (cleaned)
          return { success: true, lyrics: cleaned, isSynced: false, source: 'musixmatch' }
      }
    }

    return { success: false, code: 'NO_LYRICS', error: 'Bài hát chưa được cập nhật lời' }
  }

  // ------------------------------------------
  // LRCLIB (https://lrclib.net) — API lời bài hát miễn phí, không cần khóa, có cả lời đồng bộ (LRC)
  // ------------------------------------------
  function getLrclibBase(): string {
    const cfg = getConfig()
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
      const res = await fetch(
        `${baseUrl}/${endpoint}?${new URLSearchParams(params).toString()}`,
        { headers: LRCLIB_HEADERS, signal: controller.signal }
      )

      if (res.status === 503 || res.status === 429) {
        if (retries > 0) {
          const retryAfterHdr = res.headers.get('retry-after')
          const delaySec = retryAfterHdr
            ? Math.min(Math.max(parseInt(retryAfterHdr, 10) || 1, 1), 4)
            : 1.5
          await new Promise((r) => setTimeout(r, delaySec * 1000 + Math.random() * 300))
          return lrclibFetch(endpoint, params, retries - 1)
        }
        // Sau khi retry vẫn gặp 503/429 -> kích hoạt cooldown 2 phút để không làm nghẽn luồng phát nhạc
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

  async function fetchLrclibLyrics(
    title: string,
    artist: string,
    album?: string,
    duration?: number
  ): Promise<MxmResult> {
    const artists = splitArtistString(artist)
    const primaryArtist = artists[0] || artist
    const cleanTitle = mxmCleanTitle(title) || title
    const hasDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0

    // 1. Khớp chính xác theo tên + nghệ sĩ (+ album, thời lượng nếu có)
    const exactParams: Record<string, string> = { track_name: cleanTitle, artist_name: artist }
    if (album && album.toLowerCase() !== 'unknown' && album.toLowerCase() !== 'unknown album')
      exactParams.album_name = album
    if (hasDuration) exactParams.duration = String(Math.round(duration as number))
    const exact = await lrclibFetch('get', exactParams)
    if (exact.status === 200) {
      const r = lrclibToResult(exact.data)
      if (r) return r
    }

    // 2. Tìm kiếm rồi chọn bản khớp nhất (bắt buộc khớp tên bài + nghệ sĩ, lệch thời lượng tối đa 5 giây)
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

  // ------------------------------------------
  // NetEase Cloud Music API — Nguồn dự phòng chất lượng cao, không cần token, hỗ trợ LRC đồng bộ
  // ------------------------------------------
  async function fetchNetEaseLyrics(
    title: string,
    artist: string,
    duration?: number
  ): Promise<MxmResult | null> {
    const cleanTitle = mxmCleanTitle(title) || title
    const artists = splitArtistString(artist)
    const primaryArtist = artists[0] || artist
    const query = `${cleanTitle} ${primaryArtist}`.trim()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const searchUrl = `http://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1&offset=0&limit=5`
      const searchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'http://music.163.com/'
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
          wantArtists.some((wa) => songArtists.some((sa: string) => sa.includes(wa) || wa.includes(sa)))
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

      if (!bestSong && songs.length > 0) bestSong = songs[0]
      if (!bestSong?.id) return null

      const lyricUrl = `https://music.163.com/api/song/lyric?id=${bestSong.id}&lv=1&kv=1&tv=-1`
      const lyrRes = await fetch(lyricUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'http://music.163.com/'
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

  // ------------------------------------------
  // Kugou Music API — Nguồn dự phòng phụ trợ (LRC đồng bộ, Base64 decode)
  // ------------------------------------------
  async function fetchKugouLyrics(
    title: string,
    artist: string,
    duration?: number
  ): Promise<MxmResult | null> {
    const cleanTitle = mxmCleanTitle(title) || title
    const artists = splitArtistString(artist)
    const primaryArtist = artists[0] || artist
    const query = `${cleanTitle} ${primaryArtist}`.trim()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      let searchUrl = `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(query)}`
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

      if (!bestCand && candidates.length > 0) bestCand = candidates[0]
      if (!bestCand?.id || !bestCand?.accesskey) return null

      const dlUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${bestCand.id}&accesskey=${bestCand.accesskey}&fmt=lrc&charset=utf8`
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

  // Lấy lời online đa nguồn: LRCLIB (ưu tiên) -> NetEase (dự phòng 1) -> Kugou (dự phòng 2) -> Musixmatch (dự phòng 3)
  async function fetchOnlineLyrics(
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
    } catch (e: any) {
      /* ignore */
    }

    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Không tìm thấy lời bài hát trên các nguồn online (LRCLIB, NetEase, Kugou, Musixmatch)'
    }
  }

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

      // 2. Kiểm tra cache SQLite nhúng (tải siêu tốc 0ms, không tốn bất kỳ request mạng nào)
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

      // 3. Tra cứu đa nguồn online (LRCLIB -> NetEase -> Kugou -> Musixmatch)
      const result = await fetchOnlineLyrics(
        title,
        artist,
        typeof album === 'string' ? album : undefined,
        typeof duration === 'number' ? duration : undefined
      )

      // Lưu kết quả thành công vào SQLite vĩnh viễn và RAM cache
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

      // 1. Kiểm tra cache RAM
      const cached = mxmResultCache.get(cacheKey)
      if (cached) {
        if (cached.result.success || Date.now() - cached.at < MXM_NEGATIVE_CACHE_MS)
          return cached.result
        mxmResultCache.delete(cacheKey)
      }

      // 2. Kiểm tra cache SQLite
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

  // ==========================================
  // NHẬP FILE TỪ MÁY TÍNH / Ổ CỨNG RỜI
  // ==========================================
  ipcMain.handle('music:importLocalFiles', async (_, targetSubFolder?: string) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) {
      return {
        success: false,
        error: 'Chưa cấu hình thư mục Thư viện! Hãy vào Cài đặt để thiết lập.'
      }
    }

    // Nếu có truyền tên Playlist vào, chép vào thư mục Playlist, ngược lại chép vào Thư viện gốc
    const safeTargetSubFolder = targetSubFolder ? sanitizeDirectoryName(targetSubFolder) : null
    const destFolder = safeTargetSubFolder ? join(rootPath, safeTargetSubFolder) : rootPath
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })

    // Mở hộp thoại chọn nhiều file nhạc
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Audio Files',
          extensions: SUPPORTED_AUDIO_EXTS.map((ext) => ext.replace(/^\./, ''))
        }
      ]
    })

    if (canceled || filePaths.length === 0) return { success: false, canceled: true }

    const importedTracks: any[] = []

    for (const sourcePath of filePaths) {
      const fileName = path.basename(sourcePath)
      const destPath = join(destFolder, fileName)

      try {
        // Tránh lỗi copy đè chính nó nếu người dùng chọn file đã nằm sẵn trong thư mục
        if (sourcePath !== destPath) {
          fs.copyFileSync(sourcePath, destPath)

          // Tự động tìm và copy luôn file lời bài hát (.lrc) trùng tên nếu có
          const lrcSource = sourcePath.replace(/\.[^/.]+$/, '.lrc')
          const lrcDest = destPath.replace(/\.[^/.]+$/, '.lrc')
          if (fs.existsSync(lrcSource) && lrcSource !== lrcDest) {
            fs.copyFileSync(lrcSource, lrcDest)
          }
        }

        // Quét metadata của file mới vừa chép
        const metadata = await mm.parseFile(destPath)
        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          coverBase64 = null
        }

        const { artist, artists } = extractArtists(metadata, fileName)

        importedTracks.push({
          id: destPath,
          filePath: pathToFileURL(destPath).href,
          title: metadata.common.title || fileName.replace(/\.[^/.]+$/, ''),
          artist: artist,
          artists: artists,
          multiArtistVersion: 2,
          album: metadata.common.album || 'Unknown Album',
          duration: metadata.format.duration,
          format: metadata.format.container || fileName.split('.').pop()?.toUpperCase(),
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          bitDepth: metadata.format.bitsPerSample,
          lossless: metadata.format.lossless,
          coverArt: coverBase64,
          isCloud: false
        })
      } catch (err) {
        importedTracks.push({
          id: destPath,
          filePath: pathToFileURL(destPath).href,
          title: fileName,
          isCloud: false
        })
      }
    }

    return { success: true, tracks: importedTracks }
  })

  // ==========================================
  // API TRÍCH XUẤT ẢNH BÌA ĐƠN LẺ (ĐÃ TỐI ƯU BASE64)
  // ==========================================
  ipcMain.handle('music:getTrackCover', async (_, filePath: string) => {
    try {
      if (!filePath || filePath.startsWith('http')) return null

      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      rawPath = rawPath.split('?')[0]
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (_) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }

      if (streamPort > 0) {
        return `http://127.0.0.1:${streamPort}/cover?path=${encodeURIComponent(rawPath)}&size=128`
      }

      // 1. Khởi tạo thư mục proxy ảnh
      const rootPath = getConfig().libraryPath
      if (!rootPath) return null
      const thumbDir = join(rootPath, '.thumbnails')
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })

      // 2. Băm tên file để làm ID ảnh cache
      const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
      const thumbPath = join(thumbDir, `${trackHash}.jpg`)

      // 3. Nếu ảnh đã cache trước đó, lập tức trả về Local URL để giải phóng RAM
      if (fs.existsSync(thumbPath)) {
        return pathToFileURL(thumbPath).href
      }

      // 4. Nếu chưa có, trích xuất thumbnail 128px và lưu xuống ổ cứng
      const extractedPic = await fastExtractCover(rawPath)
      if (extractedPic && extractedPic.data && extractedPic.data.length > 0) {
        const img = nativeImage.createFromBuffer(extractedPic.data)
        const resized = img.resize({ width: 128, height: 128, quality: 'good' })
        fs.writeFileSync(thumbPath, resized.toJPEG(80))
        return pathToFileURL(thumbPath).href
      }
    } catch (e) {}
    return null
  })

  // ==========================================
  // API TRÍCH XUẤT ẢNH BÌA DYNAMIC SCALING CHO THEME & LYRICS (STREAM IN-MEMORY)
  // ==========================================
  ipcMain.handle('music:getOriginalTrackCover', async (_, filePath: string, size?: number) => {
    try {
      if (!filePath || filePath.startsWith('http') || !streamPort) return null
      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      rawPath = rawPath.split('?')[0]
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (_) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }

      if (!fs.existsSync(rawPath)) return null

      const sizeQuery = typeof size === 'number' && size > 0 ? `&size=${Math.round(size)}` : ''
      return `http://127.0.0.1:${streamPort}/cover?path=${encodeURIComponent(rawPath)}${sizeQuery}`
    } catch (e) {}
    return null
  })

  ipcMain.handle('music:getStreamPort', () => streamPort)
  ipcMain.on('music:getStreamPortSync', (event) => {
    event.returnValue = streamPort
  })

  // ==========================================
  // HỆ THỐNG TẠO PLAYLIST THỦ CÔNG
  // ==========================================

  // 1. Tạo playlist thủ công mới
  ipcMain.handle('music:createPlaylist', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath))
      return { success: false, error: 'Chưa cấu hình thư mục thư viện!' }

    const safeName = sanitizeDirectoryName(playlistName)
    if (!safeName || safeName === 'Untitled')
      return { success: false, error: 'Tên playlist không hợp lệ!' }

    const dirPath = join(rootPath, safeName)
    if (fs.existsSync(dirPath)) {
      return { success: false, error: 'Playlist đã tồn tại!' }
    }

    try {
      fs.mkdirSync(dirPath, { recursive: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. Thêm bài hát vào playlist mà KHÔNG nhân bản file vật lý (Dùng Hard Link)
  // Thêm bài hát vào playlist bằng cơ chế Hard Link (Tối ưu 100% không gian, không sao chép)
  ipcMain.handle('music:addTrackToPlaylist', async (_, playlistName, trackPath) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath) return { success: false, error: 'Chưa cấu hình thư viện!' }

    let rawPath = trackPath.replace(/^file:\/\/\/?/, '')
    if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

    if (!fs.existsSync(rawPath)) return { success: false, error: 'File nguồn không tồn tại!' }

    const safePlaylistName = sanitizeDirectoryName(playlistName)
    const playlistDir = join(rootPath, safePlaylistName)
    if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true })

    const fileName = path.basename(rawPath)
    const destPath = join(playlistDir, fileName)

    // Nếu tệp đã tồn tại trong thư mục playlist thì bỏ qua, không làm gì thêm
    if (fs.existsSync(destPath)) {
      return { success: true, note: 'Bài hát đã có trong playlist này rồi!' }
    }

    try {
      // BẮT BUỘC TẠO HARD LINK: Trỏ chung một vùng nhớ vật lý, không tốn thêm dung lượng
      fs.linkSync(rawPath, destPath)

      // Liên kết luôn file lời bài hát (.lrc) đi kèm nếu có (cũng dùng Hard Link)
      const lrcSource = rawPath.replace(/\.[^/.]+$/, '.lrc')
      const lrcDest = destPath.replace(/\.[^/.]+$/, '.lrc')
      if (fs.existsSync(lrcSource) && !fs.existsSync(lrcDest)) {
        try {
          fs.linkSync(lrcSource, lrcDest)
        } catch (e) {}
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // API TỐI ƯU HÓA HỆ THỐNG
  // ==========================================
  ipcMain.handle('music:forceGC', () => {
    // Kích hoạt dọn rác thủ công giải phóng RAM
    smallCoverCache.clear()
    largeCoverCache.clear()
    folderCoverCache.clear()
    if (typeof global.gc === 'function') {
      global.gc()
    }
    setTimeout(() => {
      trimNativeMemory()
    }, 200)
  })

  // ==========================================
  // HỆ THỐNG LOCAL BUFFER SERVER & PROXY CACHE ẢNH
  // ==========================================
  streamPort = 0
  const streamUrlCache = new Map<string, { url: string; expires: number }>()
  // BỘ NHỚ ĐỆM RAM PHÂN TẦNG (Tối ưu giới hạn tránh tích tụ heap):
  // - smallCoverCache: Lưu trữ tới 400 ảnh nhỏ (<=128px) ~1MB RAM cho cuộn danh sách.
  // - largeCoverCache: Lưu trữ tới 200 ảnh lớn (>128px) chất lượng cao cho PlayerBar, Grid, Vinyl (~2.5MB RAM).
  // - folderCoverCache: Lưu trữ tới 150 ảnh bìa thư mục album/playlist tránh fs.readdirSync lặp lại.
  const smallCoverCache = new Map<string, Buffer>()
  const largeCoverCache = new Map<string, Buffer>()
  const folderCoverCache = new Map<string, { buffer: Buffer; mime: string }>()

  // Concurrency Limiter: Giới hạn tối đa 3 tác vụ đọc/trích xuất metadata file âm thanh đồng thời
  // Triệt tiêu hoàn toàn đỉnh nhọn 100% Disk Usage và Disk Head Thrashing trên ổ cứng
  class TaskQueue {
    private concurrency: number
    private running: number = 0
    private queue: Array<() => void> = []

    constructor(concurrency: number) {
      this.concurrency = concurrency
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (this.running >= this.concurrency) {
        await new Promise<void>((resolve) => this.queue.push(resolve))
      }
      this.running++
      try {
        return await fn()
      } finally {
        this.running--
        const next = this.queue.shift()
        if (next) next()
      }
    }
  }

  const audioCoverExtractionQueue = new TaskQueue(3)

  function getCoverFromCache(key: string): Buffer | undefined {
    return smallCoverCache.get(key) || largeCoverCache.get(key)
  }

  function setCoverResizeCache(key: string, buf: Buffer, targetSize: number) {
    if (targetSize > 0 && targetSize <= 128) {
      if (smallCoverCache.size >= 400) {
        const oldestKey = smallCoverCache.keys().next().value
        if (oldestKey) smallCoverCache.delete(oldestKey)
      }
      smallCoverCache.set(key, buf)
    } else {
      if (largeCoverCache.size >= 200) {
        const oldestKey = largeCoverCache.keys().next().value
        if (oldestKey) largeCoverCache.delete(oldestKey)
      }
      largeCoverCache.set(key, buf)
    }
  }

  function getProxyImageUrl(url: string | null | undefined, id: string) {
    if (!url || !streamPort) return url || null
    return `http://127.0.0.1:${streamPort}/image?url=${encodeURIComponent(url)}&id=${id}`
  }

  function extractCovers(thumbnails: any[], fallbackId: string) {
    if (!thumbnails || thumbnails.length === 0) return { coverArt: null, coverArtHighRes: null }
    const medIndex = thumbnails.length > 1 ? 1 : 0
    const medUrl = thumbnails[medIndex].url
    let highUrl = thumbnails[thumbnails.length - 1].url
    if (highUrl.includes('=w') || highUrl.includes('=s')) {
      highUrl = highUrl.split('=w')[0].split('=s')[0] + '=w1200-h1200-l90-rj'
    } else if (highUrl.includes('hqdefault.jpg')) {
      highUrl = highUrl.replace('hqdefault.jpg', 'maxresdefault.jpg')
    }
    return {
      coverArt: getProxyImageUrl(medUrl, `med_${fallbackId}`),
      coverArtHighRes: getProxyImageUrl(highUrl, `high_${fallbackId}`)
    }
  }

  // HÀM TIỆN ÍCH MỚI: Bóc tách thông minh mọi loại nội dung từ YouTube Music
  function parseYtmItem(item: any) {
    let renderer =
      item.musicTwoRowItemRenderer ||
      item.musicResponsiveListItemRenderer ||
      item.musicCardShelfRenderer
    let style = item.musicTwoRowItemRenderer ? 'CARD' : 'LIST'
    if (!renderer) return null

    const titleRuns =
      renderer.title?.runs ||
      renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ||
      renderer.header?.musicCardShelfHeaderBasicRenderer?.title?.runs ||
      []
    const itemTitle = titleRuns.map((r: any) => r.text).join('')

    const thumbnails =
      renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      renderer.thumbnail?.thumbnails ||
      []

    const navEndpoint =
      renderer.navigationEndpoint ||
      titleRuns[0]?.navigationEndpoint ||
      renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
        ?.playNavigationEndpoint ||
      renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
        ?.navigationEndpoint ||
      renderer.buttons?.[0]?.buttonRenderer?.command

    const videoId = navEndpoint?.watchEndpoint?.videoId || renderer.playlistItemData?.videoId
    const browseId = navEndpoint?.browseEndpoint?.browseId
    const pageType =
      navEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType

    const playlistId = browseId || navEndpoint?.watchEndpoint?.playlistId
    const isArtist =
      pageType === 'MUSIC_PAGE_TYPE_ARTIST' || (browseId && browseId.startsWith('UC'))

    const subtitleRuns =
      renderer.subtitle?.runs ||
      renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ||
      []
    const subtitle = subtitleRuns.map((r: any) => r.text).join('')

    if (itemTitle && (videoId || playlistId || isArtist)) {
      const itemFallbackId =
        videoId || playlistId || crypto.createHash('md5').update(itemTitle).digest('hex')
      const covers = extractCovers(thumbnails, itemFallbackId)
      return {
        title: itemTitle,
        subtitle: subtitle,
        videoId: videoId,
        playlistId: playlistId,
        isArtist: !!isArtist,
        thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
        coverArtHighRes: covers.coverArtHighRes,
        style: style
      }
    }
    return null
  }

  const streamServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Origin')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    )
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`)

    // --- LUỒNG 1: TRUYỀN TẢI NHẠC ---
    if (parsedUrl.pathname === '/play') {
      const targetId = parsedUrl.searchParams.get('id')
      const platform =
        parsedUrl.searchParams.get('platform') ||
        (targetId?.startsWith('sc-') ? 'soundcloud' : 'youtube')
      if (!targetId) {
        res.writeHead(400).end('Thiếu ID bài hát')
        return
      }

      try {
        // Phân giải URL trực tiếp nếu chưa có trong cache
        let directUrl = ''
        const cached = streamUrlCache.get(targetId)
        if (cached && cached.expires > Date.now()) directUrl = cached.url
        else {
          const config = getConfig()
          if (platform === 'soundcloud') {
            const permalink = parsedUrl.searchParams.get('url') || undefined
            const rawScId = targetId.replace(/^sc-/, '')
            directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken)
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
          } else {
            const ytOptions: any = {
              dumpSingleJson: true,
              format: 'bestaudio/best',
              noWarnings: true,
              extractorArgs: 'youtube:player-client=android' // Bổ sung API Android
            }
            // Bơm Cookie
            if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

            const info = (await ytdlp(targetId, ytOptions as any)) as any
            directUrl = info.url
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
          }
        }

        // Xử lý stream HLS (.m3u8) bằng FFmpeg chuyển đổi tức thì sang MP3 stream cho thẻ Audio
        if (directUrl.includes('.m3u8') || directUrl.includes('/hls/')) {
          const ffmpegExe = getFfmpegPath()
          const seekParam = parsedUrl.searchParams.get('seek')
          const ffmpegArgs: string[] = [
            '-reconnect',
            '1',
            '-reconnect_streamed',
            '1',
            '-reconnect_delay_max',
            '5'
          ]
          if (seekParam && !isNaN(parseFloat(seekParam))) {
            ffmpegArgs.push('-ss', parseFloat(seekParam).toString())
          }
          ffmpegArgs.push(
            '-i',
            directUrl,
            '-f',
            'mp3',
            '-acodec',
            'libmp3lame',
            '-b:a',
            '192k',
            '-vn',
            'pipe:1'
          )

          const ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })

          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache'
          })

          ffmpegProcess.stdout.pipe(res)
          req.on('close', () => {
            try {
              ffmpegProcess.kill()
            } catch (e) {}
          })
          return
        }

        const requestHeaders: any = {}
        if (req.headers.range) requestHeaders['Range'] = req.headers.range

        let proxyRes
        try {
          proxyRes = await axios({
            method: 'GET',
            url: directUrl,
            headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' },
            responseType: 'stream',
            decompress: false
          })
        } catch (axiosErr: any) {
          if (axiosErr.response && axiosErr.response.status === 403) {
            streamUrlCache.delete(targetId)

            // Cập nhật ytOptions cho luồng Retry
            const config = getConfig()
            if (platform === 'soundcloud') {
              const permalink = parsedUrl.searchParams.get('url') || undefined
              const rawScId = targetId.replace(/^sc-/, '')
              directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken)
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
            } else {
              const ytOptions: any = {
                dumpSingleJson: true,
                format: 'bestaudio/best',
                noWarnings: true,
                extractorArgs: 'youtube:player-client=android'
              }
              if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

              const newInfo = (await ytdlp(targetId, ytOptions as any)) as any
              directUrl = newInfo.url
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
            }

            proxyRes = await axios({
              method: 'GET',
              url: directUrl,
              headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' },
              responseType: 'stream',
              decompress: false
            })
          } else throw axiosErr
        }

        const responseHeaders: any = {
          'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
          'Accept-Ranges': proxyRes.headers['accept-ranges'] || 'bytes',
          'Cache-Control': 'no-cache'
        }
        if (proxyRes.headers['content-length'])
          responseHeaders['Content-Length'] = proxyRes.headers['content-length']
        if (proxyRes.headers['content-range'])
          responseHeaders['Content-Range'] = proxyRes.headers['content-range']

        res.writeHead(proxyRes.status, responseHeaders)
        proxyRes.data.pipe(res)
        proxyRes.data.on('error', () => {
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
        res.on('error', () => proxyRes.data.destroy())
        req.on('close', () => proxyRes.data.destroy())
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 2: PROXY TẢI ẢNH BÌA ---
    else if (parsedUrl.pathname === '/image') {
      const targetUrl = parsedUrl.searchParams.get('url')
      const targetId = parsedUrl.searchParams.get('id')
      if (!targetUrl) {
        res.writeHead(400).end('Thiếu URL')
        return
      }

      const safeId = targetId
        ? targetId.replace(/[^a-zA-Z0-9_-]/g, '')
        : crypto.createHash('md5').update(targetUrl).digest('hex')
      const cachedImgPath = join(IMAGE_CACHE_DIR, `${safeId}.jpg`)
      res.setHeader('Cache-Control', 'public, max-age=31536000')

      if (fs.existsSync(cachedImgPath)) {
        res.setHeader('Content-Type', 'image/jpeg')
        fs.createReadStream(cachedImgPath).pipe(res)
        return
      }

      try {
        const imgRes = await axios({
          method: 'GET',
          url: targetUrl,
          responseType: 'stream',
          decompress: false
        })
        res.setHeader('Content-Type', (imgRes.headers['content-type'] as string) || 'image/jpeg')
        const fileStream = fs.createWriteStream(cachedImgPath)
        imgRes.data.pipe(fileStream)
        imgRes.data.pipe(res)
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 3: TRUYỀN TẢI ẢNH BÌA DYNAMIC SCALING & GỐC IN-MEMORY (0 BYTES Ổ ĐĨA) ---
    else if (parsedUrl.pathname === '/cover') {
      const rawTrackPath = parsedUrl.searchParams.get('path')
      const targetSize = parseInt(parsedUrl.searchParams.get('size') || '0', 10)
      if (!rawTrackPath) {
        res.writeHead(400).end('Thiếu đường dẫn bài hát')
        return
      }

      let targetPath = rawTrackPath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('File không tồn tại')
        return
      }

      const cacheKey = `${targetPath}_size_${targetSize}`
      const cached = targetSize > 0 ? getCoverFromCache(cacheKey) : undefined
      if (cached) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=604800, immutable',
          'Content-Length': cached.length
        })
        res.end(cached)
        return
      }

      try {
        let rawBuffer: Buffer | null = null
        let mime = 'image/jpeg'
        const directImgMimes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml'
        }

        let isDir = false
        try {
          isDir = fs.statSync(targetPath).isDirectory()
        } catch (_) {}

        if (isDir) {
          // XỬ LÝ KHI TARGETPATH LÀ THƯ MỤC (ALBUM HOẶC DIRECTORY PLAYLIST)
          const cachedFolder = folderCoverCache.get(targetPath)
          if (cachedFolder) {
            rawBuffer = cachedFolder.buffer
            mime = cachedFolder.mime
          } else {
            const playlistHash = crypto
              .createHash('md5')
              .update('playlist_' + targetPath)
              .digest('hex')
            const userPlHash = crypto
              .createHash('md5')
              .update('user_pl_' + targetPath)
              .digest('hex')
            const dirThumb = join(targetPath, '.thumbnails', `pl_${playlistHash}.jpg`)
            const parentThumb = join(dirname(targetPath), '.thumbnails', `pl_${playlistHash}.jpg`)
            const centralPlThumb = join(IMAGE_CACHE_DIR, `pl_${playlistHash}.jpg`)
            const centralUserPlThumb = join(IMAGE_CACHE_DIR, `upl_${userPlHash}.jpg`)

            const candidateThumbs = [dirThumb, parentThumb, centralPlThumb, centralUserPlThumb]
            for (const c of candidateThumbs) {
              if (fs.existsSync(c)) {
                try {
                  rawBuffer = fs.readFileSync(c)
                  mime = 'image/jpeg'
                  break
                } catch (_) {}
              }
            }

            // Fallback 1: Tìm các file ảnh bìa phổ biến trong thư mục
            if (!rawBuffer) {
              const commonCoverNames = [
                'cover',
                'folder',
                'front',
                'artwork',
                'album',
                'thumb',
                'thumbnail',
                path.basename(targetPath)
              ]
              const possibleExts = ['.jpg', '.jpeg', '.png', '.webp']
              for (const name of commonCoverNames) {
                for (const ext of possibleExts) {
                  const candidate = join(targetPath, `${name}${ext}`)
                  if (fs.existsSync(candidate)) {
                    try {
                      rawBuffer = fs.readFileSync(candidate)
                      mime = directImgMimes[ext] || 'image/jpeg'
                      break
                    } catch (_) {}
                  }
                }
                if (rawBuffer) break
              }
            }

            // Fallback 2: Quét bất kỳ file ảnh nào trong thư mục
            if (!rawBuffer) {
              try {
                const files = fs.readdirSync(targetPath)
                for (const file of files) {
                  const ext = path.extname(file).toLowerCase()
                  if (directImgMimes[ext]) {
                    const candidate = join(targetPath, file)
                    try {
                      rawBuffer = fs.readFileSync(candidate)
                      mime = directImgMimes[ext]
                      break
                    } catch (_) {}
                  }
                }
              } catch (_) {}
            }

            // Fallback 3: Lấy cover từ bài hát đầu tiên trong thư mục (KHÔNG gọi mm.parseFile trên thư mục!)
            if (!rawBuffer) {
              try {
                const files = fs.readdirSync(targetPath)
                const supportedAudioExts = SUPPORTED_AUDIO_EXTS
                for (const file of files) {
                  const ext = path.extname(file).toLowerCase()
                  if (supportedAudioExts.includes(ext)) {
                    const audioPath = join(targetPath, file)
                    const trackHash = crypto.createHash('md5').update(audioPath).digest('hex')
                    const audioThumb1 = join(targetPath, '.thumbnails', `${trackHash}.jpg`)
                    const audioThumb2 = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)
                    if (fs.existsSync(audioThumb1)) {
                      try {
                        rawBuffer = fs.readFileSync(audioThumb1)
                        mime = 'image/jpeg'
                        break
                      } catch (_) {}
                    } else if (fs.existsSync(audioThumb2)) {
                      try {
                        rawBuffer = fs.readFileSync(audioThumb2)
                        mime = 'image/jpeg'
                        break
                      } catch (_) {}
                    }
                    if (!rawBuffer) {
                      try {
                        const meta = await audioCoverExtractionQueue.run(async () => {
                          return await mm.parseFile(audioPath, {
                            skipCovers: false,
                            duration: false
                          })
                        })
                        if (meta.common.picture && meta.common.picture.length > 0) {
                          const pic = meta.common.picture[0]
                          mime = pic.format || 'image/jpeg'
                          if (!mime.includes('/')) mime = `image/${mime}`
                          rawBuffer = Buffer.from(pic.data)
                          break
                        }
                      } catch (_) {}
                    }
                  }
                }
              } catch (_) {}
            }

            if (rawBuffer) {
              if (folderCoverCache.size >= 150) {
                const oldestKey = folderCoverCache.keys().next().value
                if (oldestKey) folderCoverCache.delete(oldestKey)
              }
              folderCoverCache.set(targetPath, { buffer: rawBuffer, mime })
            }
          }
        } else {
          // XỬ LÝ KHI TARGETPATH LÀ TỆP
          const extLower = path.extname(targetPath).toLowerCase()
          if (directImgMimes[extLower]) {
            try {
              rawBuffer = fs.readFileSync(targetPath)
              mime = directImgMimes[extLower]
            } catch (_) {}
          }

          const trackHash = crypto.createHash('md5').update(targetPath).digest('hex')
          const centralThumbPath = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)
          let foundThumb: string | null = null

          // 1. Kiểm tra thumbnail có sẵn trên đĩa trước (Áp dụng đa tầng tra cứu)
          if (!rawBuffer) {
            if (fs.existsSync(centralThumbPath)) {
              foundThumb = centralThumbPath
            } else {
              const localThumbPath = join(dirname(targetPath), '.thumbnails', `${trackHash}.jpg`)
              if (fs.existsSync(localThumbPath)) {
                foundThumb = localThumbPath
              } else {
                const config = getConfig()
                const roots: string[] =
                  config.libraryPaths && config.libraryPaths.length > 0
                    ? config.libraryPaths
                    : config.libraryPath
                      ? [config.libraryPath]
                      : []
                for (const r of roots) {
                  const candidate = join(r, '.thumbnails', `${trackHash}.jpg`)
                  if (fs.existsSync(candidate)) {
                    foundThumb = candidate
                    break
                  }
                }
                if (!foundThumb) {
                  let currDir = dirname(targetPath)
                  let prevDir = ''
                  while (currDir && currDir !== prevDir && currDir !== path.parse(currDir).root) {
                    const candidate = join(currDir, '.thumbnails', `${trackHash}.jpg`)
                    if (fs.existsSync(candidate)) {
                      foundThumb = candidate
                      break
                    }
                    prevDir = currDir
                    currDir = dirname(currDir)
                  }
                }
              }
            }

            // Nếu yêu cầu ảnh nhỏ hoặc vừa (targetSize <= 256px - bao gồm Grid View tier 'md' 200px) và đã tìm thấy thumbnail -> Trả về trực tiếp thumbnail 5KB, 0% CPU/Disk audio read!
            if (targetSize > 0 && targetSize <= 256 && foundThumb) {
              try {
                rawBuffer = fs.readFileSync(foundThumb)
                mime = 'image/jpeg'
                setCoverResizeCache(cacheKey, rawBuffer, targetSize)
                res.writeHead(200, {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=604800, immutable',
                  'Content-Length': rawBuffer.length
                })
                res.end(rawBuffer)
                return
              } catch (_) {}
            }
          }

          // 2. Nếu targetSize > 256 (cần ảnh gốc nét cao cho Dynamic Scaling Vinyl/Fullscreen) HOẶC chưa có thumbnail nào:
          // Áp dụng Header-Only Seeking và ưu tiên Folder Art trước khi đọc từ file audio!
          if (!rawBuffer) {
            // 2a. Ưu tiên 1: Tra cứu Folder Art trong thư mục chứa file audio (cover.jpg, folder.jpg...)
            const trackDir = dirname(targetPath)
            const folderImgPath = findFolderCoverImage(trackDir)
            if (folderImgPath && fs.existsSync(folderImgPath)) {
              try {
                rawBuffer = fs.readFileSync(folderImgPath)
                const ext = path.extname(folderImgPath).toLowerCase()
                mime = directImgMimes[ext] || 'image/jpeg'
              } catch (_) {}
            }

            // 2b. Nếu không có file ảnh rời trong thư mục, dùng Fast Extract Cover (Header-Only Seeking cho FLAC/MP3/M4A)
            if (!rawBuffer) {
              let extractedPic: { data: Buffer | Uint8Array; format?: string } | null = null
              extractedPic = await audioCoverExtractionQueue.run(async () => {
                return await fastExtractCover(targetPath)
              })

              if (extractedPic) {
                mime = extractedPic.format || 'image/jpeg'
                if (!mime.includes('/')) mime = `image/${mime}`
                rawBuffer = Buffer.from(extractedPic.data)

                // TỰ ĐỘNG LƯU THUMBNAIL 128PX VÀO CENTRAL CACHE:
                if (!fs.existsSync(centralThumbPath)) {
                  try {
                    const nativeThumb = nativeImage.createFromBuffer(rawBuffer)
                    const resizedThumb = nativeThumb.resize({
                      width: 128,
                      height: 128,
                      quality: 'good'
                    })
                    fs.promises.writeFile(centralThumbPath, resizedThumb.toJPEG(80)).catch(() => {})
                  } catch (_) {}
                }
              }
            }

            // 2c. Fallback an toàn: Dùng foundThumb (thumbnail 128px có sẵn) nếu không có ảnh gốc
            if (!rawBuffer && foundThumb) {
              try {
                rawBuffer = fs.readFileSync(foundThumb)
                mime = 'image/jpeg'
              } catch (_) {}
            }
          }
        }

        if (!rawBuffer) {
          res.writeHead(404).end('Không tìm thấy ảnh bìa')
          return
        }

        // Nếu client yêu cầu kích thước dynamic cụ thể (size > 0)
        if (targetSize > 0) {
          try {
            const nativeImg = nativeImage.createFromBuffer(rawBuffer)
            const curSize = nativeImg.getSize()
            if (curSize.width > 0 && curSize.height > 0) {
              if (curSize.width > targetSize || curSize.height > targetSize) {
                let newW = targetSize
                let newH = targetSize
                if (curSize.width >= curSize.height) {
                  newH = Math.max(1, Math.round((curSize.height / curSize.width) * targetSize))
                } else {
                  newW = Math.max(1, Math.round((curSize.width / curSize.height) * targetSize))
                }
                const resized = nativeImg.resize({ width: newW, height: newH, quality: 'good' })
                const jpegBuf = resized.toJPEG(85)
                setCoverResizeCache(cacheKey, jpegBuf, targetSize)
                res.writeHead(200, {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=604800, immutable',
                  'Content-Length': jpegBuf.length
                })
                res.end(jpegBuf)
                return
              }
            }
          } catch (resizeErr) {
            console.warn('[Cover Stream] Resize thất bại, trả về ảnh gốc:', resizeErr)
          }
        }

        // Trả về ảnh gốc nếu không resize hoặc ảnh nhỏ hơn targetSize
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400',
          'Content-Length': rawBuffer.length
        })
        res.end(rawBuffer)
        return
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 4: STREAM AUDIO CỤC BỘ (HỖ TRỢ WEBSECURITY: TRUE & RANGE HEADERS HTTP 206) ---
    else if (parsedUrl.pathname === '/local-audio') {
      const rawTrackPath = parsedUrl.searchParams.get('path')
      if (!rawTrackPath) {
        res.writeHead(400).end('Thiếu đường dẫn bài hát')
        return
      }

      let targetPath = rawTrackPath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!isAllowedLocalPath(targetPath)) {
        res.writeHead(403).end('Truy cập bị từ chối: Đường dẫn không hợp lệ')
        return
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('File không tồn tại')
        return
      }

      try {
        const stat = fs.statSync(targetPath)
        const fileSize = stat.size
        const ext = path.extname(targetPath).toLowerCase()
        const isBin = ext === '.bin'
        const effectiveFileSize = isBin ? fileSize + 44 : fileSize

        let binWavHeader: Buffer | null = null
        if (isBin) {
          binWavHeader = Buffer.alloc(44)
          binWavHeader.write('RIFF', 0)
          binWavHeader.writeUInt32LE(fileSize + 36, 4)
          binWavHeader.write('WAVE', 8)
          binWavHeader.write('fmt ', 12)
          binWavHeader.writeUInt32LE(16, 16)
          binWavHeader.writeUInt16LE(1, 20) // PCM format
          binWavHeader.writeUInt16LE(2, 22) // 2 Channels (Stereo)
          binWavHeader.writeUInt32LE(44100, 24) // 44.1kHz Sample Rate
          binWavHeader.writeUInt32LE(176400, 28) // 176400 Byte Rate (44100 * 2 * 2)
          binWavHeader.writeUInt16LE(4, 32) // Block Align
          binWavHeader.writeUInt16LE(16, 34) // 16-bit
          binWavHeader.write('data', 36)
          binWavHeader.writeUInt32LE(fileSize, 40)
        }

        const mimeMap: Record<string, string> = {
          '.mp3': 'audio/mpeg',
          '.flac': 'audio/flac',
          '.wav': 'audio/wav',
          '.bin': 'audio/wav',
          '.ape': 'audio/ape',
          '.m4a': 'audio/mp4',
          '.aac': 'audio/aac',
          '.ogg': 'audio/ogg',
          '.opus': 'audio/opus',
          '.alac': 'audio/alac',
          '.aiff': 'audio/aiff',
          '.wma': 'audio/x-ms-wma',
          '.dsf': 'audio/dsf',
          '.dff': 'audio/x-dff',
          '.dsd': 'audio/dsd'
        }
        const contentType = isBin ? 'audio/wav' : mimeMap[ext] || 'application/octet-stream'

        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'Content-Length': effectiveFileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })
          res.end()
          return
        }

        const range = req.headers.range
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : effectiveFileSize - 1

          if (
            isNaN(start) ||
            start >= effectiveFileSize ||
            (parts[1] && (isNaN(end) || end >= effectiveFileSize || start > end))
          ) {
            res
              .writeHead(416, {
                'Content-Range': `bytes */${effectiveFileSize}`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
              })
              .end()
            return
          }

          const chunksize = end - start + 1
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${effectiveFileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })

          if (isBin && binWavHeader) {
            if (start < 44) {
              const headerSlice = binWavHeader.subarray(start, Math.min(44, end + 1))
              res.write(headerSlice)
              if (end >= 44) {
                const fileStream = fs.createReadStream(targetPath, { start: 0, end: end - 44 })
                fileStream.pipe(res)
                req.on('close', () => fileStream.destroy())
                fileStream.on('error', () => {
                  if (!res.headersSent) res.writeHead(500).end()
                })
              } else {
                res.end()
              }
            } else {
              const fileStream = fs.createReadStream(targetPath, {
                start: start - 44,
                end: end - 44
              })
              fileStream.pipe(res)
              req.on('close', () => fileStream.destroy())
              fileStream.on('error', () => {
                if (!res.headersSent) res.writeHead(500).end()
              })
            }
          } else {
            const fileStream = fs.createReadStream(targetPath, { start, end })
            fileStream.pipe(res)
            req.on('close', () => {
              fileStream.destroy()
            })
            fileStream.on('error', () => {
              if (!res.headersSent) res.writeHead(500).end()
            })
          }
        } else {
          res.writeHead(200, {
            'Content-Length': effectiveFileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })
          if (isBin && binWavHeader) {
            res.write(binWavHeader)
          }
          const fileStream = fs.createReadStream(targetPath)
          fileStream.pipe(res)
          req.on('close', () => {
            fileStream.destroy()
          })
          fileStream.on('error', () => {
            if (!res.headersSent) res.writeHead(500).end()
          })
        }
      } catch (err) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 5: TRUYỀN TẢI FILE TĨNH CỤC BỘ (BACKGROUND IMAGE / CUSTOM COVERS) ---
    else if (parsedUrl.pathname === '/local-file') {
      const rawFilePath = parsedUrl.searchParams.get('path')
      if (!rawFilePath) {
        res.writeHead(400).end('Thiếu đường dẫn tệp')
        return
      }

      let targetPath = rawFilePath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!isAllowedLocalPath(targetPath)) {
        res.writeHead(403).end('Truy cập bị từ chối: Đường dẫn không hợp lệ')
        return
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('Tệp không tồn tại')
        return
      }

      try {
        const stat = fs.statSync(targetPath)
        const ext = path.extname(targetPath).toLowerCase()
        const imgMimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml'
        }
        const contentType = imgMimeMap[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Type'
        })
        const fileStream = fs.createReadStream(targetPath)
        fileStream.pipe(res)
        req.on('close', () => {
          fileStream.destroy()
        })
        fileStream.on('error', () => {
          if (!res.headersSent) res.writeHead(500).end()
        })
      } catch (err) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
  })

  const preferredPort = 49876
  await new Promise<void>((resolve) => {
    let hasResolved = false
    const safeResolve = () => {
      if (!hasResolved) {
        hasResolved = true
        resolve()
      }
    }

    const onError = (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(
          `[StreamServer] Cổng ${preferredPort} đã được sử dụng, fallback sang cổng động 0...`
        )
        streamServer.removeListener('error', onError)
        streamServer.listen(0, '127.0.0.1', () => {
          streamPort = (streamServer.address() as any).port
          console.log(`[StreamServer Fallback] Listening on http://127.0.0.1:${streamPort}`)
          safeResolve()
        })
      } else {
        console.error('[StreamServer] Lỗi khởi động:', err)
        safeResolve()
      }
    }

    streamServer.once('error', onError)
    streamServer.listen(preferredPort, '127.0.0.1', () => {
      streamServer.removeListener('error', onError)
      streamPort = (streamServer.address() as any).port
      console.log(`[StreamServer] Listening on http://127.0.0.1:${streamPort}`)
      safeResolve()
    })
  })

  // ==========================================
  // HỆ THỐNG ONLINE STREAMING (CHỈ YOUTUBE / YT MUSIC)
  // ==========================================

  // 1. API: Tìm kiếm siêu tốc trên YouTube & Xử lý Link trực tiếp
  ipcMain.handle('music:searchOnline', async (_, query: string) => {
    try {
      const isUrl = query.startsWith('http://') || query.startsWith('https://')

      // XỬ LÝ DÁN LINK TRỰC TIẾP
      if (isUrl) {
        const info = (await ytdlp(query, {
          dumpSingleJson: true,
          flatPlaylist: true,
          noWarnings: true
        } as any)) as any
        if (info._type === 'playlist' || info.entries) {
          const tracks = (info.entries || []).map((t: any) => ({
            id: `yt-${t.id}`,
            originalId: t.id,
            title: t.title,
            artist: t.channel || t.uploader || 'YouTube',
            album: info.title || 'Playlist',
            duration: t.duration || 0,
            format: 'STREAM',
            isCloud: true,
            isOnline: true,
            platform: 'youtube',
            coverArt: t.thumbnails
              ? t.thumbnails[t.thumbnails.length - 1]?.url
              : t.thumbnail || null,
            coverArtHighRes: null
          }))
          return {
            success: true,
            isUrl: true,
            type: 'playlist',
            title: info.title || 'Playlist',
            tracks
          }
        } else {
          const track = {
            id: `yt-${info.id}`,
            originalId: info.id,
            title: info.title,
            artist: info.channel || info.uploader || 'YouTube',
            album: 'YouTube',
            duration: info.duration || 0,
            format: 'STREAM',
            isCloud: true,
            isOnline: true,
            platform: 'youtube',
            coverArt: info.thumbnails
              ? info.thumbnails[info.thumbnails.length - 1]?.url
              : info.thumbnail || null,
            coverArtHighRes: null
          }
          return { success: true, isUrl: true, type: 'song', track }
        }
      }
      /// XỬ LÝ TÌM KIẾM TRẢ VỀ PHÂN LOẠI (Nghệ sĩ, Bài hát, Playlist)
      else {
        const config = getConfig()

        // 1. CHUẨN BỊ LUỒNG 1: yt-dlp lấy 50 bài hát độ chính xác cao
        const ytdlpPromise = ytdlp(`ytsearch50:${query}`, {
          dumpSingleJson: true,
          noWarnings: true,
          flatPlaylist: true
        } as any)

        // 2. CHUẨN BỊ LUỒNG 2: YouTube Music API lấy Playlist, Album, Nghệ sĩ
        const url = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
        const payload = {
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240108.01.00',
              hl: 'vi',
              gl: 'VN'
            }
          },
          query: query
        }
        const headers: any = {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Origin: 'https://music.youtube.com'
        }

        if (config.ytCookie) {
          headers['Cookie'] = config.ytCookie
          const authHash = generateSapisidHash(config.ytCookie)
          if (authHash) headers['Authorization'] = authHash
        }
        const ytmPromise = axios.post(url, payload, { headers })

        // TỐI ƯU HÓA: Chạy 2 luồng song song cùng lúc, thời gian phản hồi bằng đúng với luồng chậm nhất
        const [ytdlpResponse, ytmResponse] = await Promise.allSettled([ytdlpPromise, ytmPromise])

        const sections: any[] = []
        const seenTitles = new Set() // BỘ LỌC CHỐNG TRÙNG LẶP

        // --- XỬ LÝ KẾT QUẢ LUỒNG 1 (Đưa 20 bài hát lên đỉnh) ---
        if (ytdlpResponse.status === 'fulfilled') {
          const output = ytdlpResponse.value as any
          const results = output.entries ? output.entries : [output]
          const tracks = results.map((track: any) => {
            const covers = extractCovers(
              track.thumbnails || (track.thumbnail ? [{ url: track.thumbnail }] : []),
              track.id
            )
            return {
              title: track.title,
              subtitle: track.channel || track.uploader || 'YouTube',
              videoId: track.id,
              playlistId: null,
              isArtist: false,
              thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
              coverArtHighRes: covers.coverArtHighRes,
              style: 'LIST'
            }
          })

          if (tracks.length > 0) {
            seenTitles.add('bài hát')
            sections.push({ title: 'Bài hát (Mở rộng)', contents: tracks })
          }
        }

        // --- XỬ LÝ KẾT QUẢ LUỒNG 2 (Nạp các Playlist, Nghệ sĩ phía dưới) ---
        if (ytmResponse.status === 'fulfilled') {
          const data = ytmResponse.value.data
          const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || []
          const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

          for (let section of sectionList) {
            if (section.itemSectionRenderer?.contents)
              section = section.itemSectionRenderer.contents[0]

            const shelf =
              section.musicShelfRenderer ||
              section.musicCardShelfRenderer ||
              section.musicCarouselShelfRenderer
            if (!shelf) continue

            const titleRuns =
              shelf.title?.runs ||
              shelf.header?.musicCardShelfHeaderBasicRenderer?.title?.runs ||
              []
            const title =
              titleRuns.map((r: any) => r.text).join('') || `Kết quả ${sections.length + 1}`

            // Bỏ qua mục "Bài hát" gốc của YTM (vì đã có 20 bài của yt-dlp xịn hơn)
            if (title.toLowerCase().includes('bài hát') || title.toLowerCase() === 'songs') continue
            if (seenTitles.has(title)) continue

            const items: any[] = []
            for (const item of shelf.contents || []) {
              const parsed = parseYtmItem(item)
              if (parsed) items.push(parsed)
            }

            if (items.length === 0 && section.musicCardShelfRenderer) {
              const parsedCard = parseYtmItem({
                musicResponsiveListItemRenderer: section.musicCardShelfRenderer
              })
              if (parsedCard) items.push(parsedCard)
            }

            if (items.length > 0) {
              seenTitles.add(title)
              sections.push({ title, contents: items })
            }
          }
        }

        return { success: true, isUrl: false, data: sections }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. API: Lấy Stream URL (Kết nối với Buffer Server)
  ipcMain.handle('music:getStreamUrl', (_, track: any) => {
    try {
      if (track.platform === 'soundcloud' || track.id?.startsWith('sc-')) {
        const rawId = track.originalId || track.id.replace(/^sc-/, '')
        return {
          success: true,
          url: `http://127.0.0.1:${streamPort}/play?id=sc-${rawId}&platform=soundcloud&url=${encodeURIComponent(track.permalinkUrl || '')}`
        }
      }
      if (track.platform === 'youtube' || !track.platform) {
        return {
          success: true,
          url: `http://127.0.0.1:${streamPort}/play?id=${track.originalId}`
        }
      }
      return { success: false, error: 'Chưa hỗ trợ nền tảng này' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 3. API: Tải nhạc bằng yt-dlp (Có phân loại Album và Check trùng lặp)
  ipcMain.handle('music:downloadOnline', async (_, track: any) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath) return { success: false, error: 'Chưa cấu hình Thư mục thư viện' }

    // Tạo thư mục Album (Nếu không có tên Album thì lưu vào thư mục Singles)
    const safeAlbum = sanitizeDirectoryName(track.album || 'Singles') || 'Singles'
    const albumPath = join(rootPath, safeAlbum)
    if (!fs.existsSync(albumPath)) {
      fs.mkdirSync(albumPath, { recursive: true })
    }

    const safeTitle = sanitizeFileName(track.title || 'Unknown') || 'Unknown'
    let destPath = join(albumPath, `${safeTitle}.mp3`)

    // Kiểm tra trùng lặp và hiện Hộp thoại (Dialog)
    if (fs.existsSync(destPath)) {
      const isEn = getConfig().language === 'en'
      const response = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: isEn
          ? ['Replace', 'Save as New File', 'Cancel']
          : ['Thay thế', 'Lưu thành tệp mới', 'Hủy'],
        defaultId: 0,
        cancelId: 2,
        title: isEn ? 'File Already Exists' : 'Tệp đã tồn tại',
        message: isEn
          ? `Track "${safeTitle}" already exists in folder "${safeAlbum}". What would you like to do?`
          : `Bài hát "${safeTitle}" đã có sẵn trong thư mục "${safeAlbum}". Bạn muốn làm gì?`
      })

      if (response === 2) return { success: false, canceled: true } // Cancel / Hủy
      if (response === 1) {
        // Lưu thành tệp mới (Thêm ID thời gian)
        destPath = join(albumPath, `${safeTitle}_${Date.now()}.mp3`)
      } else {
        // Thay thế (Xóa file cũ trước khi ghi file mới)
        fs.unlinkSync(destPath)
      }
    }

    try {
      const downloadTarget =
        track.platform === 'soundcloud'
          ? track.permalinkUrl || `https://api.soundcloud.com/tracks/${track.originalId}`
          : track.originalId

      const config = getConfig()
      const downloadOptions: any = {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        output: destPath,
        embedMetadata: true,
        embedThumbnail: true,
        ffmpegLocation: getBinaryDir()
      }

      if (track.platform !== 'soundcloud') {
        downloadOptions.extractorArgs = 'youtube:player-client=android,web,ios'
        if (config.ytCookie) {
          downloadOptions.addHeader = [`Cookie: ${config.ytCookie}`]
        }
      }

      await ytdlp(downloadTarget, downloadOptions as any)
      return { success: true, localPath: pathToFileURL(destPath).href }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG YOUTUBE MUSIC DASHBOARD & BẢO MẬT
  // ==========================================

  // Hàm phụ trợ: Tạo chữ ký xác thực (SAPISIDHASH) để Google nhận diện đúng tài khoản
  function generateSapisidHash(cookieStr: string) {
    const match = cookieStr.match(/SAPISID=([^;]+)/)
    if (!match) return null
    const sapisid = match[1]
    const time = Math.floor(Date.now() / 1000)
    const origin = 'https://music.youtube.com'
    const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex')
    return `SAPISIDHASH ${time}_${hash}`
  }

  // 1. API: Mở cửa sổ đăng nhập bảo mật và trích xuất Cookie
  ipcMain.handle('music:ytmLogin', async () => {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 700,
        title: 'Đăng nhập YouTube Music',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      // MỚI: Can thiệp sâu vào Network Session để xóa dấu vết Chromium
      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.google.com/*', '*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
          // 1. Ép User-Agent thành Firefox
          details.requestHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'

          // 2. Tẩy xóa các Header tố cáo lõi Chromium
          delete details.requestHeaders['sec-ch-ua']
          delete details.requestHeaders['sec-ch-ua-mobile']
          delete details.requestHeaders['sec-ch-ua-platform']

          callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
      )

      // Điều hướng thẳng đến trang Đăng nhập Google, kèm theo lệnh tự động quay về YT Music
      authWindow.loadURL(
        'https://accounts.google.com/ServiceLogin?continue=https://music.youtube.com/'
      )

      // Tự động đóng cửa sổ popup khi Google chuyển hướng về lại trang chủ
      authWindow.webContents.on('did-navigate', (_event, url) => {
        if (url === 'https://music.youtube.com/' || url.startsWith('https://music.youtube.com/?')) {
          setTimeout(() => {
            if (!authWindow.isDestroyed()) {
              authWindow.close()
            }
          }, 1500)
        }
      })

      // Lắng nghe khi người dùng đóng cửa sổ để quét Cookie
      authWindow.on('close', async () => {
        try {
          const cookies = await authWindow.webContents.session.cookies.get({
            domain: '.youtube.com'
          })
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

          if (cookieStr.includes('SAPISID')) {
            saveConfig({ ytCookie: cookieStr })
            resolve({ success: true })
          } else {
            resolve({
              success: false,
              error: 'Chưa đăng nhập thành công hoặc thiếu Cookie định danh.'
            })
          }
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
  })

  // API Đăng xuất YouTube Music
  ipcMain.handle('music:ytmLogout', async () => {
    try {
      saveConfig({ ytCookie: null })
      const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
      for (const c of cookies) {
        await session.defaultSession.cookies
          .remove('https://music.youtube.com', c.name)
          .catch(() => {})
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG SOUNDCLOUD DASHBOARD & BẢO MẬT
  // ==========================================

  // 1. API: Mở cửa sổ đăng nhập SoundCloud và trích xuất OAuth Token
  ipcMain.handle('music:scLogin', async () => {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 700,
        title: 'Đăng nhập SoundCloud',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      authWindow.loadURL('https://soundcloud.com/signin')

      let capturedToken: string | null = null

      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.soundcloud.com/*'] },
        (details, callback) => {
          const auth =
            details.requestHeaders['Authorization'] || details.requestHeaders['authorization']
          if (auth && auth.startsWith('OAuth ')) {
            capturedToken = auth.replace('OAuth ', '').trim()
          }
          callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
      )

      authWindow.on('close', async () => {
        try {
          if (!capturedToken) {
            const cookies = await authWindow.webContents.session.cookies.get({
              domain: '.soundcloud.com'
            })
            const oauthCookie = cookies.find((c) => c.name === 'oauth_token')
            if (oauthCookie) capturedToken = oauthCookie.value
          }

          if (capturedToken) {
            saveConfig({ scOAuthToken: capturedToken })
            try {
              const userProfile = await getScUserProfile(capturedToken)
              saveConfig({ scUserInfo: userProfile })
              resolve({ success: true, user: userProfile })
              return
            } catch (err) {
              resolve({ success: true })
              return
            }
          }
          resolve({
            success: false,
            error: 'Chưa đăng nhập hoặc không tìm thấy mã xác thực SoundCloud'
          })
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
  })

  // 2. API: Đăng xuất SoundCloud
  ipcMain.handle('music:scLogout', async () => {
    try {
      saveConfig({ scOAuthToken: null, scUserInfo: null })
      const cookies = await session.defaultSession.cookies.get({ domain: '.soundcloud.com' })
      for (const c of cookies) {
        await session.defaultSession.cookies
          .remove('https://soundcloud.com', c.name)
          .catch(() => {})
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 3. API: Lấy thông tin tài khoản SoundCloud
  ipcMain.handle('music:getScUser', async () => {
    const config = getConfig()
    if (!config.scOAuthToken) return { success: false, error: 'Chưa đăng nhập SoundCloud' }
    if (config.scUserInfo) return { success: true, user: config.scUserInfo }
    try {
      const user = await getScUserProfile(config.scOAuthToken)
      saveConfig({ scUserInfo: user })
      return { success: true, user }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 4. API: Lấy Dashboard SoundCloud (Trending, Liked Tracks, Stream, Curated Playlists)
  ipcMain.handle('music:getScDashboard', async (_, genre: string = 'all-music') => {
    const config = getConfig()
    const oauthToken = config.scOAuthToken
    const userInfo = config.scUserInfo

    try {
      const sections: any[] = []

      // 1. Nếu đã đăng nhập: Lấy Likes & Stream cá nhân
      if (oauthToken && userInfo?.id) {
        try {
          const likedTracks = await getScUserLikes(userInfo.id, oauthToken, 30)
          if (likedTracks.length > 0) {
            sections.push({
              title: 'Bài hát bạn đã thích (Liked Tracks)',
              contents: likedTracks
            })
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy Liked Tracks:', e.message)
        }

        try {
          const streamTracks = await getScUserStream(oauthToken, 30)
          if (streamTracks.length > 0) {
            sections.push({
              title: 'Bản tin theo dõi (Your Stream)',
              contents: streamTracks
            })
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy User Stream:', e.message)
        }
      }

      // 2. Lấy Bảng xếp hạng / Đề xuất theo thể loại đang chọn
      try {
        const trendingTracks = await getScTrendingCharts(genre, 30)
        if (trendingTracks.length > 0) {
          const GENRE_LABELS: Record<string, string> = {
            'all-music': 'Tất cả thịnh hành',
            electronic: 'Electronic & EDM',
            hiphoprap: 'Hip-hop & Rap',
            pop: 'Pop Hits',
            chill: 'Lo-fi & Chill',
            rock: 'Rock Classics & Hits',
            ambient: 'Ambient Relax',
            danceedm: 'Dance & EDM'
          }
          const genreLabel =
            GENRE_LABELS[genre] || (genre === 'all-music' ? 'Tất cả' : genre.toUpperCase())
          sections.push({
            title: `Bảng xếp hạng SoundCloud (${genreLabel})`,
            contents: trendingTracks
          })
        }
      } catch (e: any) {
        console.warn('[SoundCloud] Lỗi lấy Trending Tracks:', e.message)
      }

      // 3. Nếu đang ở 'all-music', bổ sung Playlist tuyển chọn từ SoundCloud (Mixed Selections)
      if (genre === 'all-music') {
        try {
          const mixedSections = await getScMixedSelections()
          for (const s of mixedSections) {
            sections.push(s)
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy Mixed Selections:', e.message)
        }
      }

      // 4. Lấy thêm các thể loại phổ biến nếu danh sách còn ít
      if (sections.length < 3) {
        const extraGenres = ['chill', 'electronic', 'pop', 'hiphoprap']
        for (const g of extraGenres) {
          if (g === genre) continue
          try {
            const extra = await getScTrendingCharts(g, 15)
            if (extra.length > 0) {
              const GENRE_LABELS: Record<string, string> = {
                electronic: 'Electronic & EDM',
                hiphoprap: 'Hip-Hop & Rap',
                pop: 'Pop Hits',
                chill: 'Lo-Fi Chill Beats'
              }
              sections.push({
                title: `SoundCloud ${GENRE_LABELS[g] || g}`,
                contents: extra
              })
            }
          } catch (e) {}
        }
      }

      return { success: true, data: sections }
    } catch (e: any) {
      console.error('[SoundCloud] Lỗi getScDashboard:', e.message)
      return { success: false, error: 'Lỗi tải SoundCloud: ' + e.message }
    }
  })

  // 5. API: Tìm kiếm SoundCloud
  ipcMain.handle('music:searchScOnline', async (_, query: string) => {
    const config = getConfig()
    try {
      const results = await searchSoundCloud(query, 30, config.scOAuthToken)
      return { success: true, ...results }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 6. API: Lấy chi tiết Playlist SoundCloud
  ipcMain.handle('music:getScPlaylist', async (_, playlistId: string) => {
    const config = getConfig()
    try {
      const playlist = await getScPlaylistTracks(playlistId, config.scOAuthToken)
      return { success: true, ...playlist }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. API: Lấy dữ liệu Dashboard (Home Sections) trực tiếp từ Google InnerTube API
  ipcMain.handle('music:getHomeDashboard', async () => {
    const config = getConfig()
    if (!config.ytCookie) return { success: false, error: 'Chưa đăng nhập' }

    try {
      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        browseId: 'FEmusic_home'
      }

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com'
      }

      // MỚI: Bơm chữ ký điện tử để "Mở khóa" các danh mục cá nhân hóa
      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }

      const response = await axios.post(url, payload, { headers })
      const data = response.data

      const sections: any[] = []
      const seenTitles = new Set() // BỘ LỌC CHỐNG TRÙNG LẶP
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs

      if (!tabs || tabs.length === 0) throw new Error('Cookie hết hạn hoặc bị Google từ chối')

      const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

      for (let section of sectionList) {
        if (section.itemSectionRenderer?.contents) {
          section = section.itemSectionRenderer.contents[0]
        }

        const carousel =
          section.musicCarouselShelfRenderer ||
          section.musicImmersiveCarouselShelfRenderer ||
          section.musicShelfRenderer
        if (!carousel) continue

        const header =
          carousel.header?.musicCarouselShelfBasicHeaderRenderer ||
          carousel.header?.musicImmersiveCarouselShelfBasicHeaderRenderer
        const titleRuns = header?.title?.runs
        const title = titleRuns ? titleRuns.map((r: any) => r.text).join('') : 'Gợi ý cho bạn'

        // KIỂM TRA TRÙNG LẶP: Nếu tiêu đề này đã được thêm vào trước đó, bỏ qua luôn!
        if (seenTitles.has(title)) continue

        const items: any[] = []
        for (const item of carousel.contents || []) {
          const parsed = parseYtmItem(item)
          if (parsed) items.push(parsed)
        }

        if (items.length > 0) {
          seenTitles.add(title) // Đánh dấu tiêu đề này đã tồn tại
          sections.push({ title, contents: items })
        }
      }

      return { success: true, data: sections }
    } catch (e: any) {
      return { success: false, error: 'Lỗi kết nối: ' + e.message }
    }
  })

  // 3. API: Lấy chi tiết danh sách bài hát của một Playlist/Album
  ipcMain.handle('music:getYtmPlaylist', async (_, playlistId: string) => {
    const config = getConfig()
    try {
      let targetId = playlistId
      if (targetId.startsWith('PL') || targetId.startsWith('RD') || targetId.startsWith('OL')) {
        targetId = 'VL' + targetId
      }

      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        browseId: targetId
      }

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com'
      }

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }

      const response = await axios.post(url, payload, { headers })
      const data = response.data

      const tracks: any[] = []
      let contents: any[] = []

      const twoColumn =
        data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer
          ?.contents || []
      const singleColumn =
        data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
          ?.sectionListRenderer?.contents || []
      const sections = [...twoColumn, ...singleColumn]

      for (const section of sections) {
        if (section.musicPlaylistShelfRenderer) {
          contents = section.musicPlaylistShelfRenderer.contents
          break
        }
        if (section.musicShelfRenderer) {
          contents = section.musicShelfRenderer.contents
          break
        }
      }

      for (const item of contents) {
        const renderer = item.musicResponsiveListItemRenderer
        if (!renderer) continue

        const videoId =
          renderer.playlistItemData?.videoId ||
          renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
            ?.playNavigationEndpoint?.watchEndpoint?.videoId ||
          renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
            ?.navigationEndpoint?.watchEndpoint?.videoId

        if (!videoId) continue

        const titleRuns =
          renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
        const title = titleRuns ? titleRuns.map((r: any) => r.text).join('') : 'Unknown'

        const artistRuns =
          renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
        const artist = artistRuns ? artistRuns.map((r: any) => r.text).join('') : 'YouTube'

        const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []

        const covers = extractCovers(thumbnails, videoId) // Dùng renderer.videoId cho getUpNext
        tracks.push({
          id: `yt-${videoId}`,
          originalId: videoId,
          title: title,
          artist: artist,
          album: 'YouTube Music',
          duration: 0,
          format: 'STREAM',
          isCloud: true,
          isOnline: true,
          platform: 'youtube',
          coverArt: covers.coverArt,
          coverArtHighRes: covers.coverArtHighRes
        })
      }

      return { success: true, tracks }
    } catch (e: any) {
      return { success: false, error: 'Lỗi tải danh sách: ' + e.message }
    }
  })

  // 4. API: Preload Buffer - Giải mã URL trước khi phát để triệt tiêu độ trễ
  ipcMain.handle('music:preloadStream', async (_, targetId: string) => {
    if (streamUrlCache.has(targetId) && streamUrlCache.get(targetId)!.expires > Date.now()) {
      return { success: true }
    }
    try {
      const config = getConfig()
      const ytOptions: any = {
        dumpSingleJson: true,
        format: 'bestaudio/best',
        noWarnings: true,
        extractorArgs: 'youtube:player-client=android'
      }
      if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

      const info = (await ytdlp(targetId, ytOptions as any)) as any
      streamUrlCache.set(targetId, { url: info.url, expires: Date.now() + 3600000 })
      return { success: true }
    } catch (e) {
      return { success: false }
    }
  })

  // 5. API: Ghi nhận lịch sử nghe nhạc để YouTube học Recommendations
  ipcMain.handle('music:logWatchHistory', async (_, videoId: string) => {
    const config = getConfig()
    if (!config.ytCookie) return { success: false }

    try {
      const url = 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false'
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        videoId: videoId
      }
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com'
      }

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }

      await axios.post(url, payload, { headers })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 6. API: Lấy danh sách phát tiếp theo (Up Next / Radio Gợi ý)
  ipcMain.handle('music:getUpNext', async (_, videoId: string) => {
    const config = getConfig()
    try {
      const url = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false'
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        videoId: videoId,
        // QUAN TRỌNG: Gắn tiền tố RDAMVM để yêu cầu Google tự tạo một Radio Mix vô tận
        playlistId: `RDAMVM${videoId}`
      }

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com'
      }

      // Đính kèm chữ ký bảo mật để lấy đúng gu âm nhạc của bạn
      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }

      const response = await axios.post(url, payload, { headers })
      const data = response.data

      const tracks: any[] = []
      const tabs =
        data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
          ?.watchNextTabbedResultsRenderer?.tabs

      // Bóc tách Tab đầu tiên (Tab "Tiếp theo")
      const tabContent = tabs?.[0]?.tabRenderer?.content

      // Quét thông minh: Cấu trúc có thể bọc trong musicQueueRenderer hoặc playlistPanelRenderer tùy tài khoản
      const contents =
        tabContent?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ||
        tabContent?.playlistPanelRenderer?.contents ||
        []

      for (const item of contents) {
        const renderer = item.playlistPanelVideoRenderer
        if (!renderer || !renderer.videoId) continue

        // SỬA LỖI TẠI ĐÂY: Khởi tạo một biến mới để lấy chính xác ID của TỪNG bài hát
        const trackVideoId = renderer.videoId

        const title = renderer.title?.runs?.[0]?.text || 'Unknown'
        const artist = renderer.longBylineText?.runs?.map((r: any) => r.text).join('') || 'YouTube'
        const thumbnails = renderer.thumbnail?.thumbnails || []

        // Đổi videoId thành trackVideoId
        const covers = extractCovers(thumbnails, trackVideoId)

        tracks.push({
          id: `yt-${trackVideoId}`,
          originalId: trackVideoId,
          title: title,
          artist: artist,
          album: 'YouTube Music',
          duration: 0,
          format: 'STREAM',
          isCloud: true,
          isOnline: true,
          platform: 'youtube',
          coverArt: covers.coverArt,
          coverArtHighRes: covers.coverArtHighRes
        })
      }
      return { success: true, tracks }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 7. API: Mở trang Nghệ Sĩ
  ipcMain.handle('music:getYtmArtist', async (_, artistId: string) => {
    const config = getConfig()
    try {
      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        browseId: artistId
      }

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Origin: 'https://music.youtube.com'
      }

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }

      const response = await axios.post(url, payload, { headers })
      const data = response.data

      const tracks: any[] = []
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
      const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

      for (const section of sections) {
        const shelf = section.musicShelfRenderer || section.musicCarouselShelfRenderer
        if (!shelf) continue

        for (const item of shelf.contents || []) {
          const parsed = parseYtmItem(item)
          // Chỉ lấy các bài hát (có videoId) và bỏ qua các nghệ sĩ liên quan để tạo danh sách phát
          if (parsed && parsed.videoId && !parsed.isArtist) {
            tracks.push({
              id: `yt-${parsed.videoId}`,
              originalId: parsed.videoId,
              title: parsed.title,
              artist: parsed.subtitle || 'Unknown',
              album: 'YouTube Music',
              duration: 0,
              format: 'STREAM',
              isCloud: true,
              isOnline: true,
              platform: 'youtube',
              coverArt: parsed.thumbnails?.[0]?.url || null,
              coverArtHighRes: parsed.coverArtHighRes
            })
          }
        }
      }
      return { success: true, tracks }
    } catch (e: any) {
      return { success: false, error: 'Lỗi tải nghệ sĩ: ' + e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG TẢI NHẠC SOULSEEK LOSSLESS ENGINE
  // ==========================================
  ipcMain.handle(
    'soulseek:login',
    async (_, { user, pass, remember }: { user: string; pass: string; remember?: boolean }) => {
      const res = await soulseekManager.login(user, pass)
      if (res.success && remember) {
        saveConfig({ soulseekUsername: user, soulseekPassword: pass, soulseekAutoLogin: true })
      }
      return res
    }
  )

  ipcMain.handle('soulseek:logout', async () => {
    await soulseekManager.logout()
    saveConfig({ soulseekUsername: null, soulseekPassword: null, soulseekAutoLogin: false })
    return { success: true }
  })

  ipcMain.handle('soulseek:getStatus', () => soulseekManager.getStatus())

  ipcMain.handle('soulseek:search', async (_, query: string, timeout?: number) => {
    return await soulseekManager.search(query, timeout)
  })

  ipcMain.handle('soulseek:download', async (_, item: any) => {
    return await soulseekManager.download(item)
  })

  ipcMain.handle('soulseek:cancelDownload', (_, id: string) => {
    return soulseekManager.cancelDownload(id)
  })

  ipcMain.handle('soulseek:selectDownloadFolder', async () => {
    const selected = await soulseekManager.selectDownloadFolder()
    if (selected) {
      saveConfig({ soulseekDownloadFolder: selected })
    }
    return selected
  })

  ipcMain.handle('soulseek:setDownloadFolder', (_, folder: string) => {
    soulseekManager.setDownloadFolder(folder)
    saveConfig({ soulseekDownloadFolder: folder })
    return { success: true }
  })

  ipcMain.handle('soulseek:openDownloadFolder', () => {
    soulseekManager.openDownloadFolder()
    return { success: true }
  })

  // Khởi tạo cửa sổ
  createWindow()

  // ==========================================
  // ĐĂNG KÝ PHÍM TẮT TOÀN CỤC (GLOBAL SHORTCUTS)
  // ==========================================
  const sendShortcut = (action: string) => {
    if (mainWindow) mainWindow.webContents.send('global-shortcut', action)
  }

  // 1. Phím tắt tổ hợp Ctrl
  globalShortcut.register('CommandOrControl+Right', () => sendShortcut('next'))
  globalShortcut.register('CommandOrControl+Left', () => sendShortcut('prev'))
  globalShortcut.register('CommandOrControl+Up', () => sendShortcut('vol-up'))
  globalShortcut.register('CommandOrControl+Down', () => sendShortcut('vol-down'))

  // Ctrl + Space để Play/Pause (Thay vì Next như cũ)
  globalShortcut.register('CommandOrControl+Space', () => sendShortcut('play-pause'))

  // 2. Nhận diện các phím Media chuyên dụng trên bàn phím
  globalShortcut.register('MediaPlayPause', () => sendShortcut('play-pause'))
  globalShortcut.register('MediaNextTrack', () => sendShortcut('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendShortcut('prev'))

  // Lưu ý: Đăng ký 2 phím Volume dưới đây sẽ chặn tính năng tăng/giảm âm lượng tổng của Windows/macOS,
  // và chỉ tăng/giảm âm lượng bên trong thanh trượt của ứng dụng.
  globalShortcut.register('VolumeUp', () => sendShortcut('vol-up'))
  globalShortcut.register('VolumeDown', () => sendShortcut('vol-down'))

  // ==========================================
  // KHỞI TẠO SYSTEM TRAY (KHAY HỆ THỐNG)
  // ==========================================
  tray = new Tray(icon)
  tray.setToolTip('Meis Radio')

  updateTrayMenu = () => {
    if (!tray) return
    const isEn = getConfig().language === 'en'
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isEn ? 'Show Meis Radio' : 'Hiển thị Meis Radio',
        click: () => {
          mainWindow?.show()
          mainWindow?.restore()
        }
      },
      { type: 'separator' },
      { label: isEn ? 'Play / Pause' : 'Phát / Tạm dừng', click: () => sendShortcut('play-pause') },
      { label: isEn ? 'Next Track' : 'Bài tiếp theo', click: () => sendShortcut('next') },
      { label: isEn ? 'Previous Track' : 'Bài trước đó', click: () => sendShortcut('prev') },
      { type: 'separator' },
      {
        label: isEn ? 'Quit' : 'Thoát hoàn toàn',
        click: () => {
          isQuitting = true
          if (bassManager) bassManager.killSync()
          if (tray) {
            try {
              tray.destroy()
            } catch (e) {}
            tray = null
          }
          app.quit()
        }
      }
    ])
    tray.setContextMenu(contextMenu)
  }

  updateTrayMenu()

  // Click đúp vào icon ở Tray để mở nhanh app
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.restore()
  })

  // ==========================================
  // API CẬP NHẬT TRAY & MINI PLAYER
  // ==========================================
  ipcMain.handle('music:updateTrayConfig', (_, c) => {
    closeToTray = c.closeToTray
    minimizeToTray = c.minimizeToTray
  })

  ipcMain.handle('music:toggleMiniPlayer', (_, isMini: boolean) => {
    if (!mainWindow) return
    if (isMini) {
      isInMiniPlayer = true
      preMiniPlayerState = {
        bounds: mainWindow.getBounds(),
        isMaximized: mainWindow.isMaximized(),
        isFullScreen: mainWindow.isFullScreen()
      }

      // Thoát chế độ Toàn màn hình / Phóng to trước khi resize
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
      if (mainWindow.isMaximized()) mainWindow.unmaximize()

      mainWindow.setContentSize(400, 120, true) // Đổi kích thước thành khung chữ nhật nhỏ
      mainWindow.setAlwaysOnTop(true, 'floating') // Luôn nổi trên các cửa sổ khác
      mainWindow.setResizable(false) // Khóa kích thước
    } else {
      isInMiniPlayer = false
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)

      if (preMiniPlayerState) {
        mainWindow.setBounds(preMiniPlayerState.bounds)
        if (preMiniPlayerState.isMaximized) {
          mainWindow.maximize()
        } else if (preMiniPlayerState.isFullScreen) {
          mainWindow.setFullScreen(true)
        }
        preMiniPlayerState = null
      } else {
        const config = getConfig()
        const ws = config.windowState || { width: 1200, height: 800 }
        mainWindow.setBounds({
          x: ws.x,
          y: ws.y,
          width: ws.width || 1200,
          height: ws.height || 800
        })
        if (ws.isMaximized) {
          mainWindow.maximize()
        }
      }
      saveWindowState()
    }
  })
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  saveMetadataCache(true)
  saveThemeColorsCache(true)
  if (sqliteStorage) {
    try {
      sqliteStorage.checkpoint('TRUNCATE')
      sqliteStorage.close()
    } catch (e) {}
  }
  if (bassManager) bassManager.killSync()
  if (discordRpcManager) discordRpcManager.destroy()
  if (soulseekManager) soulseekManager.destroy()
  if (tray) {
    try {
      tray.destroy()
    } catch (e) {}
    tray = null
  }
})

app.on('window-all-closed', () => {
  if (bassManager) bassManager.killSync()
  if (soulseekManager) soulseekManager.destroy()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (bassManager) bassManager.killSync()
  if (soulseekManager) soulseekManager.destroy()
  if (tray) {
    try {
      tray.destroy()
    } catch (e) {}
    tray = null
  }
  // Đảm bảo toàn bộ tiến trình ứng dụng thoát hoàn toàn trong vòng 1s, tránh treo ngầm
  setTimeout(() => {
    app.exit(0)
  }, 1000).unref()
})

process.on('SIGINT', () => {
  if (bassManager) bassManager.killSync()
  app.exit(0)
})

process.on('SIGTERM', () => {
  if (bassManager) bassManager.killSync()
  app.exit(0)
})
