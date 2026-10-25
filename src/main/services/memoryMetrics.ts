import { app, ipcMain } from 'electron'
import fs from 'fs'
import { join } from 'path'
import {
  DATA_FOLDER,
  getConfig,
  metadataCache,
  dirtyMetadataKeys,
  themeColorsCache,
  allowedDroppedFiles
} from './sharedContext'
import {
  smallCoverCache,
  largeCoverCache,
  folderCoverCache,
  streamUrlCache
} from './streamServer'

export const MEM_TRACE_PATH = join(DATA_FOLDER, 'mem-trace.log')

let traceTimer: NodeJS.Timeout | null = null
let started = false

function safeAppMetrics(): Array<{ type: string; pid: number; memory: any }> {
  try {
    return app
      .getAppMetrics()
      .map((m: any) => ({ type: m.type, pid: m.pid, memory: m.memory }))
  } catch {
    return []
  }
}

export function logMemorySample(reason: string): void {
  try {
    const cfg: any = getConfig()
    const entry = {
      ts: new Date().toISOString(),
      source: 'main',
      reason,
      proc: process.memoryUsage(),
      procs: safeAppMetrics(),
      caches: {
        smallCover: smallCoverCache.size,
        largeCover: largeCoverCache.size,
        folderCover: folderCoverCache.size,
        streamUrl: streamUrlCache.size,
        metadataKeys: Object.keys(metadataCache).length,
        dirtyMetadata: dirtyMetadataKeys.size,
        themeColors: Object.keys(themeColorsCache).length,
        droppedFiles: allowedDroppedFiles.size
      },
      flags: {
        discordEnabled: cfg?.discordRpc?.enabled ?? null,
        autoDeepCleanOnHide: cfg?.autoDeepCleanOnHide ?? null,
        appMode: cfg?.appMode ?? null
      }
    }
    fs.appendFileSync(MEM_TRACE_PATH, JSON.stringify(entry) + '\n')
  } catch {}
}

export function startMemoryTrace(intervalMs: number = 60000): void {
  if (started) return
  started = true
  logMemorySample('startup')
  traceTimer = setInterval(() => logMemorySample('interval'), intervalMs)
  try {
    ;(traceTimer as any)?.unref?.()
  } catch {}
}

export function stopMemoryTrace(): void {
  if (traceTimer) {
    clearInterval(traceTimer)
    traceTimer = null
  }
  started = false
}

export function registerMemoryMetricsIpc(): void {
  ipcMain.handle('metrics:appendRenderer', (_, payload: any) => {
    try {
      const entry = { ts: new Date().toISOString(), source: 'renderer', ...(payload || {}) }
      fs.appendFileSync(MEM_TRACE_PATH, JSON.stringify(entry) + '\n')
    } catch {}
    return { success: true }
  })
  ipcMain.handle('metrics:logNow', (_, reason: string) => {
    logMemorySample(typeof reason === 'string' && reason ? reason : 'manual')
    return { success: true, path: MEM_TRACE_PATH }
  })
}
