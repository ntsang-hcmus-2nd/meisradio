import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import * as mm from 'music-metadata'
import { pathToFileURL } from 'url'

// Cấu hình lưu trữ đường dẫn thư viện
const CONFIG_PATH = join(app.getPath('userData'), 'music-config.json')

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch (e) {}
  return { libraryPath: null }
}

function saveConfig(data: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...getConfig(), ...data }))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ==========================================
  // HỆ THỐNG QUẢN LÝ THƯ VIỆN & PLAYLIST
  // ==========================================

  // 1. Chọn và lưu thư mục gốc (Cài đặt)
  ipcMain.handle('music:setLibraryFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    saveConfig({ libraryPath: filePaths[0] })
    return { success: true, path: filePaths[0] }
  })

  // 2. Đọc toàn bộ thư viện (Tất cả bài hát + Playlists)
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
                id: trackPath, 
                filePath: pathToFileURL(trackPath).href, 
                title: metadata.common.title || subItem,
                artist: metadata.common.artist || 'Unknown', 
                album: metadata.common.album || 'Unknown',
                duration: metadata.format.duration, 
                format: metadata.format.container || subItem.split('.').pop()?.toUpperCase(),
                bitrate: metadata.format.bitrate,
                sampleRate: metadata.format.sampleRate,
                lossless: metadata.format.lossless,
                isCloud: false, 
                coverArt: coverBase64
              }

              // Đưa vào danh sách riêng của Playlist
              playlistTracks.push(trackData)
              
              // MỚI: Đồng thời đưa thẳng vào danh sách tổng để mục "Danh sách bài hát" hiển thị đầy đủ
              tracks.push(trackData)

            } catch (e) {
              const fallbackTrack = { 
                id: trackPath, 
                filePath: pathToFileURL(trackPath).href, 
                title: subItem, 
                isCloud: false 
              }
              playlistTracks.push(fallbackTrack)
              tracks.push(fallbackTrack)
            }
          }
        }
        
        // Tìm ảnh thumbnail của Playlist nằm ở thư mục gốc
        let thumbnailUrl = null
        const possibleImageExts = ['.jpg', '.png', '.jpeg', '.webp']
        for (const ext of possibleImageExts) {
          const imgPath = join(rootPath, `${item}${ext}`)
          if (fs.existsSync(imgPath)) {
            thumbnailUrl = pathToFileURL(imgPath).href
            break
          }
        }

        playlists.push({ 
          name: item, 
          path: itemPath, 
          tracks: playlistTracks, 
          thumbnail: thumbnailUrl 
        })
      } else if (supportedExts.some(ext => item.toLowerCase().endsWith(ext))) {
        // Đọc bài hát ở thư mục gốc
        try {
          const metadata = await mm.parseFile(itemPath)
          let coverBase64 = null
          if (metadata.common.picture && metadata.common.picture.length > 0) {
            coverBase64 = `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
          }
          tracks.push({
            id: itemPath, 
            filePath: pathToFileURL(itemPath).href, 
            title: metadata.common.title || item,
            artist: metadata.common.artist || 'Unknown', 
            album: metadata.common.album || 'Unknown',
            duration: metadata.format.duration, 
            format: metadata.format.container || item.split('.').pop()?.toUpperCase(),
            isCloud: false, 
            coverArt: coverBase64
          })
        } catch (e) {
          tracks.push({ 
            id: itemPath, 
            filePath: pathToFileURL(itemPath).href, 
            title: item, 
            isCloud: false 
          })
        }
      }
    }
    return { success: true, libraryPath: rootPath, tracks, playlists }
  })

  // 3. Đổi tên Playlist (Thư mục & Ảnh)
  ipcMain.handle('music:renamePlaylist', async (_, oldName, newName) => {
    const rootPath = getConfig().libraryPath
    try {
      fs.renameSync(join(rootPath, oldName), join(rootPath, newName))
      const exts = ['.jpg', '.png', '.jpeg', '.webp']
      for (const ext of exts) {
        const oldImg = join(rootPath, `${oldName}${ext}`)
        if (fs.existsSync(oldImg)) fs.renameSync(oldImg, join(rootPath, `${newName}${ext}`))
      }
      return { success: true }
    } catch (e: any) { 
      return { success: false, error: e.message } 
    }
  })

  // 4. Chọn và lưu ảnh Thumbnail cho Playlist
  ipcMain.handle('music:setPlaylistThumbnail', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    const { canceled, filePaths } = await dialog.showOpenDialog({ 
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }] 
    })
    if (canceled || filePaths.length === 0) return { success: false }
    
    try {
      const sourcePath = filePaths[0]
      const ext = sourcePath.split('.').pop()
      const destPath = join(rootPath, `${playlistName}.${ext}`)
      fs.copyFileSync(sourcePath, destPath)
      return { success: true }
    } catch (e: any) { 
      return { success: false, error: e.message } 
    }
  })

  // 5. Tự động tạo Playlist từ Album
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
              const imgDest = join(rootPath, `${safeAlbumName}.${imgExt}`)
              if (!fs.existsSync(imgDest)) {
                fs.writeFileSync(imgDest, Buffer.from(metadata.common.picture[0].data))
              }
            }
            
            fs.renameSync(itemPath, join(albumDirPath, item))
            movedCount++
          }
        } catch (e) {}
      }
    }
    return { success: true, movedCount }
  })

  // ==========================================
  // HỆ THỐNG GIAO TIẾP CLOUD & TIỆN ÍCH
  // ==========================================

  // Tải nhạc cục bộ thủ công (Mục "Tải lên từ máy tính")
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
      } catch (err) {
        console.error(`Lỗi đọc file ${file}:`, err)
      }
    }
    return tracks
  })

  // Tải 1 file từ Cloud
  ipcMain.handle('music:downloadCloudFile', async (_, url, filename) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const savePath = join(filePaths[0], filename)
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      fs.writeFileSync(savePath, Buffer.from(arrayBuffer))
      return { success: true, localPath: pathToFileURL(savePath).href }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Quét Google Drive (Dùng key ở .env)
  ipcMain.handle('music:fetchDriveFiles', async (_, folderId) => {
    const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY
    if (!apiKey) return { success: false, error: 'Chưa cấu hình API Key trong file .env!' }
    
    try {
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&key=${apiKey}`
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.error) return { success: false, error: data.error.message }
      
      const audioFiles = data.files.filter((f: any) => 
        f.mimeType.startsWith('audio/') || 
        f.name.endsWith('.mp3') || f.name.endsWith('.flac') ||
        f.name.endsWith('.wav') || f.name.endsWith('.m4a')
      )
      
      const tracks = audioFiles.map((file: any) => {
        const format = file.name.split('.').pop().toUpperCase()
        return {
          id: `gd-${file.id}`,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Google Drive',
          album: 'Cloud',
          duration: 0,
          format: format,
          isCloud: true,
          url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`,
          coverArt: null
        }
      })
      return { success: true, tracks }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Tải hàng loạt file từ Drive
  ipcMain.handle('music:downloadMultipleFiles', async (_, files: any[]) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return { success: false }
    const saveDir = filePaths[0]
    const downloadedTracks: any[] = []
    
    try {
      for (const file of files) {
        const safeTitle = file.title.replace(/[^a-z0-9\s]/gi, '_').trim()
        const savePath = join(saveDir, `${safeTitle}.${file.format.toLowerCase()}`)
        
        const response = await fetch(file.url)
        const arrayBuffer = await response.arrayBuffer()
        fs.writeFileSync(savePath, Buffer.from(arrayBuffer))
        
        // Quét lại Metadata sau khi tải
        try {
          const metadata = await mm.parseFile(savePath)
          let coverBase64 = null
          if (metadata.common.picture && metadata.common.picture.length > 0) {
            const picBuffer = Buffer.from(metadata.common.picture[0].data)
            coverBase64 = `data:${metadata.common.picture[0].format};base64,${picBuffer.toString('base64')}`
          }
          downloadedTracks.push({
            id: savePath,
            filePath: pathToFileURL(savePath).href,
            title: metadata.common.title || safeTitle,
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album',
            duration: metadata.format.duration,
            format: metadata.format.container || file.format,
            bitrate: metadata.format.bitrate,
            sampleRate: metadata.format.sampleRate,
            lossless: metadata.format.lossless,
            coverArt: coverBase64,
            isCloud: false
          })
        } catch (metaErr) {
          downloadedTracks.push({
            ...file,
            id: savePath,
            filePath: pathToFileURL(savePath).href,
            isCloud: false
          })
        }
      }
      return { success: true, tracks: downloadedTracks }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Khởi tạo cửa sổ
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})