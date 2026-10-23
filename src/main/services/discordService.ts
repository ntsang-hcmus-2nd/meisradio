import { ipcMain } from 'electron'
import { DiscordRpcManager, DiscordRpcConfig, DiscordPresencePayload } from '../DiscordRpcManager'
import { getConfig, saveConfig } from './sharedContext'

let discordRpcManager: DiscordRpcManager | null = null

export function getDiscordRpcManager(): DiscordRpcManager | null {
  return discordRpcManager
}

export function initDiscordRpc(config?: any): DiscordRpcManager {
  if (!discordRpcManager) {
    discordRpcManager = new DiscordRpcManager()
  }
  const currentConfig = config || getConfig()
  discordRpcManager.init(currentConfig.discordRpc)
  return discordRpcManager
}

export function destroyDiscordRpc(): void {
  if (discordRpcManager) {
    try {
      discordRpcManager.destroy()
    } catch (_) {}
    discordRpcManager = null
  }
}

export function registerDiscordRpcIpc(): void {
  ipcMain.handle('discord:updatePresence', (_, payload: DiscordPresencePayload) => {
    discordRpcManager?.updatePresence(payload)
    return { success: true }
  })

  ipcMain.handle('discord:clearPresence', () => {
    discordRpcManager?.clearPresence()
    return { success: true }
  })

  ipcMain.handle('discord:updateConfig', (_, config: Partial<DiscordRpcConfig>) => {
    const cur = getConfig()
    const updatedDiscordConfig = { ...(cur.discordRpc || {}), ...config }
    saveConfig({ discordRpc: updatedDiscordConfig })
    discordRpcManager?.updateConfig(updatedDiscordConfig)
    return { success: true, config: discordRpcManager?.getConfig() }
  })

  ipcMain.handle('discord:getStatus', () => {
    return (
      discordRpcManager?.getStatus() || { isConnected: false, isConnecting: false, enabled: false }
    )
  })
}
