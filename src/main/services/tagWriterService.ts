import fs from 'fs'
import path, { join } from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { pathToFileURL, fileURLToPath } from 'url'
import { nativeImage, ipcMain } from 'electron'
import * as mm from 'music-metadata'
import NodeID3 from 'node-id3'
import {
  sqliteStorage,
  IMAGE_CACHE_DIR,
  metadataCache,
  themeColorsCache,
  markMetadataDirty,
  saveMetadataCache,
  saveThemeColorsCache,
  getFfmpegPath
} from './sharedContext'
import { splitArtistString, buildPreAggregatedData, extractEmbeddedLyrics } from './libraryScanner'
import { updateFlacTags, FlacTagUpdate } from '../flacMetadata'
import { updateDsdTags, DsdTagUpdate } from '../dsdMetadata'

// ==========================================
// CẬP NHẬT TAG METADATA CHO CÁC ĐỊNH DẠNG
// ==========================================
export async function updateTags(
  filePath: string,
  newTags: any,
  newImagePath: string | null
): Promise<{ success: boolean; coverUrl?: string | null; error?: string }> {
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
      const ffmpegExe = getFfmpegPath()
      const tempOutput = join(
        path.dirname(rawPath),
        `temp_tag_${Date.now()}_${path.basename(rawPath)}`
      )
      const args = ['-y', '-i', rawPath, '-c', 'copy']
      if (newTags.title !== undefined && String(newTags.title).trim())
        args.push('-metadata', `title=${String(newTags.title).trim()}`)
      if (targetArtist && String(targetArtist).trim())
        args.push('-metadata', `artist=${String(targetArtist).trim()}`)
      if (newTags.album !== undefined && String(newTags.album).trim())
        args.push('-metadata', `album=${String(newTags.album).trim()}`)
      if (newTags.albumArtist !== undefined && String(newTags.albumArtist).trim())
        args.push('-metadata', `album_artist=${String(newTags.albumArtist).trim()}`)
      if (newTags.genre !== undefined && String(newTags.genre).trim())
        args.push('-metadata', `genre=${String(newTags.genre).trim()}`)
      if (newTags.year !== undefined && String(newTags.year).trim())
        args.push('-metadata', `date=${String(newTags.year).trim()}`)
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
      })

      if (newTags.lyrics !== undefined && typeof newTags.lyrics === 'string') {
        const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
        try {
          if (newTags.lyrics.trim()) {
            fs.writeFileSync(lrcPath, newTags.lyrics, 'utf-8')
          } else if (fs.existsSync(lrcPath)) {
            fs.unlinkSync(lrcPath)
          }
        } catch (_) {}
      }
    }

    const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
    const centralThumbPath = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)
    const localThumbPath = join(path.dirname(rawPath), '.thumbnails', `${trackHash}.jpg`)

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
          const dir = path.dirname(localThumbPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(localThumbPath, jpegBuf)
        } catch (e) {}
        coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
      } catch (err) {}
    } else if (rawImagePath && fs.existsSync(rawImagePath)) {
      try {
        const img = nativeImage.createFromPath(rawImagePath)
        const resized = img.resize({ width: 128, height: 128, quality: 'good' })
        const jpegBuf = resized.toJPEG(80)
        try {
          fs.writeFileSync(centralThumbPath, jpegBuf)
        } catch (e) {}
        try {
          const dir = path.dirname(localThumbPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(localThumbPath, jpegBuf)
        } catch (e) {}
        coverUrl = `${pathToFileURL(centralThumbPath).href}?t=${Date.now()}`
      } catch (err) {}
    } else {
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
    markMetadataDirty(rawPath)
    sqliteStorage.setMetadata(rawPath, stat.mtimeMs, metadataCache[rawPath].data)
    saveMetadataCache()

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

// ==========================================
// CHI TIẾT KỸ THUẬT & METADATA BÀI HÁT
// ==========================================
export async function getTrackDetails(trackPath: string): Promise<any> {
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
    } catch (err) {}

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
      replayGainTrack: common.replayGainTrack,
      replayGainAlbum: common.replayGainAlbum,
      isDsd
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ==========================================
// IPC HANDLERS CHO TAG WRITER SERVICE
// ==========================================
export function registerTagWriterIpc(): void {
  ipcMain.handle(
    'music:updateTags',
    async (_, filePath: string, newTags: any, newImagePath: string | null) => {
      return await updateTags(filePath, newTags, newImagePath)
    }
  )

  ipcMain.handle('music:getTrackDetails', async (_event, trackPath: string) => {
    return await getTrackDetails(trackPath)
  })
}
