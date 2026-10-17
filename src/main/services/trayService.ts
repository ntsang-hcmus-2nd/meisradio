import { Tray, Menu, BrowserWindow, ipcMain } from 'electron'
import { getConfig, saveConfig } from './sharedContext'

let trayInstance: Tray | null = null
let closeToTraySetting = false
let minimizeToTraySetting = false

export function isCloseToTray(): boolean {
  const cfg = getConfig()
  if (typeof cfg?.closeToTray === 'boolean') {
    closeToTraySetting = cfg.closeToTray
    return Boolean(cfg.closeToTray)
  }
  return Boolean(closeToTraySetting)
}

export function isMinimizeToTray(): boolean {
  const cfg = getConfig()
  if (typeof cfg?.minimizeToTray === 'boolean') {
    minimizeToTraySetting = cfg.minimizeToTray
    return Boolean(cfg.minimizeToTray)
  }
  return Boolean(minimizeToTraySetting)
}

export function setCloseToTray(val: boolean): void {
  closeToTraySetting = val
  saveConfig({ closeToTray: val })
}

export function setMinimizeToTray(val: boolean): void {
  minimizeToTraySetting = val
  saveConfig({ minimizeToTray: val })
}

export function getTray(): Tray | null {
  return trayInstance
}

export interface TrayInitOptions {
  icon: any
  getMainWindow: () => BrowserWindow | null
  onQuit: () => void
  sendShortcut: (action: string) => void
}

let trayOptions: TrayInitOptions | null = null

export function updateTrayMenu(): void {
  if (!trayInstance || !trayOptions) return
  const isEn = getConfig().language === 'en'
  const { getMainWindow, onQuit, sendShortcut } = trayOptions

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isEn ? 'Show Meis Radio' : 'Hiển thị Meis Radio',
      click: () => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.show()
          win.restore()
        }
      }
    },
    { type: 'separator' },
    { label: isEn ? 'Play / Pause' : 'Phát / Tạm dừng', click: () => sendShortcut('play-pause') },
    { label: isEn ? 'Next Track' : 'Bài tiếp theo', click: () => sendShortcut('next') },
    { label: isEn ? 'Previous Track' : 'Bài trước đó', click: () => sendShortcut('prev') },
    { type: 'separator' },
    {
      label: isEn ? 'Quit' : 'Thoát hoàn toàn',
      click: onQuit
    }
  ])
  trayInstance.setContextMenu(contextMenu)
}

export function initTray(options: TrayInitOptions): Tray {
  trayOptions = options
  const config = getConfig()
  closeToTraySetting = config.closeToTray ?? false
  minimizeToTraySetting = config.minimizeToTray ?? false

  trayInstance = new Tray(options.icon)
  trayInstance.setToolTip('Meis Radio')

  updateTrayMenu()

  trayInstance.on('double-click', () => {
    const win = options.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.show()
      win.restore()
    }
  })

  return trayInstance
}

export function destroyTray(): void {
  if (trayInstance) {
    try {
      trayInstance.destroy()
    } catch (_) {}
    trayInstance = null
  }
}

export function registerTrayIpc(): void {
  ipcMain.handle('music:updateTrayConfig', (_, c) => {
    if (c) {
      const updates: { closeToTray?: boolean; minimizeToTray?: boolean } = {}
      if (typeof c.closeToTray === 'boolean') {
        closeToTraySetting = c.closeToTray
        updates.closeToTray = c.closeToTray
      }
      if (typeof c.minimizeToTray === 'boolean') {
        minimizeToTraySetting = c.minimizeToTray
        updates.minimizeToTray = c.minimizeToTray
      }
      if (Object.keys(updates).length > 0) {
        saveConfig(updates)
      }
    }
  })
}
