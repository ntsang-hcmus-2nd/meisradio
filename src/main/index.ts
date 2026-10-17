import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BassManager } from './BassManager'
import { writeFlacMetadata, FlacTagUpdate } from './flacMetadata'
import { readDsdTags, DsdTagUpdate } from './dsdMetadata'
import { type CueTrackInfo } from './cueParser'
import { initAutoUpdater } from './AutoUpdaterManager'
import {
  // Shared context
  getConfig,
  sqliteStorage,
  registerAllowedDroppedFile,
  isAllowedLocalPath,
  SUPPORTED_AUDIO_EXTS,
  sanitizeDirectoryName,
  sanitizeFileName,
  markMetadataDirty,
  markThemeColorDirty,
  saveMetadataCache,
  saveThemeColorsCache,
  getBinaryDir,
  ffmpegDir,
  getFfmpegPath,
  allowedDroppedFiles,

  // Stream Server
  startStreamServer,
  stopStreamServer,
  registerStreamServerIpc,

  // Library Scanner
  registerLibraryScannerIpc,
  setupLibraryWatchers,
  stopLibraryWatchers,
  buildPreAggregatedData,
  extractArtists,
  splitArtistString,
  extractEmbeddedLyrics,
  getAudioFilesInDirectoryRecursive,
  getAudioFilesInDirectoryRecursiveAsync,
  PRESERVED_ARTIST_NAMES,

  // Playlist Manager
  registerPlaylistManagerIpc,
  UserPlaylist,

  // Tag Writer
  registerTagWriterIpc,

  // Cloud Drive
  registerCloudDriveIpc,

  // YTM InnerTube
  registerYtmInnerTubeIpc,

  // Lyrics Service
  registerLyricsIpc,
  fetchOnlineLyrics,
  fetchLrclibLyrics,
  fetchMusixmatchLyricsInternal,
  fetchNetEaseLyrics,
  fetchKugouLyrics,
  setLyricsConfigProvider,
  setArtistSplitter,
  MxmResult,

  // SoundCloud
  registerSoundCloudIpc,

  // Audio Playback
  registerAudioPlaybackIpc,
  setupBassEvents,

  // Discord RPC
  initDiscordRpc,
  destroyDiscordRpc,
  registerDiscordRpcIpc,

  // Soulseek
  initSoulseekService,
  destroySoulseekService,
  registerSoulseekIpc,
  soulseekManager,

  // Shortcuts
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
  sendShortcutAction,

  // Tray
  initTray,
  updateTrayMenu,
  destroyTray,
  registerTrayIpc,

  // Window Manager
  createMainWindow,
  getMainWindow,
  registerWindowIpc
} from './services'

// Re-exports for backwards compatibility
export {
  writeFlacMetadata,
  readDsdTags,
  SUPPORTED_AUDIO_EXTS,
  sanitizeDirectoryName,
  sanitizeFileName,
  getAudioFilesInDirectoryRecursive,
  getAudioFilesInDirectoryRecursiveAsync,
  extractEmbeddedLyrics,
  PRESERVED_ARTIST_NAMES,
  splitArtistString,
  extractArtists,
  buildPreAggregatedData,
  getBinaryDir,
  ffmpegDir,
  getFfmpegPath,
  markMetadataDirty,
  markThemeColorDirty,
  allowedDroppedFiles,
  registerAllowedDroppedFile,
  isAllowedLocalPath,
  setupLibraryWatchers,
  stopLibraryWatchers,
  fetchOnlineLyrics,
  fetchLrclibLyrics,
  fetchMusixmatchLyricsInternal,
  fetchNetEaseLyrics,
  fetchKugouLyrics,
  sqliteStorage,
  soulseekManager
}
export type { CueTrackInfo, FlacTagUpdate, DsdTagUpdate, UserPlaylist, MxmResult }

// ==========================================
// THIẾT LẬP THAM SỐ CHROMIUM & V8
// ==========================================
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=512 --optimize_for_size')
app.commandLine.appendSwitch(
  'disable-features',
  'SpareRendererForSitePerProcess,VideoCaptureService'
)
app.commandLine.appendSwitch('renderer-process-limit', '1')

// ==========================================
// BIẾN TOÀN CỤC & SHUTDOWN HANDLER
// ==========================================
let bassManager: BassManager | null = null
let isQuitting = false

function cleanShutdown(): void {
  isQuitting = true
  stopLibraryWatchers()
  stopStreamServer()
  saveMetadataCache(true)
  saveThemeColorsCache(true)
  if (sqliteStorage) {
    try {
      sqliteStorage.checkpoint('TRUNCATE')
      sqliteStorage.close()
    } catch (_) {}
  }
  if (bassManager) {
    try {
      bassManager.killSync()
    } catch (_) {}
  }
  destroyDiscordRpc()
  destroySoulseekService()
  destroyTray()
  unregisterGlobalShortcuts()
}

// ==========================================
// KHỞI ĐỘNG ỨNG DỤNG (APP READY)
// ==========================================
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.subzerofroze.meisradio')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // 1. Tự động kiểm tra cập nhật (Auto-Updater)
  try {
    initAutoUpdater()
  } catch (err) {
    console.error('[AutoUpdater] Failed to initialize:', err)
  }

  const currentConfig = getConfig()

  // 2. Khởi động HTTP Stream Server nội bộ trước khi Renderer nạp
  await startStreamServer()

  // 3. Khởi tạo Discord RPC & Soulseek
  initDiscordRpc(currentConfig)
  initSoulseekService(currentConfig)

  // 4. Khởi tạo BASS Audio Backend
  bassManager = new BassManager()
  const bitPerfectType = (currentConfig.bitPerfectType as 'wasapi' | 'asio') || 'asio'
  const rawVol = currentConfig.volume ?? 1.0
  const initialGain =
    typeof rawVol === 'number' ? Math.pow(Math.max(0, Math.min(1, rawVol)), 2) : 1.0
  bassManager
    .init(
      currentConfig.audioDevice,
      currentConfig.bitPerfectEnabled ?? false,
      initialGain,
      bitPerfectType
    )
    .catch(console.error)

  // 5. Kết nối lyric config provider & artist splitter
  setArtistSplitter(splitArtistString)
  setLyricsConfigProvider(() => getConfig())

  // 6. Đăng ký toàn bộ IPC handlers từ các services
  registerStreamServerIpc()
  registerLibraryScannerIpc()
  registerPlaylistManagerIpc()
  registerTagWriterIpc()
  registerCloudDriveIpc()
  registerYtmInnerTubeIpc()
  registerLyricsIpc()
  registerSoundCloudIpc()
  registerAudioPlaybackIpc(bassManager)
  setupBassEvents(bassManager, () => getMainWindow())
  registerDiscordRpcIpc()
  registerSoulseekIpc()
  registerTrayIpc()
  registerWindowIpc({ onConfigSaved: () => updateTrayMenu() })

  // 7. Khởi tạo cửa sổ chính
  createMainWindow({
    icon,
    isQuitting: () => isQuitting,
    onQuit: () => {
      cleanShutdown()
      app.quit()
    }
  })

  // 8. Đăng ký phím tắt toàn cục
  registerGlobalShortcuts(() => getMainWindow())

  // 9. Khởi tạo khay hệ thống (System Tray)
  initTray({
    icon,
    getMainWindow,
    onQuit: () => {
      cleanShutdown()
      app.quit()
    },
    sendShortcut: (action: string) => sendShortcutAction(action, getMainWindow)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({
        icon,
        isQuitting: () => isQuitting,
        onQuit: () => {
          cleanShutdown()
          app.quit()
        }
      })
    }
  })
})

// ==========================================
// VÒNG ĐỜI ỨNG DỤNG & GIẢI PHÓNG TÀI NGUYÊN
// ==========================================
app.on('before-quit', () => {
  cleanShutdown()
})

app.on('window-all-closed', () => {
  if (bassManager) bassManager.killSync()
  destroySoulseekService()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  cleanShutdown()
  setTimeout(() => {
    app.exit(0)
  }, 1000).unref()
})

process.on('SIGINT', () => {
  cleanShutdown()
  app.exit(0)
})

process.on('SIGTERM', () => {
  cleanShutdown()
  app.exit(0)
})
