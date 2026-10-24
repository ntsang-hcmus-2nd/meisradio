import fs from 'fs'
import path from 'path'
import * as mm from 'music-metadata'

declare module 'music-metadata' {
  interface ICommonTagsResult {
    replayGainTrack?: number
    replayGainAlbum?: number
  }
}

export interface ExtractedCover {
  data: Buffer
  format: string
}

export interface FastAudioMetadata {
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  albumArtist?: string
  genre?: string
  year?: string
  trackNumber?: string
  totalTracks?: string
  discNumber?: string
  totalDiscs?: string
  comment?: string
  composer?: string
  lyrics?: string
  duration?: number
  sampleRate?: number
  bitsPerSample?: number
  bitrate?: number
  numberOfChannels?: number
  lossless?: boolean
  format?: string
  codec?: string
  container?: string
  cover?: ExtractedCover | null
  rawTags?: Record<string, string | string[]>
  replayGainTrack?: number
  replayGainAlbum?: number
  common?: {
    replayGainTrack?: number
    replayGainAlbum?: number
    [key: string]: any
  }
}

/**
 * Standard ID3v1 Genre lookup table
 */
export const ID3V1_GENRES = [
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

/**
 * Resolves numeric genre index like `(17)` or `17` to text genre name.
 */
export function resolveGenreString(rawGenre: string | undefined): string | undefined {
  if (!rawGenre) return undefined
  const trimmed = rawGenre.trim()
  if (!trimmed) return undefined
  const match = trimmed.match(/^\(?(\d+)\)?$/)
  if (match) {
    const idx = parseInt(match[1], 10)
    if (ID3V1_GENRES[idx]) return ID3V1_GENRES[idx]
  }
  return trimmed
}

/**
 * Preserved artist names that should not be split on internal delimiters like '/', '&', ','
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
 * Splits an artist string into an array of distinct artist names.
 * Unified logic shared with cueParser, libraryScanner and renderer textUtils:
 * preserved-name placeholders (longest match first), Jr./Sr. protection,
 * "(feat. X)" normalization, broad delimiter set, bracket stripping and
 * case-insensitive deduplication.
 */
export function splitArtistNames(raw: string): string[] {
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
  const sortedPreserved = [...PRESERVED_ARTIST_NAMES].sort((a, b) => b.length - a.length)
  sortedPreserved.forEach((preserved, idx) => {
    const regex = new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    if (regex.test(working)) {
      const token = `__PRESERVED_ARTIST_${idx}__`
      working = working.replace(regex, token)
      placeholders.push({ token, original: preserved })
    }
  })

  // Protect comma-attached name suffixes (e.g. "Grover Washington, Jr.")
  working = working.replace(
    /,\s*(Jr\.?|Sr\.?|III|II|IV)(?=$|[\s,;/|)\]])/gi,
    (_, g1) => `___JRSR___${g1}`
  )

  // Normalize parenthesized feat/ft: "(feat. X)" -> " feat. X"
  working = working.replace(
    /[([{]\s*(?:feat\.?|ft\.?|featuring)\s+([^()\]}]+)[)\]}]/gi,
    ' feat. $1'
  )

  // Split on common delimiters: semicolon, NUL, slashes, pipe, feat/ft/featuring/with/vs,
  // &/x/+, CJK separators, comma
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

export const splitArtistString = splitArtistNames

/**
 * Parses raw Vorbis comment block buffer into key-value map.
 * Used for FLAC and OGG Vorbis Comments.
 */
export function parseVorbisCommentBuffer(commentBuffer: Buffer): {
  tags: Record<string, string[]>
  vendor: string
} {
  const result: Record<string, string[]> = {}
  if (commentBuffer.length < 8) return { tags: result, vendor: '' }

  try {
    let ptr = 0
    const vendorLen = commentBuffer.readUInt32LE(ptr)
    ptr += 4
    if (ptr + vendorLen > commentBuffer.length) return { tags: result, vendor: '' }
    const vendor = commentBuffer.toString('utf-8', ptr, ptr + vendorLen)
    ptr += vendorLen

    if (ptr + 4 > commentBuffer.length) return { tags: result, vendor }
    const commentCount = commentBuffer.readUInt32LE(ptr)
    ptr += 4

    for (let i = 0; i < commentCount && ptr + 4 <= commentBuffer.length; i++) {
      const commentLen = commentBuffer.readUInt32LE(ptr)
      ptr += 4
      if (ptr + commentLen > commentBuffer.length) break
      const commentStr = commentBuffer.toString('utf-8', ptr, ptr + commentLen)
      ptr += commentLen

      const eqIdx = commentStr.indexOf('=')
      if (eqIdx !== -1) {
        const key = commentStr.substring(0, eqIdx).trim().toUpperCase()
        const val = commentStr.substring(eqIdx + 1).trim()
        if (!result[key]) result[key] = []
        result[key].push(val)
      }
    }

    return { tags: result, vendor }
  } catch {
    return { tags: result, vendor: '' }
  }
}

/**
 * Alias for parseVorbisCommentBuffer
 */
export const parseVorbisComment = parseVorbisCommentBuffer

/**
 * Parses a ReplayGain string like "-6.42 dB", "+1.20 dB", or "-6.42" to float number
 */
export function parseReplayGainValue(raw: any): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'number') return isNaN(raw) ? undefined : raw
  const str = String(raw).trim()
  const match = str.replace(',', '.').match(/^[+-]?\d+(?:\.\d+)?/)
  if (match) {
    const val = parseFloat(match[0])
    return isNaN(val) ? undefined : val
  }
  return undefined
}

/**
 * Parses ID3v2 tag buffer and extracts standard text frames (TCON, TYER, TDRC, TRCK, TPE2, etc.)
 * and pictures without streaming audio data.
 */
export function parseId3v2FrameBuffer(id3Buffer: Buffer): {
  tags: Record<string, string[]>
  pictures: Array<{ format: string; data: Buffer; description?: string }>
} {
  const tags: Record<string, string[]> = {}
  const pictures: Array<{ format: string; data: Buffer; description?: string }> = []

  if (id3Buffer.length < 10) return { tags, pictures }
  if (id3Buffer[0] !== 0x49 || id3Buffer[1] !== 0x44 || id3Buffer[2] !== 0x33) {
    return { tags, pictures }
  }

  const version = id3Buffer[3]
  const flags = id3Buffer[5]
  let offset = 10

  // Handle extended header
  if ((flags & 0x40) !== 0 && offset + 4 <= id3Buffer.length) {
    const extSize =
      version === 4
        ? ((id3Buffer[offset] & 0x7f) << 21) |
          ((id3Buffer[offset + 1] & 0x7f) << 14) |
          ((id3Buffer[offset + 2] & 0x7f) << 7) |
          (id3Buffer[offset + 3] & 0x7f)
        : id3Buffer.readUInt32BE(offset)
    offset += version === 4 ? extSize : extSize + 4
  }

  const tagSize =
    ((id3Buffer[6] & 0x7f) << 21) |
    ((id3Buffer[7] & 0x7f) << 14) |
    ((id3Buffer[8] & 0x7f) << 7) |
    (id3Buffer[9] & 0x7f)
  const maxOffset = Math.min(id3Buffer.length, 10 + tagSize)

  while (offset + 10 <= maxOffset) {
    const frameId = id3Buffer.toString('ascii', offset, offset + 4)
    if (!frameId || frameId[0] === '\x00') break

    let frameSize = 0
    if (version === 4) {
      frameSize =
        ((id3Buffer[offset + 4] & 0x7f) << 21) |
        ((id3Buffer[offset + 5] & 0x7f) << 14) |
        ((id3Buffer[offset + 6] & 0x7f) << 7) |
        (id3Buffer[offset + 7] & 0x7f)
    } else {
      frameSize = id3Buffer.readUInt32BE(offset + 4)
    }

    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break
    const frameData = id3Buffer.subarray(offset + 10, offset + 10 + frameSize)
    offset += 10 + frameSize

    // Parse Text Frames (Starts with 'T', excluding 'TXXX')
    if (frameId.startsWith('T') && frameId !== 'TXXX' && frameData.length > 1) {
      const encoding = frameData[0]
      let text = ''
      try {
        if (encoding === 0) {
          text = frameData.toString('latin1', 1)
        } else if (encoding === 1) {
          text = frameData.toString('utf16le', 1)
        } else if (encoding === 2) {
          const swapped = Buffer.alloc(frameData.length - 1)
          for (let b = 1; b < frameData.length - 1; b += 2) {
            swapped[b - 1] = frameData[b + 1]
            swapped[b] = frameData[b]
          }
          text = swapped.toString('utf16le')
        } else if (encoding === 3) {
          text = frameData.toString('utf-8', 1)
        }
      } catch {}
      text = text.replace(/\0+$/, '').trim()
      if (text) {
        if (!tags[frameId]) tags[frameId] = []
        tags[frameId].push(text)
      }
    } else if (frameId === 'TXXX' && frameData.length > 2) {
      try {
        const encoding = frameData[0]
        let p = 1
        let desc = ''
        let val = ''
        if (encoding === 0 || encoding === 3) {
          while (p < frameData.length && frameData[p] !== 0) p++
          desc = frameData.toString(encoding === 0 ? 'latin1' : 'utf-8', 1, p)
          p++
          if (p <= frameData.length) {
            val = frameData.toString(encoding === 0 ? 'latin1' : 'utf-8', p)
          }
        } else if (encoding === 1 || encoding === 2) {
          let buf = frameData
          if (encoding === 2) {
            buf = Buffer.from(frameData)
            for (let b = 1; b < buf.length - 1; b += 2) {
              const tmp = buf[b]
              buf[b] = buf[b + 1]
              buf[b + 1] = tmp
            }
          }
          while (p + 1 < buf.length && !(buf[p] === 0 && buf[p + 1] === 0)) p += 2
          desc = buf.toString('utf16le', 1, p)
          p += 2
          if (p <= buf.length) {
            val = buf.toString('utf16le', p)
          }
        }
        desc = desc.replace(/\0+$/, '').trim().toUpperCase()
        val = val.replace(/\0+$/, '').trim()
        if (desc && val) {
          const txxxKey = `TXXX:${desc}`
          if (!tags[txxxKey]) tags[txxxKey] = []
          tags[txxxKey].push(val)
          if (desc.startsWith('REPLAYGAIN')) {
            if (!tags[desc]) tags[desc] = []
            tags[desc].push(val)
          }
        }
      } catch {}
    } else if (frameId === 'APIC' && frameData.length > 10) {
      try {
        const encoding = frameData[0]
        let p = 1
        let mime = ''
        while (p < frameData.length && frameData[p] !== 0) {
          mime += String.fromCharCode(frameData[p])
          p++
        }
        p++ // skip null byte
        if (p < frameData.length) {
          p++ // skip picture type byte
          if (encoding === 1 || encoding === 2) {
            while (p + 1 < frameData.length && !(frameData[p] === 0 && frameData[p + 1] === 0)) {
              p += 2
            }
            p += 2
          } else {
            while (p < frameData.length && frameData[p] !== 0) p++
            p++
          }
          if (p < frameData.length) {
            const picData = Buffer.from(frameData.subarray(p))
            if (!mime.includes('/')) mime = `image/${mime || 'jpeg'}`
            pictures.push({ format: mime, data: picData })
          }
        }
      } catch {}
    }
  }

  return { tags, pictures }
}

/**
 * Alias for parseId3v2FrameBuffer
 */
export const parseId3v2 = parseId3v2FrameBuffer

/**
 * 1. FLAC PICTURE Block Direct Extractor
 * Walks FLAC metadata block headers (4 bytes each) and extracts block type 6 (PICTURE) directly.
 * Skips 100% of the audio frames.
 */
export async function extractFlacCoverFast(filePath: string): Promise<ExtractedCover | null> {
  let fd: fs.promises.FileHandle | null = null
  try {
    fd = await fs.promises.open(filePath, 'r')
    const magic = Buffer.alloc(4)
    const { bytesRead } = await fd.read(magic, 0, 4, 0)
    if (bytesRead < 4 || magic.toString('utf-8') !== 'fLaC') return null

    let offset = 4
    let isLast = false
    const blockHeader = Buffer.alloc(4)

    while (!isLast) {
      const readRes = await fd.read(blockHeader, 0, 4, offset)
      if (readRes.bytesRead < 4) break

      const headerByte = blockHeader[0]
      isLast = (headerByte & 0x80) !== 0
      const blockType = headerByte & 0x7f
      const blockLength = (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3]

      if (blockLength < 0 || blockLength > 30 * 1024 * 1024) break

      if (blockType === 6) {
        // PICTURE Block found
        const blockData = Buffer.alloc(blockLength)
        await fd.read(blockData, 0, blockLength, offset + 4)

        if (blockLength >= 32) {
          let ptr = 4 // skip picture type uint32
          const mimeLen = blockData.readUInt32BE(ptr)
          ptr += 4
          if (ptr + mimeLen <= blockLength) {
            let mime = blockData.toString('utf-8', ptr, ptr + mimeLen)
            ptr += mimeLen
            const descLen = blockData.readUInt32BE(ptr)
            ptr += 4
            ptr += descLen // skip description
            ptr += 16 // skip width(4), height(4), colorDepth(4), colors(4)
            if (ptr + 4 <= blockLength) {
              const dataLen = blockData.readUInt32BE(ptr)
              ptr += 4
              if (ptr + dataLen <= blockLength) {
                const picData = blockData.subarray(ptr, ptr + dataLen)
                if (!mime.includes('/')) mime = `image/${mime || 'jpeg'}`
                return { data: Buffer.from(picData), format: mime }
              }
            }
          }
        }
        break
      }

      offset += 4 + blockLength
      if (offset > 50 * 1024 * 1024) break
    }
  } catch {
    return null
  } finally {
    if (fd) {
      try {
        await fd.close()
      } catch {
        // ignore close error
      }
    }
  }
  return null
}

/**
 * 2. ID3v2 (MP3) Header-Only Seeking
 * Reads only the ID3v2 header and tags from the start of the file.
 * Returns tag Buffer or null if not an ID3v2 tag.
 */
export async function readId3v2TagBuffer(filePath: string): Promise<Buffer | null> {
  let fd: fs.promises.FileHandle | null = null
  try {
    fd = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(10)
    const { bytesRead } = await fd.read(header, 0, 10, 0)
    if (bytesRead < 10) return null

    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null

    const version = header[3]
    if (version < 2 || version > 4) return null

    const flags = header[5]
    const hasFooter = (flags & 0x10) !== 0

    const tagSize =
      ((header[6] & 0x7f) << 21) |
      ((header[7] & 0x7f) << 14) |
      ((header[8] & 0x7f) << 7) |
      (header[9] & 0x7f)

    if (tagSize <= 0 || tagSize > 25 * 1024 * 1024) return null

    const totalReadSize = 10 + tagSize + (hasFooter ? 10 : 0)
    const tagBuffer = Buffer.alloc(totalReadSize)
    await fd.read(tagBuffer, 0, totalReadSize, 0)
    return tagBuffer
  } catch {
    return null
  } finally {
    if (fd) {
      try {
        await fd.close()
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * 3. MP3 Cover Extractor using ID3v2 Header-Only Seeking
 */
export async function extractMp3CoverFast(filePath: string): Promise<ExtractedCover | null> {
  const tagBuffer = await readId3v2TagBuffer(filePath)
  if (!tagBuffer) return null
  try {
    const meta = await mm.parseBuffer(tagBuffer, 'audio/mpeg', { duration: false })
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0]
      let format = pic.format || 'image/jpeg'
      if (!format.includes('/')) format = `image/${format}`
      return { data: Buffer.from(pic.data), format }
    }
  } catch {
    // ignore parse error
  }
  return null
}

/**
 * 4. M4A / MP4 Atom-Seeking Cover Extractor
 * Reads top-level atoms and extracts 'covr' from 'moov' atom, completely skipping 'mdat' (audio frames).
 */
export async function extractM4aCoverFast(filePath: string): Promise<ExtractedCover | null> {
  let fd: fs.promises.FileHandle | null = null
  try {
    fd = await fs.promises.open(filePath, 'r')
    const stat = await fd.stat()
    const fileSize = stat.size
    let offset = 0
    const headerBuf = Buffer.alloc(8)

    while (offset < fileSize) {
      const { bytesRead } = await fd.read(headerBuf, 0, 8, offset)
      if (bytesRead < 8) break

      let atomSize = headerBuf.readUInt32BE(0)
      const atomType = headerBuf.toString('ascii', 4, 8)

      if (atomSize === 1) {
        // 64-bit size
        const extBuf = Buffer.alloc(8)
        await fd.read(extBuf, 0, 8, offset + 8)
        atomSize = Number(extBuf.readBigUInt64BE(0))
      } else if (atomSize === 0) {
        atomSize = fileSize - offset
      }

      if (atomSize <= 0) break

      if (atomType === 'moov') {
        const moovBuf = Buffer.alloc(atomSize)
        await fd.read(moovBuf, 0, atomSize, offset)
        const covrIdx = moovBuf.indexOf(Buffer.from('covr', 'ascii'))
        if (covrIdx !== -1) {
          const dataIdx = moovBuf.indexOf(Buffer.from('data', 'ascii'), covrIdx)
          if (dataIdx !== -1 && dataIdx < covrIdx + 64) {
            const dataAtomStart = dataIdx - 4
            const dataAtomSize = moovBuf.readUInt32BE(dataAtomStart)
            const typeIndicator = moovBuf.readUInt32BE(dataIdx + 4) // 13=jpeg, 14=png
            const picStart = dataIdx + 12
            const picLen = dataAtomSize - 16
            if (picLen > 0 && picStart + picLen <= moovBuf.length) {
              const picData = moovBuf.subarray(picStart, picStart + picLen)
              const format = typeIndicator === 14 ? 'image/png' : 'image/jpeg'
              return { data: Buffer.from(picData), format }
            }
          }
        }
        break
      }

      offset += atomSize
    }
  } catch {
    return null
  } finally {
    if (fd) {
      try {
        await fd.close()
      } catch {
        // ignore close error
      }
    }
  }
  return null
}

/**
 * 5. DSF Header-Only Seeking Tag Reader
 * Reads the DSF 'DSD ' chunk and directly seeks to `metadataPointer` to read the ID3v2 tag.
 * Completely skips gigabytes of 1-bit DSD audio data!
 */
export async function readDsfId3v2TagBuffer(filePath: string): Promise<Buffer | null> {
  let fd: fs.promises.FileHandle | null = null
  try {
    fd = await fs.promises.open(filePath, 'r')
    const dsdHeader = Buffer.alloc(28)
    const { bytesRead } = await fd.read(dsdHeader, 0, 28, 0)
    if (bytesRead < 28 || dsdHeader.toString('ascii', 0, 4) !== 'DSD ') return null

    const metadataPointer = Number(dsdHeader.readBigUInt64LE(20))
    if (!metadataPointer || metadataPointer <= 0) return null

    const stat = await fd.stat()
    if (metadataPointer >= stat.size) return null

    const id3Header = Buffer.alloc(10)
    const readHeader = await fd.read(id3Header, 0, 10, metadataPointer)
    if (readHeader.bytesRead < 10) return null
    if (id3Header[0] !== 0x49 || id3Header[1] !== 0x44 || id3Header[2] !== 0x33) return null

    const flags = id3Header[5]
    const hasFooter = (flags & 0x10) !== 0
    const tagSize =
      ((id3Header[6] & 0x7f) << 21) |
      ((id3Header[7] & 0x7f) << 14) |
      ((id3Header[8] & 0x7f) << 7) |
      (id3Header[9] & 0x7f)

    if (tagSize <= 0 || tagSize > 50 * 1024 * 1024) return null

    const totalReadSize = 10 + tagSize + (hasFooter ? 10 : 0)
    const tagBuffer = Buffer.alloc(totalReadSize)
    await fd.read(tagBuffer, 0, totalReadSize, metadataPointer)
    return tagBuffer
  } catch {
    return null
  } finally {
    if (fd) {
      try {
        await fd.close()
      } catch {}
    }
  }
}

/**
 * 6. DSF Cover Extractor using direct metadataPointer seeking
 */
export async function extractDsfCoverFast(filePath: string): Promise<ExtractedCover | null> {
  const tagBuf = await readDsfId3v2TagBuffer(filePath)
  if (!tagBuf) return null
  try {
    const meta = await mm.parseBuffer(tagBuf, 'audio/mpeg', { duration: false })
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0]
      let format = pic.format || 'image/jpeg'
      if (!format.includes('/')) format = `image/${format}`
      return { data: Buffer.from(pic.data), format }
    }
  } catch {}
  return null
}

/**
 * 7. DFF (DSDIFF) Chunk-Seeking Tag Reader
 * Walks FRM8 chunks and skips the massive 'DSD ' chunk to locate 'ID3 ' or 'ID32' metadata.
 */
export async function readDffId3v2TagBuffer(filePath: string): Promise<Buffer | null> {
  let fd: fs.promises.FileHandle | null = null
  try {
    fd = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(16)
    const { bytesRead } = await fd.read(header, 0, 16, 0)
    if (bytesRead < 16) return null
    if (header.toString('ascii', 0, 4) !== 'FRM8') return null
    if (header.toString('ascii', 12, 16) !== 'DSD ') return null

    const stat = await fd.stat()
    const fileSize = stat.size
    let offset = 16
    const chunkHeader = Buffer.alloc(12)

    while (offset + 12 <= fileSize) {
      const res = await fd.read(chunkHeader, 0, 12, offset)
      if (res.bytesRead < 12) break

      const chunkId = chunkHeader.toString('ascii', 0, 4)
      const chunkSize = Number(chunkHeader.readBigUInt64BE(4))
      if (chunkSize < 0 || offset + 12 + chunkSize > fileSize + 1) break

      if (chunkId === 'ID3 ' || chunkId === 'ID32') {
        const id3Buf = Buffer.alloc(chunkSize)
        await fd.read(id3Buf, 0, chunkSize, offset + 12)
        return id3Buf
      }

      // Pad byte if size is odd
      const pad = chunkSize & 1 ? 1 : 0
      offset += 12 + chunkSize + pad
      if (offset > 100 * 1024 * 1024 * 1024) break
    }
    return null
  } catch {
    return null
  } finally {
    if (fd) {
      try {
        await fd.close()
      } catch {}
    }
  }
}

/**
 * 8. DFF Cover Extractor using chunk-seeking
 */
export async function extractDffCoverFast(filePath: string): Promise<ExtractedCover | null> {
  const tagBuf = await readDffId3v2TagBuffer(filePath)
  if (!tagBuf) return null
  try {
    const meta = await mm.parseBuffer(tagBuf, 'audio/mpeg', { duration: false })
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0]
      let format = pic.format || 'image/jpeg'
      if (!format.includes('/')) format = `image/${format}`
      return { data: Buffer.from(pic.data), format }
    }
  } catch {}
  return null
}

/**
 * Universal Fast Cover Extractor:
 * 1. Checks FLAC block-seeking
 * 2. Checks MP3 ID3v2 header-seeking
 * 3. Checks M4A atom-seeking
 * 4. Checks DSF metadataPointer-seeking
 * 5. Checks DFF chunk-seeking
 * 6. Fallback: Partial stream read (Stream Abort) with 64KB chunks
 */
export async function fastExtractCover(filePath: string): Promise<ExtractedCover | null> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.flac') {
    const res = await extractFlacCoverFast(filePath)
    if (res) return res
  } else if (ext === '.mp3') {
    const res = await extractMp3CoverFast(filePath)
    if (res) return res
  } else if (ext === '.m4a' || ext === '.mp4') {
    const res = await extractM4aCoverFast(filePath)
    if (res) return res
  } else if (ext === '.dsf') {
    const res = await extractDsfCoverFast(filePath)
    if (res) return res
  } else if (ext === '.dff') {
    const res = await extractDffCoverFast(filePath)
    if (res) return res
  }

  // Fallback: Partial Stream Read (Stream Abort)
  try {
    const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })
    try {
      const metadata = await mm.parseStream(readStream, undefined, {
        skipCovers: false,
        duration: false
      })
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0]
        let format = pic.format || 'image/jpeg'
        if (!format.includes('/')) format = `image/${format}`
        return { data: Buffer.from(pic.data), format }
      }
    } finally {
      readStream.destroy()
    }
  } catch {
    // ignore stream abort error
  }

  return null
}

/**
 * Helper to enrich `metadata.common` with `genre`, `year`, `trackNumber`, `albumArtist`
 * from ID3v2 frames (`TCON`, `TYER`/`TDRC`, `TRCK`, `TPE2`) and Vorbis comments.
 */
function enrichCommonMetadata(metadata: mm.IAudioMetadata): void {
  const common = metadata.common
  const native = metadata.native || {}

  // 1. Album Artist enrichment (TPE2 or Vorbis ALBUMARTIST / ALBUM ARTIST)
  if (!common.albumartist) {
    for (const tagFormat of Object.keys(native)) {
      const tagList = native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id).toUpperCase()
          if (
            tid === 'TPE2' ||
            tid === 'ALBUMARTIST' ||
            tid === 'ALBUM ARTIST' ||
            tid === 'ENSEMBLE' ||
            tid === 'aART'
          ) {
            if (t.value) {
              common.albumartist = String(t.value).trim()
              break
            }
          }
        }
      }
      if (common.albumartist) break
    }
  }

  // 2. Genre enrichment (TCON or Vorbis GENRE)
  if (!common.genre || common.genre.length === 0) {
    for (const tagFormat of Object.keys(native)) {
      const tagList = native[tagFormat]
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
              const val = Array.isArray(t.value) ? t.value.map(String) : [String(t.value)]
              const clean = val.map((g) => resolveGenreString(g)).filter(Boolean) as string[]
              if (clean.length > 0) {
                common.genre = clean
                break
              }
            }
          }
        }
      }
      if (common.genre && common.genre.length > 0) break
    }
  } else {
    // Clean any numeric ID3 genres in common.genre
    common.genre = common.genre.map((g) => resolveGenreString(g) || g)
  }

  // 3. Year / Date enrichment (TYER, TDRC or Vorbis DATE / YEAR)
  if (!common.year && !common.date) {
    for (const tagFormat of Object.keys(native)) {
      const tagList = native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id).toUpperCase()
          if (
            tid === 'TYER' ||
            tid === 'TDRC' ||
            tid === 'DATE' ||
            tid === 'YEAR' ||
            tid === '©DAY'
          ) {
            if (t.value) {
              const strVal = String(t.value).trim()
              const yearMatch = strVal.match(/\b\d{4}\b/)
              if (yearMatch) {
                common.year = parseInt(yearMatch[0], 10)
              }
              common.date = strVal
              break
            }
          }
        }
      }
      if (common.year || common.date) break
    }
  }

  // 4. Track Number enrichment (TRCK or Vorbis TRACKNUMBER / TRACK)
  if (!common.track || common.track.no === null || common.track.no === undefined) {
    for (const tagFormat of Object.keys(native)) {
      const tagList = native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id).toUpperCase()
          if (tid === 'TRCK' || tid === 'TRACKNUMBER' || tid === 'TRACK' || tid === 'TRK') {
            if (t.value) {
              const strVal = String(t.value).trim()
              const match = strVal.match(/^(\d+)(?:\/(\d+))?/)
              if (match) {
                common.track = {
                  no: parseInt(match[1], 10),
                  of: match[2] ? parseInt(match[2], 10) : (common.track?.of ?? null)
                }
                break
              }
            }
          }
        }
      }
      if (common.track && common.track.no !== null && common.track.no !== undefined) break
    }
  }

  // 5. ReplayGain enrichment (REPLAYGAIN_TRACK_GAIN, REPLAYGAIN_ALBUM_GAIN)
  if (common.replayGainTrack === undefined || common.replayGainAlbum === undefined) {
    for (const tagFormat of Object.keys(native)) {
      const tagList = native[tagFormat]
      if (Array.isArray(tagList)) {
        for (const t of tagList) {
          const tid = String(t.id).toUpperCase()
          const valObj = t.value
          const valStr =
            typeof valObj === 'object' && valObj !== null && 'text' in valObj
              ? String((valObj as any).text)
              : String(valObj ?? '')
          const descStr =
            typeof valObj === 'object' && valObj !== null && 'description' in valObj
              ? String((valObj as any).description).toUpperCase()
              : ''

          if (
            tid === 'REPLAYGAIN_TRACK_GAIN' ||
            tid === 'TXXX:REPLAYGAIN_TRACK_GAIN' ||
            descStr === 'REPLAYGAIN_TRACK_GAIN' ||
            tid === 'RVA2:TRACK'
          ) {
            if (common.replayGainTrack === undefined) {
              const parsed = parseReplayGainValue(valStr)
              if (parsed !== undefined) common.replayGainTrack = parsed
            }
          } else if (
            tid === 'REPLAYGAIN_ALBUM_GAIN' ||
            tid === 'TXXX:REPLAYGAIN_ALBUM_GAIN' ||
            descStr === 'REPLAYGAIN_ALBUM_GAIN' ||
            tid === 'RVA2:ALBUM'
          ) {
            if (common.replayGainAlbum === undefined) {
              const parsed = parseReplayGainValue(valStr)
              if (parsed !== undefined) common.replayGainAlbum = parsed
            }
          }
        }
      }
    }
  }
}

/**
 * Fast Metadata Reader:
 * Reads metadata without streaming the entire audio file.
 * - For MP3: reads ID3v2 tag + first 32KB of audio frames (for MPEG sync and duration).
 * - For FLAC: reads fLaC magic + all metadata blocks (filtering PICTURE block if skipCovers is true).
 * - For DSF: reads DSD header + fmt chunk + ID3v2 tag at metadataPointer.
 * - For DFF: reads FRM8 chunks + PROP + ID3 chunk.
 * - Fallback: mm.parseFile with duration: false and skipCovers option.
 */
export async function fastReadMetadata(
  filePath: string,
  options?: { skipCovers?: boolean }
): Promise<mm.IAudioMetadata> {
  const ext = path.extname(filePath).toLowerCase()

  // 0. Raw CD-DA .bin image handler (44.1kHz, 16-bit stereo PCM)
  if (ext === '.bin') {
    try {
      const stat = await fs.promises.stat(filePath)
      const dur = Math.max(0, stat.size / 176400)
      return {
        format: {
          container: 'CD-DA (BIN)',
          codec: 'PCM',
          duration: dur,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitsPerSample: 16,
          bitrate: 1411200,
          lossless: true
        },
        common: {
          title: path.basename(filePath, ext),
          artist: 'Unknown Artist',
          album: path.basename(path.dirname(filePath)),
          genre: [],
          picture: []
        },
        native: {},
        quality: {}
      } as any
    } catch {}
  }

  // 1. MP3 Fast Reader
  if (ext === '.mp3') {
    try {
      const fd = await fs.promises.open(filePath, 'r')
      try {
        const stat = await fd.stat()
        const header = Buffer.alloc(10)
        const { bytesRead } = await fd.read(header, 0, 10, 0)
        if (bytesRead >= 10 && header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
          const tagSize =
            ((header[6] & 0x7f) << 21) |
            ((header[7] & 0x7f) << 14) |
            ((header[8] & 0x7f) << 7) |
            (header[9] & 0x7f)

          if (tagSize > 0 && tagSize <= 25 * 1024 * 1024) {
            const readLen = Math.min(stat.size, 10 + tagSize + 32 * 1024)
            const buf = Buffer.alloc(readLen)
            await fd.read(buf, 0, readLen, 0)
            const meta = await mm.parseBuffer(
              buf,
              { mimeType: 'audio/mpeg', size: stat.size },
              {
                skipCovers: options?.skipCovers,
                duration: true
              }
            )
            enrichCommonMetadata(meta)
            return meta
          }
        }
      } finally {
        await fd.close()
      }
    } catch {
      // fallback to parseFile
    }
  }

  // 2. FLAC Fast Reader
  if (ext === '.flac') {
    try {
      const fd = await fs.promises.open(filePath, 'r')
      try {
        const magic = Buffer.alloc(4)
        const { bytesRead } = await fd.read(magic, 0, 4, 0)
        if (bytesRead === 4 && magic.toString('utf-8') === 'fLaC') {
          let offset = 4
          let isLast = false
          const blockHeader = Buffer.alloc(4)
          const blocksToKeep: { offset: number; length: number; type: number }[] = []
          let skippedPictureBlock = false

          while (!isLast) {
            const readRes = await fd.read(blockHeader, 0, 4, offset)
            if (readRes.bytesRead < 4) break

            const headerByte = blockHeader[0]
            isLast = (headerByte & 0x80) !== 0
            const blockType = headerByte & 0x7f
            const blockLength = (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3]

            if (blockLength < 0 || blockLength > 30 * 1024 * 1024) break

            const isPictureBlock = blockType === 6
            if (isPictureBlock && options?.skipCovers) {
              skippedPictureBlock = true
            }

            const shouldKeep = !(options?.skipCovers && isPictureBlock)
            if (shouldKeep) {
              blocksToKeep.push({ offset, length: blockLength, type: blockType })
            }

            offset += 4 + blockLength
            if (offset > 50 * 1024 * 1024) break
          }

          if (blocksToKeep.length > 0) {
            const hasSkippedPicture = skippedPictureBlock
            let meta: mm.IAudioMetadata
            if (!hasSkippedPicture) {
              const metaBuf = Buffer.alloc(offset)
              await fd.read(metaBuf, 0, offset, 0)
              meta = await mm.parseBuffer(metaBuf, 'audio/flac', {
                skipCovers: options?.skipCovers,
                duration: true
              })
            } else {
              const chunks: Buffer[] = [Buffer.from('fLaC', 'utf-8')]
              for (let i = 0; i < blocksToKeep.length; i++) {
                const blk = blocksToKeep[i]
                const isActuallyLast = i === blocksToKeep.length - 1
                const blkBuf = Buffer.alloc(4 + blk.length)
                await fd.read(blkBuf, 0, 4 + blk.length, blk.offset)
                if (isActuallyLast) blkBuf[0] |= 0x80
                else blkBuf[0] &= 0x7f
                chunks.push(blkBuf)
              }
              const finalBuf = Buffer.concat(chunks)
              meta = await mm.parseBuffer(finalBuf, 'audio/flac', {
                skipCovers: options?.skipCovers,
                duration: true
              })
            }
            enrichCommonMetadata(meta)
            return meta
          }
        }
      } finally {
        await fd.close()
      }
    } catch {
      // fallback to parseFile
    }
  }

  // 3. DSF Fast Reader (Direct Seek to Header & ID3v2 metadataPointer)
  if (ext === '.dsf') {
    try {
      const fd = await fs.promises.open(filePath, 'r')
      try {
        const headerBuf = Buffer.alloc(80)
        const { bytesRead } = await fd.read(headerBuf, 0, 80, 0)
        if (bytesRead >= 80 && headerBuf.toString('ascii', 0, 4) === 'DSD ') {
          const metadataPointer = Number(headerBuf.readBigUInt64LE(20))
          const channelNum = headerBuf.readUInt32LE(52)
          const samplingFrequency = headerBuf.readUInt32LE(56)
          const bitsPerSample = headerBuf.readUInt32LE(60) || 1
          const sampleCount = headerBuf.readBigUInt64LE(64)
          const duration =
            samplingFrequency > 0 ? Number(sampleCount) / samplingFrequency : undefined
          const bitrate = bitsPerSample * samplingFrequency * channelNum

          let dsfMeta: mm.IAudioMetadata | null = null

          if (metadataPointer > 0) {
            const id3TagBuf = await readDsfId3v2TagBuffer(filePath)
            if (id3TagBuf) {
              dsfMeta = await mm.parseBuffer(id3TagBuf, 'audio/mpeg', {
                skipCovers: options?.skipCovers,
                duration: false
              })
            }
          }

          if (!dsfMeta) {
            dsfMeta = {
              format: {} as any,
              common: {
                title: path.basename(filePath, ext),
                artist: 'Unknown',
                album: 'Unknown'
              } as any,
              native: {},
              quality: {} as any
            }
          }

          const fmt = dsfMeta.format as any
          fmt.container = 'DSF'
          fmt.codec = 'DSD'
          fmt.lossless = true
          fmt.numberOfChannels = channelNum
          fmt.sampleRate = samplingFrequency
          fmt.bitsPerSample = bitsPerSample
          fmt.duration = duration
          fmt.bitrate = bitrate

          enrichCommonMetadata(dsfMeta)
          return dsfMeta
        }
      } finally {
        await fd.close()
      }
    } catch {
      // fallback to parseFile
    }
  }

  // 4. DFF (DSDIFF) Fast Reader
  if (ext === '.dff') {
    try {
      const id3Buf = await readDffId3v2TagBuffer(filePath)
      if (id3Buf) {
        const dffMeta = await mm.parseBuffer(id3Buf, 'audio/mpeg', {
          skipCovers: options?.skipCovers,
          duration: false
        })
        const fmt = dffMeta.format as any
        fmt.container = 'DSDIFF'
        fmt.codec = 'DSD'
        fmt.lossless = true
        fmt.bitsPerSample = 1
        fmt.sampleRate = fmt.sampleRate || 2822400
        enrichCommonMetadata(dffMeta)
        return dffMeta
      }
    } catch {
      // fallback to parseFile
    }
  }

  // 5. Fallback: parseFile with skipCovers and duration: false
  const meta = await mm.parseFile(filePath, {
    skipCovers: options?.skipCovers ?? false,
    duration: false
  })
  enrichCommonMetadata(meta)
  return meta
}

/**
 * Universal Fast Audio Metadata Extractor
 * Returns a strongly-typed `FastAudioMetadata` object including optional
 * `genre`, `year`, `trackNumber`, `albumArtist` extracted from ID3v2 frames
 * (TCON, TYER/TDRC, TRCK, TPE2) and Vorbis comments.
 */
export async function parseFastAudioMetadata(
  filePath: string,
  options?: { skipCovers?: boolean }
): Promise<FastAudioMetadata> {
  const meta = await fastReadMetadata(filePath, options)
  const common = meta.common
  const fmt = meta.format

  const ext = path.extname(filePath).toLowerCase()
  const isDsd = ext === '.dsf' || ext === '.dff' || ext === '.dsd'

  let genre: string | undefined = undefined
  if (common.genre && common.genre.length > 0) {
    genre = Array.isArray(common.genre) ? common.genre.join(', ') : String(common.genre)
  }

  let year: string | undefined = undefined
  if (common.year) {
    year = String(common.year)
  } else if (common.date) {
    year = String(common.date)
  }

  let trackNumber: string | undefined = undefined
  let totalTracks: string | undefined = undefined
  if (common.track) {
    if (common.track.no !== null && common.track.no !== undefined) {
      trackNumber = String(common.track.no)
    }
    if (common.track.of !== null && common.track.of !== undefined) {
      totalTracks = String(common.track.of)
    }
  }

  let discNumber: string | undefined = undefined
  let totalDiscs: string | undefined = undefined
  if (common.disk) {
    if (common.disk.no !== null && common.disk.no !== undefined) {
      discNumber = String(common.disk.no)
    }
    if (common.disk.of !== null && common.disk.of !== undefined) {
      totalDiscs = String(common.disk.of)
    }
  }

  const artist = common.artist || undefined
  const artists = common.artists || (artist ? splitArtistNames(artist) : undefined)
  const albumArtist = common.albumartist || undefined

  let cover: ExtractedCover | null = null
  if (!options?.skipCovers && common.picture && common.picture.length > 0) {
    const pic = common.picture[0]
    let format = pic.format || 'image/jpeg'
    if (!format.includes('/')) format = `image/${format}`
    cover = { data: Buffer.from(pic.data), format }
  }

  return {
    title: common.title || path.basename(filePath, ext),
    artist,
    artists,
    album: common.album || undefined,
    albumArtist,
    genre,
    year,
    trackNumber,
    totalTracks,
    discNumber,
    totalDiscs,
    comment: common.comment ? common.comment.join(' ') : undefined,
    composer: common.composer ? common.composer.join(', ') : undefined,
    lyrics:
      common.lyrics && common.lyrics.length > 0
        ? typeof common.lyrics[0] === 'string'
          ? common.lyrics[0]
          : (common.lyrics[0] as any).text
        : undefined,
    duration: fmt.duration,
    sampleRate: fmt.sampleRate || (isDsd ? 2822400 : undefined),
    bitsPerSample: fmt.bitsPerSample || (isDsd ? 1 : undefined),
    bitrate: fmt.bitrate,
    numberOfChannels: fmt.numberOfChannels,
    lossless: fmt.lossless || isDsd,
    format: fmt.container || ext.replace('.', '').toUpperCase(),
    codec: fmt.codec,
    cover,
    replayGainTrack: common.replayGainTrack,
    replayGainAlbum: common.replayGainAlbum,
    common: {
      replayGainTrack: common.replayGainTrack,
      replayGainAlbum: common.replayGainAlbum
    }
  }
}

/**
 * Finds a standard folder cover image inside a directory
 */
export function findFolderCoverImage(dirPath: string): string | null {
  const baseName = path.basename(dirPath)
  const commonNames = [
    'cover',
    'folder',
    'front',
    'artwork',
    baseName,
    'thumb',
    'thumbnail',
    'album'
  ]
  const possibleExts = ['.jpg', '.jpeg', '.png', '.webp']

  for (const name of commonNames) {
    for (const ext of possibleExts) {
      const candidate = path.join(dirPath, `${name}${ext}`)
      if (fs.existsSync(candidate)) return candidate
    }
  }

  // Check any image file in dir
  try {
    const entries = fs.readdirSync(dirPath)
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase()
      if (possibleExts.includes(ext)) {
        return path.join(dirPath, file)
      }
    }
  } catch {
    // ignore read error
  }

  return null
}
