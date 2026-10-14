import fs from 'fs'
import path from 'path'
import * as mm from 'music-metadata'

export interface ExtractedCover {
  data: Buffer
  format: string
}

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
        // Read moov into memory (usually < 2MB)
        const moovBuf = Buffer.alloc(atomSize)
        await fd.read(moovBuf, 0, atomSize, offset)
        // Search for 'covr' atom in moovBuf
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

      // Skip mdat or other atoms directly by adjusting offset (Seek, no read!)
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
 * Universal Fast Cover Extractor:
 * 1. Checks FLAC block-seeking
 * 2. Checks MP3 ID3v2 header-seeking
 * 3. Checks M4A atom-seeking
 * 4. Fallback: Partial stream read (Stream Abort) with 64KB chunks
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
 * Fast Metadata Reader:
 * Reads metadata without streaming the entire audio file.
 * - For MP3: reads ID3v2 tag + first 32KB of audio frames (for MPEG sync and duration).
 * - For FLAC: reads fLaC magic + all metadata blocks (filtering PICTURE block if skipCovers is true).
 * - For M4A: reads ftyp + moov atoms.
 * - Fallback: mm.parseFile with duration: false and skipCovers option.
 */
export async function fastReadMetadata(
  filePath: string,
  options?: { skipCovers?: boolean }
): Promise<mm.IAudioMetadata> {
  const ext = path.extname(filePath).toLowerCase()

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
            // Read tag + 32KB for MPEG audio frames
            const readLen = Math.min(stat.size, 10 + tagSize + 32 * 1024)
            const buf = Buffer.alloc(readLen)
            await fd.read(buf, 0, readLen, 0)
            return await mm.parseBuffer(
              buf,
              { mimeType: 'audio/mpeg', size: stat.size },
              {
                skipCovers: options?.skipCovers,
                duration: true
              }
            )
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

          while (!isLast) {
            const readRes = await fd.read(blockHeader, 0, 4, offset)
            if (readRes.bytesRead < 4) break

            const headerByte = blockHeader[0]
            isLast = (headerByte & 0x80) !== 0
            const blockType = headerByte & 0x7f
            const blockLength = (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3]

            if (blockLength < 0 || blockLength > 30 * 1024 * 1024) break

            const shouldKeep = !(options?.skipCovers && blockType === 6)
            if (shouldKeep) {
              blocksToKeep.push({ offset, length: blockLength, type: blockType })
            }

            offset += 4 + blockLength
            if (offset > 50 * 1024 * 1024) break
          }

          if (blocksToKeep.length > 0) {
            const hasSkippedPicture =
              blocksToKeep.length < (isLast ? blocksToKeep.length : 0) || options?.skipCovers
            if (!hasSkippedPicture) {
              const metaBuf = Buffer.alloc(offset)
              await fd.read(metaBuf, 0, offset, 0)
              return await mm.parseBuffer(metaBuf, 'audio/flac', {
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
              return await mm.parseBuffer(finalBuf, 'audio/flac', {
                skipCovers: options?.skipCovers,
                duration: true
              })
            }
          }
        }
      } finally {
        await fd.close()
      }
    } catch {
      // fallback to parseFile
    }
  }

  // 3. Fallback: parseFile with skipCovers and duration: false
  return await mm.parseFile(filePath, {
    skipCovers: options?.skipCovers ?? false,
    duration: false
  })
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
