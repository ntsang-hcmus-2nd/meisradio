import { ipcMain, BrowserWindow } from 'electron'
import { soulseekManager } from '../SoulseekManager'
import { getConfig, saveConfig } from './sharedContext'

export { soulseekManager }

export function initSoulseekService(config?: any, win?: BrowserWindow | null): void {
  const currentConfig = config || getConfig()
  soulseekManager.init(currentConfig)
  if (win) {
    soulseekManager.setMainWindow(win)
  }
}

export function destroySoulseekService(): void {
  try {
    soulseekManager.destroy()
  } catch (_) {}
}

export function registerSoulseekIpc(): void {
  ipcMain.handle(
    'soulseek:login',
    async (_, { user, pass, remember }: { user: string; pass: string; remember?: boolean }) => {
      const res = await soulseekManager.login(user, pass)
      if (res.success && remember) {
        saveConfig({ soulseekUsername: user, soulseekPassword: pass, soulseekAutoLogin: true })
      }
      return res
    }
  )

  ipcMain.handle('soulseek:logout', async () => {
    await soulseekManager.logout()
    saveConfig({ soulseekUsername: null, soulseekPassword: null, soulseekAutoLogin: false })
    return { success: true }
  })

  ipcMain.handle('soulseek:getStatus', () => soulseekManager.getStatus())

  ipcMain.handle('soulseek:search', async (_, query: string, timeout?: number) => {
    return await soulseekManager.search(query, timeout)
  })

  ipcMain.handle('soulseek:download', async (_, item: any) => {
    return await soulseekManager.download(item)
  })

  ipcMain.handle('soulseek:cancelDownload', (_, id: string) => {
    return soulseekManager.cancelDownload(id)
  })

  ipcMain.handle('soulseek:clearCompletedDownloads', () => {
    return soulseekManager.clearCompletedDownloads()
  })

  ipcMain.handle('soulseek:selectDownloadFolder', async () => {
    const selected = await soulseekManager.selectDownloadFolder()
    if (selected) {
      saveConfig({ soulseekDownloadFolder: selected })
    }
    return selected
  })

  ipcMain.handle('soulseek:setDownloadFolder', (_, folder: string) => {
    soulseekManager.setDownloadFolder(folder)
    saveConfig({ soulseekDownloadFolder: folder })
    return { success: true }
  })

  ipcMain.handle('soulseek:openDownloadFolder', () => {
    soulseekManager.openDownloadFolder()
    return { success: true }
  })
}
