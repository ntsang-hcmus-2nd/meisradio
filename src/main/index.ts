import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage, globalShortcut, nativeImage, Tray, Menu, session } from 'electron'
import { spawn } from 'child_process'
import crypto from 'crypto'
import { join } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import * as mm from 'music-metadata'
import { pathToFileURL } from 'url'
import NodeID3 from 'node-id3'
import ytdlpDefault, { create } from 'yt-dlp-exec' // Đã sửa lỗi import yt-dlp
import axios from 'axios'
import http from 'http'
import { MpvManager } from './MpvManager'
import { writeFlacMetadata } from './flacMetadata'
import { 
  getScUserProfile, 
  getScTrendingCharts, 
  getScUserStream, 
  getScUserLikes, 
  searchSoundCloud, 
  getScPlaylistTracks, 
  resolveScStreamUrl 
} from './soundcloud'

export const SUPPORTED_AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.m4a', '.opus', '.ogg', '.aac', '.alac', '.aiff', '.wma']

let mpvManager: MpvManager | null = null
// FFmpeg directories

const ffmpegDir = is.dev 
  ? join(app.getAppPath(), 'resources', 'bin')
  : join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin');

// 1. QUẢN LÝ THƯ MỤC DỮ LIỆU ĐỘC LẬP (Chống lỗi cấm ghi ổ đĩa khi Build)
const DATA_FOLDER = is.dev 
  ? app.getPath('userData') 
  : join(path.dirname(app.getPath('exe')), 'MeisRadioData');

if (!fs.existsSync(DATA_FOLDER)) {
  try { fs.mkdirSync(DATA_FOLDER, { recursive: true }); } catch (err) { }
}

const IMAGE_CACHE_DIR = join(DATA_FOLDER, '.image_cache');
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  try { fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true }); } catch (err) { }
}

const CONFIG_PATH = join(DATA_FOLDER, 'music-config.json');
const METADATA_CACHE_PATH = join(DATA_FOLDER, 'metadata-cache.json');
const LIBRARY_CACHE_PATH = join(DATA_FOLDER, 'library-cache.json');

let metadataCache: Record<string, { mtime: number; data: any }> = {};
try {
  if (fs.existsSync(METADATA_CACHE_PATH)) {
    metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_PATH, 'utf-8'));
  }
} catch (e) {
  metadataCache = {};
}

function saveMetadataCache() {
  try {
    fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metadataCache));
  } catch (e) {}
}

// 2. KHỞI TẠO YT-DLP AN TOÀN (Chống lỗi không tìm thấy file .exe trong app.asar)
const ytdlp = is.dev 
  ? ytdlpDefault 
  : create(join(
      app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
      'node_modules',
      'yt-dlp-exec',
      'bin',
      process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    ));

app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=256');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-hardware-overlays');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let tray: Tray | null = null
let isQuitting = false 
let closeToTray = false
let minimizeToTray = false

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (app.isReady() && safeStorage.isEncryptionAvailable()) {
        if (config.googleDriveApiKey && config.googleDriveApiKey.startsWith('ENC:')) {
          try { config.googleDriveApiKey = safeStorage.decryptString(Buffer.from(config.googleDriveApiKey.replace('ENC:', ''), 'base64')) } catch (e) { }
        }
        if (config.musixmatchApiKey && config.musixmatchApiKey.startsWith('ENC:')) {
          try { config.musixmatchApiKey = safeStorage.decryptString(Buffer.from(config.musixmatchApiKey.replace('ENC:', ''), 'base64')) } catch (e) { }
        }
        if (config.ytCookie && config.ytCookie.startsWith('ENC:')) {
          try { config.ytCookie = safeStorage.decryptString(Buffer.from(config.ytCookie.replace('ENC:', ''), 'base64')) } catch (e) { }
        }
        if (config.scOAuthToken && config.scOAuthToken.startsWith('ENC:')) {
          try { config.scOAuthToken = safeStorage.decryptString(Buffer.from(config.scOAuthToken.replace('ENC:', ''), 'base64')) } catch (e) { }
        }
      }
      return config
    }
  } catch (e) {}
  return { 
    libraryPath: null, crossfadeEnabled: false, crossfadeDuration: 3, 
    volume: 1, eqBands: null, appMode: 'default' // <-- Thay liteMode bằng appMode
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

    // Mã hóa YouTube Music Cookie
    if (data.ytCookie && !data.ytCookie.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.ytCookie)
        newConfig.ytCookie = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) { console.error('Lỗi mã hóa YT Cookie', e) }
    }

    // Mã hóa SoundCloud OAuth Token
    if (data.scOAuthToken && !data.scOAuthToken.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.scOAuthToken)
        newConfig.scOAuthToken = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) { console.error('Lỗi mã hóa SoundCloud OAuth Token', e) }
    }

  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2))
}

let mainWindow: BrowserWindow | null = null
let isInMiniPlayer = false
let preMiniPlayerState: { bounds: Electron.Rectangle; isMaximized: boolean; isFullScreen: boolean } | null = null

// Lưu trạng thái cửa sổ khi thay đổi (chỉ lưu khi không ở chế độ Mini Player)
const saveWindowState = () => {
  if (!mainWindow || isInMiniPlayer) return
  const bounds = mainWindow.getBounds()
  const isMaximized = mainWindow.isMaximized()
  saveConfig({ windowState: { ...bounds, isMaximized } })
}

function createWindow(): void {
  // Đọc cấu hình khi khởi tạo cửa sổ
  const config = getConfig()
  closeToTray = config.closeToTray ?? false
  minimizeToTray = config.minimizeToTray ?? false

  const windowState = config.windowState || { width: 1200, height: 800, isMaximized: false }

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    title: "MEI'S RADIO",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#ffffff',
      height: 40
    },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }
  
  mainWindow.on('resized', saveWindowState)
  mainWindow.on('moved', saveWindowState)
  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)

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
  
  app.on('before-quit', () => {
    isQuitting = true
    if (mpvManager) mpvManager.killAll()
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
  // MPV AUDIO BACKEND IPC
  // ==========================================
  mpvManager = new MpvManager()
  const currentConfig = getConfig()
  mpvManager.init(currentConfig.audioDevice, currentConfig.bitPerfectEnabled ?? false).catch(console.error) // auto init on start
  
  mpvManager.on('time', (val) => mainWindow?.webContents.send('mpv:time', val))
  mpvManager.on('duration', (val) => mainWindow?.webContents.send('mpv:duration', val))
  mpvManager.on('paused', (val) => mainWindow?.webContents.send('mpv:paused', val))
  mpvManager.on('ended', () => mainWindow?.webContents.send('mpv:ended'))

  ipcMain.handle('mpv:play', (_, url, crossfade) => {
    // If it's a file path, we need to ensure it's loaded as raw path by MPV
    // Or if it's http it just works.
    let rawPath = url
    if (rawPath.startsWith('file:///')) {
      const { fileURLToPath } = require('url')
      try { rawPath = fileURLToPath(rawPath) } catch(e){}
    }
    mpvManager?.playTrack(rawPath, crossfade)
  })
  ipcMain.handle('mpv:resume', () => mpvManager?.play())
  ipcMain.handle('mpv:pause', () => mpvManager?.pause())
  ipcMain.handle('mpv:seek', (_, pos) => mpvManager?.seek(pos))
  ipcMain.handle('mpv:setVolume', (_, vol) => mpvManager?.setVolume(vol))
  ipcMain.handle('mpv:setEqualizer', (_, bands, preamp = 0) => mpvManager?.setEqualizer(bands, preamp))
  ipcMain.handle('mpv:setBitPerfect', (_, val) => {
    const config = getConfig()
    config.bitPerfectEnabled = val
    saveConfig(config)
    mpvManager?.init(config.audioDevice, val)
  })

  ipcMain.handle('music:setAudioDevice', (_, deviceId) => {
    const config = getConfig()
    config.audioDevice = deviceId
    saveConfig(config)
    mpvManager?.setAudioDevice(deviceId)
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

  // 2. Đọc toàn bộ thư viện (Tất cả bài hát + Playlists) với cơ chế quét gia tăng (Incremental Scan)
  ipcMain.handle('music:getLibrary', async (_, forceRefresh: boolean = false) => {
    const config = getConfig()
    if (!config.libraryPath || !fs.existsSync(config.libraryPath)) {
      return { success: false, error: 'Chưa cài đặt thư viện' }
    }
    
    const rootPath = config.libraryPath

    // 1. NẾU MỞ APP BÌNH THƯỜNG (KHÔNG FORCE REFRESH): ĐỌC TRỰC TIẾP TỪ CACHE, 0% QUÉT Ổ CỨNG
    if (!forceRefresh && fs.existsSync(LIBRARY_CACHE_PATH)) {
      try {
        const cached = JSON.parse(fs.readFileSync(LIBRARY_CACHE_PATH, 'utf-8'))
        if (cached && cached.libraryPath === rootPath && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
          return { success: true, fromCache: true, libraryPath: rootPath, tracks: cached.tracks, playlists: cached.playlists || [] }
        }
      } catch (e) {}
    }

    // 2. LÀM MỚI GIA TĂNG (INCREMENTAL REFRESH):
    // Nạp lại danh sách bài hát trước đó vào Memory Map để tái sử dụng ngay lập tức
    const previousTrackMap = new Map<string, any>()
    if (fs.existsSync(LIBRARY_CACHE_PATH)) {
      try {
        const cached = JSON.parse(fs.readFileSync(LIBRARY_CACHE_PATH, 'utf-8'))
        if (cached && Array.isArray(cached.tracks)) {
          for (const t of cached.tracks) {
            const key = t.id || t.filePath
            if (key) previousTrackMap.set(key, t)
          }
        }
      } catch (e) {}
    }

    const items = fs.readdirSync(rootPath)
    
    const tracks: any[] = []
    const playlists: any[] = []
    const supportedExts = SUPPORTED_AUDIO_EXTS
    const existingDiskPaths = new Set<string>()

    // Khởi tạo thư mục ẩn để chứa ảnh Proxy (Thumbnail)
    const thumbDir = join(rootPath, '.thumbnails')
    if (!fs.existsSync(thumbDir)) {
      try { fs.mkdirSync(thumbDir) } catch (e) {}
    }

    let cacheModified = false

    const parseOrGetTrack = async (trackPath: string, subItemName: string, stat: fs.Stats) => {
      existingDiskPaths.add(trackPath)

      const trackHash = crypto.createHash('md5').update(trackPath).digest('hex')
      const thumbPath = join(thumbDir, `${trackHash}.jpg`)
      let coverUrl: string | null = null
      if (fs.existsSync(thumbPath)) {
        coverUrl = pathToFileURL(thumbPath).href
      }

      // KIỂM TRA CACHE: Nếu file đã có và mtime không đổi -> TÁI SỬ DỤNG HOÀN TOÀN, KHÔNG ĐỌC LẠI FILE
      const cached = metadataCache[trackPath]
      if (cached && cached.mtime === stat.mtimeMs && cached.data) {
        const existingTrack = previousTrackMap.get(trackPath) || previousTrackMap.get(cached.data.filePath)
        if (existingTrack) {
          return existingTrack
        }
        return {
          ...cached.data,
          filePath: pathToFileURL(trackPath).href,
          coverArt: coverUrl || cached.data.coverArt || null
        }
      }

      // CHỈ ĐỌC VÀ PHÂN TÍCH METADATA VỚI CÁC FILE MỚI ĐƯỢC THÊM HOẶC BỊ SỬA ĐỔI
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
          id: trackPath,
          filePath: pathToFileURL(trackPath).href,
          title: metadata.common.title || subItemName.replace(/\.[^/.]+$/, ""),
          artist: metadata.common.artist || 'Unknown',
          album: metadata.common.album || 'Unknown',
          duration: metadata.format.duration,
          format: metadata.format.container || subItemName.split('.').pop()?.toUpperCase(),
          bitrate: metadata.format.bitrate,
          sampleRate: metadata.format.sampleRate,
          bitDepth: metadata.format.bitsPerSample,
          lossless: metadata.format.lossless,
          isCloud: false,
          coverArt: coverUrl,
          lyrics: metadata.common.lyrics ? metadata.common.lyrics[0] : null
        }

        metadataCache[trackPath] = {
          mtime: stat.mtimeMs,
          data: trackData
        }
        cacheModified = true
        return trackData
      } catch (e) {
        const fallbackTrack = {
          id: trackPath,
          filePath: pathToFileURL(trackPath).href,
          title: subItemName,
          artist: 'Unknown',
          album: 'Unknown',
          isCloud: false,
          coverArt: coverUrl
        }
        return fallbackTrack
      }
    }

    for (const item of items) {
      const itemPath = join(rootPath, item)
      try {
        const stat = fs.statSync(itemPath)

        if (stat.isDirectory() && item !== '.thumbnails') {
          const playlistTracks: any[] = []
          const subItems = fs.readdirSync(itemPath)
          for (const subItem of subItems) {
            if (supportedExts.some(ext => subItem.toLowerCase().endsWith(ext))) {
              const trackPath = join(itemPath, subItem)
              try {
                const subStat = fs.statSync(trackPath)
                const trackData = await parseOrGetTrack(trackPath, subItem, subStat)
                playlistTracks.push(trackData)
                tracks.push(trackData)
              } catch (e) {}
            }
          }
          
          let thumbnailUrl: string | null = null
          const possibleImageExts = ['.jpg', '.png', '.jpeg', '.webp']
          const commonCoverNames = ['cover', 'folder', 'front', 'artwork', item, 'thumb', 'thumbnail', 'album']

          // 1. Kiểm tra các tên cover tiêu chuẩn
          for (const name of commonCoverNames) {
            for (const ext of possibleImageExts) {
              const imgPath = join(itemPath, `${name}${ext}`)
              if (fs.existsSync(imgPath)) {
                thumbnailUrl = `${pathToFileURL(imgPath).href}?t=${Date.now()}`
                break
              }
            }
            if (thumbnailUrl) break
          }

          // 2. Nếu không có tên chuẩn, quét tìm bất kỳ file ảnh nào trong thư mục playlist
          if (!thumbnailUrl) {
            for (const subItem of subItems) {
              if (possibleImageExts.some(ext => subItem.toLowerCase().endsWith(ext))) {
                const imgPath = join(itemPath, subItem)
                thumbnailUrl = `${pathToFileURL(imgPath).href}?t=${Date.now()}`
                break
              }
            }
          }

          playlists.push({ name: item, path: itemPath, tracks: playlistTracks, thumbnail: thumbnailUrl })
        } else if (supportedExts.some(ext => item.toLowerCase().endsWith(ext))) {
          const trackData = await parseOrGetTrack(itemPath, item, stat)
          tracks.push(trackData)
        }
      } catch (e) {}
    }

    // DỌN DẸP CACHE: Loại bỏ các file đã bị xóa khỏi ổ đĩa khỏi metadataCache
    for (const cachedPath of Object.keys(metadataCache)) {
      if (!existingDiskPaths.has(cachedPath)) {
        delete metadataCache[cachedPath]
        cacheModified = true
      }
    }

    if (cacheModified) {
      saveMetadataCache()
    }

    try {
      fs.writeFileSync(LIBRARY_CACHE_PATH, JSON.stringify({ libraryPath: rootPath, tracks, playlists }))
    } catch (e) {}

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
    const supportedExts = SUPPORTED_AUDIO_EXTS
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

  // Đọc buffer file âm thanh để dựng spectrogram toàn bài hát
  ipcMain.handle('music:readAudioBuffer', async (_event, audioFilePath: string) => {
    try {
      if (!audioFilePath) return { success: false, error: 'Đường dẫn rỗng' }
      if (audioFilePath.startsWith('http')) return { success: false, error: 'Chỉ hỗ trợ file cục bộ' }
      let rawPath = audioFilePath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') {
        try { rawPath = decodeURIComponent(rawPath) } catch (e) {}
      }
      if (fs.existsSync(rawPath)) {
        const fileBuffer = fs.readFileSync(rawPath)
        return { 
          success: true, 
          buffer: fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) 
        }
      }
      return { success: false, error: `Không tìm thấy file: ${rawPath}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 7. Cập nhật Metadata (Hỗ trợ MP3 ID3 và FLAC Vorbis Comments + Picture)
  ipcMain.handle('music:updateTags', async (_, filePath: string, newTags: any, newImagePath: string | null) => {
    try {
      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

      if (!fs.existsSync(rawPath)) {
        return { success: false, error: 'Tệp không tồn tại trên hệ thống' }
      }

      const isFlac = rawPath.toLowerCase().endsWith('.flac')
      const isMp3 = rawPath.toLowerCase().endsWith('.mp3')

      if (isFlac) {
        // Ghi trực tiếp vào file FLAC
        const flacRes = await writeFlacMetadata(rawPath, {
          title: newTags.title,
          artist: newTags.artist,
          album: newTags.album,
          lyrics: newTags.lyrics
        }, newImagePath)

        if (!flacRes.success) {
          return { success: false, error: flacRes.error }
        }
      } else if (isMp3) {
        // Ghi trực tiếp vào file MP3
        const tags: any = {
          title: newTags.title,
          artist: newTags.artist,
          album: newTags.album,
          unsynchronisedLyrics: { language: 'eng', text: newTags.lyrics || '' }
        }
        if (newImagePath) {
          tags.image = newImagePath
        }
        const success = NodeID3.update(tags, rawPath)
        if (!success) {
          return { success: false, error: 'Không thể ghi thẻ ID3 vào file MP3' }
        }
      } else {
        // Đối với định dạng khác, lưu Lời bài hát dưới dạng file .lrc trùng tên
        if (newTags.lyrics) {
          const dir = path.dirname(rawPath)
          const fileNameWithoutExt = path.basename(rawPath, path.extname(rawPath))
          const lrcPath = path.join(dir, `${fileNameWithoutExt}.lrc`)
          fs.writeFileSync(lrcPath, newTags.lyrics, 'utf-8')
        }
      }

      // Cập nhật Thumbnail Proxy nếu có ảnh mới
      const config = getConfig()
      const rootPath = config.libraryPath || path.dirname(rawPath)
      const thumbDir = join(rootPath, '.thumbnails')
      if (!fs.existsSync(thumbDir)) {
        try { fs.mkdirSync(thumbDir) } catch (e) {}
      }

      const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
      const thumbPath = join(thumbDir, `${trackHash}.jpg`)
      let coverUrl: string | null = null

      let rawImagePath = newImagePath
      if (rawImagePath && rawImagePath.startsWith('file:///')) {
        const { fileURLToPath } = require('url')
        try { rawImagePath = fileURLToPath(rawImagePath) } catch(e){}
      }

      if (rawImagePath && fs.existsSync(rawImagePath)) {
        try {
          const img = nativeImage.createFromPath(rawImagePath)
          const resized = img.resize({ width: 128, height: 128, quality: 'good' })
          fs.writeFileSync(thumbPath, resized.toJPEG(80))
          coverUrl = `${pathToFileURL(thumbPath).href}?t=${Date.now()}`
        } catch (e) {}
      } else if (fs.existsSync(thumbPath)) {
        coverUrl = `${pathToFileURL(thumbPath).href}?t=${Date.now()}`
      }

      // Cập nhật ngay vào Metadata Cache
      const stat = fs.statSync(rawPath)
      const existingCached = metadataCache[rawPath]?.data || {}
      metadataCache[rawPath] = {
        mtime: stat.mtimeMs,
        data: {
          ...existingCached,
          id: rawPath,
          filePath: pathToFileURL(rawPath).href,
          title: newTags.title || existingCached.title,
          artist: newTags.artist || existingCached.artist,
          album: newTags.album || existingCached.album,
          lyrics: newTags.lyrics || existingCached.lyrics,
          coverArt: coverUrl || existingCached.coverArt
        }
      }
      saveMetadataCache()

      return { success: true, coverUrl }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('music:selectImageFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ 
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp', 'jfif', 'bmp', 'gif', 'avif', 'svg'] }] 
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  // 8. Xóa bài hát (Xóa file / Chuyển vào Thùng rác)
  ipcMain.handle('music:deleteTrack', async (_, trackPath: string, deletePermanently: boolean = false) => {
    try {
      let rawPath = trackPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)

      if (fs.existsSync(rawPath)) {
        if (deletePermanently) {
          await shell.trashItem(rawPath)
          const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
          if (fs.existsSync(lrcPath)) {
            await shell.trashItem(lrcPath)
          }
        } else {
          fs.unlinkSync(rawPath)
          const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
          if (fs.existsSync(lrcPath)) {
            fs.unlinkSync(lrcPath)
          }
        }
      }

      if (metadataCache[rawPath]) {
        delete metadataCache[rawPath]
        saveMetadataCache()
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 9. Xóa Playlist (Chuyển thư mục Playlist vào Thùng rác)
  ipcMain.handle('music:deletePlaylist', async (_, playlistName: string) => {
    try {
      const config = getConfig()
      if (!config.libraryPath) return { success: false, error: 'Chưa cấu hình thư viện' }
      const playlistFolder = join(config.libraryPath, playlistName)
      if (fs.existsSync(playlistFolder)) {
        await shell.trashItem(playlistFolder)
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 10. Mở file / thư mục trong File Explorer
  ipcMain.handle('music:showInFolder', async (_, targetPath: string) => {
    try {
      let rawPath = targetPath.replace(/^file:\/\/\/?/, '')
      if (process.platform === 'win32') rawPath = decodeURIComponent(rawPath)
      if (fs.existsSync(rawPath)) {
        shell.showItemInFolder(rawPath)
        return { success: true }
      }
      return { success: false, error: 'Đường dẫn không tồn tại trên ổ đĩa' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
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
          bitDepth: metadata.format.bitsPerSample,
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
      
      // MỚI: Báo lỗi rõ ràng nếu bị Google Drive chặn
      if (!response.ok) {
        throw new Error(`Google Drive từ chối tải file. Mã lỗi: ${response.status}`)
      }
      
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
          url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}&acknowledgeAbuse=true`,
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

        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

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
        
        // MỚI: Nếu Google Drive từ chối tải, xóa file tạm và bỏ qua để tải bài tiếp theo
        if (!response.ok) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
          continue
        }
        
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
            sampleRate: metadata?.format.sampleRate, bitDepth: metadata?.format.bitsPerSample, lossless: metadata?.format.lossless, coverArt: null, isCloud: false
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
      const supportedExts = SUPPORTED_AUDIO_EXTS
      
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
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'opus', 'ogg', 'aac', 'alac', 'aiff', 'wma'] }]
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
          bitDepth: metadata.format.bitsPerSample,
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

  // ==========================================
  // HỆ THỐNG LOCAL BUFFER SERVER & PROXY CACHE ẢNH
  // ==========================================
  let streamPort = 0;
  const streamUrlCache = new Map<string, { url: string, expires: number }>();

  function getProxyImageUrl(url: string | null | undefined, id: string) {
    if (!url || !streamPort) return url || null;
    return `http://127.0.0.1:${streamPort}/image?url=${encodeURIComponent(url)}&id=${id}`;
  }

  function extractCovers(thumbnails: any[], fallbackId: string) {
    if (!thumbnails || thumbnails.length === 0) return { coverArt: null, coverArtHighRes: null };
    const medIndex = thumbnails.length > 1 ? 1 : 0;
    const medUrl = thumbnails[medIndex].url;
    const highUrl = thumbnails[thumbnails.length - 1].url.split('=w')[0];
    return {
      coverArt: getProxyImageUrl(medUrl, `med_${fallbackId}`),
      coverArtHighRes: getProxyImageUrl(highUrl, `high_${fallbackId}`)
    };
  }

  // HÀM TIỆN ÍCH MỚI: Bóc tách thông minh mọi loại nội dung từ YouTube Music
  function parseYtmItem(item: any) {
    let renderer = item.musicTwoRowItemRenderer || item.musicResponsiveListItemRenderer || item.musicCardShelfRenderer;
    let style = item.musicTwoRowItemRenderer ? 'CARD' : 'LIST';
    if (!renderer) return null;

    const titleRuns = renderer.title?.runs || renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || renderer.header?.musicCardShelfHeaderBasicRenderer?.title?.runs || [];
    const itemTitle = titleRuns.map((r: any) => r.text).join('');

    const thumbnails = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails 
                    || renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails 
                    || renderer.thumbnail?.thumbnails 
                    || [];

    const navEndpoint = renderer.navigationEndpoint 
                     || titleRuns[0]?.navigationEndpoint
                     || renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
                     || renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint
                     || renderer.buttons?.[0]?.buttonRenderer?.command;

    const videoId = navEndpoint?.watchEndpoint?.videoId || renderer.playlistItemData?.videoId;
    const browseId = navEndpoint?.browseEndpoint?.browseId;
    const pageType = navEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

    const playlistId = browseId || navEndpoint?.watchEndpoint?.playlistId;
    const isArtist = pageType === 'MUSIC_PAGE_TYPE_ARTIST' || (browseId && browseId.startsWith('UC'));

    const subtitleRuns = renderer.subtitle?.runs || renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const subtitle = subtitleRuns.map((r: any) => r.text).join('');

    if (itemTitle && (videoId || playlistId || isArtist)) {
      const itemFallbackId = videoId || playlistId || crypto.createHash('md5').update(itemTitle).digest('hex');
      const covers = extractCovers(thumbnails, itemFallbackId);
      return {
        title: itemTitle,
        subtitle: subtitle,
        videoId: videoId,
        playlistId: playlistId,
        isArtist: !!isArtist,
        thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
        coverArtHighRes: covers.coverArtHighRes,
        style: style 
      };
    }
    return null;
  }

  const streamServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);
    
    // --- LUỒNG 1: TRUYỀN TẢI NHẠC ---
    if (parsedUrl.pathname === '/play') {
      const targetId = parsedUrl.searchParams.get('id');
      const platform = parsedUrl.searchParams.get('platform') || (targetId?.startsWith('sc-') ? 'soundcloud' : 'youtube');
      if (!targetId) { res.writeHead(400).end('Thiếu ID bài hát'); return; }

      try {
        // Phân giải URL trực tiếp nếu chưa có trong cache
        let directUrl = '';
        const cached = streamUrlCache.get(targetId);
        if (cached && cached.expires > Date.now()) directUrl = cached.url;
        else {
          const config = getConfig();
          if (platform === 'soundcloud') {
            const permalink = parsedUrl.searchParams.get('url') || undefined;
            const rawScId = targetId.replace(/^sc-/, '');
            directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken);
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 });
          } else {
            const ytOptions: any = { 
              dumpSingleJson: true, 
              format: 'bestaudio/best', 
              noWarnings: true,
              extractorArgs: 'youtube:player-client=android' // Bổ sung API Android
            };
            // Bơm Cookie
            if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`];

            const info = await ytdlp(targetId, ytOptions as any) as any;
            directUrl = info.url;
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 });
          }
        }

        // Xử lý stream HLS (.m3u8) bằng FFmpeg chuyển đổi tức thì sang MP3 stream cho thẻ Audio
        if (directUrl.includes('.m3u8') || directUrl.includes('/hls/')) {
          const ffmpegExe = join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
          const ffmpegProcess = spawn(ffmpegExe, [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', directUrl,
            '-f', 'mp3',
            '-acodec', 'libmp3lame',
            '-b:a', '192k',
            '-vn',
            'pipe:1'
          ], { stdio: ['ignore', 'pipe', 'ignore'] });

          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache'
          });

          ffmpegProcess.stdout.pipe(res);
          req.on('close', () => {
            try { ffmpegProcess.kill(); } catch (e) {}
          });
          return;
        }

        const requestHeaders: any = {};
        if (req.headers.range) requestHeaders['Range'] = req.headers.range;

        let proxyRes;
        try {
          proxyRes = await axios({ method: 'GET', url: directUrl, headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' }, responseType: 'stream', decompress: false });
        } catch (axiosErr: any) {
          if (axiosErr.response && axiosErr.response.status === 403) {
            streamUrlCache.delete(targetId);
            
            // Cập nhật ytOptions cho luồng Retry
            const config = getConfig();
            if (platform === 'soundcloud') {
              const permalink = parsedUrl.searchParams.get('url') || undefined;
              const rawScId = targetId.replace(/^sc-/, '');
              directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken);
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 });
            } else {
              const ytOptions: any = { dumpSingleJson: true, format: 'bestaudio/best', noWarnings: true, extractorArgs: 'youtube:player-client=android' };
              if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`];

              const newInfo = await ytdlp(targetId, ytOptions as any) as any;
              directUrl = newInfo.url;
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 });
            }

            proxyRes = await axios({ method: 'GET', url: directUrl, headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' }, responseType: 'stream', decompress: false });
          } else throw axiosErr;
        }

        const responseHeaders: any = { 'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg', 'Accept-Ranges': proxyRes.headers['accept-ranges'] || 'bytes', 'Cache-Control': 'no-cache' };
        if (proxyRes.headers['content-length']) responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
        if (proxyRes.headers['content-range']) responseHeaders['Content-Range'] = proxyRes.headers['content-range'];

        res.writeHead(proxyRes.status, responseHeaders);
        proxyRes.data.pipe(res);
        proxyRes.data.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
        res.on('error', () => proxyRes.data.destroy());
        req.on('close', () => proxyRes.data.destroy());
      } catch (e) { if (!res.headersSent) res.writeHead(500).end(); }
    } 
    // --- LUỒNG 2: PROXY TẢI ẢNH BÌA ---
    else if (parsedUrl.pathname === '/image') {
      const targetUrl = parsedUrl.searchParams.get('url');
      const targetId = parsedUrl.searchParams.get('id');
      if (!targetUrl) { res.writeHead(400).end('Thiếu URL'); return; }

      const safeId = targetId ? targetId.replace(/[^a-zA-Z0-9_-]/g, '') : crypto.createHash('md5').update(targetUrl).digest('hex');
      const cachedImgPath = join(IMAGE_CACHE_DIR, `${safeId}.jpg`);
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      if (fs.existsSync(cachedImgPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        fs.createReadStream(cachedImgPath).pipe(res);
        return;
      }

      try {
        const imgRes = await axios({ method: 'GET', url: targetUrl, responseType: 'stream', decompress: false });
        res.setHeader('Content-Type', (imgRes.headers['content-type'] as string) || 'image/jpeg');
        const fileStream = fs.createWriteStream(cachedImgPath);
        imgRes.data.pipe(fileStream);
        imgRes.data.pipe(res);
      } catch (e) { if (!res.headersSent) res.writeHead(500).end(); }
    }
  });

  streamServer.listen(0, '127.0.0.1', () => { streamPort = (streamServer.address() as any).port; });

  // ==========================================
  // HỆ THỐNG ONLINE STREAMING (CHỈ YOUTUBE / YT MUSIC)
  // ==========================================

  // 1. API: Tìm kiếm siêu tốc trên YouTube & Xử lý Link trực tiếp
  ipcMain.handle('music:searchOnline', async (_, query: string) => {
    try {
      const isUrl = query.startsWith('http://') || query.startsWith('https://')
      
      // XỬ LÝ DÁN LINK TRỰC TIẾP
      if (isUrl) {
        const info = await ytdlp(query, { dumpSingleJson: true, flatPlaylist: true, noWarnings: true } as any) as any;
        if (info._type === 'playlist' || info.entries) {
            const tracks = (info.entries || []).map((t: any) => ({
                id: `yt-${t.id}`, originalId: t.id, title: t.title, artist: t.channel || t.uploader || 'YouTube',
                album: info.title || 'Playlist', duration: t.duration || 0, format: 'STREAM', isCloud: true, isOnline: true, platform: 'youtube',
                coverArt: t.thumbnails ? t.thumbnails[t.thumbnails.length-1]?.url : (t.thumbnail || null),
                coverArtHighRes: null
            }));
            return { success: true, isUrl: true, type: 'playlist', title: info.title || 'Playlist', tracks };
        } else {
            const track = {
                id: `yt-${info.id}`, originalId: info.id, title: info.title, artist: info.channel || info.uploader || 'YouTube',
                album: 'YouTube', duration: info.duration || 0, format: 'STREAM', isCloud: true, isOnline: true, platform: 'youtube',
                coverArt: info.thumbnails ? info.thumbnails[info.thumbnails.length-1]?.url : (info.thumbnail || null),
                coverArtHighRes: null
            };
            return { success: true, isUrl: true, type: 'song', track };
        }
      } 
      /// XỬ LÝ TÌM KIẾM TRẢ VỀ PHÂN LOẠI (Nghệ sĩ, Bài hát, Playlist)
      else {
        const config = getConfig();
        
        // 1. CHUẨN BỊ LUỒNG 1: yt-dlp lấy 50 bài hát độ chính xác cao
        const ytdlpPromise = ytdlp(`ytsearch50:${query}`, { dumpSingleJson: true, noWarnings: true, flatPlaylist: true } as any);

        // 2. CHUẨN BỊ LUỒNG 2: YouTube Music API lấy Playlist, Album, Nghệ sĩ
        const url = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
        const payload = {
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' } },
          query: query
        };
        const headers: any = {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://music.youtube.com',
        };

        if (config.ytCookie) {
          headers['Cookie'] = config.ytCookie;
          const authHash = generateSapisidHash(config.ytCookie);
          if (authHash) headers['Authorization'] = authHash;
        }
        const ytmPromise = axios.post(url, payload, { headers });

        // TỐI ƯU HÓA: Chạy 2 luồng song song cùng lúc, thời gian phản hồi bằng đúng với luồng chậm nhất
        const [ytdlpResponse, ytmResponse] = await Promise.allSettled([ytdlpPromise, ytmPromise]);

        const sections: any[] = [];
        const seenTitles = new Set(); // BỘ LỌC CHỐNG TRÙNG LẶP

        // --- XỬ LÝ KẾT QUẢ LUỒNG 1 (Đưa 20 bài hát lên đỉnh) ---
        if (ytdlpResponse.status === 'fulfilled') {
            const output = ytdlpResponse.value as any;
            const results = output.entries ? output.entries : [output];
            const tracks = results.map((track: any) => {
              const covers = extractCovers(track.thumbnails || (track.thumbnail ? [{url: track.thumbnail}] : []), track.id);
              return {
                title: track.title,
                subtitle: track.channel || track.uploader || 'YouTube',
                videoId: track.id,
                playlistId: null,
                isArtist: false,
                thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
                coverArtHighRes: covers.coverArtHighRes,
                style: 'LIST'
              };
            });
            
            if (tracks.length > 0) {
                seenTitles.add('bài hát');
                sections.push({ title: 'Bài hát (Mở rộng)', contents: tracks });
            }
        }

        // --- XỬ LÝ KẾT QUẢ LUỒNG 2 (Nạp các Playlist, Nghệ sĩ phía dưới) ---
        if (ytmResponse.status === 'fulfilled') {
            const data = ytmResponse.value.data;
            const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
            const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

            for (let section of sectionList) {
               if (section.itemSectionRenderer?.contents) section = section.itemSectionRenderer.contents[0];
               
               const shelf = section.musicShelfRenderer || section.musicCardShelfRenderer || section.musicCarouselShelfRenderer;
               if (!shelf) continue;

               const titleRuns = shelf.title?.runs || shelf.header?.musicCardShelfHeaderBasicRenderer?.title?.runs || [];
               const title = titleRuns.map((r: any) => r.text).join('') || `Kết quả ${sections.length + 1}`;
               
               // Bỏ qua mục "Bài hát" gốc của YTM (vì đã có 20 bài của yt-dlp xịn hơn)
               if (title.toLowerCase().includes('bài hát') || title.toLowerCase() === 'songs') continue;
               if (seenTitles.has(title)) continue;

               const items: any[] = [];
               for (const item of shelf.contents || []) {
                   const parsed = parseYtmItem(item);
                   if (parsed) items.push(parsed);
               }
               
               if (items.length === 0 && section.musicCardShelfRenderer) {
                  const parsedCard = parseYtmItem({ musicResponsiveListItemRenderer: section.musicCardShelfRenderer });
                  if (parsedCard) items.push(parsedCard);
               }
               
               if (items.length > 0) {
                   seenTitles.add(title);
                   sections.push({ title, contents: items });
               }
            }
        }

        return { success: true, isUrl: false, data: sections };
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. API: Lấy Stream URL (Kết nối với Buffer Server)
  ipcMain.handle('music:getStreamUrl', (_, track: any) => {
    try {
      if (track.platform === 'soundcloud' || track.id?.startsWith('sc-')) {
        const rawId = track.originalId || track.id.replace(/^sc-/, '');
        return { 
          success: true, 
          url: `http://127.0.0.1:${streamPort}/play?id=sc-${rawId}&platform=soundcloud&url=${encodeURIComponent(track.permalinkUrl || '')}` 
        }
      }
      if (track.platform === 'youtube' || !track.platform) {
        return { 
          success: true, 
          url: `http://127.0.0.1:${streamPort}/play?id=${track.originalId}` 
        } 
      }
      return { success: false, error: 'Chưa hỗ trợ nền tảng này' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 3. API: Tải nhạc bằng yt-dlp (Có phân loại Album và Check trùng lặp)
  ipcMain.handle('music:downloadOnline', async (_, track: any) => {
    const rootPath = getConfig().libraryPath;
    if (!rootPath) return { success: false, error: 'Chưa cấu hình Thư mục thư viện' };
    
    // Tạo thư mục Album (Nếu không có tên Album thì lưu vào thư mục Singles)
    const safeAlbum = (track.album || 'Singles').replace(/[<>:"\/\\|?*]/g, '_').trim();
    const albumPath = join(rootPath, safeAlbum);
    if (!fs.existsSync(albumPath)) {
      fs.mkdirSync(albumPath, { recursive: true });
    }

    const safeTitle = (track.title || 'Unknown').replace(/[<>:"\/\\|?*]/g, '_').trim();
    let destPath = join(albumPath, `${safeTitle}.mp3`);
    
    // Kiểm tra trùng lặp và hiện Hộp thoại (Dialog)
    if (fs.existsSync(destPath)) {
      const response = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Thay thế', 'Lưu thành tệp mới', 'Hủy'],
        defaultId: 0,
        cancelId: 2,
        title: 'Tệp đã tồn tại',
        message: `Bài hát "${safeTitle}" đã có sẵn trong thư mục "${safeAlbum}". Bạn muốn làm gì?`
      });
      
      if (response === 2) return { success: false, canceled: true }; // Người dùng chọn Hủy
      if (response === 1) {
        // Lưu thành tệp mới (Thêm ID thời gian)
        destPath = join(albumPath, `${safeTitle}_${Date.now()}.mp3`);
      } else {
        // Thay thế (Xóa file cũ trước khi ghi file mới)
        fs.unlinkSync(destPath);
      }
    }
    
    try {
      const downloadTarget = track.platform === 'soundcloud'
        ? (track.permalinkUrl || `https://api.soundcloud.com/tracks/${track.originalId}`)
        : track.originalId;

      await ytdlp(downloadTarget, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        output: destPath,
        embedMetadata: true,
        embedThumbnail: true,
        extractorArgs: track.platform === 'soundcloud' ? undefined : 'youtube:player-client=android',
        ffmpegLocation: ffmpegDir 
      } as any);
      return { success: true, localPath: pathToFileURL(destPath).href };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  })

  // ==========================================
  // HỆ THỐNG YOUTUBE MUSIC DASHBOARD & BẢO MẬT
  // ==========================================

  // Hàm phụ trợ: Tạo chữ ký xác thực (SAPISIDHASH) để Google nhận diện đúng tài khoản
  function generateSapisidHash(cookieStr: string) {
    const match = cookieStr.match(/SAPISID=([^;]+)/);
    if (!match) return null;
    const sapisid = match[1];
    const time = Math.floor(Date.now() / 1000);
    const origin = 'https://music.youtube.com';
    const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex');
    return `SAPISIDHASH ${time}_${hash}`;
  }

  // 1. API: Mở cửa sổ đăng nhập bảo mật và trích xuất Cookie
  ipcMain.handle('music:ytmLogin', async () => {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800, height: 700,
        title: 'Đăng nhập YouTube Music',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      // MỚI: Can thiệp sâu vào Network Session để xóa dấu vết Chromium
      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.google.com/*', '*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
          // 1. Ép User-Agent thành Firefox
          details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
          
          // 2. Tẩy xóa các Header tố cáo lõi Chromium
          delete details.requestHeaders['sec-ch-ua'];
          delete details.requestHeaders['sec-ch-ua-mobile'];
          delete details.requestHeaders['sec-ch-ua-platform'];
          
          callback({ cancel: false, requestHeaders: details.requestHeaders });
        }
      );

      // Điều hướng thẳng đến trang Đăng nhập Google, kèm theo lệnh tự động quay về YT Music
      authWindow.loadURL('https://accounts.google.com/ServiceLogin?continue=https://music.youtube.com/')

      // Tự động đóng cửa sổ popup khi Google chuyển hướng về lại trang chủ
      authWindow.webContents.on('did-navigate', (_event, url) => {
        if (url === 'https://music.youtube.com/' || url.startsWith('https://music.youtube.com/?')) {
          setTimeout(() => {
            if (!authWindow.isDestroyed()) {
              authWindow.close()
            }
          }, 1500) 
        }
      })

      // Lắng nghe khi người dùng đóng cửa sổ để quét Cookie
      authWindow.on('close', async () => {
        try {
          const cookies = await authWindow.webContents.session.cookies.get({ domain: '.youtube.com' })
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
          
          if (cookieStr.includes('SAPISID')) {
            saveConfig({ ytCookie: cookieStr }) 
            resolve({ success: true })
          } else {
            resolve({ success: false, error: 'Chưa đăng nhập thành công hoặc thiếu Cookie định danh.' })
          }
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
  })

  // API Đăng xuất YouTube Music
  ipcMain.handle('music:ytmLogout', async () => {
    try {
      saveConfig({ ytCookie: null })
      const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
      for (const c of cookies) {
        await session.defaultSession.cookies.remove('https://music.youtube.com', c.name).catch(() => {})
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==========================================
  // HỆ THỐNG SOUNDCLOUD DASHBOARD & BẢO MẬT
  // ==========================================

  // 1. API: Mở cửa sổ đăng nhập SoundCloud và trích xuất OAuth Token
  ipcMain.handle('music:scLogin', async () => {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800, height: 700,
        title: 'Đăng nhập SoundCloud',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      authWindow.loadURL('https://soundcloud.com/signin')

      let capturedToken: string | null = null

      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.soundcloud.com/*'] },
        (details, callback) => {
          const auth = details.requestHeaders['Authorization'] || details.requestHeaders['authorization']
          if (auth && auth.startsWith('OAuth ')) {
            capturedToken = auth.replace('OAuth ', '').trim()
          }
          callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
      )

      authWindow.on('close', async () => {
        try {
          if (!capturedToken) {
            const cookies = await authWindow.webContents.session.cookies.get({ domain: '.soundcloud.com' })
            const oauthCookie = cookies.find(c => c.name === 'oauth_token')
            if (oauthCookie) capturedToken = oauthCookie.value
          }

          if (capturedToken) {
            saveConfig({ scOAuthToken: capturedToken })
            try {
              const userProfile = await getScUserProfile(capturedToken)
              saveConfig({ scUserInfo: userProfile })
              resolve({ success: true, user: userProfile })
              return
            } catch (err) {
              resolve({ success: true })
              return
            }
          }
          resolve({ success: false, error: 'Chưa đăng nhập hoặc không tìm thấy mã xác thực SoundCloud' })
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
  })

  // 2. API: Đăng xuất SoundCloud
  ipcMain.handle('music:scLogout', async () => {
    try {
      saveConfig({ scOAuthToken: null, scUserInfo: null })
      const cookies = await session.defaultSession.cookies.get({ domain: '.soundcloud.com' })
      for (const c of cookies) {
        await session.defaultSession.cookies.remove('https://soundcloud.com', c.name).catch(() => {})
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 3. API: Lấy thông tin tài khoản SoundCloud
  ipcMain.handle('music:getScUser', async () => {
    const config = getConfig()
    if (!config.scOAuthToken) return { success: false, error: 'Chưa đăng nhập SoundCloud' }
    if (config.scUserInfo) return { success: true, user: config.scUserInfo }
    try {
      const user = await getScUserProfile(config.scOAuthToken)
      saveConfig({ scUserInfo: user })
      return { success: true, user }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 4. API: Lấy Dashboard SoundCloud (Trending, Liked Tracks, Stream)
  ipcMain.handle('music:getScDashboard', async (_, genre: string = 'all-music') => {
    const config = getConfig()
    const oauthToken = config.scOAuthToken
    const userInfo = config.scUserInfo

    try {
      const sections: any[] = []

      // Nếu đã đăng nhập: Lấy Likes & Stream cá nhân
      if (oauthToken && userInfo?.id) {
        try {
          const likedTracks = await getScUserLikes(userInfo.id, oauthToken, 30)
          if (likedTracks.length > 0) {
            sections.push({
              title: 'Bài hát bạn đã thích (Liked Tracks)',
              contents: likedTracks
            })
          }
        } catch (e) {}

        try {
          const streamTracks = await getScUserStream(oauthToken, 30)
          if (streamTracks.length > 0) {
            sections.push({
              title: 'Bản tin theo dõi (Your Stream)',
              contents: streamTracks
            })
          }
        } catch (e) {}
      }

      // Lấy Bảng xếp hạng Top Charts theo thể loại đang chọn
      const trendingTracks = await getScTrendingCharts(genre, 30)
      if (trendingTracks.length > 0) {
        const genreLabel = genre === 'all-music' ? 'Tất cả' : genre.toUpperCase()
        sections.push({
          title: `Bảng xếp hạng Top SoundCloud (${genreLabel})`,
          contents: trendingTracks
        })
      }

      // Lấy thêm các thể loại phổ biến nếu danh sách còn ít
      if (sections.length < 3) {
        const extraGenres = ['electronic', 'hiphoprap', 'pop', 'chill']
        for (const g of extraGenres) {
          if (g === genre) continue
          try {
            const extra = await getScTrendingCharts(g, 15)
            if (extra.length > 0) {
              sections.push({
                title: `SoundCloud ${g.charAt(0).toUpperCase() + g.slice(1)}`,
                contents: extra
              })
            }
          } catch (e) {}
        }
      }

      return { success: true, data: sections }
    } catch (e: any) {
      return { success: false, error: 'Lỗi tải SoundCloud: ' + e.message }
    }
  })

  // 5. API: Tìm kiếm SoundCloud
  ipcMain.handle('music:searchScOnline', async (_, query: string) => {
    const config = getConfig()
    try {
      const results = await searchSoundCloud(query, 30, config.scOAuthToken)
      return { success: true, ...results }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 6. API: Lấy chi tiết Playlist SoundCloud
  ipcMain.handle('music:getScPlaylist', async (_, playlistId: string) => {
    const config = getConfig()
    try {
      const playlist = await getScPlaylistTracks(playlistId, config.scOAuthToken)
      return { success: true, ...playlist }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2. API: Lấy dữ liệu Dashboard (Home Sections) trực tiếp từ Google InnerTube API
  ipcMain.handle('music:getHomeDashboard', async () => {
    const config = getConfig()
    if (!config.ytCookie) return { success: false, error: 'Chưa đăng nhập' }

    try {
      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        browseId: 'FEmusic_home' 
      };
      
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
      };

      // MỚI: Bơm chữ ký điện tử để "Mở khóa" các danh mục cá nhân hóa
      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie;
        const authHash = generateSapisidHash(config.ytCookie);
        if (authHash) headers['Authorization'] = authHash;
      }

      const response = await axios.post(url, payload, { headers });
      const data = response.data;
      
      const sections: any[] = [];
      const seenTitles = new Set(); // BỘ LỌC CHỐNG TRÙNG LẶP
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
      
      if (!tabs || tabs.length === 0) throw new Error("Cookie hết hạn hoặc bị Google từ chối");
      
      const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      
      for (let section of sectionList) {
        if (section.itemSectionRenderer?.contents) {
          section = section.itemSectionRenderer.contents[0];
        }

        const carousel = section.musicCarouselShelfRenderer || section.musicImmersiveCarouselShelfRenderer || section.musicShelfRenderer;
        if (!carousel) continue;
        
        const header = carousel.header?.musicCarouselShelfBasicHeaderRenderer || carousel.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
        const titleRuns = header?.title?.runs;
        const title = titleRuns ? titleRuns.map((r: any) => r.text).join('') : 'Gợi ý cho bạn';
        
        // KIỂM TRA TRÙNG LẶP: Nếu tiêu đề này đã được thêm vào trước đó, bỏ qua luôn!
        if (seenTitles.has(title)) continue;
        
        const items: any[] = [];
        for (const item of carousel.contents || []) {
           const parsed = parseYtmItem(item);
           if (parsed) items.push(parsed);
        }
        
        if (items.length > 0) {
          seenTitles.add(title); // Đánh dấu tiêu đề này đã tồn tại
          sections.push({ title, contents: items });
        }
      }
      
      return { success: true, data: sections };
    } catch (e: any) {
      return { success: false, error: 'Lỗi kết nối: ' + e.message }
    }
  })

  // 3. API: Lấy chi tiết danh sách bài hát của một Playlist/Album
  ipcMain.handle('music:getYtmPlaylist', async (_, playlistId: string) => {
    const config = getConfig()
    try {
      let targetId = playlistId;
      if (targetId.startsWith('PL') || targetId.startsWith('RD') || targetId.startsWith('OL')) {
        targetId = 'VL' + targetId;
      }

      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
      const payload = {
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' } },
        browseId: targetId
      };
      
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
      };

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie;
        const authHash = generateSapisidHash(config.ytCookie);
        if (authHash) headers['Authorization'] = authHash;
      }

      const response = await axios.post(url, payload, { headers });
      const data = response.data;

      const tracks: any[] = [];
      let contents: any[] = [];

      const twoColumn = data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents || [];
      const singleColumn = data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const sections = [...twoColumn, ...singleColumn];

      for (const section of sections) {
        if (section.musicPlaylistShelfRenderer) {
          contents = section.musicPlaylistShelfRenderer.contents;
          break;
        }
        if (section.musicShelfRenderer) {
          contents = section.musicShelfRenderer.contents;
          break;
        }
      }

      for (const item of contents) {
        const renderer = item.musicResponsiveListItemRenderer;
        if (!renderer) continue;

        const videoId = renderer.playlistItemData?.videoId 
                     || renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
                     || renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
                     
        if (!videoId) continue;

        const titleRuns = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
        const title = titleRuns ? titleRuns.map((r:any) => r.text).join('') : 'Unknown';
        
        const artistRuns = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
        const artist = artistRuns ? artistRuns.map((r:any) => r.text).join('') : 'YouTube';
        
        const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

        const covers = extractCovers(thumbnails, videoId); // Dùng renderer.videoId cho getUpNext
        tracks.push({
          id: `yt-${videoId}`, originalId: videoId, title: title, artist: artist, album: 'YouTube Music',
          duration: 0, format: 'STREAM', isCloud: true, isOnline: true, platform: 'youtube',
          coverArt: covers.coverArt, coverArtHighRes: covers.coverArtHighRes
        });
      }

      return { success: true, tracks };
    } catch (e: any) {
      return { success: false, error: 'Lỗi tải danh sách: ' + e.message };
    }
  })

  // 4. API: Preload Buffer - Giải mã URL trước khi phát để triệt tiêu độ trễ
  ipcMain.handle('music:preloadStream', async (_, targetId: string) => {
    if (streamUrlCache.has(targetId) && streamUrlCache.get(targetId)!.expires > Date.now()) {
      return { success: true };
    }
    try {
      const config = getConfig();
      const ytOptions: any = { 
        dumpSingleJson: true, 
        format: 'bestaudio/best', 
        noWarnings: true, 
        extractorArgs: 'youtube:player-client=android' 
      };
      if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`];

      const info = await ytdlp(targetId, ytOptions as any) as any;
      streamUrlCache.set(targetId, { url: info.url, expires: Date.now() + 3600000 });
      return { success: true };
    } catch (e) { return { success: false }; }
  })

  // 5. API: Ghi nhận lịch sử nghe nhạc để YouTube học Recommendations
  ipcMain.handle('music:logWatchHistory', async (_, videoId: string) => {
    const config = getConfig()
    if (!config.ytCookie) return { success: false }

    try {
      const url = 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false';
      const payload = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
        },
        videoId: videoId
      };
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
      };

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie;
        const authHash = generateSapisidHash(config.ytCookie);
        if (authHash) headers['Authorization'] = authHash;
      }

      await axios.post(url, payload, { headers });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  })

  // 6. API: Lấy danh sách phát tiếp theo (Up Next / Radio Gợi ý)
  ipcMain.handle('music:getUpNext', async (_, videoId: string) => {
    const config = getConfig()
    try {
      const url = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false';
      const payload = {
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' } },
        videoId: videoId,
        // QUAN TRỌNG: Gắn tiền tố RDAMVM để yêu cầu Google tự tạo một Radio Mix vô tận
        playlistId: `RDAMVM${videoId}` 
      };

      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
      };

      // Đính kèm chữ ký bảo mật để lấy đúng gu âm nhạc của bạn
      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie;
        const authHash = generateSapisidHash(config.ytCookie);
        if (authHash) headers['Authorization'] = authHash;
      }

      const response = await axios.post(url, payload, { headers });
      const data = response.data;

      const tracks: any[] = [];
      const tabs = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
      
      // Bóc tách Tab đầu tiên (Tab "Tiếp theo")
      const tabContent = tabs?.[0]?.tabRenderer?.content;
      
      // Quét thông minh: Cấu trúc có thể bọc trong musicQueueRenderer hoặc playlistPanelRenderer tùy tài khoản
      const contents = tabContent?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents 
                    || tabContent?.playlistPanelRenderer?.contents 
                    || [];

      for (const item of contents) {
        const renderer = item.playlistPanelVideoRenderer;
        if (!renderer || !renderer.videoId) continue;

        // SỬA LỖI TẠI ĐÂY: Khởi tạo một biến mới để lấy chính xác ID của TỪNG bài hát
        const trackVideoId = renderer.videoId; 

        const title = renderer.title?.runs?.[0]?.text || 'Unknown';
        const artist = renderer.longBylineText?.runs?.map((r:any) => r.text).join('') || 'YouTube';
        const thumbnails = renderer.thumbnail?.thumbnails || [];

        // Đổi videoId thành trackVideoId
        const covers = extractCovers(thumbnails, trackVideoId); 
        
        tracks.push({
          id: `yt-${trackVideoId}`, 
          originalId: trackVideoId, 
          title: title, 
          artist: artist, 
          album: 'YouTube Music',
          duration: 0, 
          format: 'STREAM', 
          isCloud: true, 
          isOnline: true, 
          platform: 'youtube',
          coverArt: covers.coverArt, 
          coverArtHighRes: covers.coverArtHighRes
        });
      }
      return { success: true, tracks };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  })

  // 7. API: Mở trang Nghệ Sĩ
  ipcMain.handle('music:getYtmArtist', async (_, artistId: string) => {
    const config = getConfig()
    try {
      const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
      const payload = {
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' } },
        browseId: artistId
      };
      
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://music.youtube.com',
      };

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie;
        const authHash = generateSapisidHash(config.ytCookie);
        if (authHash) headers['Authorization'] = authHash;
      }

      const response = await axios.post(url, payload, { headers });
      const data = response.data;

      const tracks: any[] = [];
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        const shelf = section.musicShelfRenderer || section.musicCarouselShelfRenderer;
        if (!shelf) continue;
        
        for (const item of shelf.contents || []) {
          const parsed = parseYtmItem(item);
          // Chỉ lấy các bài hát (có videoId) và bỏ qua các nghệ sĩ liên quan để tạo danh sách phát
          if (parsed && parsed.videoId && !parsed.isArtist) {
            tracks.push({
              id: `yt-${parsed.videoId}`, originalId: parsed.videoId, title: parsed.title, artist: parsed.subtitle || 'Unknown',
              album: 'YouTube Music', duration: 0, format: 'STREAM', isCloud: true, isOnline: true, platform: 'youtube',
              coverArt: parsed.thumbnails?.[0]?.url || null, coverArtHighRes: parsed.coverArtHighRes
            });
          }
        }
      }
      return { success: true, tracks };
    } catch (e: any) {
      return { success: false, error: 'Lỗi tải nghệ sĩ: ' + e.message };
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
      isInMiniPlayer = true
      preMiniPlayerState = {
        bounds: mainWindow.getBounds(),
        isMaximized: mainWindow.isMaximized(),
        isFullScreen: mainWindow.isFullScreen()
      }

      // Thoát chế độ Toàn màn hình / Phóng to trước khi resize
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      
      mainWindow.setContentSize(400, 120, true) // Đổi kích thước thành khung chữ nhật nhỏ
      mainWindow.setAlwaysOnTop(true, 'floating') // Luôn nổi trên các cửa sổ khác
      mainWindow.setResizable(false) // Khóa kích thước
    } else {
      isInMiniPlayer = false
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)

      if (preMiniPlayerState) {
        mainWindow.setBounds(preMiniPlayerState.bounds)
        if (preMiniPlayerState.isMaximized) {
          mainWindow.maximize()
        } else if (preMiniPlayerState.isFullScreen) {
          mainWindow.setFullScreen(true)
        }
        preMiniPlayerState = null
      } else {
        const config = getConfig()
        const ws = config.windowState || { width: 1200, height: 800 }
        mainWindow.setBounds({
          x: ws.x,
          y: ws.y,
          width: ws.width || 1200,
          height: ws.height || 800
        })
        if (ws.isMaximized) {
          mainWindow.maximize()
        }
      }
      saveWindowState()
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