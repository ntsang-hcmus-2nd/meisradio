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

export const performDeepMemoryTrim = async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:onDeepClean')
    }
    clearStreamCoverCache()
    if (typeof (global as any).gc === 'function') {
      ;(global as any).gc()
    }
    setTimeout(() => {
      trimNativeMemory()
    }, 300)
  } catch (e) {}
}

export interface WindowManagerOptions {
  icon?: any
  isQuitting: () => boolean
  onQuit: () => void
}

export function createMainWindow(options: WindowManagerOptions): BrowserWindow {
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

  mainWindow.on('resized', saveWindowState)
  mainWindow.on('moved', saveWindowState)
  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)

  let idleTrimTimer: NodeJS.Timeout | null = null
  const resetIdleTrim = () => {
    if (idleTrimTimer) clearTimeout(idleTrimTimer)
    idleTrimTimer = setTimeout(() => {
      if (
        mainWindow &&
        (!mainWindow.isFocused() || mainWindow.isMinimized() || !mainWindow.isVisible())
      ) {
        performDeepMemoryTrim()
      }
    }, 180000)
  }

  mainWindow.on('blur', resetIdleTrim)
  mainWindow.on('focus', () => {
    if (idleTrimTimer) {
      clearTimeout(idleTrimTimer)
      idleTrimTimer = null
    }
  })

  // @ts-ignore
  mainWindow.on('minimize', (event: Electron.Event) => {
    if (isMinimizeToTray()) {
      event.preventDefault()
      mainWindow?.hide()
    }
    performDeepMemoryTrim()
  })

  mainWindow.on('hide', () => {
    performDeepMemoryTrim()
  })

  mainWindow.on('close', (event: Electron.Event) => {
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
