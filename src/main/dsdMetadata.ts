import fs from 'fs'
import path from 'path'
import NodeID3 from 'node-id3'

export interface DsdTagUpdate {
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  albumArtist?: string
  genre?: string
  year?: string
  date?: string
  trackNumber?: string
  discNumber?: string
  lyrics?: string
  picture?: {
    data: Buffer
    mimeType: string
    description?: string
  } | null
}

export interface DsdTags {
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  albumArtist?: string
  genre?: string
  year?: string
  date?: string
  trackNumber?: string
  discNumber?: string
  lyrics?: string
  picture?: {
    data: Buffer
    mimeType: string
    description?: string
  }
  raw?: any
}

/**
 * Chuyển đổi và hợp nhất các trường cập nhật với thẻ ID3 hiện có
 */
function mergeId3Tags(existingTags: any, updates: DsdTagUpdate): Buffer {
  const merged: any = { ...(existingTags || {}) }
  delete merged.raw // Xóa raw để các trường cập nhật/xóa có hiệu lực hoàn toàn

  if (updates.title !== undefined) {
    if (updates.title.trim()) merged.title = updates.title.trim()
    else delete merged.title
  }

  if (updates.artists && updates.artists.length > 0) {
    merged.artist = updates.artists.map((a) => a.trim()).filter(Boolean).join(', ')
  } else if (updates.artist !== undefined) {
    if (updates.artist.trim()) merged.artist = updates.artist.trim()
    else delete merged.artist
  }

  if (updates.album !== undefined) {
    if (updates.album.trim()) merged.album = updates.album.trim()
    else delete merged.album
  }

  if (updates.albumArtist !== undefined) {
    if (updates.albumArtist.trim()) merged.performerInfo = updates.albumArtist.trim()
    else delete merged.performerInfo
  }

  if (updates.genre !== undefined) {
    if (updates.genre.trim()) merged.genre = updates.genre.trim()
    else delete merged.genre
  }

  const yearVal = updates.year ?? updates.date
  if (yearVal !== undefined) {
    if (yearVal.trim()) {
      merged.year = yearVal.trim()
      merged.date = yearVal.trim()
    } else {
      delete merged.year
      delete merged.date
    }
  }

  if (updates.trackNumber !== undefined) {
    if (updates.trackNumber.trim()) merged.trackNumber = updates.trackNumber.trim()
    else delete merged.trackNumber
  }

  if (updates.discNumber !== undefined) {
    if (updates.discNumber.trim()) merged.partOfSet = updates.discNumber.trim()
    else delete merged.partOfSet
  }

  if (updates.lyrics !== undefined) {
    if (updates.lyrics.trim()) {
      merged.unsynchronisedLyrics = {
        language: 'eng',
        text: updates.lyrics.trim()
      }
    } else {
      delete merged.unsynchronisedLyrics
    }
  }

  if (updates.picture !== undefined) {
    if (updates.picture && updates.picture.data && updates.picture.data.length > 0) {
      merged.image = {
        mime: updates.picture.mimeType || 'image/jpeg',
        type: { id: 3, name: 'front cover' },
        description: updates.picture.description || '',
        imageBuffer: updates.picture.data
      }
    } else {
      delete merged.image
    }
  }

  const buf = NodeID3.create(merged)
  if (!Buffer.isBuffer(buf)) {
    throw new Error('NodeID3 không thể tạo ID3 buffer hợp lệ')
  }
  return buf
}

/**
 * Chuyển đổi dữ liệu thẻ từ NodeID3 sang DsdTags tiêu chuẩn
 */
function parseNodeId3ToDsdTags(id3: any): DsdTags {
  let picture: DsdTags['picture'] | undefined = undefined
  if (id3.image && id3.image.imageBuffer) {
    picture = {
      data: Buffer.from(id3.image.imageBuffer),
      mimeType: id3.image.mime || 'image/jpeg',
      description: id3.image.description
    }
  }

  let lyrics: string | undefined = undefined
  if (id3.unsynchronisedLyrics) {
    if (typeof id3.unsynchronisedLyrics === 'string') {
      lyrics = id3.unsynchronisedLyrics
    } else if (typeof id3.unsynchronisedLyrics === 'object' && id3.unsynchronisedLyrics.text) {
      lyrics = id3.unsynchronisedLyrics.text
    }
  }

  const artist: string | undefined = id3.artist || undefined
  let artists: string[] = []
  if (artist) {
    artists = artist
      .split(/[,;&/]|(?:\s+(?:feat\.|ft\.|&)\s+)/i)
      .map((s: string) => s.trim())
      .filter(Boolean)
  }

  return {
    title: id3.title || undefined,
    artist,
    artists: artists.length > 0 ? artists : undefined,
    album: id3.album || undefined,
    albumArtist: id3.performerInfo || undefined,
    genre: id3.genre || undefined,
    year: id3.year || id3.date || undefined,
    date: id3.date || id3.year || undefined,
    trackNumber: id3.trackNumber || undefined,
    discNumber: id3.partOfSet || undefined,
    lyrics,
    picture,
    raw: id3
  }
}

/**
 * Cập nhật Metadata cho tệp .dsf (DSD Stream File)
 * Header 28 bytes:
 * - Bytes 0..3: 'DSD '
 * - Bytes 4..11: uint64LE (28)
 * - Bytes 12..19: uint64LE totalFileSize
 * - Bytes 20..27: uint64LE metadataOffset
 * ID3v2 tag chunk nằm ở cuối tệp. 0 byte dữ liệu âm thanh bị đọc/sao chép!
 */
export function updateDsfTags(filePath: string, updates: DsdTagUpdate): boolean {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r+')
    const stat = fs.fstatSync(fd)
    const fileSize = stat.size

    if (fileSize < 28) return false

    const header = Buffer.alloc(28)
    fs.readSync(fd, header, 0, 28, 0)

    if (header.toString('ascii', 0, 4) !== 'DSD ') {
      return false
    }

    const metadataOffset = header.readBigUInt64LE(20)

    let existingTags: any = {}
    if (metadataOffset > 0n && metadataOffset < BigInt(fileSize)) {
      const id3Len = fileSize - Number(metadataOffset)
      if (id3Len >= 10) {
        const id3Buf = Buffer.alloc(id3Len)
        fs.readSync(fd, id3Buf, 0, id3Len, Number(metadataOffset))
        if (id3Buf.toString('ascii', 0, 3) === 'ID3') {
          existingTags = NodeID3.read(id3Buf) || {}
        }
      }
    }

    const newId3Buf = mergeId3Tags(existingTags, updates)

    const writeOffset =
      metadataOffset > 0n && metadataOffset <= BigInt(fileSize) ? Number(metadataOffset) : fileSize

    // 1. Cắt bỏ ID3 tag cũ nếu có
    fs.ftruncateSync(fd, writeOffset)

    // 2. Ghi ID3 tag mới tại writeOffset
    fs.writeSync(fd, newId3Buf, 0, newId3Buf.length, writeOffset)

    // 3. Cập nhật 28-byte header ở đầu file:
    // Bytes 12..19: totalFileSize = writeOffset + newId3Buf.length
    // Bytes 20..27: metadataOffset = writeOffset
    const newTotalFileSize = BigInt(writeOffset + newId3Buf.length)
    const newMetadataOffset = BigInt(writeOffset)

    const updateBuf = Buffer.alloc(16)
    updateBuf.writeBigUInt64LE(newTotalFileSize, 0)
    updateBuf.writeBigUInt64LE(newMetadataOffset, 8)
    fs.writeSync(fd, updateBuf, 0, 16, 12)

    return true
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }
}

/**
 * Đọc Metadata từ tệp .dsf
 */
export function readDsfTags(filePath: string): DsdTags | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const stat = fs.fstatSync(fd)
    const fileSize = stat.size
    if (fileSize < 28) return null

    const header = Buffer.alloc(28)
    fs.readSync(fd, header, 0, 28, 0)
    if (header.toString('ascii', 0, 4) !== 'DSD ') return null

    const metadataOffset = header.readBigUInt64LE(20)
    if (metadataOffset === 0n || metadataOffset >= BigInt(fileSize)) {
      return null
    }

    const id3Len = fileSize - Number(metadataOffset)
    if (id3Len < 10) return null

    const id3Buf = Buffer.alloc(id3Len)
    fs.readSync(fd, id3Buf, 0, id3Len, Number(metadataOffset))

    if (id3Buf.toString('ascii', 0, 3) !== 'ID3') return null

    const id3 = NodeID3.read(id3Buf)
    if (!id3) return null

    return parseNodeId3ToDsdTags(id3)
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }
}

/**
 * Cập nhật Metadata cho tệp .dff (DSDIFF FRM8 File)
 * Chunks bên trong FRM8:
 * - 4 bytes chunkId + 8 bytes uint64BE chunkSize + padded data
 * Nếu ID3 chunk ở cuối file hoặc chưa có: ghi in-place/append không chạm đến dữ liệu âm thanh!
 * Nếu ID3 chunk ở giữa file: copy temp với chunks 256KB loại bỏ ID3 cũ và chuyển ra cuối file.
 */
export function updateDffTags(filePath: string, updates: DsdTagUpdate): boolean {
  let fd: number | null = null
  let tempPath: string | null = null

  try {
    fd = fs.openSync(filePath, 'r+')
    const stat = fs.fstatSync(fd)
    const fileSize = stat.size

    if (fileSize < 16) return false

    const header = Buffer.alloc(16)
    fs.readSync(fd, header, 0, 16, 0)

    if (header.toString('ascii', 0, 4) !== 'FRM8' || header.toString('ascii', 12, 16) !== 'DSD ') {
      return false
    }

    // Duyệt qua các chunk cấp 1 bắt đầu từ byte 16
    let chunkOffset = 16n
    const fileSizeBig = BigInt(fileSize)
    const chunkHdr = Buffer.alloc(12)

    let foundId3: { offset: bigint; size: bigint; paddedSize: bigint } | null = null
    let foundProp: { offset: bigint; size: bigint } | null = null

    while (chunkOffset + 12n <= fileSizeBig) {
      const bytesRead = fs.readSync(fd, chunkHdr, 0, 12, Number(chunkOffset))
      if (bytesRead < 12) break

      const chunkId = chunkHdr.toString('ascii', 0, 4)
      const chunkSize = chunkHdr.readBigUInt64BE(4)
      const paddedSize = chunkSize % 2n !== 0n ? chunkSize + 1n : chunkSize

      if (chunkId === 'ID3 ') {
        foundId3 = { offset: chunkOffset, size: chunkSize, paddedSize }
      } else if (chunkId === 'PROP') {
        foundProp = { offset: chunkOffset, size: chunkSize }
      }

      chunkOffset += 12n + paddedSize
    }

    // Đọc thẻ ID3 hiện có nếu tìm thấy
    let existingTags: any = {}
    if (foundId3 && foundId3.size > 0n) {
      const id3DataBuf = Buffer.alloc(Number(foundId3.size))
      fs.readSync(fd, id3DataBuf, 0, Number(foundId3.size), Number(foundId3.offset + 12n))
      if (id3DataBuf.toString('ascii', 0, 3) === 'ID3') {
        existingTags = NodeID3.read(id3DataBuf) || {}
      }
    } else if (foundProp) {
      // Tìm subchunk ID3 bên trong PROP nếu có
      try {
        const propDataOffset = foundProp.offset + 12n
        let subOffset = propDataOffset + 4n // Bỏ qua 4 bytes propType 'SND '
        const propEnd = propDataOffset + foundProp.size
        const subHdr = Buffer.alloc(12)
        while (subOffset + 12n <= propEnd) {
          fs.readSync(fd, subHdr, 0, 12, Number(subOffset))
          const subId = subHdr.toString('ascii', 0, 4)
          const subSize = subHdr.readBigUInt64BE(4)
          const subPadded = subSize % 2n !== 0n ? subSize + 1n : subSize
          if (subId === 'ID3 ') {
            const id3DataBuf = Buffer.alloc(Number(subSize))
            fs.readSync(fd, id3DataBuf, 0, Number(subSize), Number(subOffset + 12n))
            if (id3DataBuf.toString('ascii', 0, 3) === 'ID3') {
              existingTags = NodeID3.read(id3DataBuf) || {}
            }
            break
          }
          subOffset += 12n + subPadded
        }
      } catch {}
    }

    const newId3Buf = mergeId3Tags(existingTags, updates)
    const isOdd = newId3Buf.length % 2 !== 0
    const newId3ChunkSize = 12 + newId3Buf.length + (isOdd ? 1 : 0)

    const id3ChunkHdr = Buffer.alloc(12)
    id3ChunkHdr.write('ID3 ', 0, 4, 'ascii')
    id3ChunkHdr.writeBigUInt64BE(BigInt(newId3Buf.length), 4)

    // Kiểm tra xem ID3 chunk có ở cuối file không
    const isId3AtEof = foundId3 ? foundId3.offset + 12n + foundId3.paddedSize >= fileSizeBig : false

    // Fast Path DFF: Chưa có ID3 chunk hoặc ID3 chunk ở cuối file
    if (!foundId3 || isId3AtEof) {
      const writeOffset = foundId3 ? Number(foundId3.offset) : fileSize

      // Cắt bỏ ID3 cũ nếu có
      fs.ftruncateSync(fd, writeOffset)

      // Ghi chunk ID3 mới
      fs.writeSync(fd, id3ChunkHdr, 0, 12, writeOffset)
      fs.writeSync(fd, newId3Buf, 0, newId3Buf.length, writeOffset + 12)
      if (isOdd) {
        fs.writeSync(fd, Buffer.from([0]), 0, 1, writeOffset + 12 + newId3Buf.length)
      }

      const newFileSize = writeOffset + newId3ChunkSize

      // Cập nhật FRM8 data size ở bytes 4..11: BigInt(newFileSize - 12)
      const sizeBuf = Buffer.alloc(8)
      sizeBuf.writeBigUInt64BE(BigInt(newFileSize - 12), 0)
      fs.writeSync(fd, sizeBuf, 0, 8, 4)

      return true
    }

    // Slow Path DFF: ID3 chunk nằm ở giữa file
    tempPath = `${filePath}.tmp_${Date.now()}`
    const dstFd = fs.openSync(tempPath, 'w')

    try {
      const CHUNK_SIZE = 256 * 1024
      const chunkBuf = Buffer.alloc(CHUNK_SIZE)

      // 1. Sao chép đoạn trước ID3 cũ
      const beforeId3Len = Number(foundId3.offset)
      let copied = 0
      while (copied < beforeId3Len) {
        const toRead = Math.min(CHUNK_SIZE, beforeId3Len - copied)
        const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, copied)
        if (bytesRead <= 0) break
        fs.writeSync(dstFd, chunkBuf, 0, bytesRead)
        copied += bytesRead
      }

      // 2. Sao chép đoạn sau ID3 cũ đến EOF
      const afterId3Start = Number(foundId3.offset + 12n + foundId3.paddedSize)
      copied = afterId3Start
      while (copied < fileSize) {
        const toRead = Math.min(CHUNK_SIZE, fileSize - copied)
        const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, copied)
        if (bytesRead <= 0) break
        fs.writeSync(dstFd, chunkBuf, 0, bytesRead)
        copied += bytesRead
      }

      // 3. Ghi ID3 chunk mới ở cuối file
      fs.writeSync(dstFd, id3ChunkHdr, 0, 12)
      fs.writeSync(dstFd, newId3Buf, 0, newId3Buf.length)
      if (isOdd) {
        fs.writeSync(dstFd, Buffer.from([0]), 0, 1)
      }

      const newFileSize = fs.fstatSync(dstFd).size

      // 4. Cập nhật FRM8 data size ở bytes 4..11
      const sizeBuf = Buffer.alloc(8)
      sizeBuf.writeBigUInt64BE(BigInt(newFileSize - 12), 0)
      fs.writeSync(dstFd, sizeBuf, 0, 8, 4)

      fs.closeSync(dstFd)
      fs.closeSync(fd)
      fd = null

      const finalTempPath = tempPath
      let renamed = false
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(finalTempPath, filePath)
          renamed = true
          tempPath = null
          break
        } catch {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
        }
      }

      if (!renamed) {
        fs.renameSync(finalTempPath, filePath)
        tempPath = null
      }

      return true
    } catch {
      try {
        fs.closeSync(dstFd)
      } catch {}
      return false
    }
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath)
      } catch {}
    }
  }
}

/**
 * Đọc Metadata từ tệp .dff
 */
export function readDffTags(filePath: string): DsdTags | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const stat = fs.fstatSync(fd)
    const fileSize = stat.size
    if (fileSize < 16) return null

    const header = Buffer.alloc(16)
    fs.readSync(fd, header, 0, 16, 0)
    if (header.toString('ascii', 0, 4) !== 'FRM8' || header.toString('ascii', 12, 16) !== 'DSD ') {
      return null
    }

    let chunkOffset = 16n
    const fileSizeBig = BigInt(fileSize)
    const chunkHdr = Buffer.alloc(12)
    let foundProp: { offset: bigint; size: bigint } | null = null

    while (chunkOffset + 12n <= fileSizeBig) {
      const bytesRead = fs.readSync(fd, chunkHdr, 0, 12, Number(chunkOffset))
      if (bytesRead < 12) break

      const chunkId = chunkHdr.toString('ascii', 0, 4)
      const chunkSize = chunkHdr.readBigUInt64BE(4)
      const paddedSize = chunkSize % 2n !== 0n ? chunkSize + 1n : chunkSize

      if (chunkId === 'ID3 ') {
        if (chunkSize >= 10n) {
          const id3Buf = Buffer.alloc(Number(chunkSize))
          fs.readSync(fd, id3Buf, 0, Number(chunkSize), Number(chunkOffset + 12n))
          if (id3Buf.toString('ascii', 0, 3) === 'ID3') {
            const id3 = NodeID3.read(id3Buf)
            if (id3) return parseNodeId3ToDsdTags(id3)
          }
        }
      } else if (chunkId === 'PROP') {
        foundProp = { offset: chunkOffset, size: chunkSize }
      }

      chunkOffset += 12n + paddedSize
    }

    if (foundProp) {
      try {
        const propDataOffset = foundProp.offset + 12n
        let subOffset = propDataOffset + 4n // Bỏ qua 4 bytes propType 'SND '
        const propEnd = propDataOffset + foundProp.size
        const subHdr = Buffer.alloc(12)
        while (subOffset + 12n <= propEnd) {
          fs.readSync(fd, subHdr, 0, 12, Number(subOffset))
          const subId = subHdr.toString('ascii', 0, 4)
          const subSize = subHdr.readBigUInt64BE(4)
          const subPadded = subSize % 2n !== 0n ? subSize + 1n : subSize
          if (subId === 'ID3 ' && subSize >= 10n) {
            const id3Buf = Buffer.alloc(Number(subSize))
            fs.readSync(fd, id3Buf, 0, Number(subSize), Number(subOffset + 12n))
            if (id3Buf.toString('ascii', 0, 3) === 'ID3') {
              const id3 = NodeID3.read(id3Buf)
              if (id3) return parseNodeId3ToDsdTags(id3)
            }
          }
          subOffset += 12n + subPadded
        }
      } catch {}
    }

    return null
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }
}

/**
 * Universal DSD Metadata Updater
 * Tự động phân loại định dạng (.dsf hoặc .dff) và ghi thẻ ID3v2 nhanh chóng.
 * Trả về true nếu thành công, false nếu thất bại.
 */
export function updateDsdTags(filePath: string, updates: DsdTagUpdate): boolean {
  if (!fs.existsSync(filePath)) return false
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.dsf') {
    return updateDsfTags(filePath, updates)
  }
  if (ext === '.dff') {
    return updateDffTags(filePath, updates)
  }

  // Tự động nhận diện qua file header
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const magicBuf = Buffer.alloc(4)
    fs.readSync(fd, magicBuf, 0, 4, 0)
    fs.closeSync(fd)
    fd = null

    const magic = magicBuf.toString('ascii')
    if (magic === 'DSD ') {
      return updateDsfTags(filePath, updates)
    }
    if (magic === 'FRM8') {
      return updateDffTags(filePath, updates)
    }
  } catch {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }

  return false
}

/**
 * Universal DSD Metadata Reader
 * Đọc toàn bộ các trường ID3v2 mở rộng (genre, year, trackNumber, discNumber, albumArtist, lyrics, picture)
 * từ cả .dsf và .dff mà KHÔNG nạp luồng âm thanh vào RAM.
 */
export function readDsdTags(filePath: string): DsdTags | null {
  if (!fs.existsSync(filePath)) return null
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.dsf') {
    return readDsfTags(filePath)
  }
  if (ext === '.dff') {
    return readDffTags(filePath)
  }

  // Tự động nhận diện qua file header
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const magicBuf = Buffer.alloc(4)
    fs.readSync(fd, magicBuf, 0, 4, 0)
    fs.closeSync(fd)
    fd = null

    const magic = magicBuf.toString('ascii')
    if (magic === 'DSD ') {
      return readDsfTags(filePath)
    }
    if (magic === 'FRM8') {
      return readDffTags(filePath)
    }
  } catch {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }

  return null
}
