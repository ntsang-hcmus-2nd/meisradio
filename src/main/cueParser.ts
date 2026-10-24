import fs from 'fs'
import path from 'path'
import { splitArtistNames } from './fastAudioParser'

export { splitArtistNames }

export interface CueTrackInfo {
  id: string // e.g. `${cueFilePath}#track-${trackNo}`
  cueFilePath: string
  audioFilePath: string // Resolved absolute path to the actual audio file on disk
  trackNumber: number
  title: string
  artist: string
  artists: string[]
  album: string
  albumArtist: string
  genre?: string
  year?: string
  startTime: number // in seconds
  endTime?: number // in seconds (undefined until resolved with parent audio duration for last track)
  duration?: number // in seconds
  isCueTrack: boolean
}

export interface CueSheetResult {
  cueFilePath: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: string
  referencedAudioFiles: string[] // Normalized/absolute paths of underlying audio files
  tracks: CueTrackInfo[]
}

/**
 * Supported audio file extensions probed when resolving referenced audio files
 */
export const AUDIO_PROBE_EXTS = [
  '.flac',
  '.wav',
  '.ape',
  '.dsf',
  '.dff',
  '.wv',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.aiff',
  '.alac',
  '.aac',
  '.wma',
  '.bin'
]

/**
 * Decodes a CUE file buffer with robust multi-encoding detection:
 * 1. Checks UTF-8 BOM, UTF-16LE BOM, UTF-16BE BOM.
 * 2. Attempts strict UTF-8 decoding.
 * 3. Probes for Japanese (Shift-JIS) vs European/Vietnamese (Windows-1252) to eliminate mojibake.
 */
export function decodeCueBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return ''

  // 1. Check Byte Order Marks (BOM)
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    try {
      return new TextDecoder('utf-8').decode(buffer.subarray(3))
    } catch {}
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    try {
      return new TextDecoder('utf-16le').decode(buffer.subarray(2))
    } catch {}
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    try {
      return new TextDecoder('utf-16be').decode(buffer.subarray(2))
    } catch {}
  }

  // 2. Strict UTF-8 trial
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    const text = utf8Decoder.decode(buffer)
    // Strip DOS EOF character (\x1a) if present at end of file
    return text.replace(/\x1a+$/, '')
  } catch {
    // Buffer contains byte sequences invalid in UTF-8
  }

  // 3. Probe Shift-JIS vs Windows-1252 fallback
  // Shift-JIS lead bytes: 0x81-0x9F and 0xE0-0xFC, trail bytes: 0x40-0x7E and 0x80-0xFC
  let sjisScore = 0
  for (let i = 0; i < buffer.length - 1; i++) {
    const b1 = buffer[i]
    if ((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) {
      const b2 = buffer[i + 1]
      if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
        sjisScore++
        i++ // skip trail byte
      }
    }
  }

  if (sjisScore >= 2) {
    try {
      const sjisDecoder = new TextDecoder('shift-jis', { fatal: false })
      const sjisText = sjisDecoder.decode(buffer)
      return sjisText.replace(/\x1a+$/, '')
    } catch {}
  }

  // Fallback to Windows-1252 (covers European, ISO-8859-1, and standard legacy ANSI rips)
  try {
    const win1252Decoder = new TextDecoder('windows-1252', { fatal: false })
    return win1252Decoder.decode(buffer).replace(/\x1a+$/, '')
  } catch {}

  // Final fallback to non-fatal UTF-8
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/\x1a+$/, '')
}

/**
 * Removes surrounding quotes from a string or returns the trimmed value.
 */
function cleanQuotedString(val: string): string {
  let s = val.trim()
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    if (end !== -1) {
      s = s.substring(1, end)
    } else {
      s = s.substring(1)
    }
  }
  return s.trim()
}

/**
 * Converts a CUE timestamp `mm:ss:ff` to seconds.
 * `ff` is CD frames (75 frames = 1 second).
 */
export function cueTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':')
  if (parts.length < 2) return 0

  const mm = parseInt(parts[0], 10) || 0
  const ss = parseInt(parts[1], 10) || 0
  const ff = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0

  const total = mm * 60 + ss + ff / 75
  return Math.round(total * 1000) / 1000
}

/**
 * Resolves the referenced audio file path relative to the `.cue` file's directory.
 * If the exact referenced file does not exist on disk, probes for matching basename with
 * `.flac`, `.wav`, `.ape`, `.dsf`, `.dff`, `.wv`, `.m4a`, etc. in the same folder.
 */
export function resolveReferencedAudioPath(cueDir: string, referencedFile: string): string {
  // Normalize path separators
  const cleanRef = referencedFile
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep)
  const exactPath = path.isAbsolute(cleanRef) ? cleanRef : path.resolve(cueDir, cleanRef)

  if (fs.existsSync(exactPath)) {
    return exactPath
  }

  // Base name without extension
  const refBaseName = path.parse(cleanRef).name

  // Probe with candidate extensions
  for (const ext of AUDIO_PROBE_EXTS) {
    const candidate = path.join(cueDir, `${refBaseName}${ext}`)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Probe case-insensitively in the cue directory
  try {
    const entries = fs.readdirSync(cueDir)
    const lowerRefBase = refBaseName.toLowerCase()

    // 1. Basename matches case-insensitively and extension is in probe list
    for (const entry of entries) {
      const entryBase = path.parse(entry).name.toLowerCase()
      const entryExt = path.extname(entry).toLowerCase()
      if (entryBase === lowerRefBase && AUDIO_PROBE_EXTS.includes(entryExt)) {
        return path.join(cueDir, entry)
      }
    }

    // 2. If only one single audio file exists in directory, map to it (very common for 1-disc rips)
    const audioFiles = entries.filter((entry) =>
      AUDIO_PROBE_EXTS.includes(path.extname(entry).toLowerCase())
    )
    if (audioFiles.length === 1) {
      return path.join(cueDir, audioFiles[0])
    }
  } catch {}

  return exactPath
}

interface RawCueTrack {
  trackNumber: number
  dataType: string
  audioFilePath: string
  title?: string
  artist?: string
  genre?: string
  year?: string
  index00?: number
  index01?: number
}

/**
 * Parses CUE sheet content string into structured CueSheetResult.
 */
export function parseCueContent(content: string, cueFilePath: string = ''): CueSheetResult {
  const cueDir = cueFilePath ? path.dirname(cueFilePath) : ''

  let albumTitle = ''
  let albumArtist = ''
  let globalGenre = ''
  let globalYear = ''

  let currentAudioFile = ''
  const referencedAudioFilesSet = new Set<string>()

  const rawTracks: RawCueTrack[] = []
  let currentTrack: RawCueTrack | null = null

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 1. FILE command
    if (/^FILE\b/i.test(line)) {
      // Flush previous track
      if (currentTrack) {
        rawTracks.push(currentTrack)
        currentTrack = null
      }

      const rest = line.substring(4).trim()
      let fileName = ''

      if (rest.startsWith('"')) {
        const endQuote = rest.indexOf('"', 1)
        fileName = endQuote !== -1 ? rest.substring(1, endQuote) : rest.substring(1)
      } else {
        const parts = rest.split(/\s+/)
        if (parts.length >= 2) {
          parts.pop() // remove file type like WAVE, FLAC
          fileName = parts.join(' ')
        } else {
          fileName = rest
        }
      }

      currentAudioFile = resolveReferencedAudioPath(cueDir, fileName)
      if (currentAudioFile) {
        referencedAudioFilesSet.add(currentAudioFile)
      }
      continue
    }

    // 2. TRACK command
    const trackMatch = line.match(/^TRACK\s+(\d+)\s+(\S+)/i)
    if (trackMatch) {
      if (currentTrack) {
        rawTracks.push(currentTrack)
      }
      currentTrack = {
        trackNumber: parseInt(trackMatch[1], 10),
        dataType: trackMatch[2].toUpperCase(),
        audioFilePath: currentAudioFile
      }
      continue
    }

    // 3. REM commands
    if (/^REM\b/i.test(line)) {
      const remRest = line.substring(3).trim()
      const genreMatch = remRest.match(/^GENRE\s+(.+)$/i)
      if (genreMatch) {
        const g = cleanQuotedString(genreMatch[1])
        if (currentTrack) {
          currentTrack.genre = g
        } else if (!globalGenre) {
          globalGenre = g
        }
        continue
      }

      const dateMatch = remRest.match(/^(?:DATE|YEAR)\s+(.+)$/i)
      if (dateMatch) {
        const y = cleanQuotedString(dateMatch[1])
        if (currentTrack) {
          currentTrack.year = y
        } else if (!globalYear) {
          globalYear = y
        }
        continue
      }
      continue
    }

    // 4. TITLE command
    if (/^TITLE\b/i.test(line)) {
      const val = cleanQuotedString(line.substring(5))
      if (currentTrack) {
        currentTrack.title = val
      } else if (!albumTitle) {
        albumTitle = val
      }
      continue
    }

    // 5. PERFORMER command
    if (/^PERFORMER\b/i.test(line)) {
      const val = cleanQuotedString(line.substring(9))
      if (currentTrack) {
        currentTrack.artist = val
      } else if (!albumArtist) {
        albumArtist = val
      }
      continue
    }

    // 6. INDEX command
    const indexMatch = line.match(/^INDEX\s+(\d+)\s+([\d:]+)/i)
    if (indexMatch && currentTrack) {
      const idxNo = parseInt(indexMatch[1], 10)
      const sec = cueTimeToSeconds(indexMatch[2])
      if (idxNo === 0) {
        currentTrack.index00 = sec
      } else if (idxNo === 1) {
        currentTrack.index01 = sec
      }
      continue
    }
  }

  // Push final track
  if (currentTrack) {
    rawTracks.push(currentTrack)
    currentTrack = null
  }

  // Build final CueTrackInfo list and compute start / end times
  const tracks: CueTrackInfo[] = []

  const defaultAlbumName = cueFilePath ? path.parse(cueFilePath).name : 'Unknown Album'

  for (let i = 0; i < rawTracks.length; i++) {
    const raw = rawTracks[i]
    const trackNo = raw.trackNumber
    const title = raw.title || `Track ${trackNo}`
    const artist = raw.artist || albumArtist || 'Unknown Artist'
    const artists = splitArtistNames(artist)
    const album = albumTitle || defaultAlbumName
    const genre = raw.genre || globalGenre || undefined
    const year = raw.year || globalYear || undefined

    const startTime =
      raw.index01 !== undefined ? raw.index01 : raw.index00 !== undefined ? raw.index00 : 0

    let endTime: number | undefined = undefined
    let duration: number | undefined = undefined

    // Check if next track belongs to the SAME audio file
    const nextTrack = i + 1 < rawTracks.length ? rawTracks[i + 1] : null
    if (nextTrack && nextTrack.audioFilePath === raw.audioFilePath) {
      const nextBound = nextTrack.index00 !== undefined ? nextTrack.index00 : nextTrack.index01
      if (nextBound !== undefined && nextBound >= startTime) {
        endTime = nextBound
        duration = Math.max(0, Math.round((endTime - startTime) * 1000) / 1000)
      }
    }

    const id = cueFilePath ? `${cueFilePath}#track-${trackNo}` : `track-${trackNo}`

    tracks.push({
      id,
      cueFilePath,
      audioFilePath: raw.audioFilePath,
      trackNumber: trackNo,
      title,
      artist,
      artists: artists.length > 0 ? artists : [artist],
      album,
      albumArtist: albumArtist || artist,
      genre,
      year,
      startTime,
      endTime,
      duration,
      isCueTrack: true
    })
  }

  return {
    cueFilePath,
    album: albumTitle || defaultAlbumName,
    albumArtist: albumArtist || undefined,
    genre: globalGenre || undefined,
    year: globalYear || undefined,
    referencedAudioFiles: Array.from(referencedAudioFilesSet),
    tracks
  }
}

/**
 * Parses a CUE file from disk into structured CueSheetResult.
 * Automatically handles character encodings and probes audio file paths.
 */
export function parseCueFile(cueFilePath: string): CueSheetResult | null {
  try {
    if (!fs.existsSync(cueFilePath)) return null
    const buffer = fs.readFileSync(cueFilePath)
    const content = decodeCueBuffer(buffer)
    if (!content || !content.trim()) return null
    return parseCueContent(content, cueFilePath)
  } catch {
    return null
  }
}

export const parseCueSheet = parseCueFile

/**
 * Helper to resolve undefined endTimes and durations for the final tracks
 * by querying parent audio file duration through a provided duration resolver.
 */
export async function resolveCueSheetDurations(
  cueResult: CueSheetResult,
  durationResolver: (audioFilePath: string) => Promise<number | undefined>
): Promise<CueSheetResult> {
  const fileDurationCache: Record<string, number | undefined> = {}

  for (const track of cueResult.tracks) {
    if (track.endTime === undefined && track.audioFilePath) {
      if (fileDurationCache[track.audioFilePath] === undefined) {
        try {
          fileDurationCache[track.audioFilePath] = await durationResolver(track.audioFilePath)
        } catch {
          fileDurationCache[track.audioFilePath] = undefined
        }

        // Fallback for raw CD-DA .bin image files (16-bit 44.1kHz stereo PCM = 176400 bytes/sec)
        if (
          fileDurationCache[track.audioFilePath] === undefined &&
          track.audioFilePath.toLowerCase().endsWith('.bin')
        ) {
          try {
            if (fs.existsSync(track.audioFilePath)) {
              const stat = fs.statSync(track.audioFilePath)
              fileDurationCache[track.audioFilePath] = Math.max(0, stat.size / 176400)
            }
          } catch {}
        }
      }

      const totalDur = fileDurationCache[track.audioFilePath]
      if (typeof totalDur === 'number' && totalDur > track.startTime) {
        track.endTime = totalDur
        track.duration = Math.max(0, Math.round((totalDur - track.startTime) * 1000) / 1000)
      }
    }
  }

  return cueResult
}
