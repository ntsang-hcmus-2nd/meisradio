import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import fs from 'fs'
import path from 'path'

export interface UpdaterStatus {
  status:
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  releaseNotes?: string
  releaseDate?: string
  progressPercent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

let updaterStatus: UpdaterStatus = {
  status: 'idle',
  currentVersion: typeof app?.getVersion === 'function' ? app.getVersion() : '1.0.0'
}

let isInitialized = false

export function broadcastStatus(): void {
  try {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('updater:status-changed', updaterStatus)
      }
    }
  } catch (err) {
    console.error('[AutoUpdater] Failed to broadcast status:', err)
  }
}

export function getUpdaterStatus(): UpdaterStatus {
  if (typeof app?.getVersion === 'function') {
    updaterStatus.currentVersion = app.getVersion()
  }
  return { ...updaterStatus }
}

export function initAutoUpdater(): void {
  if (isInitialized) return
  isInitialized = true

  if (typeof app?.getVersion === 'function') {
    updaterStatus.currentVersion = app.getVersion()
  }

  // Configure autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    updaterStatus = {
      ...updaterStatus,
      status: 'checking',
      error: undefined
    }
    broadcastStatus()
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    let releaseNotesStr: string | undefined = undefined
    if (typeof info.releaseNotes === 'string') {
      releaseNotesStr = info.releaseNotes
    } else if (Array.isArray(info.releaseNotes)) {
      releaseNotesStr = info.releaseNotes
        .map((n) => (typeof n === 'string' ? n : n.note))
        .join('\n')
    }

    updaterStatus = {
      ...updaterStatus,
      status: 'available',
      latestVersion: info.version,
      releaseNotes: releaseNotesStr,
      releaseDate: info.releaseDate,
      error: undefined
    }
    broadcastStatus()
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    updaterStatus = {
      ...updaterStatus,
      status: 'not-available',
      latestVersion: info?.version,
      error: undefined
    }
    broadcastStatus()
  })

  autoUpdater.on('download-progress', (progressObj) => {
    updaterStatus = {
      ...updaterStatus,
      status: 'downloading',
      progressPercent: Math.round(progressObj.percent || 0),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
      error: undefined
    }
    broadcastStatus()
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    updaterStatus = {
      ...updaterStatus,
      status: 'downloaded',
      latestVersion: info?.version,
      error: undefined
    }
    broadcastStatus()
  })

  autoUpdater.on('error', (err: Error) => {
    console.error('[AutoUpdater] Error:', err)
    updaterStatus = {
      ...updaterStatus,
      status: 'error',
      error: err?.message || String(err)
    }
    broadcastStatus()
  })

  // Register IPC handlers
  ipcMain.handle('updater:getStatus', () => {
    return getUpdaterStatus()
  })

  ipcMain.handle('updater:check', async () => {
    // If in dev mode and dev-app-update.yml doesn't exist, gracefully catch or simulate clean 'not-available'
    if (!app.isPackaged) {
      const devConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml')
      if (!fs.existsSync(devConfigPath)) {
        updaterStatus = {
          ...updaterStatus,
          status: 'not-available',
          latestVersion: app.getVersion(),
          error: undefined
        }
        broadcastStatus()
        return { success: true, status: updaterStatus }
      }
    }

    try {
      updaterStatus.status = 'checking'
      updaterStatus.error = undefined
      broadcastStatus()

      const result = await autoUpdater.checkForUpdates()
      return { success: true, result, status: updaterStatus }
    } catch (err: any) {
      console.warn('[AutoUpdater] Check failed (handled):', err?.message || err)
      updaterStatus = {
        ...updaterStatus,
        status: !app.isPackaged ? 'not-available' : 'error',
        error: !app.isPackaged ? undefined : err?.message || 'Check for updates failed'
      }
      broadcastStatus()
      return { success: !app.isPackaged, error: err?.message, status: updaterStatus }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      updaterStatus.status = 'downloading'
      updaterStatus.progressPercent = 0
      broadcastStatus()
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err: any) {
      updaterStatus = {
        ...updaterStatus,
        status: 'error',
        error: err?.message || 'Failed to download update'
      }
      broadcastStatus()
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('updater:install', () => {
    try {
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })
}
