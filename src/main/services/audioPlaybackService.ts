import { BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { BassManager } from '../BassManager'
import { getConfig, saveConfig } from './sharedContext'

/**
 * Xử lý phát bài hát qua BassManager (hỗ trợ cả đường dẫn cục bộ, URL tệp và tham số CUE virtual track)
 */
export function handlePlayAudio(
  bassManager: BassManager | null,
  _: any,
  url: string,
  deviceIdOrCrossfade?: any,
  exclusive: boolean = true,
  startTime?: number,
  endTime?: number
) {
  let rawPath = url
  if (typeof rawPath === 'string') {
    if (rawPath.startsWith('file://')) {
      try {
        rawPath = fileURLToPath(rawPath)
      } catch {
        rawPath = decodeURIComponent(rawPath.replace(/^file:\/\/\/?/, ''))
      }
    } else if (rawPath.includes('/local-audio?path=')) {
      try {
        const parsed = new URL(rawPath)
        const p = parsed.searchParams.get('path')
        if (p) rawPath = p
      } catch (_) {}
    }
  }

  let actualDevice = deviceIdOrCrossfade
  let actualExclusive = exclusive
  const actualStart = startTime
  const actualEnd = endTime

  // Nếu truyền crossfadeDuration dưới dạng số ở tham số 2
  if (typeof deviceIdOrCrossfade === 'number') {
    actualDevice = undefined
    actualExclusive = typeof exclusive === 'boolean' ? exclusive : true
  }

  return bassManager?.playFile(rawPath, actualDevice, actualExclusive, actualStart, actualEnd)
}

/**
 * Đăng ký lắng nghe các sự kiện âm thanh từ BassManager và chuyển tiếp tới Renderer
 */
export function setupBassEvents(
  bassManager: BassManager,
  getWin: () => BrowserWindow | null
): void {
  bassManager.on('time', (val) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:time', val)
    }
  })
  bassManager.on('duration', (val) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:duration', val)
    }
  })
  bassManager.on('paused', (val) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:paused', val)
    }
  })
  bassManager.on('ended', () => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:ended')
    }
  })
  bassManager.on('error', (err) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:error', err)
    }
  })
  bassManager.on('audio-out-params', (params) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:audio-out-params', params)
    }
  })
  bassManager.on('gapless-transition', (nextPath, nextInfo) => {
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('bass:gapless-transition', { nextPath, nextInfo })
    }
  })
}

/**
 * Đăng ký toàn bộ các kênh IPC điều khiển phát nhạc của BASS / MPV
 */
export function registerAudioPlaybackIpc(bassManager: BassManager): void {
  const playHandler = (
    _: any,
    url: string,
    devOrCf?: any,
    excl: boolean = true,
    st?: number,
    et?: number
  ) => handlePlayAudio(bassManager, _, url, devOrCf, excl, st, et)

  ipcMain.handle('bass:play', playHandler)
  ipcMain.handle('mpv:play', playHandler)
  ipcMain.handle('bass:setGapless', (_, enabled: boolean) => bassManager?.setGapless(enabled))
  ipcMain.handle('bass:preloadNext', (_, filePath: string, startTime?: number, endTime?: number) =>
    bassManager?.preloadNextTrack(filePath, startTime, endTime)
  )
  ipcMain.handle('bass:resume', () => bassManager?.play())
  ipcMain.handle('mpv:resume', () => bassManager?.play())
  ipcMain.handle('bass:pause', () => bassManager?.pause())
  ipcMain.handle('mpv:pause', () => bassManager?.pause())
  ipcMain.handle('bass:stop', () => bassManager?.stop())
  ipcMain.handle('mpv:stop', () => bassManager?.stop())
  ipcMain.handle('bass:seek', (_, pos, mode = 'absolute') => bassManager?.seek(pos, mode))
  ipcMain.handle('mpv:seek', (_, pos, mode = 'absolute') => bassManager?.seek(pos, mode))
  ipcMain.handle('bass:setVolume', (_, vol) => {
    bassManager?.setVolume(vol)
  })
  ipcMain.handle('mpv:setVolume', (_, vol) => {
    bassManager?.setVolume(vol)
  })
  ipcMain.handle('bass:setEqualizer', (_, bands, preamp = 0) =>
    bassManager?.setEqualizer(bands, preamp)
  )
  ipcMain.handle('mpv:setEqualizer', (_, bands, preamp = 0) =>
    bassManager?.setEqualizer(bands, preamp)
  )

  const setBitPerfectHandler = async (
    _: any,
    val: boolean,
    currentVol?: number,
    outputType?: 'wasapi' | 'asio'
  ) => {
    const config = getConfig()
    config.bitPerfectEnabled = val
    if (outputType) {
      config.bitPerfectType = outputType
    }
    if (typeof currentVol === 'number') {
      config.volume = currentVol
    }
    saveConfig(config)
    const effectiveVol = typeof currentVol === 'number' ? currentVol : config.volume
    const effectiveGain =
      typeof effectiveVol === 'number' ? Math.pow(Math.max(0, Math.min(1, effectiveVol)), 2) : 1.0
    await bassManager?.init(
      config.audioDevice,
      val,
      effectiveGain,
      (config.bitPerfectType as 'wasapi' | 'asio') || 'asio'
    )
    return { success: true }
  }

  ipcMain.handle('mpv:setBitPerfect', setBitPerfectHandler)
  ipcMain.handle('bass:setBitPerfect', setBitPerfectHandler)

  ipcMain.handle('bass:setOutputType', async (_, type: 'wasapi' | 'asio') => {
    const config = getConfig()
    config.bitPerfectType = type
    saveConfig(config)
    bassManager?.setOutputType(type)
    return { success: true }
  })

  ipcMain.handle('music:setAudioDevice', (_, deviceId) => {
    const config = getConfig()
    config.audioDevice = deviceId
    saveConfig(config)
    bassManager?.setAudioDevice(deviceId)
    return { success: true }
  })

  ipcMain.handle('music:getAudioDevices', async (_, type?: 'wasapi' | 'asio') => {
    try {
      const config = getConfig()
      const targetType = type || (config.bitPerfectType as 'wasapi' | 'asio') || 'wasapi'
      const rawDevices = bassManager ? bassManager.getAudioDevices(targetType) : []
      const devices = rawDevices.map((d) => ({
        name: d.id,
        description: d.description || d.name,
        type: d.type
      }))
      return { success: true, devices }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unknown error',
        devices: []
      }
    }
  })
}
