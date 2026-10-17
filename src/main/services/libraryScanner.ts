import fs from 'fs'
import path, { join } from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { pathToFileURL } from 'url'
import { dialog, nativeImage, ipcMain, shell, BrowserWindow } from 'electron'
import * as mm from 'music-metadata'
import {
  getConfig,
  saveConfig,
  sqliteStorage,
  IMAGE_CACHE_DIR,
  SUPPORTED_AUDIO_EXTS,
  sanitizeDirectoryName,
  sanitizeFileName,
  metadataCache,
  themeColorsCache,
  markMetadataDirty,
  markThemeColorDirty,
  saveMetadataCache,
  saveThemeColorsCache,
  dirtyMetadataKeys,
  dirtyThemeColorKeys,
  getMainWindow,
  getFfmpegPath,
  trimNativeMemory,
  registerAllowedDroppedFile
} from './sharedContext'
import { parseCueFile, resolveCueSheetDurations } from '../cueParser'
import { fastReadMetadata, findFolderCoverImage, ID3V1_GENRES } from '../fastAudioParser'
import { normalizePathKey } from '../sqliteStorage'
import { clearStreamCoverCache } from './streamServer'
import { getUserPlaylists } from './playlistManager'

// ==========================================
// HẰNG SỐ & TIỆN ÍCH CHUẨN HÓA
// ==========================================
export { SUPPORTED_AUDIO_EXTS, sanitizeDirectoryName, sanitizeFileName }

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

  working = working.replace(
    /,\s*(Jr\.?|Sr\.?|III|II|IV)(?=$|[\s,;/|)\]])/gi,
    (_, g1) => `___JRSR___${g1}`
  )

  working = working.replace(
    /[([{]\s*(?:feat\.?|ft\.?|featuring)\s+([^()\]}]+)[)\]}]/gi,
    ' feat. $1'
  )

  const splitRegex =
    /(?:\s*;\s*|\0+|\s*[/\\/]+\s*|\s*\|\s*|\s+(?:feat\.?|ft\.?|featuring|with|vs\.?)\s+|\s+[&xX+]\s+|[，、；]|\s*,\s*)/i

  const parts = working.split(splitRegex)
  const result: string[] = []

  for (let part of parts) {
    for (const p of placeholders) {
      part = part.replace(new RegExp(p.token, 'g'), p.original)
    }
    part = part.replace(/___JRSR___/g, ', ')

    const clean = part
      .trim()
      .replace(/^[([{]/, '')
      .replace(/[)\]}]$/, '')
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

export function extractArtists(
  metadata: any,
  fallbackTitle: string = ''
): { artist: string; artists: string[] } {
  const rawArtistsList: string[] = []

  if (Array.isArray(metadata?.common?.artists) && metadata.common.artists.length > 0) {
    for (const a of metadata.common.artists) {
      if (typeof a === 'string' && a.trim()) rawArtistsList.push(a.trim())
    }
  }

  if (typeof metadata?.common?.artist === 'string' && metadata.common.artist.trim()) {
    const artStr = metadata.common.artist.trim()
    if (!rawArtistsList.includes(artStr)) {
      rawArtistsList.push(artStr)
    }
  }

  if (metadata?.native) {
    for (const tagFormat of Object.keys(metadata.native)) {
      const tagList = metadata.native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id || '').toUpperCase()
          if (tid === 'ARTIST' || tid === 'ARTISTS') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            }
          } else if (tid === 'TPE1' || tid === 'TXXX:ARTISTS' || tid === 'TXXX:ARTIST') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            } else if (Array.isArray(t.value)) {
              for (const v of t.value) {
                if (typeof v === 'string' && v.trim()) rawArtistsList.push(v.trim())
              }
            }
          } else if (tid === '©ART' || tid === '----:COM.APPLE.ITUNES:ARTISTS') {
            if (typeof t.value === 'string' && t.value.trim()) {
              rawArtistsList.push(t.value.trim())
            }
          }
        }
      }
    }
  }

  const titleToCheck = metadata?.common?.title || fallbackTitle || ''
  if (titleToCheck) {
    const featMatch = titleToCheck.match(/[([]\s*(?:feat\.?|ft\.?|featuring)\s+([^()[\]]+)[)\]]/i)
    if (featMatch && featMatch[1]) {
      rawArtistsList.push(featMatch[1].trim())
    }
  }

  const parsedArtists: string[] = []
  for (const rawItem of rawArtistsList) {
    const split = splitArtistString(rawItem)
    for (const s of split) {
      if (!s) continue
      if (/^(jr\.?|sr\.?|iii|ii|iv)$/i.test(s.trim())) continue

      const existingIdx = parsedArtists.findIndex((ex) => ex.toLowerCase() === s.toLowerCase())
      if (existingIdx !== -1) continue

      const normS = normalizeForComparison(s)
      const nearIdx = parsedArtists.findIndex((ex) => normalizeForComparison(ex) === normS)
      if (nearIdx !== -1) {
        if (s.length > parsedArtists[nearIdx].length) {
          parsedArtists[nearIdx] = s
        }
        continue
      }

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

export function extractThemeColorsFromImage(img: Electron.NativeImage): {
  primary60: string
  secondary30: string
  accent10: string
} {
  try {
    const small = img.resize({ width: 32, height: 32, quality: 'good' })
    const bitmap = small.toBitmap()
    const pixels: { r: number; g: number; b: number }[] = []

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
      for (const rawArtist of effectiveArtists) {
        if (rawArtist && rawArtist.toLowerCase() !== 'unknown') {
          gm.artists.add(rawArtist.trim())
        }
      }
      if (track.album && track.album.trim() && track.album.toLowerCase() !== 'unknown') {
        gm.albumSet.add(track.album.trim())
      }
      if (track.coverArt && !gm.coverArts.includes(track.coverArt) && gm.coverArts.length < 4) {
        gm.coverArts.push(track.coverArt)
      }
    }
  }

  const artistsList = Array.from(artistMap.values()).map((a) => {
    const albums = Array.from(a.albumMap.values()).map((alb) => ({
      title: alb.title,
      trackIds: alb.trackIds,
      trackCount: alb.trackIds.length,
      coverArt: alb.coverArt,
      year: alb.year
    }))
    albums.sort((x, y) => (y.year || 0) - (x.year || 0) || x.title.localeCompare(y.title))

    return {
      name: a.name,
      trackIds: a.trackIds,
      trackCount: a.trackIds.length,
      coverArt: a.coverArt,
      albumCount: albums.length,
      albums
    }
  })

  artistsList.sort((a, b) => {
    if (a.name === 'Unknown Artist') return 1
    if (b.name === 'Unknown Artist') return -1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  const groupsMap = new Map<string, typeof artistsList>()
  for (const art of artistsList) {
    if (art.name === 'Unknown Artist') continue
    const trimmed = art.name.trim()
    const firstChar = trimmed[0] || '#'
    let letter = firstChar.toUpperCase()

    if (letter === 'Đ') {
      letter = 'D'
    } else {
      letter = letter.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    }

    if (!/[A-Z]/.test(letter)) {
      letter = '#'
    }
    let grp = groupsMap.get(letter)
    if (!grp) {
      grp = []
      groupsMap.set(letter, grp)
    }
    grp.push(art)
  }

  const alphabetGroups: { letter: string; artists: typeof artistsList }[] = []
  const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
    if (a === '#') return 1
    if (b === '#') return -1
    return a.localeCompare(b)
  })

  for (const k of sortedKeys) {
    alphabetGroups.push({ letter: k, artists: groupsMap.get(k)! })
  }

  const genresList = Array.from(genreMap.values()).map((gm) => ({
    name: gm.name,
    trackIds: gm.trackIds,
    trackCount: gm.trackIds.length,
    artistCount: gm.artists.size,
    albumCount: gm.albumSet.size,
    coverArts: gm.coverArts,
    artists: Array.from(gm.artists)
  }))

  genresList.sort((a, b) => {
    if (a.name === 'Unknown') return 1
    if (b.name === 'Unknown') return -1
    return b.trackCount - a.trackCount || a.name.localeCompare(b.name)
  })

  return { artistsList, alphabetGroups, genresList }
}

// ==========================================
// WATCHERS THƯ VIỆN NHẠC
// ==========================================
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
          const mainWindow = getMainWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('library:fs-changed', { eventType, filename })
          }
        }, 2500)
      })

      watcher.on('error', (_err) => {})
      activeWatchers.push(watcher)
    } catch (watchErr) {
      console.warn(`[LibraryWatcher] Could not watch directory ${dir}:`, watchErr)
    }
  }
}

export function stopLibraryWatchers(): void {
  for (const w of activeWatchers) {
    try {
      w.close()
    } catch {}
  }
  activeWatchers = []
  if (libraryWatchDebounceTimer) {
    clearTimeout(libraryWatchDebounceTimer)
    libraryWatchDebounceTimer = null
  }
}

// ==========================================
// ĐỘNG CƠ QUÉT THƯ VIỆN CHÍNH
// ==========================================
export async function scanLibrary(forceRefresh: boolean = false, hardRescan: boolean = false) {
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

  // 1. NẾU MỞ APP BÌNH THƯỜNG: ĐỌC TRỰC TIẾP TỪ SQLITE CACHE, 0% QUÉT Ổ CỨNG
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
                  artists.every((a: string) => t.artist.toLowerCase().includes(a.toLowerCase())))
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

  // 2. LÀM MỚI GIA TĂNG (INCREMENTAL REFRESH)
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

    const cached = metadataCache[trackPath]
    const isMtimeMatch =
      cached && (cached.mtime === stat.mtimeMs || Math.abs(cached.mtime - stat.mtimeMs) < 1000)
    if (!isHardRescan && isMtimeMatch && cached.data && cached.data.multiArtistVersion === 2) {
      const existingTrack =
        previousTrackMap.get(trackPath) || previousTrackMap.get(cached.data.filePath)
      const finalCover = coverUrl || existingTrack?.coverArt || cached.data.coverArt || null
      const finalColors =
        calculatedColors || existingTrack?.themeColors || cached.data.themeColors || null

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

    try {
      const trackDir = path.dirname(trackPath)
      let knownAlbumCover = albumCoverMap ? albumCoverMap.get(trackDir) : undefined
      const hasKnownCover = Boolean(coverUrl || (knownAlbumCover && knownAlbumCover.coverUrl))
      const shouldSkipCovers = hasKnownCover

      const metadata = await fastReadMetadata(trackPath, { skipCovers: shouldSkipCovers })

      if (!calculatedColors) {
        calculatedColors =
          themeColorsCache[trackPath] || themeColorsCache[pathToFileURL(trackPath).href] || null
      }

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
            markThemeColorDirty(trackPath)
            themeColorsCache[pathToFileURL(trackPath).href] = calculatedColors
            markThemeColorDirty(pathToFileURL(trackPath).href)
            cacheModified = true
          }

          if (albumCoverMap) {
            const entry = { coverUrl: coverUrl!, themeColors: calculatedColors }
            if (albumKey) albumCoverMap.set(albumKey, entry)
            albumCoverMap.set(trackDir, entry)

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

      const numMatch = genreStr.match(/^\(?(\d+)\)?$/)
      if (numMatch) {
        const idx = parseInt(numMatch[1])
        if (ID3V1_GENRES[idx]) {
          genreStr = ID3V1_GENRES[idx]
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
        replayGainTrack: metadata?.common?.replayGainTrack,
        replayGainAlbum: metadata?.common?.replayGainAlbum,
        coverArt: coverUrl,
        themeColors:
          themeColorsCache[trackPath] || themeColorsCache[pathToFileURL(trackPath).href] || null
      }

      metadataCache[trackPath] = {
        mtime: stat.mtimeMs,
        data: trackData
      }
      markMetadataDirty(trackPath)
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
          markThemeColorDirty(folderImg)
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
          let isDir = dirent.isDirectory()
          if (!isDir && dirent.isSymbolicLink()) {
            isDir = (await fs.promises.stat(itemPath)).isDirectory()
          }

          if (isDir && item !== '.thumbnails') {
            const playlistTracks: any[] = []
            const allFiles = await getAudioFilesInDirectoryRecursiveAsync(
              itemPath,
              [...supportedExts, '.cue']
            )
            const allTrackPaths = allFiles.filter((f) => !f.toLowerCase().endsWith('.cue'))
            const subCuePaths = allFiles.filter((f) => f.toLowerCase().endsWith('.cue'))

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
                if (++trackIndex % 10 === 0) {
                  await new Promise<void>((resolve) => setImmediate(resolve))
                }

                const subStat = await fs.promises.stat(trackPath)
                const fileName = path.basename(trackPath)
                const trackDir = path.dirname(trackPath)

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

  const replacedAudioFiles = new Set<string>()

  for (const cueItem of discoveredCueFiles) {
    try {
      const cueResult = parseCueFile(cueItem.cuePath)
      if (!cueResult || cueResult.tracks.length === 0) continue

      await resolveCueSheetDurations(cueResult, async (audioPath) => {
        const normPath = normalizePathKey(audioPath)
        const matched = tracks.find(
          (t) => normalizePathKey(t.id) === normPath || normalizePathKey(t.filePath) === normPath
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
          (t) => normalizePathKey(t.id) === normAudio || normalizePathKey(t.filePath) === normAudio
        )

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
            cueTrack.artists && cueTrack.artists.length > 0 ? cueTrack.artists : [cueTrack.artist],
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
          replayGainTrack: parentTrack?.replayGainTrack,
          replayGainAlbum: parentTrack?.replayGainAlbum,
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

  for (const cachedPath of Object.keys(metadataCache)) {
    if (!existingDiskPaths.has(cachedPath)) {
      delete metadataCache[cachedPath]
      delete themeColorsCache[cachedPath]
      delete themeColorsCache[pathToFileURL(cachedPath).href]
      dirtyMetadataKeys.delete(cachedPath)
      dirtyThemeColorKeys.delete(cachedPath)
      dirtyThemeColorKeys.delete(pathToFileURL(cachedPath).href)
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

// ==========================================
// IPC HANDLERS CHO LIBRARY SCANNER
// ==========================================
export function registerLibraryScannerIpc(): void {
  ipcMain.handle(
    'music:getLibrary',
    async (_, forceRefresh: boolean = false, hardRescan: boolean = false) => {
      return await scanLibrary(forceRefresh, hardRescan)
    }
  )

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

  ipcMain.handle('music:removeLibraryFolder', async (_, folderPath: string) => {
    const config = getConfig()
    let currentPaths: string[] =
      config.libraryPaths || (config.libraryPath ? [config.libraryPath] : [])
    currentPaths = currentPaths.filter((p) => p !== folderPath)
    saveConfig({ libraryPaths: currentPaths, libraryPath: currentPaths[0] || null })
    return { success: true, libraryPaths: currentPaths }
  })

  ipcMain.handle('music:updateLibraryFolder', async (_, oldPath: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const newPath = filePaths[0]
    const config = getConfig()
    const currentPaths: string[] =
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

  ipcMain.handle('music:importLocalFiles', async (_, targetSubFolder?: string) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) {
      return {
        success: false,
        error: 'Chưa cấu hình thư mục Thư viện! Hãy vào Cài đặt để thiết lập.'
      }
    }

    const safeTargetSubFolder = targetSubFolder ? sanitizeDirectoryName(targetSubFolder) : null
    const destFolder = safeTargetSubFolder ? join(rootPath, safeTargetSubFolder) : rootPath
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })

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
        if (sourcePath !== destPath) {
          fs.copyFileSync(sourcePath, destPath)

          const lrcSource = sourcePath.replace(/\.[^/.]+$/, '.lrc')
          const lrcDest = destPath.replace(/\.[^/.]+$/, '.lrc')
          if (fs.existsSync(lrcSource) && lrcSource !== lrcDest) {
            fs.copyFileSync(lrcSource, lrcDest)
          }
        }

        const metadata = await mm.parseFile(destPath)
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
          coverArt: null,
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

      const cached = metadataCache[rawPath]
      if (
        cached?.data?.lyrics &&
        typeof cached.data.lyrics === 'string' &&
        cached.data.lyrics.trim()
      ) {
        return cached.data.lyrics
      }

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
        } catch (mErr) {}

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

  ipcMain.handle(
    'music:convertAudioTrack',
    async (
      _event,
      track: {
        filePath: string
        title?: string
        artist?: string
        album?: string
        startTime?: number
        endTime?: number
      },
      targetFormat: 'flac' | 'mp3' | 'wav'
    ) => {
      try {
        if (!track || !track.filePath) {
          return { success: false, error: 'Source file path is required' }
        }

        let rawPath = track.filePath
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
        rawPath = rawPath.replace(/^file:\/\/\/?/, '')
        if (process.platform === 'win32') {
          try {
            rawPath = decodeURIComponent(rawPath)
          } catch (e) {}
          if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
          rawPath = rawPath.replace(/\//g, '\\')
        }

        if (!fs.existsSync(rawPath)) {
          return { success: false, error: `Source audio file not found: ${rawPath}` }
        }

        const cleanTitle = sanitizeFileName(
          track.title || path.basename(rawPath, path.extname(rawPath))
        )
        const defaultDir = path.dirname(rawPath)
        const defaultPath = join(defaultDir, `${cleanTitle}.${targetFormat}`)

        const focusedWin = BrowserWindow.getFocusedWindow()
        const saveDialogOpts = {
          title: 'Save Converted Audio File / Lưu tệp âm thanh chuyển đổi',
          defaultPath,
          filters: [
            {
              name: targetFormat.toUpperCase(),
              extensions: [targetFormat]
            }
          ]
        }
        const saveRes = focusedWin
          ? await dialog.showSaveDialog(focusedWin, saveDialogOpts)
          : await dialog.showSaveDialog(saveDialogOpts)

        if (saveRes.canceled || !saveRes.filePath) {
          return { success: false, canceled: true }
        }

        const outputPath = saveRes.filePath
        const ffmpegExe = getFfmpegPath()
        const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error']

        if (typeof track.startTime === 'number' && track.startTime > 0) {
          args.push('-ss', track.startTime.toString())
        }
        if (
          typeof track.endTime === 'number' &&
          track.endTime > (track.startTime || 0)
        ) {
          args.push('-to', track.endTime.toString())
        }

        args.push('-i', rawPath)

        if (targetFormat === 'mp3') {
          args.push('-c:a', 'libmp3lame', '-b:a', '320k')
        } else if (targetFormat === 'flac') {
          args.push('-c:a', 'flac')
        } else if (targetFormat === 'wav') {
          args.push('-c:a', 'pcm_s16le')
        }

        if (track.title && String(track.title).trim()) {
          args.push('-metadata', `title=${String(track.title).trim()}`)
        }
        if (track.artist && String(track.artist).trim()) {
          args.push('-metadata', `artist=${String(track.artist).trim()}`)
        }
        if (track.album && String(track.album).trim()) {
          args.push('-metadata', `album=${String(track.album).trim()}`)
        }

        args.push(outputPath)

        await new Promise<void>((resolve, reject) => {
          const ff = spawn(ffmpegExe, args)
          let errOutput = ''
          ff.stderr.on('data', (d) => {
            errOutput += d.toString()
          })
          ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
              resolve()
            } else {
              reject(new Error(`FFmpeg exited with code ${code}: ${errOutput}`))
            }
          })
          ff.on('error', reject)
        })

        return { success: true, outputPath }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) }
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
      markThemeColorDirty(rawPath)
      themeColorsCache[trackPath] = colors
      markThemeColorDirty(trackPath)
      sqliteStorage.setThemeColor(rawPath, colors)
      sqliteStorage.setThemeColor(trackPath, colors)
      saveThemeColorsCache()

      if (metadataCache[rawPath] && metadataCache[rawPath].data) {
        metadataCache[rawPath].data.themeColors = colors
        markMetadataDirty(rawPath)
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
      clearStreamCoverCache()
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

  ipcMain.handle('music:forceGC', () => {
    clearStreamCoverCache()
    if (typeof (global as any).gc === 'function') {
      ;(global as any).gc()
    }
    setTimeout(() => {
      trimNativeMemory()
    }, 200)
    return { success: true }
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
    registerAllowedDroppedFile(filePaths[0])
    return filePaths[0]
  })

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
          format: metadata.format.container || file.split('.').pop()?.toUpperCase(),
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          bitDepth: metadata.format.bitsPerSample,
          lossless: metadata.format.lossless,
          coverArt: null,
          isCloud: false
        })
      } catch (err) {
        tracks.push({
          id: filePath,
          filePath: pathToFileURL(filePath).href,
          title: file,
          isCloud: false
        })
      }
    }
    return tracks
  })
}
