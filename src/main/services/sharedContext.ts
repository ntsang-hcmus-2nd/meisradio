import { app, safeStorage, BrowserWindow } from 'electron'
import { join } from 'path'
import * as path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { is } from '@electron-toolkit/utils'
import ytdlpDefault, { create } from 'yt-dlp-exec'
import { SqliteStorage } from '../sqliteStorage'
import { DEFAULT_DISCORD_CLIENT_ID } from '../DiscordRpcManager'

// ==========================================
// THƯ MỤC DỮ LIỆU ĐỘC LẬP
// ==========================================
export const DATA_FOLDER = is.dev
  ? app.getPath('userData')
  : join(path.dirname(app.getPath('exe')), 'MeisRadioData')

if (!fs.existsSync(DATA_FOLDER)) {
  try {
    fs.mkdirSync(DATA_FOLDER, { recursive: true })
  } catch (err) {}
}

export const IMAGE_CACHE_DIR = join(DATA_FOLDER, '.image_cache')
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  try {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true })
  } catch (err) {}
}

export const CONFIG_PATH = join(DATA_FOLDER, 'music-config.json')
export const USER_PLAYLISTS_PATH = join(DATA_FOLDER, 'user-playlists.json')

// Khởi tạo SQLite Storage Engine (koffi C-FFI) thay thế toàn bộ cache JSON
export const sqliteStorage = new SqliteStorage(DATA_FOLDER)

// ==========================================
// CẤU HÌNH ỨNG DỤNG (CONFIG)
// ==========================================
export function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (app.isReady() && safeStorage.isEncryptionAvailable()) {
        if (config.googleDriveApiKey && config.googleDriveApiKey.startsWith('ENC:')) {
          try {
            config.googleDriveApiKey = safeStorage.decryptString(
              Buffer.from(config.googleDriveApiKey.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.musixmatchApiKey && config.musixmatchApiKey.startsWith('ENC:')) {
          try {
            config.musixmatchApiKey = safeStorage.decryptString(
              Buffer.from(config.musixmatchApiKey.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.ytCookie && config.ytCookie.startsWith('ENC:')) {
          try {
            config.ytCookie = safeStorage.decryptString(
              Buffer.from(config.ytCookie.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
        if (config.scOAuthToken && config.scOAuthToken.startsWith('ENC:')) {
          try {
            config.scOAuthToken = safeStorage.decryptString(
              Buffer.from(config.scOAuthToken.replace('ENC:', ''), 'base64')
            )
          } catch (e) {}
        }
      }

      const rawPaths = Array.isArray(config.libraryPaths)
        ? config.libraryPaths
        : config.libraryPath
          ? [config.libraryPath]
          : []
      config.libraryPaths = rawPaths.filter((p: any) => typeof p === 'string' && p.trim() !== '')
      config.libraryPath = config.libraryPaths[0] || null

      if (!config.discordRpc) {
        config.discordRpc = {
          enabled: true,
          clientId: DEFAULT_DISCORD_CLIENT_ID,
          showDetails: true,
          showTime: true,
          showCover: true,
          showQuality: true,
          showButtons: true,
          showIdle: true
        }
      }

      return config
    }
  } catch (e) {}
  return {
    libraryPath: null,
    libraryPaths: [],
    crossfadeEnabled: false,
    crossfadeDuration: 3,
    volume: 1,
    eqBands: null,
    appMode: 'default',
    discordRpc: {
      enabled: true,
      clientId: DEFAULT_DISCORD_CLIENT_ID,
      showDetails: true,
      showTime: true,
      showCover: true,
      showQuality: true,
      showButtons: true,
      showIdle: true
    }
  }
}

export function saveConfig(data: any) {
  const currentConfig = getConfig()
  const newConfig = { ...currentConfig, ...data }

  if (data.libraryPaths && Array.isArray(data.libraryPaths)) {
    newConfig.libraryPaths = data.libraryPaths.filter(
      (p: any) => typeof p === 'string' && p.trim() !== ''
    )
    newConfig.libraryPath = newConfig.libraryPaths[0] || null
  } else if (data.libraryPath !== undefined) {
    if (data.libraryPath) {
      if (!newConfig.libraryPaths) newConfig.libraryPaths = []
      if (!newConfig.libraryPaths.includes(data.libraryPath)) {
        newConfig.libraryPaths = [data.libraryPath, ...newConfig.libraryPaths]
      }
      newConfig.libraryPath = data.libraryPath
    }
  }

  // Mã hóa API Key trước khi ghi đè xuống file JSON
  if (app.isReady() && safeStorage.isEncryptionAvailable()) {
    if (data.googleDriveApiKey && !data.googleDriveApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.googleDriveApiKey)
        newConfig.googleDriveApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Google Drive API Key', e)
      }
    }

    if (data.musixmatchApiKey && !data.musixmatchApiKey.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.musixmatchApiKey)
        newConfig.musixmatchApiKey = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Musixmatch API Key', e)
      }
    }

    if (data.ytCookie && !data.ytCookie.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.ytCookie)
        newConfig.ytCookie = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa YT Cookie', e)
      }
    }

    if (data.scOAuthToken && !data.scOAuthToken.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.scOAuthToken)
        newConfig.scOAuthToken = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa SoundCloud OAuth Token', e)
      }
    }

    if (data.soulseekPassword && !data.soulseekPassword.startsWith('ENC:')) {
      try {
        const encryptedBuffer = safeStorage.encryptString(data.soulseekPassword)
        newConfig.soulseekPassword = `ENC:${encryptedBuffer.toString('base64')}`
      } catch (e) {
        console.error('Lỗi mã hóa Soulseek Password', e)
      }
    }
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2))
}

// ==========================================
// BINARY DIRECTORY & FFMPEG
// ==========================================
export function getBinaryDir(): string {
  const candidateDirs = [
    join(process.resourcesPath, 'bin'),
    join(process.resourcesPath, 'resources', 'bin'),
    join(app.getAppPath(), 'resources', 'bin'),
    join(process.cwd(), 'resources', 'bin'),
    join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin'),
    join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'bin'),
    join(path.dirname(app.getPath('exe')), 'resources', 'bin'),
    join(path.dirname(app.getPath('exe')), 'bin')
  ]

  for (const dir of candidateDirs) {
    if (
      fs.existsSync(dir) &&
      (fs.existsSync(join(dir, 'ffmpeg.exe')) || fs.existsSync(join(dir, 'ffmpeg')))
    ) {
      return dir
    }
  }

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) return dir
  }
  return candidateDirs[0]
}

export const ffmpegDir = getBinaryDir()

export const getFfmpegPath = (): string => {
  return join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

// ==========================================
// YT-DLP
// ==========================================
export const ytdlp = is.dev
  ? ytdlpDefault
  : create(
      join(
        app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
        'node_modules',
        'yt-dlp-exec',
        'bin',
        process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
      )
    )

// ==========================================
// SECURITY & ALLOWED LOCAL PATHS
// ==========================================
export const allowedDroppedFiles = new Set<string>()

export function normalizeLocalPath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return ''
  let clean = filePath
  if (clean.startsWith('file://')) {
    try {
      clean = fileURLToPath(clean)
    } catch {
      clean = clean.replace(/^file:\/\/\/?/, '')
      clean = clean.split('?')[0]
      try {
        clean = decodeURIComponent(clean)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(clean)) clean = clean.slice(1)
        clean = clean.replace(/\//g, '\\')
      }
    }
  } else {
    clean = clean.split('?')[0]
    try {
      if (clean.includes('%')) {
        clean = decodeURIComponent(clean)
      }
    } catch (_) {}
    if (process.platform === 'win32') {
      if (/^\/[a-zA-Z]:/.test(clean)) clean = clean.slice(1)
      clean = clean.replace(/\//g, '\\')
    }
  }
  return path.normalize(clean)
}

export function registerAllowedDroppedFile(filePath: string): void {
  if (filePath && typeof filePath === 'string') {
    const norm = normalizeLocalPath(filePath)
    if (norm) {
      allowedDroppedFiles.add(norm)
    }
  }
}

const safeGetPath = (name: any): string | null => {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

export const SUPPORTED_AUDIO_EXTS = [
  '.mp3',
  '.flac',
  '.wav',
  '.m4a',
  '.opus',
  '.ogg',
  '.aac',
  '.alac',
  '.aiff',
  '.wma',
  '.dsf',
  '.dff',
  '.dsd',
  '.bin',
  '.ape'
]

export const ALLOWED_AUDIO_EXTENSIONS = [
  ...SUPPORTED_AUDIO_EXTS,
  '.cue',
  '.lrc'
]

export const COMMON_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp'
]

/**
 * Chuẩn hóa tên thư mục, đảm bảo không kết thúc bằng dấu chấm hoặc khoảng trắng (Lỗi Windows Win32)
 * và không chứa các ký tự đặc biệt bị cấm.
 */
export function sanitizeDirectoryName(name: string): string {
  if (!name || typeof name !== 'string') return 'Untitled'
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim()
  safe = safe.replace(/[\s.]+$/, '').trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) {
    safe += '_folder'
  }
  return safe || 'Untitled'
}

/**
 * Chuẩn hóa tên tệp, loại bỏ ký tự cấm và dấu chấm/khoảng trắng cuối tên.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'track'
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim()
  safe = safe.replace(/[\s.]+$/, '').trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) {
    safe += '_file'
  }
  return safe || 'track'
}

export function isAllowedLocalPath(filePath: string, allowCoverOrFolder: boolean = false): boolean {
  if (!filePath || typeof filePath !== 'string') return false
  const norm = normalizeLocalPath(filePath)
  if (!norm) return false
  const isWin = process.platform === 'win32'
  const normLower = isWin ? norm.toLowerCase() : norm

  // Block sensitive files
  const base = path.basename(norm).toLowerCase()
  if (
    base.startsWith('.env') ||
    base === 'config.json' ||
    base === 'music-config.json' ||
    base === 'settings.json' ||
    base === 'credentials.json'
  ) {
    return false
  }

  const ext = path.extname(norm).toLowerCase()

  if (!allowCoverOrFolder) {
    if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
      return false
    }
  } else {
    let isDirectory = false
    try {
      isDirectory = fs.existsSync(norm) && fs.statSync(norm).isDirectory()
    } catch (_) {}

    const isAllowedExt =
      ALLOWED_AUDIO_EXTENSIONS.includes(ext) || COMMON_IMAGE_EXTENSIONS.includes(ext)
    if (!isAllowedExt && !isDirectory) {
      return false
    }
  }

  // Check if explicitly registered as dropped file
  for (const dropped of allowedDroppedFiles) {
    const droppedNorm = isWin ? path.normalize(dropped).toLowerCase() : path.normalize(dropped)
    const droppedWithSep = droppedNorm.endsWith(path.sep) ? droppedNorm : droppedNorm + path.sep
    if (normLower === droppedNorm || normLower.startsWith(droppedWithSep)) {
      return true
    }
  }

  // Allowed directories
  try {
    const config = getConfig()
    const allowedDirs: (string | null | undefined)[] = [
      IMAGE_CACHE_DIR,
      ...(config.libraryPaths || []),
      config.libraryPath,
      safeGetPath('userData'),
      safeGetPath('music'),
      safeGetPath('downloads'),
      safeGetPath('desktop'),
      safeGetPath('documents'),
      safeGetPath('pictures'),
      safeGetPath('temp'),
      os.tmpdir()
    ]

    for (const rawDir of allowedDirs) {
      if (!rawDir || typeof rawDir !== 'string') continue
      let dir = path.normalize(rawDir)
      if (isWin) dir = dir.toLowerCase()
      const dirWithSep = dir.endsWith(path.sep) ? dir : dir + path.sep
      if (normLower === dir || normLower.startsWith(dirWithSep)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

// ==========================================
// METADATA & THEME COLORS IN-MEMORY CACHE
// ==========================================
export const metadataCache: Record<string, { mtime: number; data: any }> = sqliteStorage.getAllMetadata()
export const dirtyMetadataKeys = new Set<string>()

export function markMetadataDirty(key: string): void {
  if (key) dirtyMetadataKeys.add(key)
}

let metadataSaveTimer: NodeJS.Timeout | null = null
export function saveMetadataCache(immediate: boolean = false) {
  const flush = () => {
    if (dirtyMetadataKeys.size === 0) return
    try {
      const items: Array<{ filePath: string; mtime: number; data: any }> = []
      for (const filePath of dirtyMetadataKeys) {
        const val = metadataCache[filePath]
        if (val) {
          items.push({
            filePath,
            mtime: val.mtime,
            data: val.data
          })
        }
      }
      if (items.length > 0) {
        sqliteStorage.batchSetMetadata(items)
      }
      dirtyMetadataKeys.clear()
    } catch (e) {}
  }

  if (immediate) {
    if (metadataSaveTimer) {
      clearTimeout(metadataSaveTimer)
      metadataSaveTimer = null
    }
    flush()
    return
  }
  if (metadataSaveTimer) return
  metadataSaveTimer = setTimeout(() => {
    metadataSaveTimer = null
    flush()
  }, 1000)
}

export const themeColorsCache: Record<
  string,
  { primary60: string; secondary30: string; accent10: string }
> = sqliteStorage.getAllThemeColors()
export const dirtyThemeColorKeys = new Set<string>()

export function markThemeColorDirty(key: string): void {
  if (key) dirtyThemeColorKeys.add(key)
}

let themeColorsSaveTimer: NodeJS.Timeout | null = null
export function saveThemeColorsCache(immediate: boolean = false) {
  const flush = () => {
    if (dirtyThemeColorKeys.size === 0) return
    try {
      const items: Array<{
        key: string
        colors: { primary60: string; secondary30: string; accent10: string }
      }> = []
      for (const key of dirtyThemeColorKeys) {
        const colors = themeColorsCache[key]
        if (colors) {
          items.push({
            key,
            colors
          })
        }
      }
      if (items.length > 0) {
        sqliteStorage.batchSetThemeColors(items)
      }
      dirtyThemeColorKeys.clear()
    } catch (e) {}
  }

  if (immediate) {
    if (themeColorsSaveTimer) {
      clearTimeout(themeColorsSaveTimer)
      themeColorsSaveTimer = null
    }
    flush()
    return
  }
  if (themeColorsSaveTimer) return
  themeColorsSaveTimer = setTimeout(() => {
    themeColorsSaveTimer = null
    flush()
  }, 1000)
}

// ==========================================
// WINDOW REFERENCE
// ==========================================
let mainWindowRef: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindowRef = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef
}

// ==========================================
// WIN32 NATIVE WORKING SET TRIMMING
// ==========================================
export let trimNativeMemory: () => void = () => {}
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi')
    const k32 = koffi.load('kernel32.dll')
    const SetProcessWorkingSetSize = k32.func(
      'int __stdcall SetProcessWorkingSetSize(void* hProcess, size_t dwMinimumWorkingSetSize, size_t dwMaximumWorkingSetSize)'
    )
    const OpenProcess = k32.func(
      'void* __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)'
    )
    const CloseHandle = k32.func('int __stdcall CloseHandle(void* hObject)')
    const GetCurrentProcess = k32.func('void* __stdcall GetCurrentProcess()')

    trimNativeMemory = () => {
      try {
        SetProcessWorkingSetSize(GetCurrentProcess(), -1, -1)
        const metrics = app.getAppMetrics()
        for (const m of metrics) {
          if (m.pid && m.pid !== process.pid) {
            const h = OpenProcess(0x0100 | 0x0400, 0, m.pid)
            if (h) {
              SetProcessWorkingSetSize(h, -1, -1)
              CloseHandle(h)
            }
          }
        }
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[MemoryTrim] Failed to initialize Win32 trim:', e)
  }
}
