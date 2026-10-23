import fs from 'fs'
import path from 'path'
import { nativeImage } from 'electron'

export interface FlacTagUpdate {
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

export type FlacTags = FlacTagUpdate

export interface FlacBlock {
  isLast: boolean
  type: number
  data: Buffer
}

export interface FlacParsedMetadata {
  blocks: FlacBlock[]
  audioDataOffset: number
}

/**
 * Đọc cấu trúc các block Metadata FLAC từ byte 4 đến audioDataOffset
 * KHÔNG đọc dữ liệu âm thanh vào RAM!
 */
export function parseFlacMetadataBlocks(fd: number): FlacParsedMetadata {
  const magic = Buffer.alloc(4)
  const bytesRead = fs.readSync(fd, magic, 0, 4, 0)
  if (bytesRead < 4 || magic.toString('utf-8') !== 'fLaC') {
    throw new Error('Không phải tệp định dạng FLAC hợp lệ (thiếu magic fLaC header)')
  }

  const blocks: FlacBlock[] = []
  let offset = 4
  let isLast = false
  const headerBuf = Buffer.alloc(4)

  while (!isLast) {
    const hdrRead = fs.readSync(fd, headerBuf, 0, 4, offset)
    if (hdrRead < 4) {
      throw new Error('Dữ liệu block metadata FLAC bị cắt ngắn hoặc không hợp lệ')
    }

    const headerByte = headerBuf[0]
    isLast = (headerByte & 0x80) !== 0
    const type = headerByte & 0x7f
    const length = (headerBuf[1] << 16) | (headerBuf[2] << 8) | headerBuf[3]
    offset += 4

    if (length < 0 || length > 64 * 1024 * 1024) {
      throw new Error(`Kích thước block metadata FLAC không hợp lệ: ${length}`)
    }

    const data = Buffer.alloc(length)
    if (length > 0) {
      const dataRead = fs.readSync(fd, data, 0, length, offset)
      if (dataRead < length) {
        throw new Error('Dữ liệu block metadata FLAC bị thiếu hoặc đọc lỗi')
      }
    }

    blocks.push({ isLast, type, data })
    offset += length
  }

  return {
    blocks,
    audioDataOffset: offset
  }
}

/**
 * Trích xuất Vorbis Comments và Vendor string từ block Vorbis Comment
 */
export function extractExistingComments(blockData: Buffer): { vendor: string; comments: string[] } {
  try {
    if (blockData.length < 8) return { vendor: '', comments: [] }
    let pos = 0
    const vendorLen = blockData.readUInt32LE(pos)
    pos += 4
    if (pos + vendorLen > blockData.length) return { vendor: '', comments: [] }
    const vendor = blockData.toString('utf-8', pos, pos + vendorLen)
    pos += vendorLen

    if (pos + 4 > blockData.length) return { vendor, comments: [] }
    const count = blockData.readUInt32LE(pos)
    pos += 4

    const comments: string[] = []
    for (let i = 0; i < count; i++) {
      if (pos + 4 > blockData.length) break
      const cLen = blockData.readUInt32LE(pos)
      pos += 4
      if (pos + cLen > blockData.length) break
      const commentStr = blockData.toString('utf-8', pos, pos + cLen)
      comments.push(commentStr)
      pos += cLen
    }
    return { vendor, comments }
  } catch {
    return { vendor: '', comments: [] }
  }
}

/**
 * Tạo block VORBIS_COMMENT cho FLAC
 * Bảo toàn các thẻ không bị chỉnh sửa (REPLAYGAIN, COMPOSER, BPM,...)
 */
export function createVorbisCommentBlock(
  tags: FlacTagUpdate,
  existingComments: string[] = [],
  existingVendor?: string
): Buffer {
  const vendorString = existingVendor || 'Meis Radio Audio Engine'
  const vendorBuf = Buffer.from(vendorString, 'utf-8')

  const keysToRemove = new Set<string>()

  const isUpdatingArtist =
    tags.artist !== undefined || (Array.isArray(tags.artists) && tags.artists.length > 0)
  if (isUpdatingArtist) {
    keysToRemove.add('ARTIST')
    keysToRemove.add('ARTISTS')
  }
  if (tags.title !== undefined) keysToRemove.add('TITLE')
  if (tags.album !== undefined) keysToRemove.add('ALBUM')
  if (tags.albumArtist !== undefined) {
    keysToRemove.add('ALBUMARTIST')
    keysToRemove.add('ALBUM ARTIST')
  }
  if (tags.genre !== undefined) keysToRemove.add('GENRE')
  if (tags.year !== undefined || tags.date !== undefined) {
    keysToRemove.add('DATE')
    keysToRemove.add('YEAR')
  }
  if (tags.trackNumber !== undefined) {
    keysToRemove.add('TRACKNUMBER')
    keysToRemove.add('TRACK')
  }
  if (tags.discNumber !== undefined) {
    keysToRemove.add('DISCNUMBER')
    keysToRemove.add('DISC')
  }
  if (tags.lyrics !== undefined) {
    keysToRemove.add('LYRICS')
    keysToRemove.add('UNSYNCEDLYRICS')
  }

  // Giữ lại các comment hiện có không bị ghi đè
  const retainedComments = existingComments.filter((c) => {
    const eqIdx = c.indexOf('=')
    if (eqIdx === -1) return true
    const key = c.substring(0, eqIdx).toUpperCase().trim()
    return !keysToRemove.has(key)
  })

  const newComments: string[] = []

  if (tags.title !== undefined && tags.title.trim()) {
    newComments.push(`TITLE=${tags.title.trim()}`)
  }
  if (tags.album !== undefined && tags.album.trim()) {
    newComments.push(`ALBUM=${tags.album.trim()}`)
  }
  if (tags.albumArtist !== undefined && tags.albumArtist.trim()) {
    newComments.push(`ALBUMARTIST=${tags.albumArtist.trim()}`)
  }
  if (tags.genre !== undefined && tags.genre.trim()) {
    newComments.push(`GENRE=${tags.genre.trim()}`)
  }
  const yearVal = tags.year ?? tags.date
  if (yearVal !== undefined && yearVal.trim()) {
    newComments.push(`DATE=${yearVal.trim()}`)
    newComments.push(`YEAR=${yearVal.trim()}`)
  }
  if (tags.trackNumber !== undefined && tags.trackNumber.trim()) {
    newComments.push(`TRACKNUMBER=${tags.trackNumber.trim()}`)
  }
  if (tags.discNumber !== undefined && tags.discNumber.trim()) {
    newComments.push(`DISCNUMBER=${tags.discNumber.trim()}`)
  }
  if (tags.lyrics !== undefined && tags.lyrics.trim()) {
    newComments.push(`LYRICS=${tags.lyrics.trim()}`)
    newComments.push(`UNSYNCEDLYRICS=${tags.lyrics.trim()}`)
  }

  // Thêm các thẻ ARTIST độc lập cho từng nghệ sĩ (Chuẩn Vorbis Comment đa nghệ sĩ)
  if (isUpdatingArtist) {
    const artistList =
      Array.isArray(tags.artists) && tags.artists.length > 0
        ? tags.artists.map((a) => a.trim()).filter(Boolean)
        : tags.artist && tags.artist.trim()
          ? [tags.artist.trim()]
          : []

    for (const a of artistList) {
      newComments.push(`ARTIST=${a}`)
    }
    if (artistList.length > 1) {
      newComments.push(`ARTISTS=${artistList.join(', ')}`)
    }
  }

  const finalComments = [...retainedComments, ...newComments]

  // Tính toán kích thước buffer Vorbis Comment
  let totalSize = 4 + vendorBuf.length + 4
  const encodedComments: Buffer[] = []
  for (const c of finalComments) {
    const cBuf = Buffer.from(c, 'utf-8')
    encodedComments.push(cBuf)
    totalSize += 4 + cBuf.length
  }

  const result = Buffer.alloc(totalSize)
  let pos = 0

  // 1. Vendor string
  result.writeUInt32LE(vendorBuf.length, pos)
  pos += 4
  vendorBuf.copy(result, pos)
  pos += vendorBuf.length

  // 2. User comments count
  result.writeUInt32LE(encodedComments.length, pos)
  pos += 4

  // 3. User comments
  for (const cBuf of encodedComments) {
    result.writeUInt32LE(cBuf.length, pos)
    pos += 4
    cBuf.copy(result, pos)
    pos += cBuf.length
  }

  return result
}

/**
 * Tạo block PICTURE cho FLAC
 */
export function createPictureBlock(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg',
  description: string = ''
): Buffer {
  let width = 0
  let height = 0
  const colorDepth = 24

  try {
    if (nativeImage && typeof nativeImage.createFromBuffer === 'function') {
      const nImg = nativeImage.createFromBuffer(imageBuffer)
      const size = nImg.getSize()
      width = size.width || 0
      height = size.height || 0
    }
  } catch {}

  const mimeBuf = Buffer.from(mimeType, 'utf-8')
  const descBuf = Buffer.from(description, 'utf-8')

  const totalSize =
    4 + 4 + mimeBuf.length + 4 + descBuf.length + 4 + 4 + 4 + 4 + 4 + imageBuffer.length
  const result = Buffer.alloc(totalSize)
  let pos = 0

  // 1. Picture Type: 3 = Cover (front)
  result.writeUInt32BE(3, pos)
  pos += 4

  // 2. MIME type length & MIME string
  result.writeUInt32BE(mimeBuf.length, pos)
  pos += 4
  mimeBuf.copy(result, pos)
  pos += mimeBuf.length

  // 3. Description length & Description
  result.writeUInt32BE(descBuf.length, pos)
  pos += 4
  descBuf.copy(result, pos)
  pos += descBuf.length

  // 4. Width
  result.writeUInt32BE(width, pos)
  pos += 4

  // 5. Height
  result.writeUInt32BE(height, pos)
  pos += 4

  // 6. Color depth
  result.writeUInt32BE(colorDepth, pos)
  pos += 4

  // 7. Color index count (0)
  result.writeUInt32BE(0, pos)
  pos += 4

  // 8. Picture data length & binary data
  result.writeUInt32BE(imageBuffer.length, pos)
  pos += 4
  imageBuffer.copy(result, pos)

  return result
}

/**
 * Cập nhật Metadata FLAC với hỗ trợ Fast Path (In-place ghi đè khi có đủ padding)
 * và Slow Path (Stream 256KB copy an toàn khi cần mở rộng padding).
 * KHÔNG BAO GIỜ nạp toàn bộ file âm thanh vào bộ nhớ RAM!
 */
export function updateFlacTags(
  filePath: string,
  tags: FlacTagUpdate
): { success: boolean; error?: string } {
  let fd: number | null = null
  let tempPath: string | null = null

  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Tệp FLAC không tồn tại' }
    }

    fd = fs.openSync(filePath, 'r+')
    const { blocks: originalBlocks, audioDataOffset } = parseFlacMetadataBlocks(fd)

    // 1. Trích xuất Vorbis comments và vendor cũ
    let existingComments: string[] = []
    let existingVendor = ''
    for (const b of originalBlocks) {
      if (b.type === 4) {
        const parsed = extractExistingComments(b.data)
        existingComments = parsed.comments
        existingVendor = parsed.vendor
        break
      }
    }

    // 2. Tạo block VORBIS_COMMENT mới
    const newVorbisData = createVorbisCommentBlock(tags, existingComments, existingVendor)
    const newVorbisBlock: FlacBlock = { isLast: false, type: 4, data: newVorbisData }

    // 3. Xử lý block PICTURE
    let newPictureBlock: FlacBlock | null = null
    if (tags.picture !== undefined) {
      if (tags.picture && tags.picture.data && tags.picture.data.length > 0) {
        const picData = createPictureBlock(
          tags.picture.data,
          tags.picture.mimeType || 'image/jpeg',
          tags.picture.description || ''
        )
        newPictureBlock = { isLast: false, type: 6, data: picData }
      }
      // Nếu tags.picture === null, giữ newPictureBlock = null để xóa ảnh bìa
    }

    // 4. Lọc các block hiện có:
    // - STREAMINFO (type 0): luôn giữ nguyên vị trí đầu tiên
    // - PADDING (type 1): loại bỏ vì sẽ được tái tính toán
    // - VORBIS_COMMENT (type 4): thay thế bằng newVorbisBlock
    // - PICTURE (type 6): nếu có cập nhật ảnh bìa thì bỏ block ảnh cũ, ngược lại giữ nguyên
    const streamInfo = originalBlocks.find((b) => b.type === 0)
    if (!streamInfo) {
      throw new Error('Không tìm thấy block STREAMINFO bắt buộc của FLAC')
    }

    const otherBlocks: FlacBlock[] = []
    for (const b of originalBlocks) {
      if (b.type === 0 || b.type === 1 || b.type === 4) {
        continue
      }
      if (b.type === 6 && tags.picture !== undefined) {
        continue
      }
      otherBlocks.push({ isLast: false, type: b.type, data: b.data })
    }

    // 5. Tập hợp các block cần ghi
    const assembledBlocks: FlacBlock[] = [
      { isLast: false, type: 0, data: streamInfo.data },
      newVorbisBlock,
      ...otherBlocks
    ]
    if (newPictureBlock) {
      assembledBlocks.push(newPictureBlock)
    }

    // Tính kích thước các block mới (không tính padding)
    let newMetadataBlocksSize = 0
    for (const b of assembledBlocks) {
      newMetadataBlocksSize += 4 + b.data.length
    }

    const existingMetadataAreaSize = audioDataOffset - 4
    const leftoverSpace = existingMetadataAreaSize - newMetadataBlocksSize

    // ==========================================
    // FAST PATH: Ghi trực tiếp In-Place nếu vừa khít hoặc dư >= 4 bytes (tạo PADDING)
    // 0 byte dữ liệu âm thanh bị đọc hoặc sao chép!
    // ==========================================
    if (leftoverSpace === 0 || leftoverSpace >= 4) {
      if (leftoverSpace >= 4) {
        const paddingDataLength = leftoverSpace - 4
        assembledBlocks.push({
          isLast: true,
          type: 1, // PADDING
          data: Buffer.alloc(paddingDataLength)
        })
      } else {
        assembledBlocks[assembledBlocks.length - 1].isLast = true
      }

      for (let i = 0; i < assembledBlocks.length - 1; i++) {
        assembledBlocks[i].isLast = false
      }

      const outBuffer = Buffer.alloc(existingMetadataAreaSize)
      let writePos = 0
      for (const b of assembledBlocks) {
        const headerByte = (b.isLast ? 0x80 : 0x00) | (b.type & 0x7f)
        outBuffer[writePos] = headerByte
        outBuffer[writePos + 1] = (b.data.length >> 16) & 0xff
        outBuffer[writePos + 2] = (b.data.length >> 8) & 0xff
        outBuffer[writePos + 3] = b.data.length & 0xff
        writePos += 4

        b.data.copy(outBuffer, writePos)
        writePos += b.data.length
      }

      fs.writeSync(fd, outBuffer, 0, existingMetadataAreaSize, 4)
      fs.closeSync(fd)
      fd = null

      return { success: true }
    }

    // ==========================================
    // SLOW PATH: Sao chép luồng dữ liệu âm thanh theo chunks 256KB
    // Thêm block PADDING 16KB để các lần sửa sau rơi vào Fast Path
    // Bộ nhớ RAM tiêu thụ tối đa chỉ 256KB!
    // ==========================================
    const EXTRA_PADDING_SIZE = 16384 // 16 KB
    assembledBlocks.push({
      isLast: true,
      type: 1,
      data: Buffer.alloc(EXTRA_PADDING_SIZE)
    })

    for (let i = 0; i < assembledBlocks.length - 1; i++) {
      assembledBlocks[i].isLast = false
    }

    let totalNewMetadataSize = 4 // 'fLaC'
    for (const b of assembledBlocks) {
      totalNewMetadataSize += 4 + b.data.length
    }

    const headerAndMetaBuf = Buffer.alloc(totalNewMetadataSize)
    headerAndMetaBuf.write('fLaC', 0, 4, 'ascii')
    let pos = 4
    for (const b of assembledBlocks) {
      const headerByte = (b.isLast ? 0x80 : 0x00) | (b.type & 0x7f)
      headerAndMetaBuf[pos] = headerByte
      headerAndMetaBuf[pos + 1] = (b.data.length >> 16) & 0xff
      headerAndMetaBuf[pos + 2] = (b.data.length >> 8) & 0xff
      headerAndMetaBuf[pos + 3] = b.data.length & 0xff
      pos += 4

      b.data.copy(headerAndMetaBuf, pos)
      pos += b.data.length
    }

    tempPath = `${filePath}.tmp_${Date.now()}`
    const dstFd = fs.openSync(tempPath, 'w')

    try {
      // 1. Ghi header + metadata blocks
      fs.writeSync(dstFd, headerAndMetaBuf, 0, headerAndMetaBuf.length)

      // 2. Stream audio frames bằng vòng lặp buffer 256KB
      const CHUNK_SIZE = 256 * 1024
      const chunkBuf = Buffer.alloc(CHUNK_SIZE)
      const stat = fs.fstatSync(fd)
      let readPos = audioDataOffset

      while (readPos < stat.size) {
        const toRead = Math.min(CHUNK_SIZE, stat.size - readPos)
        const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, readPos)
        if (bytesRead <= 0) break
        fs.writeSync(dstFd, chunkBuf, 0, bytesRead)
        readPos += bytesRead
      }

      fs.closeSync(dstFd)
      fs.closeSync(fd)
      fd = null

      const finalTempPath = tempPath!
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

      return { success: true }
    } catch (e: any) {
      try {
        fs.closeSync(dstFd)
      } catch {}
      throw e
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Lỗi không xác định khi ghi thẻ FLAC' }
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
 * Hàm tương thích ngược với src/main/index.ts (writeFlacMetadata)
 */
export async function writeFlacMetadata(
  filePath: string,
  tags: FlacTagUpdate,
  imagePath?: string | null
): Promise<{ success: boolean; error?: string }> {
  const updates: FlacTagUpdate = { ...tags }

  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const imgBuffer = fs.readFileSync(imagePath)
      const ext = path.extname(imagePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      updates.picture = {
        data: imgBuffer,
        mimeType: mime
      }
    } catch {}
  } else if (imagePath === null) {
    updates.picture = null
  }

  return updateFlacTags(filePath, updates)
}

/**
 * Ghi thẻ FLAC và ảnh bìa trực tiếp (hỗ trợ buffer ảnh hoặc xóa ảnh)
 */
export function writeFlacTagsAndPicture(
  filePath: string,
  tags: FlacTagUpdate,
  pictureBuffer?: Buffer | null
): { success: boolean; error?: string } {
  const updates: FlacTagUpdate = { ...tags }
  if (pictureBuffer) {
    updates.picture = {
      data: pictureBuffer,
      mimeType: 'image/jpeg'
    }
  } else if (pictureBuffer === null) {
    updates.picture = null
  }
  return updateFlacTags(filePath, updates)
}

/**
 * Đọc thông tin thẻ FLAC mà không tải toàn bộ file âm thanh vào bộ nhớ
 */
export function readFlacTags(filePath: string): FlacTagUpdate | null {
  let fd: number | null = null
  try {
    if (!fs.existsSync(filePath)) return null
    fd = fs.openSync(filePath, 'r')
    const { blocks } = parseFlacMetadataBlocks(fd)

    const result: FlacTagUpdate = {}

    for (const b of blocks) {
      if (b.type === 4) {
        const { comments } = extractExistingComments(b.data)
        const artists: string[] = []
        for (const c of comments) {
          const eqIdx = c.indexOf('=')
          if (eqIdx === -1) continue
          const key = c.substring(0, eqIdx).toUpperCase().trim()
          const val = c.substring(eqIdx + 1).trim()
          if (!val) continue

          if (key === 'TITLE' && !result.title) result.title = val
          else if (key === 'ALBUM' && !result.album) result.album = val
          else if ((key === 'ALBUMARTIST' || key === 'ALBUM ARTIST') && !result.albumArtist)
            result.albumArtist = val
          else if (key === 'GENRE' && !result.genre) result.genre = val
          else if ((key === 'DATE' || key === 'YEAR') && !result.year) {
            result.year = val
            result.date = val
          } else if ((key === 'TRACKNUMBER' || key === 'TRACK') && !result.trackNumber)
            result.trackNumber = val
          else if ((key === 'DISCNUMBER' || key === 'DISC') && !result.discNumber)
            result.discNumber = val
          else if ((key === 'LYRICS' || key === 'UNSYNCEDLYRICS') && !result.lyrics)
            result.lyrics = val
          else if (key === 'ARTIST') artists.push(val)
        }
        if (artists.length > 0) {
          result.artists = artists
          result.artist = artists.join(', ')
        }
      } else if (b.type === 6 && !result.picture) {
        if (b.data.length >= 32) {
          let ptr = 4
          const mimeLen = b.data.readUInt32BE(ptr)
          ptr += 4
          if (ptr + mimeLen <= b.data.length) {
            const mime = b.data.toString('utf-8', ptr, ptr + mimeLen)
            ptr += mimeLen
            const descLen = b.data.readUInt32BE(ptr)
            ptr += 4
            const desc = b.data.toString('utf-8', ptr, ptr + descLen)
            ptr += descLen
            ptr += 16
            if (ptr + 4 <= b.data.length) {
              const dataLen = b.data.readUInt32BE(ptr)
              ptr += 4
              if (ptr + dataLen <= b.data.length) {
                const picData = b.data.subarray(ptr, ptr + dataLen)
                result.picture = {
                  data: Buffer.from(picData),
                  mimeType: mime,
                  description: desc
                }
              }
            }
          }
        }
      }
    }

    return result
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
