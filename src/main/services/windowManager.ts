import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  getConfig,
  saveConfig,
  setMainWindow as setSharedMainWindow,
  registerAllowedDroppedFile,
  trimNativeMemory
} from './sharedContext'
import { clearStreamCoverCache } from './streamServer'
import { logMemorySample } from './memoryMetrics'
import { getDiscordRpcManager } from './discordService'
import { soulseekManager } from '../SoulseekManager'
import { isCloseToTray, isMinimizeToTray } from './trayService'

let mainWindow: BrowserWindow | null = null
let isInMiniPlayer = false
let preMiniPlayerState: any = null

export const saveWindowState = () => {
  if (!mainWindow || isInMiniPlayer) return
  const bounds = mainWindow.getBounds()
  const isMaximized = mainWindow.isMaximized()
  saveConfig({ windowState: { ...bounds, isMaximized } })
}

let saveWindowStateTimer: ReturnType<typeof setTimeout> | null = null
const scheduleSaveWindowState = () => {
  if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer)
  saveWindowStateTimer = setTimeout(() => {
    saveWindowStateTimer = null
    saveWindowState()
  }, 400)
}

let isTrimmingMemory = false
let lastDeepTrimAt = 0
let activeAudioPlayingCheck: (() => boolean) | undefined

export const performDeepMemoryTrim = async (options?: { wipeCoverCache?: boolean; notifyRenderer?: boolean }) => {
  const now = Date.now()
  if (isTrimmingMemory || (now - lastDeepTrimAt < 15000 && !options?.wipeCoverCache)) return
  isTrimmingMemory = true
  lastDeepTrimAt = now
  try {
    if (getConfig()?.autoDeepCleanOnHide === false && !options?.wipeCoverCache) return
    if (options?.notifyRenderer !== false && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:onDeepClean')
    }
    if (options?.wipeCoverCache === true) {
      clearStreamCoverCache()
    }
    if (typeof (global as any).gc === 'function') {
      ;(global as any).gc()
    }
    setTimeout(() => {
      // Không page-out working set khi đang phát nhạc nền để tránh giật DAC/WebAudio
      if (!activeAudioPlayingCheck?.()) {
        trimNativeMemory()
      }
    }, 300)
  } catch {} finally {
    isTrimmingMemory = false
  }
}

export interface WindowManagerOptions {
  icon?: any
  isQuitting: () => boolean
  onQuit: () => void
  isAudioPlaying?: () => boolean
}

export function createMainWindow(options: WindowManagerOptions): BrowserWindow {
  activeAudioPlayingCheck = options.isAudioPlaying
  const config = getConfig()
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
    ...(process.platform === 'linux' && options.icon ? { icon: options.icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  setSharedMainWindow(mainWindow)
  soulseekManager.setMainWindow(mainWindow)

  mainWindow.on('resized', scheduleSaveWindowState)
  mainWindow.on('moved', scheduleSaveWindowState)
  mainWindow.on('maximize', scheduleSaveWindowState)
  mainWindow.on('unmaximize', scheduleSaveWindowState)

  let idleTrimTimer: NodeJS.Timeout | null = null
  let idleRetrimInterval: NodeJS.Timeout | null = null
  const IDLE_TRIM_MS = 180000
  const IDLE_RETRIM_MS = 600000

  const clearIdleRetrim = (): void => {
    if (idleRetrimInterval) {
      clearInterval(idleRetrimInterval)
      idleRetrimInterval = null
    }
  }

  const doIdleTrimIfUnfocused = (): void => {
    if (activeAudioPlayingCheck?.()) return
    if (
      mainWindow &&
      (!mainWindow.isFocused() || mainWindow.isMinimized() || !mainWindow.isVisible())
    ) {
      try {
        logMemorySample('idle-trim')
      } catch {}
      performDeepMemoryTrim()
    }
  }

  const resetIdleTrim = () => {
    if (idleTrimTimer) clearTimeout(idleTrimTimer)
    clearIdleRetrim()
    idleTrimTimer = setTimeout(() => {
      doIdleTrimIfUnfocused()
      // OOM fix: keep re-trimming periodically while idle instead of once.
      idleRetrimInterval = setInterval(doIdleTrimIfUnfocused, IDLE_RETRIM_MS)
      try {
        ;(idleRetrimInterval as any)?.unref?.()
      } catch {}
    }, IDLE_TRIM_MS)
  }

  mainWindow.on('blur', resetIdleTrim)
  mainWindow.on('focus', () => {
    if (idleTrimTimer) {
      clearTimeout(idleTrimTimer)
      idleTrimTimer = null
    }
    clearIdleRetrim()
    // Give Discord RPC one user-driven retry chance after backoff gave up.
    try {
      getDiscordRpcManager()?.wakeup()
    } catch {}
  })

  // @ts-ignore
  mainWindow.on('minimize', (event: Electron.Event) => {
    if (isMinimizeToTray()) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
    try {
      logMemorySample('minimize')
    } catch {}
    performDeepMemoryTrim({ wipeCoverCache: false, notifyRenderer: true })
  })

  mainWindow.on('hide', () => {
    try {
      logMemorySample('hide')
    } catch {}
    performDeepMemoryTrim({ wipeCoverCache: false, notifyRenderer: true })
  })

  mainWindow.on('close', (event: Electron.Event) => {
    if (saveWindowStateTimer) {
      clearTimeout(saveWindowStateTimer)
      saveWindowStateTimer = null
      saveWindowState()
    }
    if (!options.isQuitting() && isCloseToTray()) {
      event.preventDefault()
      mainWindow?.hide()
    } else {
      options.onQuit()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    setSharedMainWindow(null)
    soulseekManager.setMainWindow(null as any)
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch (_) {}
    return { action: 'deny' }
  })

  mainWindow.on('app-command', (_e: any, cmd: string) => {
    if (cmd === 'browser-backward') {
      mainWindow?.webContents.send('nav:back')
    } else if (cmd === 'browser-forward') {
      mainWindow?.webContents.send('nav:forward')
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function toggleMiniPlayer(isMini: boolean): void {
  if (!mainWindow) return
  if (isMini) {
    isInMiniPlayer = true
    preMiniPlayerState = {
      bounds: mainWindow.getBounds(),
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen()
    }

    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
    if (mainWindow.isMaximized()) mainWindow.unmaximize()

    mainWindow.setContentSize(400, 120, true)
    mainWindow.setAlwaysOnTop(true, 'floating')
    mainWindow.setResizable(false)
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
}

export function registerWindowIpc(options?: { onConfigSaved?: () => void }): void {
  ipcMain.handle('music:getConfig', () => getConfig())

  ipcMain.handle('music:saveConfig', (_, data) => {
    saveConfig(data)
    options?.onConfigSaved?.()
    return { success: true }
  })

  ipcMain.handle('music:registerDroppedFiles', (_, paths: string[]) => {
    if (Array.isArray(paths)) {
      for (const p of paths) registerAllowedDroppedFile(p)
    }
    return { success: true }
  })

  ipcMain.handle('music:toggleMiniPlayer', (_, isMini: boolean) => {
    toggleMiniPlayer(isMini)
    return { success: true }
  })
}
