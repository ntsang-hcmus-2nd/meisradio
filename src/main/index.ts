import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage, globalShortcut } from 'electron'
import { join } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import * as mm from 'music-metadata'
import { pathToFileURL } from 'url'
import NodeID3 from 'node-id3'

const CONFIG_PATH = join(app.getPath('userData'), 'music-config.json')

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (app.isReady() && safeStorage.isEncryptionAvailable()) {
        if (config.googleDriveApiKey && config.googleDriveApiKey.startsWith('ENC:')) {
          try {
            const buffer = Buffer.from(config.googleDriveApiKey.replace('ENC:', ''), 'base64')
            config.googleDriveApiKey = safeStorage.decryptString(buffer)
          } catch (e) { console.error('Lỗi giải mã Google Drive API Key', e) }
        }
        if (config.musixmatchApiKey && config.musixmatchApiKey.startsWith('ENC:')) {
          try {
            const buffer = Buffer.from(config.musixmatchApiKey.replace('ENC:', ''), 'base64')
            config.musixmatchApiKey = safeStorage.decryptString(buffer)
          } catch (e) { console.error('Lỗi giải mã Musixmatch API Key', e) }
        }
      }
      return config
    }
  } catch (e) {}
  return { 
    libraryPath: null, 
    crossfadeEnabled: false, 
    crossfadeDuration: 3, 
    volume: 1, 
    eqBands: null 
  }
}

function saveConfig(data: any) {
  const currentConfig = getConfig()
  const newConfig = { ...currentConfig, ...data }

  if (app.isReady() && safeStorage.isEncryptionAvailable()) {
    if (data.googleDriveApiKey && !data.googleDriveApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.googleDriveApiKey)
        newConfig.googleDriveApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) { console.error('Lỗi mã hóa Google Drive API Key', e) }
    }
    if (data.musixmatchApiKey && !data.musixmatchApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.musixmatchApiKey)
        newConfig.musixmatchApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) { console.error('Lỗi mã hóa Musixmatch API Key', e) }
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2))
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('music:getConfig', () => getConfig())
  ipcMain.handle('music:saveConfig', (_, data) => {
    saveConfig(data)
    return { success: true }
  })

  ipcMain.handle('music:setLibraryFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    saveConfig({ libraryPath: filePaths[0] })
    return { success: true, path: filePaths[0] }
  })

  ipcMain.handle('music:getLibrary', async () => {
    const config = getConfig()
    if (!config.libraryPath || !fs.existsSync(config.libraryPath)) {
      return { success: false, error: 'Chưa cài đặt thư viện' }
    }
    
    const rootPath = config.libraryPath
    const items = fs.readdirSync(rootPath)
    
    const tracks: any[] = []
    const playlists: any[] = []
    const supportedExts = ['.mp3', '.flac', '.wav', '.m4a']

    for (const item of items) {
      const itemPath = join(rootPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        const playlistTracks: any[] = []
        const subItems = fs.readdirSync(itemPath)
        for (const subItem of subItems) {
          if (supportedExts.some(ext => subItem.toLowerCase().endsWith(ext))) {
            const trackPath = join(itemPath, subItem)
            try {
              const metadata = await mm.parseFile(trackPath)
              let coverBase64 = null
              if (metadata.common.picture && metadata.common.picture.length > 0) {
                coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
              }
              const trackData = {
                id: trackPath, filePath: pathToFileURL(trackPath).href, 
                title: metadata.common.title || subItem.replace(/\.[^/.]+$/, ""),
                artist: metadata.common.artist || 'Unknown', album: metadata.common.album || 'Unknown',
                duration: metadata.format.duration, format: metadata.format.container || subItem.split('.').pop()?.toUpperCase(),
                bitrate: metadata.format.bitrate, sampleRate: metadata.format.sampleRate,
                lossless: metadata.format.lossless, isCloud: false, coverArt: coverBase64,
                lyrics: metadata.common.lyrics ? metadata.common.lyrics[0] : null
              }
              playlistTracks.push(trackData)
              tracks.push(trackData)
            } catch (e) {
              const fallbackTrack = { id: trackPath, filePath: pathToFileURL(trackPath).href, title: subItem, isCloud: false }
              playlistTracks.push(fallbackTrack)
              tracks.push(fallbackTrack)
            }
          }
        }
        
        let thumbnailUrl = null
        const possibleImageExts = ['.jpg', '.png', '.jpeg', '.webp']
        for (const ext of possibleImageExts) {
          const imgPath = join(itemPath, `${item}${ext}`)
          if (fs.existsSync(imgPath)) {
            thumbnailUrl = `${pathToFileURL(imgPath).href}?t=${Date.now()}`
            break
          }
        }
        playlists.push({ name: item, path: itemPath, tracks: playlistTracks, thumbnail: thumbnailUrl })
      } else if (supportedExts.some(ext => item.toLowerCase().endsWith(ext))) {
        try {
          const metadata = await mm.parseFile(itemPath)
          let coverBase64 = null
          if (metadata.common.picture && metadata.common.picture.length > 0) {
            coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
          }
          tracks.push({
            id: itemPath, filePath: pathToFileURL(itemPath).href, 
            title: metadata.common.title || item.replace(/\.[^/.]+$/, ""),
            artist: metadata.common.artist || 'Unknown', album: metadata.common.album || 'Unknown',
            duration: metadata.format.duration, format: metadata.format.container || item.split('.').pop()?.toUpperCase(),
            isCloud: false, coverArt: coverBase64, lyrics: metadata.common.lyrics ? metadata.common.lyrics[0] : null
          })
        } catch (e) {
          tracks.push({ id: itemPath, filePath: pathToFileURL(itemPath).href, title: item, isCloud: false })
        }
      }
    }
    return { success: true, libraryPath: rootPath, tracks, playlists }
  })

  ipcMain.handle('music:renamePlaylist', async (_, oldName, newName) => {
    const rootPath = getConfig().libraryPath
    try {
      const oldDirPath = join(rootPath, oldName)
      const newDirPath = join(rootPath, newName)
      fs.renameSync(oldDirPath, newDirPath)
      const exts = ['.jpg', '.png', '.jpeg', '.webp']
      for (const ext of exts) {
        const oldImgPath = join(newDirPath, `${oldName}${ext}`)
        if (fs.existsSync(oldImgPath)) fs.renameSync(oldImgPath, join(newDirPath, `${newName}${ext}`))
      }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('music:setPlaylistThumbnail', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    const { canceled, filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }] })
    if (canceled || filePaths.length === 0) return { success: false }
    try {
      const sourcePath = filePaths[0]
      const ext = sourcePath.split('.').pop()?.toLowerCase() || 'jpg'
      const playlistPath = join(rootPath, playlistName)
      const destPath = join(playlistPath, `${playlistName}.${ext}`)
      const exts = ['jpg', 'png', 'jpeg', 'webp']
      for (const e of exts) {
          const oldImg = join(playlistPath, `${playlistName}.${e}`)
          if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
      }
      fs.copyFileSync(sourcePath, destPath)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('music:autoGeneratePlaylists', async () => {
    const rootPath = getConfig().libraryPath
    const items = fs.readdirSync(rootPath)
    const supportedExts = ['.mp3', '.flac', '.wav', '.m4a']
    let movedCount = 0
    for (const item of items) {
      const itemPath = join(rootPath, item)
      if (fs.statSync(itemPath).isFile() && supportedExts.some(ext => item.toLowerCase().endsWith(ext))) {
        try {
          const metadata = await mm.parseFile(itemPath)
          const albumName = metadata.common.album
          if (albumName && albumName.trim() !== '') {
            const safeAlbumName = albumName.replace(/[^a-zA-Z0-9 \u00C0-\u1EF9]/g, '').trim()
            const albumDirPath = join(rootPath, safeAlbumName)
            if (!fs.existsSync(albumDirPath)) fs.mkdirSync(albumDirPath)
            if (metadata.common.picture && metadata.common.picture.length > 0) {
              const imgExt = metadata.common.picture[0].format.split('/')[1] || 'jpg'
              const imgDest = join(albumDirPath, `${safeAlbumName}.${imgExt}`)
              if (!fs.existsSync(imgDest)) fs.writeFileSync(imgDest, Buffer.from(metadata.common.picture[0].data))
            }
            fs.renameSync(itemPath, join(albumDirPath, item))
            const fileNameWithoutExt = item.replace(/\.[^/.]+$/, "")
            const lrcPath = join(rootPath, `${fileNameWithoutExt}.lrc`)
            if (fs.existsSync(lrcPath)) fs.renameSync(lrcPath, join(albumDirPath, `${fileNameWithoutExt}.lrc`))
            movedCount++
          }
        } catch (e) {}
      }
    }
    return { success: true, movedCount }
  })

  ipcMain.handle('music:read-lyrics', async (_event, audioFilePath: string) => {
    try {
      if (!audioFilePath || audioFilePath.startsWith('http')) return null
      let rawPath = audioFilePath
      if (rawPath.startsWith('file://')) {
        const { fileURLToPath } = require('url')
        rawPath = fileURLToPath(rawPath)
      } else {
        try { rawPath = decodeURIComponent(rawPath) } catch (e) {}
      }
      const dir = path.dirname(rawPath)
      const fileNameWithoutExt = path.basename(rawPath, path.extname(rawPath))
      const lrcPath = path.join(dir, `${fileNameWithoutExt}.lrc`)
      if (fs.existsSync(lrcPath)) return fs.readFileSync(lrcPath, 'utf-8')
      return null
    } catch (error) { return null }
  })

  ipcMain.handle('music:updateTags', async (_, filePath: string, newTags: any, newImagePath: string | null) => {
    try {
      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

      const tags: any = {
        title: newTags.title,
        artist: newTags.artist,
        album: newTags.album,
        unsynchronisedLyrics: { language: 'eng', text: newTags.lyrics || '' }
      }

      if (newImagePath) tags.image = newImagePath

      if (rawPath.toLowerCase().endsWith('.mp3')) {
        const success = NodeID3.update(tags, rawPath)
        if (success) return { success: true }
        return { success: false, error: 'Không thể ghi thẻ ID3' }
      } else {
        if (newTags.lyrics) {
          const dir = path.dirname(rawPath)
          const fileNameWithoutExt = path.basename(rawPath, path.extname(rawPath))
          const lrcPath = path.join(dir, `${fileNameWithoutExt}.lrc`)
          fs.writeFileSync(lrcPath, newTags.lyrics, 'utf-8')
        }
        return { success: true, note: 'Định dạng chưa hỗ trợ ghi ảnh trực tiếp, đã lưu Lời bài hát dưới dạng .lrc' }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('music:selectImageFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ 
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }] 
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('music:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return []
    const folderPath = filePaths[0]
    const files = fs.readdirSync(folderPath)
    
    const supportedExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.mp4']
    const audioFiles = files.filter(file => supportedExtensions.some(ext => file.toLowerCase().endsWith(ext)))
    const tracks = []
    
    for (const file of audioFiles) {
      const filePath = join(folderPath, file)
      try {
        const metadata = await mm.parseFile(filePath)
        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const picture = metadata.common.picture[0]
          const buffer = Buffer.from(picture.data)
          coverBase64 = `data:${picture.format};base64,${buffer.toString('base64')}`
        }
        tracks.push({
          id: filePath,
          filePath: pathToFileURL(filePath).href,
          title: metadata.common.title || file,
          artist: metadata.common.artist || 'Unknown Artist',
          album: metadata.common.album || 'Unknown Album',
          duration: metadata.format.duration,
          format: metadata.format.container || 'Unknown',
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          lossless: metadata.format.lossless,
          coverArt: coverBase64
        })
      } catch (err) {}
    }
    return tracks
  })

  ipcMain.handle('music:downloadCloudFile', async (_, url, filename, existingTracks: any[] = []) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }
    
    const tempPath = join(rootPath, `temp_${Date.now()}_${filename}`)
    let destPath = join(rootPath, filename)
    
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      fs.writeFileSync(tempPath, buffer)

      let title = filename.replace(/\.[^/.]+$/, "")
      let artist = 'Unknown Artist'
      let metadata

      try {
        metadata = await mm.parseFile(tempPath)
        if (metadata.common.title) title = metadata.common.title
        if (metadata.common.artist) artist = metadata.common.artist
      } catch (e) {}

      const duplicate = existingTracks.find(t => 
        t.title && t.artist && 
        t.title.toLowerCase() === title.toLowerCase() && 
        t.artist.toLowerCase() === artist.toLowerCase()
      )

      if (duplicate) {
        const choice = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Thay thế bản cũ', 'Thêm bản riêng', 'Hủy bỏ'],
          defaultId: 0,
          cancelId: 2,
          title: 'Phát hiện trùng lặp từ Cloud',
          message: `Bản nhạc "${title}" của "${artist}" đã tồn tại trong thư viện.\nBạn muốn xử lý như thế nào đối với tệp đang tải?`
        })

        if (choice === 0) {
          try {
            if (fs.existsSync(duplicate.id) && duplicate.id !== destPath) {
              fs.unlinkSync(duplicate.id)
              const oldLrc = duplicate.id.replace(/\.[^/.]+$/, ".lrc")
              if (fs.existsSync(oldLrc)) fs.unlinkSync(oldLrc)
            }
          } catch (e) {}
        } else if (choice === 1) {
          const ext = path.extname(filename)
          const base = path.basename(filename, ext)
          destPath = join(rootPath, `${base} (${Date.now()})${ext}`)
        } else {
          fs.unlinkSync(tempPath)
          return { success: false, canceled: true }
        }
      }

      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      fs.renameSync(tempPath, destPath)

      try {
        const ext = destPath.toLowerCase().split('.').pop()
        if (ext === 'mp3') {
          const tags: NodeID3.Tags = {
            title: title, artist: artist, album: metadata?.common.album || 'Unknown Album',
          }
          if (metadata?.common.picture && metadata.common.picture.length > 0) {
            tags.image = { mime: metadata.common.picture[0].format, imageBuffer: Buffer.from(metadata.common.picture[0].data) }
          }
          if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
            tags.unsynchronisedLyrics = { language: 'eng', text: metadata.common.lyrics[0] }
          }
          NodeID3.update(tags, destPath)
        } else {
          if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
            const fileNameWithoutExt = path.basename(destPath, path.extname(destPath))
            const lyricText = typeof metadata.common.lyrics[0] === 'string' ? metadata.common.lyrics[0] : (metadata.common.lyrics[0] as any).text || ''
            if (lyricText) fs.writeFileSync(join(rootPath, `${fileNameWithoutExt}.lrc`), lyricText, 'utf-8')
          }
        }
      } catch (e) {}

      return { success: true, localPath: pathToFileURL(destPath).href }
    } catch (err: any) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('music:downloadMultipleFiles', async (_, files: any[], existingTracks: any[] = []) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }
    
    const downloadedTracks: any[] = []
    
    try {
      for (const file of files) {
        const safeTitle = (file.title || 'track').replace(/[^a-z0-9\s]/gi, '_').trim()
        const ext = file.format ? file.format.toLowerCase() : 'mp3'
        const filename = `${safeTitle}.${ext}`
        
        const tempPath = join(rootPath, `temp_${Date.now()}_${filename}`)
        let destPath = join(rootPath, filename)
        
        const response = await fetch(file.url)
        const arrayBuffer = await response.arrayBuffer()
        fs.writeFileSync(tempPath, Buffer.from(arrayBuffer))
        
        let title = safeTitle
        let artist = 'Unknown Artist'
        let metadata

        try {
          metadata = await mm.parseFile(tempPath)
          if (metadata.common.title) title = metadata.common.title
          if (metadata.common.artist) artist = metadata.common.artist
        } catch (e) {}

        const duplicate = existingTracks.find(t => 
          t.title && t.artist && 
          t.title.toLowerCase() === title.toLowerCase() && 
          t.artist.toLowerCase() === artist.toLowerCase()
        )

        let shouldKeep = true

        if (duplicate) {
          const choice = dialog.showMessageBoxSync({
            type: 'question',
            buttons: ['Thay thế bản cũ', 'Thêm bản riêng', 'Hủy bỏ'],
            defaultId: 0,
            cancelId: 2,
            title: 'Phát hiện trùng lặp từ Cloud',
            message: `Bản nhạc "${title}" của "${artist}" đã tồn tại trong thư viện.\nBạn muốn xử lý như thế nào đối với tệp đang tải?`
          })

          if (choice === 0) {
            try {
              if (fs.existsSync(duplicate.id) && duplicate.id !== destPath) {
                fs.unlinkSync(duplicate.id)
                const oldLrc = duplicate.id.replace(/\.[^/.]+$/, ".lrc")
                if (fs.existsSync(oldLrc)) fs.unlinkSync(oldLrc)
              }
            } catch (e) {}
          } else if (choice === 1) {
            destPath = join(rootPath, `${safeTitle} (${Date.now()}).${ext}`)
          } else {
            shouldKeep = false
          }
        }

        if (!shouldKeep) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
          continue
        }

        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        fs.renameSync(tempPath, destPath)

        let coverBase64 = null
        try {
          if (ext === 'mp3') {
            const tags: NodeID3.Tags = { title, artist, album: metadata?.common.album || 'Unknown Album' }
            if (metadata?.common.picture && metadata.common.picture.length > 0) {
              tags.image = { mime: metadata.common.picture[0].format, imageBuffer: Buffer.from(metadata.common.picture[0].data) }
              coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
            }
            NodeID3.update(tags, destPath)
          } else {
            if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
              const lyricText = typeof metadata.common.lyrics[0] === 'string' ? metadata.common.lyrics[0] : (metadata.common.lyrics[0] as any).text || ''
              if (lyricText) fs.writeFileSync(join(rootPath, `${path.basename(destPath, `.${ext}`)}.lrc`), lyricText, 'utf-8')
            }
            if (metadata?.common.picture && metadata.common.picture.length > 0) {
              coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
            }
          }

          const newTrackObj = {
            id: destPath, filePath: pathToFileURL(destPath).href, title, artist,
            album: metadata?.common.album || 'Unknown Album', duration: metadata?.format.duration || 0,
            format: metadata?.format.container || ext.toUpperCase(), bitrate: metadata?.format.bitrate,
            sampleRate: metadata?.format.sampleRate, lossless: metadata?.format.lossless, coverArt: coverBase64, isCloud: false
          }
          downloadedTracks.push(newTrackObj)
          existingTracks.push(newTrackObj)
        } catch (e) {
          downloadedTracks.push({ ...file, id: destPath, filePath: pathToFileURL(destPath).href, isCloud: false })
        }
      }
      return { success: true, tracks: downloadedTracks }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('music:fetchDriveFiles', async (_, folderId) => {
    const apiKey = getConfig().googleDriveApiKey
    if (!apiKey || apiKey.trim() === '') return { success: false, error: 'Chưa cấu hình API Key!' }
    
    try {
      let allFiles: any[] = []
      let pageToken = ''
      let hasNextPage = true

      while (hasNextPage) {
        let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)&key=${apiKey}`
        if (pageToken) url += `&pageToken=${pageToken}`

        const response = await fetch(url)
        const data = await response.json()
        
        if (data.error) return { success: false, error: data.error.message }
        if (data.files && data.files.length > 0) allFiles = allFiles.concat(data.files)

        if (data.nextPageToken) pageToken = data.nextPageToken
        else hasNextPage = false
      }
      
      const audioFiles = allFiles.filter((f: any) => 
        f.mimeType.startsWith('audio/') || 
        f.name.endsWith('.mp3') || f.name.endsWith('.flac') ||
        f.name.endsWith('.wav') || f.name.endsWith('.m4a')
      )
      
      const tracks = audioFiles.map((file: any) => {
        const format = file.name.split('.').pop().toUpperCase()
        return {
          id: `gd-${file.id}`, title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Google Drive',
          album: 'Cloud', duration: 0, format: format, isCloud: true,
          url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`, coverArt: null
        }
      })
      
      return { success: true, tracks }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('music:extractPlaylistThumbnail', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    const playlistPath = join(rootPath, playlistName)
    
    try {
      const items = fs.readdirSync(playlistPath)
      const supportedExts = ['.mp3', '.flac', '.wav', '.m4a']
      
      const firstTrack = items.find(item => supportedExts.some(ext => item.toLowerCase().endsWith(ext)))
      if (!firstTrack) return { success: false, error: 'Playlist đang trống!' }

      const trackPath = join(playlistPath, firstTrack)
      const metadata = await mm.parseFile(trackPath)

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const ext = metadata.common.picture[0].format.split('/')[1] || 'jpg'
        const destPath = join(playlistPath, `${playlistName}.${ext}`)

        const exts = ['jpg', 'png', 'jpeg', 'webp']
        for (const e of exts) {
          const oldImg = join(playlistPath, `${playlistName}.${e}`)
          if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
        }

        fs.writeFileSync(destPath, Buffer.from(metadata.common.picture[0].data))
        return { success: true }
      }
      return { success: false, error: 'Không tìm thấy ảnh bìa!' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  let mxmToken: string | null = null
  const mxmHeaders = {
    'User-Agent': 'Musixmatch/3.14.4346-master-20200508',
    'Accept': 'application/json'
  }

  async function getMusixmatchToken() {
    if (mxmToken) return mxmToken
    const url = 'https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0'
    try {
      const res = await fetch(url, { headers: mxmHeaders })
      const data = await res.json()
      if (data.message.header.status_code === 200) {
        mxmToken = data.message.body.user_token
        return mxmToken
      }
    } catch (e) {}
    return null
  }

  ipcMain.handle('music:fetchMusixmatchLyrics', async (_, title: string, artist: string) => {
    try {
      let token = await getMusixmatchToken()
      if (!token) return { success: false, error: 'Không lấy được token' }

      const cleanTitle = title.replace(/\([^)]*\)/g, '').trim()
      const isUnknownArtist = !artist || artist.toLowerCase().includes('unknown')
      const artistParam = isUnknownArtist ? '' : `&q_artist=${encodeURIComponent(artist)}`
      
      let searchUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&q_track=${encodeURIComponent(cleanTitle)}${artistParam}&usertoken=${token}`
      
      let searchRes = await fetch(searchUrl, { headers: mxmHeaders })
      let searchData = await searchRes.json()

      if (searchData.message?.header?.status_code === 401) {
        mxmToken = null
        token = await getMusixmatchToken()
        searchUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&q_track=${encodeURIComponent(cleanTitle)}${artistParam}&usertoken=${token}`
        searchRes = await fetch(searchUrl, { headers: mxmHeaders })
        searchData = await searchRes.json()
      }

      if (searchData.message?.header?.status_code !== 200 || !searchData.message?.body?.track_list || searchData.message.body.track_list.length === 0) {
        return { success: false, error: 'Không tìm thấy bài hát' }
      }

      const trackId = searchData.message.body.track_list[0].track.track_id

      const subtitleUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&track_id=${trackId}&subtitle_format=lrc&usertoken=${token}`
      const subtitleRes = await fetch(subtitleUrl, { headers: mxmHeaders })
      const subtitleData = await subtitleRes.json()

      if (subtitleData.message?.header?.status_code === 200 && subtitleData.message?.body?.subtitle) {
        return { success: true, lyrics: subtitleData.message.body.subtitle.subtitle_body, isSynced: true }
      }

      const lyricsUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?app_id=web-desktop-app-v1.0&track_id=${trackId}&usertoken=${token}`
      const lyricsRes = await fetch(lyricsUrl, { headers: mxmHeaders })
      const lyricsData = await lyricsRes.json()

      if (lyricsData.message?.header?.status_code === 200 && lyricsData.message?.body?.lyrics) {
        return { success: true, lyrics: lyricsData.message.body.lyrics.lyrics_body, isSynced: false }
      }

      return { success: false, error: 'Không có lời bài hát' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('music:importLocalFiles', async (_, targetSubFolder?: string, existingTracks: any[] = []) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình Thư viện!' }

    const destFolder = targetSubFolder ? join(rootPath, targetSubFolder) : rootPath
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder)

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a'] }]
    })

    if (canceled || filePaths.length === 0) return { success: false, canceled: true }

    const importedTracks: any[] = []
    
    for (const sourcePath of filePaths) {
      let fileName = path.basename(sourcePath)
      let destPath = join(destFolder, fileName)
      let shouldCopy = true

      try {
        const metadata = await mm.parseFile(sourcePath)
        const title = metadata.common.title || fileName.replace(/\.[^/.]+$/, "")
        const artist = metadata.common.artist || 'Unknown Artist'

        const duplicate = existingTracks.find(t => 
          t.title && t.artist && 
          t.title.toLowerCase() === title.toLowerCase() && 
          t.artist.toLowerCase() === artist.toLowerCase()
        )

        if (duplicate) {
          const choice = dialog.showMessageBoxSync({
            type: 'question',
            buttons: ['Thay thế bản cũ', 'Thêm bản riêng', 'Hủy bỏ'],
            defaultId: 0, cancelId: 2, title: 'Phát hiện trùng lặp',
            message: `Bản nhạc "${title}" của "${artist}" đã tồn tại.\nBạn muốn xử lý như thế nào?`
          })

          if (choice === 0) {
            try {
              if (fs.existsSync(duplicate.id) && duplicate.id !== destPath) {
                fs.unlinkSync(duplicate.id)
                const oldLrc = duplicate.id.replace(/\.[^/.]+$/, ".lrc")
                if (fs.existsSync(oldLrc)) fs.unlinkSync(oldLrc)
              }
            } catch (e) {}
          } else if (choice === 1) {
            const ext = path.extname(fileName)
            fileName = `${path.basename(fileName, ext)} (${Date.now()})${ext}`
            destPath = join(destFolder, fileName)
          } else {
            shouldCopy = false
          }
        }

        if (!shouldCopy) continue

        if (sourcePath !== destPath) {
          fs.copyFileSync(sourcePath, destPath)
          const lrcSource = sourcePath.replace(/\.[^/.]+$/, ".lrc")
          const lrcDest = destPath.replace(/\.[^/.]+$/, ".lrc")
          if (fs.existsSync(lrcSource) && lrcSource !== lrcDest) fs.copyFileSync(lrcSource, lrcDest)
        }

        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
        }

        importedTracks.push({
          id: destPath, filePath: pathToFileURL(destPath).href, title: title, artist: artist,
          album: metadata.common.album || 'Unknown Album', duration: metadata.format.duration,
          format: metadata.format.container || fileName.split('.').pop()?.toUpperCase(),
          bitrate: metadata.format.bitrate, sampleRate: metadata.format.sampleRate, lossless: metadata.format.lossless,
          coverArt: coverBase64, isCloud: false
        })
      } catch (err) {
        if (shouldCopy && sourcePath !== destPath) {
          fs.copyFileSync(sourcePath, destPath)
          importedTracks.push({ id: destPath, filePath: pathToFileURL(destPath).href, title: fileName, isCloud: false })
        }
      }
    }

    return { success: true, tracks: importedTracks }
  })

  createWindow()

  const sendShortcut = (action: string) => {
    if (mainWindow) mainWindow.webContents.send('global-shortcut', action)
  }

  globalShortcut.register('CommandOrControl+Right', () => sendShortcut('next'))
  globalShortcut.register('CommandOrControl+Left', () => sendShortcut('prev'))
  globalShortcut.register('CommandOrControl+Up', () => sendShortcut('vol-up'))
  globalShortcut.register('CommandOrControl+Down', () => sendShortcut('vol-down'))
  globalShortcut.register('CommandOrControl+Space', () => sendShortcut('play-pause'))
  globalShortcut.register('MediaPlayPause', () => sendShortcut('play-pause'))
  globalShortcut.register('MediaNextTrack', () => sendShortcut('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendShortcut('prev'))
  globalShortcut.register('VolumeUp', () => sendShortcut('vol-up'))
  globalShortcut.register('VolumeDown', () => sendShortcut('vol-down'))

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})