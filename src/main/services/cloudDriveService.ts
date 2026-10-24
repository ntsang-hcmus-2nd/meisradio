import fs from 'fs'
import path, { join } from 'path'
import { pathToFileURL } from 'url'
import { ipcMain } from 'electron'
import * as mm from 'music-metadata'
import { isBlockedSsrfHost } from './streamServer'
import {
  getConfig,
  sqliteStorage,
  SUPPORTED_AUDIO_EXTS,
  metadataCache,
  markMetadataDirty,
  saveMetadataCache,
  getMainWindow,
  sanitizeFileName
} from './sharedContext'

// Chỉ cho phép tải từ URL https công khai (chặn SSRF tới host nội bộ).
function validateCloudDownloadUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Access denied: Invalid or blocked cloud URL')
  }
  if (parsed.protocol !== 'https:' || isBlockedSsrfHost(parsed.hostname)) {
    throw new Error('Access denied: Invalid or blocked cloud URL')
  }
  return parsed
}

function assertSafeRedirectUrl(responseUrl: string | undefined): void {
  if (!responseUrl) return
  try {
    const finalUrl = new URL(responseUrl)
    if (finalUrl.protocol !== 'https:' || isBlockedSsrfHost(finalUrl.hostname)) {
      throw new Error('Access denied: Invalid or blocked cloud URL')
    }
  } catch (err: any) {
    if (err?.message?.startsWith('Access denied:')) throw err
    throw new Error('Access denied: Invalid or blocked cloud URL')
  }
}

// ==========================================
// TẢI FILE TỪ STREAM
// ==========================================
export async function streamDownloadToFile(
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
            totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0
          const progressPayload = {
            url,
            fileName,
            downloadedBytes,
            totalBytes,
            percent
          }
          const mainWindow = getMainWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', progressPayload)
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

// ==========================================
// TẢI 1 FILE TỪ CLOUD
// ==========================================
export async function downloadCloudFile(
  url: string,
  filename: string,
  _existingTracks?: any[]
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  const rootPath = getConfig().libraryPath
  if (!rootPath || !fs.existsSync(rootPath))
    return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }

  const safeFilename = sanitizeFileName(filename || 'cloud_track.mp3') || 'cloud_track.mp3'
  const savePath = join(rootPath, safeFilename)
  const tempDestPath = join(rootPath, `temp_cloud_${Date.now()}_${safeFilename}`)
  try {
    validateCloudDownloadUrl(url)
    const response = await fetch(url)
    assertSafeRedirectUrl(response.url)

    if (!response.ok) {
      throw new Error(`Google Drive từ chối tải file. Mã lỗi: ${response.status}`)
    }

    await streamDownloadToFile(response, tempDestPath, url, safeFilename)

    if (fs.existsSync(savePath)) {
      try {
        fs.unlinkSync(savePath)
      } catch {}
    }
    fs.renameSync(tempDestPath, savePath)

    try {
      const metadata = await mm.parseFile(savePath)
      const ext = savePath.toLowerCase().split('.').pop()

      // Không ghi đè ID3 tag gốc của file mp3: chỉ trích lyric nhúng ra .lrc cho file không phải mp3.
      if (ext !== 'mp3') {
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
}

// ==========================================
// QUÉT GOOGLE DRIVE
// ==========================================
export async function fetchDriveFiles(
  folderId: string
): Promise<{ success: boolean; tracks?: any[]; error?: string }> {
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

    while (hasNextPage) {
      let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)&key=${apiKey}`

      if (pageToken) {
        url += `&pageToken=${pageToken}`
      }

      const response = await fetch(url)
      const data = await response.json()

      if (data.error) return { success: false, error: data.error.message }

      if (data.files && data.files.length > 0) {
        allFiles = allFiles.concat(data.files)
      }

      if (data.nextPageToken) {
        pageToken = data.nextPageToken
      } else {
        hasNextPage = false
      }
    }

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
        isOnline: true,
        platform: 'drive',
        url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}&acknowledgeAbuse=true`,
        coverArt: null
      }
    })

    return { success: true, tracks }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ==========================================
// TẢI HÀNG LOẠT TỪ CLOUD
// ==========================================
export async function downloadMultipleFiles(
  event: Electron.IpcMainInvokeEvent,
  files: any[],
  existingTracks: any[] = []
): Promise<{ success: boolean; tracks?: any[]; error?: string }> {
  const rootPath = getConfig().libraryPath
  if (!rootPath || !fs.existsSync(rootPath))
    return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }

  const downloadedTracks: any[] = []

  const existingTrackKeys = new Set<string>()
  const getTrackKey = (t?: string, a?: string) =>
    `${String(t || '')
      .trim()
      .toLowerCase()}:::${String(a || '')
      .trim()
      .toLowerCase()}`

  for (const track of existingTracks) {
    if (track && track.title && track.artist) {
      existingTrackKeys.add(getTrackKey(track.title, track.artist))
    }
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      event.sender.send('download-progress', {
        current: i + 1,
        total: files.length,
        fileName: file.title || 'Đang tải...'
      })

      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      const originalTitle = (file.title || 'track').replace(/^\d+[\s.\-_]+/, '').trim()
      const safeTitle = originalTitle.replace(/[<>:"/\\|?*]/g, '_').trim()
      const ext = file.format ? file.format.toLowerCase() : 'mp3'
      const filename = `${safeTitle}.${ext}`

      const tempPath = join(rootPath, `temp_${Date.now()}_${filename}`)
      const destPath = join(rootPath, filename)

      try {
        validateCloudDownloadUrl(file.url)
      } catch {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
        continue
      }
      const response = await fetch(file.url)
      try {
        assertSafeRedirectUrl(response.url)
      } catch {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
        continue
      }

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
        if (metadata.common.title) {
          title = metadata.common.title.replace(/^\d+[\s.\-_]+/, '').trim()
        }
        if (metadata.common.artist) artist = metadata.common.artist
        if (metadata.common.album) album = metadata.common.album
      } catch {}

      const isDuplicate = existingTrackKeys.has(getTrackKey(title, artist))

      if (isDuplicate) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
        continue
      }

      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      fs.renameSync(tempPath, destPath)

      try {
        if (ext !== 'mp3') {
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
          replayGainTrack: metadata?.common?.replayGainTrack,
          replayGainAlbum: metadata?.common?.replayGainAlbum,
          coverArt: null,
          isCloud: false
        }

        try {
          const stat = fs.statSync(destPath)
          metadataCache[destPath] = {
            mtime: stat.mtimeMs,
            data: newTrackObj
          }
          markMetadataDirty(destPath)
          sqliteStorage.setMetadata(destPath, stat.mtimeMs, newTrackObj)
          saveMetadataCache()
        } catch {}

        downloadedTracks.push(newTrackObj)
        existingTracks.push(newTrackObj)
        existingTrackKeys.add(getTrackKey(title, artist))
      } catch {
        const fallbackTrackObj = {
          ...file,
          id: destPath,
          filePath: pathToFileURL(destPath).href,
          isCloud: false
        }

        try {
          const stat = fs.statSync(destPath)
          metadataCache[destPath] = {
            mtime: stat.mtimeMs,
            data: fallbackTrackObj
          }
          markMetadataDirty(destPath)
          sqliteStorage.setMetadata(destPath, stat.mtimeMs, fallbackTrackObj)
          saveMetadataCache()
        } catch {}

        downloadedTracks.push(fallbackTrackObj)
        existingTracks.push(fallbackTrackObj)
        existingTrackKeys.add(getTrackKey(title, artist))
      }
    }
    return { success: true, tracks: downloadedTracks }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ==========================================
// IPC HANDLERS CHO CLOUD DRIVE SERVICE
// ==========================================
export function registerCloudDriveIpc(): void {
  ipcMain.handle(
    'music:downloadCloudFile',
    async (_, url: string, filename: string, existingTracks?: any[]) =>
      downloadCloudFile(url, filename, existingTracks)
  )

  ipcMain.handle('music:fetchDriveFiles', async (_, folderId) => {
    return await fetchDriveFiles(folderId)
  })

  ipcMain.handle(
    'music:downloadMultipleFiles',
    async (event, files: any[], existingTracks: any[] = []) => {
      return await downloadMultipleFiles(event, files, existingTracks)
    }
  )
}
