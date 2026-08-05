import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage, globalShortcut, nativeImage, Tray, Menu } from 'electron'
import crypto from 'crypto'
import { join } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import * as mm from 'music-metadata'
import { pathToFileURL } from 'url'
import NodeID3 from 'node-id3'
// Cấu hình lưu trữ đường dẫn thư viện
const CONFIG_PATH = join(app.getPath('userData'), 'music-config.json')

// Bật tính năng thu gom rác chủ động và giới hạn dung lượng không gian bộ nhớ cũ
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=256');
// Tối ưu hóa GPU Rasterization để tiết kiệm VRAM/RAM đồ họa
app.commandLine.appendSwitch('enable-zero-copy');

// Cấu hình tray và minimize
let tray: Tray | null = null
let isQuitting = false // Cờ đánh dấu khi người dùng thực sự muốn thoát ứng dụng
let closeToTray = false
let minimizeToTray = false

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      
      // Khôi phục (Giải mã) các API Key nếu hệ thống mã hóa khả dụng
      if (app.isReady() && safeStorage.isEncryptionAvailable()) {
        
        // Giải mã Google Drive API Key
        if (config.googleDriveApiKey && config.googleDriveApiKey.startsWith('ENC:')) {
          try {
            const buffer = Buffer.from(config.googleDriveApiKey.replace('ENC:', ''), 'base64')
            config.googleDriveApiKey = safeStorage.decryptString(buffer)
          } catch (e) { console.error('Lỗi giải mã Google Drive API Key', e) }
        }

        // Giải mã Musixmatch API Key (nếu bạn có dùng)
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
    eqBands: null,
    liteMode: false // MỚI: Thêm mặc định cho Lite Mode
  }
}

function saveConfig(data: any) {
  const currentConfig = getConfig()
  const newConfig = { ...currentConfig, ...data }

  // Mã hóa API Key trước khi ghi đè xuống file JSON
  if (app.isReady() && safeStorage.isEncryptionAvailable()) {
    
    // Mã hóa Google Drive API Key
    if (data.googleDriveApiKey && !data.googleDriveApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.googleDriveApiKey)
        newConfig.googleDriveApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) { console.error('Lỗi mã hóa Google Drive API Key', e) }
    }

    // Mã hóa Musixmatch API Key (nếu bạn có dùng)
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
    title: "MEI'S RADIO",
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })
  
  // Đọc cấu hình khi khởi tạo cửa sổ
  const config = getConfig()
  closeToTray = config.closeToTray ?? false
  minimizeToTray = config.minimizeToTray ?? false

  // MỚI: Bắt sự kiện khi bấm nút Thu nhỏ (Minimize - Dấu trừ)
  // @ts-ignore
  mainWindow.on('minimize', (event: Electron.Event) => {
    if (minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide() // Ẩn khỏi Taskbar, chỉ hiện ở System Tray
    }
  })

  // MỚI: Bắt sự kiện khi bấm nút Đóng (Close - Dấu X)
  mainWindow.on('close', (event: Electron.Event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
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

  // ==========================================
  // API CẤU HÌNH & THƯ VIỆN
  // ==========================================
  ipcMain.handle('music:getConfig', () => getConfig())
  ipcMain.handle('music:saveConfig', (_, data) => {
    saveConfig(data)
    return { success: true }
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

    // MỚI: Khởi tạo thư mục ẩn để chứa ảnh Proxy (Thumbnail)
    const thumbDir = join(rootPath, '.thumbnails')
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir)

    for (const item of items) {
      const itemPath = join(rootPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory() && item !== '.thumbnails') {
        const playlistTracks: any[] = []
        const subItems = fs.readdirSync(itemPath)
        for (const subItem of subItems) {
          if (supportedExts.some(ext => subItem.toLowerCase().endsWith(ext))) {
            const trackPath = join(itemPath, subItem)
            
            // Xử lý Caching Ảnh Proxy
            let coverUrl: string | null = null
            const trackHash = crypto.createHash('md5').update(trackPath).digest('hex')
            const thumbPath = join(thumbDir, `${trackHash}.jpg`)

            if (fs.existsSync(thumbPath)) {
              coverUrl = pathToFileURL(thumbPath).href
            }

            try {
              const metadata = await mm.parseFile(trackPath)
              
              if (!coverUrl && metadata.common.picture && metadata.common.picture.length > 0) {
                try {
                  const img = nativeImage.createFromBuffer(Buffer.from(metadata.common.picture[0].data))
                  const resized = img.resize({ width: 128, height: 128, quality: 'good' })
                  fs.writeFileSync(thumbPath, resized.toJPEG(80))
                  coverUrl = pathToFileURL(thumbPath).href
                } catch(e) {}
              }

              const trackData = {
                id: trackPath, filePath: pathToFileURL(trackPath).href, 
                title: metadata.common.title || subItem.replace(/\.[^/.]+$/, ""),
                artist: metadata.common.artist || 'Unknown', album: metadata.common.album || 'Unknown',
                duration: metadata.format.duration, format: metadata.format.container || subItem.split('.').pop()?.toUpperCase(),
                bitrate: metadata.format.bitrate, sampleRate: metadata.format.sampleRate,
                lossless: metadata.format.lossless, isCloud: false, coverArt: coverUrl,
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
        
        let thumbnailUrl: string | null = null
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
        
        // Xử lý Caching Ảnh Proxy cho bài hát ở Thư viện gốc
        let coverUrl: string | null = null
        const trackHash = crypto.createHash('md5').update(itemPath).digest('hex')
        const thumbPath = join(thumbDir, `${trackHash}.jpg`)

        if (fs.existsSync(thumbPath)) {
          coverUrl = pathToFileURL(thumbPath).href
        }

        try {
          const metadata = await mm.parseFile(itemPath)
          
          if (!coverUrl && metadata.common.picture && metadata.common.picture.length > 0) {
            try {
              const img = nativeImage.createFromBuffer(Buffer.from(metadata.common.picture[0].data))
              const resized = img.resize({ width: 128, height: 128, quality: 'good' })
              fs.writeFileSync(thumbPath, resized.toJPEG(80))
              coverUrl = pathToFileURL(thumbPath).href
            } catch(e) {}
          }

          tracks.push({
            id: itemPath, filePath: pathToFileURL(itemPath).href, 
            title: metadata.common.title || item.replace(/\.[^/.]+$/, ""),
            artist: metadata.common.artist || 'Unknown', album: metadata.common.album || 'Unknown',
            duration: metadata.format.duration, format: metadata.format.container || item.split('.').pop()?.toUpperCase(),
            isCloud: false, coverArt: coverUrl, lyrics: metadata.common.lyrics ? metadata.common.lyrics[0] : null
          })
        } catch (e) {
          tracks.push({ id: itemPath, filePath: pathToFileURL(itemPath).href, title: item, isCloud: false })
        }
      }
    }
    return { success: true, libraryPath: rootPath, tracks, playlists }
  })

  // 3. Đổi tên Playlist (Thư mục & Ảnh)
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

  // 4. Chọn và lưu ảnh Thumbnail cho Playlist
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

  // 5. Tự động tạo Playlist từ Album
  ipcMain.handle('music:autoGeneratePlaylists', async () => {
    const rootPath = getConfig().libraryPath
    const items = fs.readdirSync(rootPath)
    const supportedExts = ['.mp3', '.flac', '.wav', '.m4a']
    let movedCount = 0
    for (const item of items) {
      const itemPath = join(rootPath, item)
      if (!fs.existsSync(itemPath)) continue
      if (fs.statSync(itemPath).isFile() && supportedExts.some(ext => item.toLowerCase().endsWith(ext))) {
        try {
          const metadata = await mm.parseFile(itemPath)
          const albumName = metadata.common.album
          if (albumName && albumName.trim() !== '') {
            const safeAlbumName = albumName.replace(/[<>:"\/\\|?*]/g, '').trim()
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

  // 6. Đăng ký IPC handler để đọc lời bài hát
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

      if (newImagePath) {
        tags.image = newImagePath
      }

      // Hiện tại hỗ trợ write ID3 cho MP3
      if (rawPath.toLowerCase().endsWith('.mp3')) {
        const success = NodeID3.update(tags, rawPath)
        if (success) return { success: true }
        return { success: false, error: 'Không thể ghi thẻ ID3' }
      } else {
        // Đối với FLAC/WAV, tạo file .lrc cục bộ cho lời bài hát thay thế
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
    const tracks: any[] = []
    
    for (const file of audioFiles) {
      const filePath = join(folderPath, file)
      try {
        const metadata = await mm.parseFile(filePath)
        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          // const buffer = Buffer.from(picture.data)
          coverBase64 = null
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
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }
    
    const savePath = join(rootPath, filename)
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // Ghi file trực tiếp để giữ nguyên chất lượng
      fs.writeFileSync(savePath, buffer)

      // Xử lý trích xuất & nhúng Metadata (Thumbnail, Lời bài hát nếu có từ Drive API)
      try {
        const metadata = await mm.parseFile(savePath)
        const ext = savePath.toLowerCase().split('.').pop()

        // Nếu là file MP3, hỗ trợ ghi trực tiếp ID3 tag (ảnh bìa, lyrics) vào file
        if (ext === 'mp3') {
          const tags: NodeID3.Tags = {
            title: metadata.common.title || filename.replace(/\.[^/.]+$/, ""),
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album',
          }
          if (metadata.common.picture && metadata.common.picture.length > 0) {
            tags.image = {
              mime: metadata.common.picture[0].format,
              type: { id: 3, name: 'front cover' },
              description: 'Cover',
              imageBuffer: Buffer.from(metadata.common.picture[0].data)
            }
          }
          if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
            tags.unsynchronisedLyrics = { 
              language: 'eng', 
              text: String(metadata.common.lyrics[0]) // Ép kiểu chuỗi
            }
          }
          NodeID3.update(tags, savePath)
        } else {
          // Đối với FLAC/WAV (Lossless), nếu có lyrics thì tách ra file .lrc đi kèm cùng cấp
          if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
            const fileNameWithoutExt = path.basename(savePath, path.extname(savePath))
            const lrcPath = join(rootPath, `${fileNameWithoutExt}.lrc`)
            const lyricText = typeof metadata.common.lyrics[0] === 'string' 
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
  })

  // Quét Google Drive (Sử dụng API Key từ Cài đặt, hỗ trợ tải > 100 tệp)
  ipcMain.handle('music:fetchDriveFiles', async (_, folderId) => {
    const apiKey = getConfig().googleDriveApiKey
    
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, error: 'Chưa cấu hình API Key! Vui lòng vào Cài đặt để thêm khóa API Google Drive của bạn.' }
    }
    
    try {
      let allFiles: any[] = []
      let pageToken = ''
      let hasNextPage = true

      // Lặp liên tục để lấy toàn bộ danh sách tệp nếu có nhiều hơn 1000 tệp
      while (hasNextPage) {
        // Thêm pageSize=1000 và nextPageToken vào cấu trúc URL
        let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)&key=${apiKey}`
        
        if (pageToken) {
          url += `&pageToken=${pageToken}`
        }

        const response = await fetch(url)
        const data = await response.json()
        
        if (data.error) return { success: false, error: data.error.message }
        
        if (data.files && data.files.length > 0) {
          allFiles = allFiles.concat(data.files) // Gộp tệp mới vào mảng tổng
        }

        // Kiểm tra xem Google có báo còn trang tiếp theo không
        if (data.nextPageToken) {
          pageToken = data.nextPageToken
        } else {
          hasNextPage = false // Hết tệp để tải, dừng vòng lặp
        }
      }
      
      // Lọc ra các file âm thanh từ mảng tổng
      const audioFiles = allFiles.filter((f: any) => 
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

  // ==========================================
  // TẢI HÀNG LOẠT TỪ CLOUD (CÓ CHECK TRÙNG LẶP & LỌC SỐ & TIẾN ĐỘ)
  // ==========================================
  ipcMain.handle('music:downloadMultipleFiles', async (event, files: any[], existingTracks: any[] = []) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình thư mục Thư viện trong Cài đặt!' }
    
    const downloadedTracks: any[] = []
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Gửi tiến trình về giao diện
        event.sender.send('download-progress', { 
          current: i + 1, 
          total: files.length, 
          fileName: file.title || 'Đang tải...' 
        })

        // Lấy tên gốc và XÓA số thứ tự cộng với dấu phân cách ở đầu (vd: "01. acb@123" -> "acb@123")
        // Lưu ý: Dùng dấu + ở cuối Regex để tránh xóa nhầm các bài hát có tên bắt đầu bằng số (vd: "1989")
        let originalTitle = (file.title || 'track').replace(/^\d+[\s\.\-\_]+/, '').trim()
        
        // Lọc bỏ ký tự cấm của hệ điều hành để làm tên file, nhưng vẫn giữ lại các ký tự đặc biệt hợp lệ (@, #, $)
        const safeTitle = originalTitle.replace(/[<>:"\/\\|?*]/g, '_').trim()
        const ext = file.format ? file.format.toLowerCase() : 'mp3'
        const filename = `${safeTitle}.${ext}`
        
        const tempPath = join(rootPath, `temp_${Date.now()}_${filename}`)
        let destPath = join(rootPath, filename)
        
        const response = await fetch(file.url)
        const arrayBuffer = await response.arrayBuffer()
        fs.writeFileSync(tempPath, Buffer.from(arrayBuffer))
        
        let title = originalTitle
        let artist = 'Unknown Artist'
        let album = 'Unknown Album'
        let metadata

        try {
          metadata = await mm.parseFile(tempPath)
          // Trích xuất trọn vẹn dữ liệu lõi
          if (metadata.common.title) {
            // Áp dụng lại Regex an toàn (+) để đảm bảo nếu thẻ tag nội bộ có dính số thứ tự thì cũng bị xóa an toàn
            title = metadata.common.title.replace(/^\d+[\s\.\-\_]+/, '').trim()
          }
          if (metadata.common.artist) artist = metadata.common.artist
          if (metadata.common.album) album = metadata.common.album
        } catch (e) {}

        const duplicate = existingTracks.find(t => 
          t.title && t.artist && 
          t.title.toLowerCase() === title.toLowerCase() && 
          t.artist.toLowerCase() === artist.toLowerCase()
        )

        // Tự động bỏ qua tệp nếu phát hiện trùng lặp (không hiện thông báo hỏi)
        if (duplicate) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) // Xóa file tạm vừa tải về
          continue // Bỏ qua tệp này và chuyển sang tệp tiếp theo ngay lập tức
        }

        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        fs.renameSync(tempPath, destPath)

        try {
          if (ext === 'mp3') {
            // Chỉ cập nhật các Tag đã được chuẩn hóa (Bảo toàn Album & Nghệ sĩ)
            const tags: NodeID3.Tags = { title, artist, album }
            
            // Giữ lại thẻ ảnh trong file gốc (nhưng không nạp vào RAM)
            if (metadata?.common.picture && metadata.common.picture.length > 0) {
            tags.image = { 
              mime: metadata.common.picture[0].format, 
              type: { id: 3, name: 'front cover' },
              description: 'Cover',
              imageBuffer: Buffer.from(metadata.common.picture[0].data) 
            }
          }
            NodeID3.update(tags, destPath)
          } else {
            if (metadata?.common.lyrics && metadata.common.lyrics.length > 0) {
              const lyricText = typeof metadata.common.lyrics[0] === 'string' ? metadata.common.lyrics[0] : (metadata.common.lyrics[0] as any).text || ''
              if (lyricText) fs.writeFileSync(join(rootPath, `${path.basename(destPath, `.${ext}`)}.lrc`), lyricText, 'utf-8')
            }
          }

          const newTrackObj = {
            id: destPath, filePath: pathToFileURL(destPath).href, title, artist,
            album, duration: metadata?.format.duration || 0,
            format: metadata?.format.container || ext.toUpperCase(), bitrate: metadata?.format.bitrate,
            sampleRate: metadata?.format.sampleRate, lossless: metadata?.format.lossless, coverArt: null, isCloud: false
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
  
  // Lấy ảnh bìa từ bài hát đầu tiên trong Playlist
  ipcMain.handle('music:extractPlaylistThumbnail', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    const playlistPath = join(rootPath, playlistName)
    
    try {
      const items = fs.readdirSync(playlistPath)
      const supportedExts = ['.mp3', '.flac', '.wav', '.m4a']
      
      // Tìm bài hát đầu tiên có đuôi hỗ trợ
      const firstTrack = items.find(item => supportedExts.some(ext => item.toLowerCase().endsWith(ext)))
      if (!firstTrack) return { success: false, error: 'Playlist đang trống, không có bài hát nào!' }

      const trackPath = join(playlistPath, firstTrack)
      const metadata = await mm.parseFile(trackPath)

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const ext = metadata.common.picture[0].format.split('/')[1] || 'jpg'
        const destPath = join(playlistPath, `${playlistName}.${ext}`)

        // Xóa tất cả ảnh bìa cũ trước khi lưu ảnh mới
        const exts = ['jpg', 'png', 'jpeg', 'webp']
        for (const e of exts) {
          const oldImg = join(playlistPath, `${playlistName}.${e}`)
          if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
        }

        // Lưu ảnh từ thẻ metadata ra file
        fs.writeFileSync(destPath, Buffer.from(metadata.common.picture[0].data))
        return { success: true }
      }
      return { success: false, error: 'Bài hát đầu tiên trong thư mục không có thẻ ảnh bìa!' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // TÍCH HỢP MUSIXMATCH API (DESKTOP BYPASS LẤY LRC 100%)
  // ==========================================
  
  let mxmToken: string | null = null

  // Header ngụy trang thành phần mềm Musixmatch Desktop thật
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
    } catch (e) {
      console.error("Lỗi lấy Token Musixmatch:", e)
    }
    return null
  }

  ipcMain.handle('music:fetchMusixmatchLyrics', async (_, title: string, artist: string) => {
    try {
      let token = await getMusixmatchToken()
      if (!token) return { success: false, error: 'Không thể khởi tạo token Musixmatch' }

      // 1. Tìm kiếm ID bài hát (Track ID)
      const cleanTitle = title.replace(/\([^)]*\)/g, '').trim()
      let searchUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&q_track=${encodeURIComponent(cleanTitle)}&q_artist=${encodeURIComponent(artist)}&usertoken=${token}`
      
      let searchRes = await fetch(searchUrl, { headers: mxmHeaders })
      let searchData = await searchRes.json()

      // FIX 1: Tự động làm mới Token nếu bị Musixmatch báo hết hạn (Lỗi 401)
      if (searchData.message?.header?.status_code === 401) {
        mxmToken = null // Xóa token cũ
        token = await getMusixmatchToken() // Xin lại token mới
        searchUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&q_track=${encodeURIComponent(cleanTitle)}&q_artist=${encodeURIComponent(artist)}&usertoken=${token}`
        searchRes = await fetch(searchUrl, { headers: mxmHeaders })
        searchData = await searchRes.json()
      }

      if (searchData.message?.header?.status_code !== 200 || !searchData.message?.body?.track_list || searchData.message.body.track_list.length === 0) {
        return { success: false, error: 'Không tìm thấy bài hát trên hệ thống' }
      }

      const trackId = searchData.message.body.track_list[0].track.track_id

      // FIX 2: Bổ sung &subtitle_format=lrc để ép Musixmatch trả về đúng định dạng chuẩn
      const subtitleUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&track_id=${trackId}&subtitle_format=lrc&usertoken=${token}`
      const subtitleRes = await fetch(subtitleUrl, { headers: mxmHeaders })
      const subtitleData = await subtitleRes.json()

      if (subtitleData.message?.header?.status_code === 200 && subtitleData.message?.body?.subtitle) {
        return { success: true, lyrics: subtitleData.message.body.subtitle.subtitle_body, isSynced: true }
      }

      // 3. Nếu không có bản đồng bộ, lấy lời thô
      const lyricsUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?app_id=web-desktop-app-v1.0&track_id=${trackId}&usertoken=${token}`
      const lyricsRes = await fetch(lyricsUrl, { headers: mxmHeaders })
      const lyricsData = await lyricsRes.json()

      if (lyricsData.message?.header?.status_code === 200 && lyricsData.message?.body?.lyrics) {
        return { success: true, lyrics: lyricsData.message.body.lyrics.lyrics_body, isSynced: false }
      }

      return { success: false, error: 'Bài hát chưa được cập nhật lời' }
    } catch (error: any) {
      console.error("Lỗi API Musixmatch:", error)
      return { success: false, error: error.message }
    }
  })

  // ==========================================
  // NHẬP FILE TỪ MÁY TÍNH / Ổ CỨNG RỜI
  // ==========================================
  ipcMain.handle('music:importLocalFiles', async (_, targetSubFolder?: string) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) {
      return { success: false, error: 'Chưa cấu hình thư mục Thư viện! Hãy vào Cài đặt để thiết lập.' }
    }

    // Nếu có truyền tên Playlist vào, chép vào thư mục Playlist, ngược lại chép vào Thư viện gốc
    const destFolder = targetSubFolder ? join(rootPath, targetSubFolder) : rootPath
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder)

    // Mở hộp thoại chọn nhiều file nhạc
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a'] }]
    })

    if (canceled || filePaths.length === 0) return { success: false, canceled: true }

    const importedTracks: any[] = []
    
    for (const sourcePath of filePaths) {
      const fileName = path.basename(sourcePath)
      const destPath = join(destFolder, fileName)

      try {
        // Tránh lỗi copy đè chính nó nếu người dùng chọn file đã nằm sẵn trong thư mục
        if (sourcePath !== destPath) {
          fs.copyFileSync(sourcePath, destPath)
          
          // Tự động tìm và copy luôn file lời bài hát (.lrc) trùng tên nếu có
          const lrcSource = sourcePath.replace(/\.[^/.]+$/, ".lrc")
          const lrcDest = destPath.replace(/\.[^/.]+$/, ".lrc")
          if (fs.existsSync(lrcSource) && lrcSource !== lrcDest) {
            fs.copyFileSync(lrcSource, lrcDest)
          }
        }

        // Quét metadata của file mới vừa chép
        const metadata = await mm.parseFile(destPath)
        let coverBase64 = null
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          coverBase64 = null
        }

        importedTracks.push({
          id: destPath,
          filePath: pathToFileURL(destPath).href,
          title: metadata.common.title || fileName.replace(/\.[^/.]+$/, ""),
          artist: metadata.common.artist || 'Unknown Artist',
          album: metadata.common.album || 'Unknown Album',
          duration: metadata.format.duration,
          format: metadata.format.container || fileName.split('.').pop()?.toUpperCase(),
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          lossless: metadata.format.lossless,
          coverArt: coverBase64,
          isCloud: false
        })
      } catch (err) {
        importedTracks.push({ id: destPath, filePath: pathToFileURL(destPath).href, title: fileName, isCloud: false })
      }
    }

    return { success: true, tracks: importedTracks }
  })

  // ==========================================
  // API TRÍCH XUẤT ẢNH BÌA ĐƠN LẺ (ĐÃ TỐI ƯU BASE64)
  // ==========================================
  ipcMain.handle('music:getTrackCover', async (_, filePath: string) => {
    try {
      if (filePath.startsWith('http')) return null

      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

      // 1. Khởi tạo thư mục proxy ảnh
      const rootPath = getConfig().libraryPath
      if (!rootPath) return null
      const thumbDir = join(rootPath, '.thumbnails')
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir)

      // 2. Băm tên file để làm ID ảnh cache
      const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
      const thumbPath = join(thumbDir, `${trackHash}.jpg`)

      // 3. Nếu ảnh đã cache trước đó, lập tức trả về Local URL để giải phóng RAM
      if (fs.existsSync(thumbPath)) {
        return pathToFileURL(thumbPath).href
      }

      // 4. Nếu chưa có, trích xuất, giảm dung lượng và lưu xuống ổ cứng
      const metadata = await mm.parseFile(rawPath)
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const img = nativeImage.createFromBuffer(Buffer.from(metadata.common.picture[0].data))
        const resized = img.resize({ width: 500, quality: 'good' })
        fs.writeFileSync(thumbPath, resized.toJPEG(80))
        return pathToFileURL(thumbPath).href
      }
    } catch (e) {}
    return null
  })

  // ==========================================
  // API TRÍCH XUẤT ẢNH BÌA CHẤT LƯỢNG GỐC CHO LYRICS
  // ==========================================
  ipcMain.handle('music:getOriginalTrackCover', async (_, filePath: string) => {
    try {
      if (filePath.startsWith('http')) return null
      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

      const metadata = await mm.parseFile(rawPath)
      // Lấy trực tiếp ảnh Base64 chất lượng cao từ metadata mà không qua giảm dung lượng
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        return `data:${metadata.common.picture[0].format};base64,${Buffer.from(metadata.common.picture[0].data).toString('base64')}`
      }
    } catch (e) {}
    return null
  })

  // ==========================================
  // HỆ THỐNG TẠO PLAYLIST THỦ CÔNG
  // ==========================================

  // 1. Tạo playlist thủ công mới
  ipcMain.handle('music:createPlaylist', async (_, playlistName) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) return { success: false, error: 'Chưa cấu hình thư mục thư viện!' }
    
    const safeName = playlistName.replace(/[<>:"\/\\|?*]/g, '').trim()
    if (!safeName) return { success: false, error: 'Tên playlist không hợp lệ!' }

    const dirPath = join(rootPath, safeName)
    if (fs.existsSync(dirPath)) {
      return { success: false, error: 'Playlist đã tồn tại!' }
    }

    try {
      fs.mkdirSync(dirPath, { recursive: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. Thêm bài hát vào playlist mà KHÔNG nhân bản file vật lý (Dùng Hard Link)
  // Thêm bài hát vào playlist bằng cơ chế Hard Link (Tối ưu 100% không gian, không sao chép)
  ipcMain.handle('music:addTrackToPlaylist', async (_, playlistName, trackPath) => {
    const rootPath = getConfig().libraryPath
    if (!rootPath) return { success: false, error: 'Chưa cấu hình thư viện!' }

    let rawPath = trackPath.replace(/^file:\/\/\/?/, '')
    if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

    if (!fs.existsSync(rawPath)) return { success: false, error: 'File nguồn không tồn tại!' }

    const playlistDir = join(rootPath, playlistName)
    if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true })

    const fileName = path.basename(rawPath)
    const destPath = join(playlistDir, fileName)

    // Nếu tệp đã tồn tại trong thư mục playlist thì bỏ qua, không làm gì thêm
    if (fs.existsSync(destPath)) {
      return { success: true, note: 'Bài hát đã có trong playlist này rồi!' }
    }

    try {
      // BẮT BUỘC TẠO HARD LINK: Trỏ chung một vùng nhớ vật lý, không tốn thêm dung lượng
      fs.linkSync(rawPath, destPath)

      // Liên kết luôn file lời bài hát (.lrc) đi kèm nếu có (cũng dùng Hard Link)
      const lrcSource = rawPath.replace(/\.[^/.]+$/, '.lrc')
      const lrcDest = destPath.replace(/\.[^/.]+$/, '.lrc')
      if (fs.existsSync(lrcSource) && !fs.existsSync(lrcDest)) {
        try { 
          fs.linkSync(lrcSource, lrcDest) 
        } catch (e) {}
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // API TỐI ƯU HÓA HỆ THỐNG
  // ==========================================
  ipcMain.handle('music:forceGC', () => {
    // Kích hoạt dọn rác thủ công giải phóng RAM
    if (typeof global.gc === 'function') {
      global.gc()
    }
  })

  // Khởi tạo cửa sổ
  createWindow()

  // ==========================================
  // ĐĂNG KÝ PHÍM TẮT TOÀN CỤC (GLOBAL SHORTCUTS)
  // ==========================================
  const sendShortcut = (action: string) => {
    if (mainWindow) mainWindow.webContents.send('global-shortcut', action)
  }

  // 1. Phím tắt tổ hợp Ctrl
  globalShortcut.register('CommandOrControl+Right', () => sendShortcut('next'))
  globalShortcut.register('CommandOrControl+Left', () => sendShortcut('prev'))
  globalShortcut.register('CommandOrControl+Up', () => sendShortcut('vol-up'))
  globalShortcut.register('CommandOrControl+Down', () => sendShortcut('vol-down'))
  
  // Ctrl + Space để Play/Pause (Thay vì Next như cũ)
  globalShortcut.register('CommandOrControl+Space', () => sendShortcut('play-pause'))

  // 2. Nhận diện các phím Media chuyên dụng trên bàn phím
  globalShortcut.register('MediaPlayPause', () => sendShortcut('play-pause'))
  globalShortcut.register('MediaNextTrack', () => sendShortcut('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendShortcut('prev'))
  
  // Lưu ý: Đăng ký 2 phím Volume dưới đây sẽ chặn tính năng tăng/giảm âm lượng tổng của Windows/macOS,
  // và chỉ tăng/giảm âm lượng bên trong thanh trượt của ứng dụng.
  globalShortcut.register('VolumeUp', () => sendShortcut('vol-up'))
  globalShortcut.register('VolumeDown', () => sendShortcut('vol-down'))

  // ==========================================
  // KHỞI TẠO SYSTEM TRAY (KHAY HỆ THỐNG)
  // ==========================================
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Hiển thị Meis Radio', click: () => { mainWindow?.show(); mainWindow?.restore(); } },
    { type: 'separator' },
    { label: 'Phát / Tạm dừng', click: () => sendShortcut('play-pause') },
    { label: 'Bài tiếp theo', click: () => sendShortcut('next') },
    { label: 'Bài trước đó', click: () => sendShortcut('prev') },
    { type: 'separator' },
    { 
      label: 'Thoát hoàn toàn', 
      click: () => { 
        isQuitting = true; 
        app.quit(); 
      } 
    }
  ])
  tray.setToolTip('Meis Radio')
  tray.setContextMenu(contextMenu)
  
  // Click đúp vào icon ở Tray để mở nhanh app
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.restore()
  })

  // ==========================================
  // API CẬP NHẬT TRAY & MINI PLAYER
  // ==========================================
  ipcMain.handle('music:updateTrayConfig', (_, c) => {
    closeToTray = c.closeToTray
    minimizeToTray = c.minimizeToTray
  })

  ipcMain.handle('music:toggleMiniPlayer', (_, isMini: boolean) => {
    if (!mainWindow) return
    if (isMini) {
      // MỚI: Bắt buộc thoát chế độ Toàn màn hình / Phóng to trước khi resize
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      
      mainWindow.setContentSize(400, 120, true) // Đổi kích thước thành khung chữ nhật nhỏ
      mainWindow.setAlwaysOnTop(true, 'floating') // Luôn nổi trên các cửa sổ khác
      mainWindow.setResizable(false) // Khóa kích thước
    } else {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)
      mainWindow.setContentSize(1200, 800, true) // Trả về kích thước gốc
      mainWindow.center()
    }
  })
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})