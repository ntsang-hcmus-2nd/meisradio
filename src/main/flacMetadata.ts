import fs from 'fs'
import path from 'path'
import { nativeImage } from 'electron'

interface FlacTags {
  title?: string
  artist?: string
  album?: string
  lyrics?: string
  genre?: string
  date?: string
  trackNumber?: string
}

interface FlacBlock {
  isLast: boolean
  type: number
  data: Buffer
}

/**
 * Đọc cấu trúc các block Metadata của tệp FLAC
 */
function parseFlacBlocks(fileBuffer: Buffer): { header: Buffer; blocks: FlacBlock[]; audioData: Buffer } {
  if (fileBuffer.length < 4 || fileBuffer.toString('utf-8', 0, 4) !== 'fLaC') {
    throw new Error('Không phải tệp định dạng FLAC hợp lệ (thiếu magic fLaC header)')
  }

  const blocks: FlacBlock[] = []
  let offset = 4

  while (offset < fileBuffer.length) {
    if (offset + 4 > fileBuffer.length) break

    const headerByte = fileBuffer[offset]
    const isLast = (headerByte & 0x80) !== 0
    const type = headerByte & 0x7f

    const length = (fileBuffer[offset + 1] << 16) | (fileBuffer[offset + 2] << 8) | fileBuffer[offset + 3]
    offset += 4

    if (offset + length > fileBuffer.length) {
      throw new Error('Dữ liệu block metadata FLAC bị cắt ngắn hoặc không hợp lệ')
    }

    const data = fileBuffer.subarray(offset, offset + length)
    blocks.push({ isLast, type, data: Buffer.from(data) })
    offset += length

    if (isLast) break
  }

  const audioData = fileBuffer.subarray(offset)
  return {
    header: fileBuffer.subarray(0, 4),
    blocks,
    audioData: Buffer.from(audioData)
  }
}

/**
 * Tạo block VORBIS_COMMENT cho FLAC
 */
function createVorbisCommentBlock(tags: FlacTags, existingComments: string[] = []): Buffer {
  const vendorString = 'Meis Radio Audio Engine'
  const vendorBuf = Buffer.from(vendorString, 'utf-8')

  // Giữ lại các trường khác không bị ghi đè
  const commentMap = new Map<string, string>()
  for (const c of existingComments) {
    const eqIdx = c.indexOf('=')
    if (eqIdx !== -1) {
      const key = c.substring(0, eqIdx).toUpperCase()
      const val = c.substring(eqIdx + 1)
      commentMap.set(key, val)
    }
  }

  if (tags.title !== undefined) commentMap.set('TITLE', tags.title)
  if (tags.artist !== undefined) commentMap.set('ARTIST', tags.artist)
  if (tags.album !== undefined) commentMap.set('ALBUM', tags.album)
  if (tags.genre !== undefined) commentMap.set('GENRE', tags.genre)
  if (tags.date !== undefined) commentMap.set('DATE', tags.date)
  if (tags.trackNumber !== undefined) commentMap.set('TRACKNUMBER', tags.trackNumber)
  if (tags.lyrics !== undefined) {
    commentMap.set('LYRICS', tags.lyrics)
    commentMap.set('UNSYNCEDLYRICS', tags.lyrics)
  }

  const commentStrings: string[] = []
  for (const [k, v] of commentMap.entries()) {
    if (v && v.trim() !== '') {
      commentStrings.push(`${k}=${v}`)
    }
  }

  // Tính toán kích thước buffer
  let totalSize = 4 + vendorBuf.length + 4 // vendor_length + vendor + user_comment_list_length
  const encodedComments: Buffer[] = []

  for (const c of commentStrings) {
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
 * Trích xuất Vorbis Comments từ block hiện tại
 */
function extractExistingComments(blockData: Buffer): string[] {
  try {
    if (blockData.length < 8) return []
    let pos = 0
    const vendorLen = blockData.readUInt32LE(pos)
    pos += 4 + vendorLen
    if (pos + 4 > blockData.length) return []

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
    return comments
  } catch (e) {
    return []
  }
}

/**
 * Tạo block PICTURE cho FLAC
 */
function createPictureBlock(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Buffer {
  let width = 0
  let height = 0
  let colorDepth = 24

  try {
    const nImg = nativeImage.createFromBuffer(imageBuffer)
    const size = nImg.getSize()
    width = size.width || 0
    height = size.height || 0
  } catch (e) {}

  const mimeBuf = Buffer.from(mimeType, 'utf-8')
  const descBuf = Buffer.alloc(0) // Description rỗng

  const totalSize = 4 + 4 + mimeBuf.length + 4 + descBuf.length + 4 + 4 + 4 + 4 + 4 + imageBuffer.length
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
 * Ghi trực tiếp Metadata và Ảnh bìa vào tệp .flac
 */
export async function writeFlacMetadata(
  filePath: string,
  tags: FlacTags,
  imagePath?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Tệp FLAC không tồn tại' }
    }

    const fileBuffer = fs.readFileSync(filePath)
    const { header, blocks, audioData } = parseFlacBlocks(fileBuffer)

    // Trích xuất comments cũ
    let existingComments: string[] = []
    const newBlocks: FlacBlock[] = []

    for (const b of blocks) {
      if (b.type === 4) {
        // VORBIS_COMMENT
        existingComments = extractExistingComments(b.data)
      } else if (b.type === 6 && imagePath) {
        // PICTURE: Nếu có ảnh mới, bỏ block ảnh cũ
        continue
      } else {
        newBlocks.push(b)
      }
    }

    // 1. Tạo block VORBIS_COMMENT mới
    const newVorbisData = createVorbisCommentBlock(tags, existingComments)
    // Chèn VORBIS_COMMENT ngay sau STREAMINFO (block 0)
    newBlocks.splice(1, 0, { isLast: false, type: 4, data: newVorbisData })

    // 2. Tạo block PICTURE mới nếu có ảnh
    if (imagePath && fs.existsSync(imagePath)) {
      const imgBuffer = fs.readFileSync(imagePath)
      const ext = path.extname(imagePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      const pictureData = createPictureBlock(imgBuffer, mime)
      newBlocks.push({ isLast: false, type: 6, data: pictureData })
    }

    // Đánh dấu block cuối cùng là isLast = true
    for (let i = 0; i < newBlocks.length; i++) {
      newBlocks[i].isLast = (i === newBlocks.length - 1)
    }

    // Tính tổng dung lượng cần ghi
    let totalMetadataSize = 4 // 'fLaC'
    for (const b of newBlocks) {
      totalMetadataSize += 4 + b.data.length
    }

    const outBuffer = Buffer.alloc(totalMetadataSize + audioData.length)
    header.copy(outBuffer, 0)
    let writePos = 4

    for (const b of newBlocks) {
      const headerByte = (b.isLast ? 0x80 : 0x00) | (b.type & 0x7f)
      outBuffer[writePos] = headerByte
      outBuffer[writePos + 1] = (b.data.length >> 16) & 0xff
      outBuffer[writePos + 2] = (b.data.length >> 8) & 0xff
      outBuffer[writePos + 3] = b.data.length & 0xff
      writePos += 4

      b.data.copy(outBuffer, writePos)
      writePos += b.data.length
    }

    audioData.copy(outBuffer, writePos)

    // Ghi an toàn bằng tệp tạm rồi rename
    const tempPath = `${filePath}.tmp_${Date.now()}`
    fs.writeFileSync(tempPath, outBuffer)
    fs.renameSync(tempPath, filePath)

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Lỗi không xác định khi ghi thẻ FLAC' }
  }
}
