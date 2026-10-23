import {
  SlskClient,
  FileAttribute,
  Download,
  DownloadProgress,
  DownloadResult,
  DownloadStatus
} from 'slsk-client'
import { app, dialog, BrowserWindow, shell, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import { sanitizeFileName } from './services/sharedContext'

export interface SoulseekFormattedResult {
  id: string
  user: string
  file: string
  filename: string
  ext: string
  size: number
  slots: boolean
  speed: number
  queueLength: number
  bitrate?: number
  duration?: number
  sampleRate?: number
  bitDepth?: number
  isVbr?: boolean
  isLossless: boolean
  folderArtist: string
  folderAlbum: string
}

export interface SoulseekDownloadItem {
  id: string
  user: string
  file: string
  filename: string
  destinationPath: string
  size: number
  receivedBytes: number
  progress: number
  speed: number
  status: DownloadStatus | 'queued_peer' | 'error' | 'completed'
  queuePlace?: number
  error?: string
  startedAt: number
  completedAt?: number
  downloadRef?: Download
}

export type SoulseekDownloadStatus = Omit<SoulseekDownloadItem, 'downloadRef'>

const AUDIO_EXTS = new Set([
  '.flac',
  '.mp3',
  '.wav',
  '.m4a',
  '.opus',
  '.ogg',
  '.aac',
  '.alac',
  '.aiff',
  '.aif',
  '.wma',
  '.dsf',
  '.dff',
  '.dsd',
  '.ape',
  '.wv'
])

const LOSSLESS_EXTS = new Set([
  '.flac',
  '.wav',
  '.aiff',
  '.aif',
  '.alac',
  '.dsf',
  '.dff',
  '.dsd',
  '.ape',
  '.wv'
])

function checkIsLossless(file: string, attribs: any = {}): boolean {
  const ext = path.extname(file).toLowerCase()
  if (LOSSLESS_EXTS.has(ext)) {
    return true
  }

  // Apple Lossless (.m4a container with ALAC codec)
  if (ext === '.m4a') {
    const lower = file.toLowerCase()
    if (lower.includes('alac') || lower.includes('apple lossless')) {
      return true
    }
    const bitDepth = attribs[FileAttribute.BitDepth]
    const bitrate = attribs[FileAttribute.Bitrate]
    if (
      bitDepth !== undefined &&
      (bitDepth === 16 || bitDepth === 24) &&
      (!bitrate || bitrate >= 600)
    ) {
      return true
    }
  }

  // All other formats (.mp3, standard .m4a AAC, .ogg, .opus, .aac, .wma) are lossy
  return false
}

function getFileQualityScore(r: any): number {
  const isLossless = checkIsLossless(r.file, r.attribs)

  if (isLossless) {
    const bitDepth = r.attribs?.[FileAttribute.BitDepth] || 16
    const sampleRate = r.attribs?.[FileAttribute.SampleRate] || 44100
    // Lossless base score is 1,000,000 (ensures Lossless ranks above any lossy format)
    return 1000000 + bitDepth * 10000 + Math.round(sampleRate / 100)
  }

  // Lossy formats (MP3, M4A, etc.)
  let bitrate = r.attribs?.[FileAttribute.Bitrate] || 0
  const duration = r.attribs?.[FileAttribute.Duration]
  if (bitrate === 0 && duration && duration > 0 && r.size > 0) {
    bitrate = Math.round((r.size * 8) / (duration * 1000))
  }
  // Cap lossy score at 320 to avoid inflated container bitrates
  return Math.min(bitrate, 320)
}

export class SoulseekManager {
  private client: SlskClient | null = null
  private connected: boolean = false
  private isConnecting: boolean = false
  private username: string | null = null
  private savedPassword: string | null = null
  private downloadFolder: string = ''
  private activeDownloads: Map<string, SoulseekDownloadItem> = new Map()
  private mainWindow: BrowserWindow | null = null
  private speedCalcIntervals: Map<string, { lastBytes: number; lastTime: number }> = new Map()
  private lastNotifyTime: Map<string, number> = new Map()

  constructor() {
    this.downloadFolder = path.join(app.getPath('downloads'), "Mei's Radio", 'Soulseek')
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  init(config: any) {
    if (config?.soulseekDownloadFolder && typeof config.soulseekDownloadFolder === 'string') {
      this.downloadFolder = config.soulseekDownloadFolder
    } else if (config?.libraryPaths?.[0]) {
      this.downloadFolder = path.join(config.libraryPaths[0], 'Soulseek Downloads')
    }

    // Lưu lại thông tin đăng nhập đã cấu hình (Lazy connection - KHÔNG tự động kết nối ngầm khi mở app để giữ 0% CPU/RAM)
    if (config?.soulseekUsername && config?.soulseekPassword) {
      this.username = config.soulseekUsername
      let password = config.soulseekPassword
      if (password.startsWith('ENC:') && safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(password.replace('ENC:', ''), 'base64')
          password = safeStorage.decryptString(buffer)
        } catch (e) {
          console.error('[Soulseek] Không thể giải mã mật khẩu đã lưu:', e)
        }
      }
      this.savedPassword = password
    }
  }

  // Kết nối theo nhu cầu (On-Demand Connection) khi người dùng mở giao diện Tải xuống
  async ensureConnected(): Promise<boolean> {
    if (this.connected && this.client) return true
    if (this.username && this.savedPassword) {
      const res = await this.login(this.username, this.savedPassword)
      return res.success
    }
    return false
  }

  async login(
    user: string,
    pass: string
  ): Promise<{ success: boolean; username?: string; error?: string }> {
    const trimmedUser = user?.trim()
    if (!trimmedUser || !pass) {
      return { success: false, error: 'Tên đăng nhập và mật khẩu không được để trống' }
    }

    if (this.isConnecting) {
      return { success: false, error: 'Đang trong quá trình kết nối đến máy chủ Soulseek...' }
    }

    this.isConnecting = true
    this.notifyStatus()

    try {
      if (this.client) {
        try {
          this.client.destroy()
        } catch {}
        this.client = null
        this.connected = false
      }

      this.client = new SlskClient({
        timeout: 12000,
        reconnect: true
      })

      // =========================================================================
      // TỐI ƯU HÓA HIỆU NĂNG CỰC ĐẠI: VÔ HIỆU HÓA DISTRIBUTED PEER ROUTING (DHT ROUTER)
      // Mặc định của Soulseek biến mọi client thành nút cha (Parent Node) trung chuyển
      // hàng ngàn lượt tìm kiếm/giây của người dùng toàn thế giới, gây nghẽn CPU và mạng.
      // Chúng ta vô hiệu hóa hoàn toàn nhánh này, chỉ giữ kết nối tới Server chính!
      // =========================================================================
      const peers = (this.client as any).peers
      if (peers) {
        peers.createDistributedPeer = () => ({
          destroy() {},
          on() {},
          once() {},
          emit() {},
          label: 'disabled-distributed-peer'
        })
      }

      this.client.on('server-disconnect', () => {
        console.warn('[Soulseek] Mất kết nối máy chủ')
        this.connected = false
        this.notifyStatus()
      })

      this.client.on('server-reconnect', () => {
        console.log('[Soulseek] Đã kết nối lại máy chủ')
        this.connected = true
        this.notifyStatus()
      })

      await this.client.login(trimmedUser, pass)
      this.connected = true
      this.username = trimmedUser
      this.savedPassword = pass
      this.isConnecting = false
      this.notifyStatus()
      return { success: true, username: trimmedUser }
    } catch (err: any) {
      this.isConnecting = false
      this.connected = false
      this.notifyStatus()
      console.error('[Soulseek] Lỗi đăng nhập:', err)

      let msg = err.message || 'Không thể kết nối đến máy chủ Soulseek'
      if (msg.includes('INVALIDPASS')) {
        msg =
          'Mật khẩu không chính xác cho tài khoản này (hoặc tên đăng nhập đã được người khác sử dụng).'
      } else if (msg.includes('INVALIDUSERNAME')) {
        msg = 'Tên đăng nhập không hợp lệ hoặc chứa ký tự đặc biệt.'
      } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
        msg = 'Hết thời gian chờ phản hồi từ máy chủ Soulseek (server.slsknet.org:2242).'
      }
      return { success: false, error: msg }
    }
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        this.client.destroy()
      } catch {}
      this.client = null
    }
    this.connected = false
    this.username = null
    this.savedPassword = null
    this.notifyStatus()
  }

  getDownloads(): SoulseekDownloadStatus[] {
    return Array.from(this.activeDownloads.values()).map((item) => ({
      id: item.id,
      user: item.user,
      file: item.file,
      filename: item.filename,
      destinationPath: item.destinationPath,
      size: item.size,
      receivedBytes: item.receivedBytes,
      progress: item.progress,
      speed: item.speed,
      status: item.status,
      queuePlace: item.queuePlace,
      error: item.error,
      startedAt: item.startedAt,
      completedAt: item.completedAt
    }))
  }

  clearCompletedDownloads(): SoulseekDownloadStatus[] {
    for (const [id, item] of this.activeDownloads) {
      if (
        item.status === 'complete' ||
        (item.status as string) === 'completed' ||
        item.status === 'failed' ||
        (item.status as string) === 'error' ||
        item.status === 'cancelled'
      ) {
        if (item.downloadRef) {
          try {
            item.downloadRef.cancel('Cleared completed')
          } catch {}
          item.downloadRef = undefined
        }
        this.activeDownloads.delete(id)
        this.speedCalcIntervals.delete(id)
        this.lastNotifyTime.delete(id)
      }
    }
    this.notifyStatus()
    return this.getDownloads()
  }

  getStatus() {
    return {
      connected: this.connected,
      isConnecting: this.isConnecting,
      username: this.username,
      downloadFolder: this.downloadFolder,
      activeDownloads: this.getDownloads()
    }
  }

  notifyStatus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('soulseek:status-changed', this.getStatus())
    }
  }

  async search(
    query: string,
    timeout = 4000
  ): Promise<{ success: boolean; results?: SoulseekFormattedResult[]; error?: string }> {
    if (!this.client || !this.connected) {
      // Thử tự động kết nối lại nếu có thông tin lưu trữ
      const reconnected = await this.ensureConnected()
      if (!reconnected || !this.client || !this.connected) {
        return {
          success: false,
          error: 'Chưa kết nối đến mạng Soulseek. Vui lòng đăng nhập trước khi tìm kiếm.'
        }
      }
    }

    const cleanQuery = query?.trim()
    if (!cleanQuery) {
      return { success: true, results: [] }
    }

    try {
      const rawResults = await this.client.search({ req: cleanQuery, timeout })

      // =========================================================================
      // TỐI ƯU HÓA BỘ NHỚ VÀ IPC:
      // 1. Chỉ lọc các file âm thanh hợp lệ (bỏ file rác .txt, .cue, .log, .jpg)
      // 2. Sắp xếp ưu tiên (có slot tải ngay > bitrate cao > tốc độ nhanh)
      // 3. Giới hạn tối đa 250 kết quả tốt nhất thay vì 38.000 kết quả làm tràn RAM 1.7GB
      // =========================================================================
      const audioOnly = rawResults.filter((r) => {
        const ext = path.extname(r.file).toLowerCase()
        return AUDIO_EXTS.has(ext) && r.size > 100000 // bỏ file < 100KB
      })

      audioOnly.sort((a, b) => {
        // 1. Ưu tiên peer có slot tải ngay
        if (a.slots !== b.slots) return a.slots ? -1 : 1

        // 2. Ưu tiên chất lượng âm thanh: Lossless (Hi-Res > 16-bit) > 320k > 256k > 128k
        const scoreA = getFileQualityScore(a)
        const scoreB = getFileQualityScore(b)
        if (scoreA !== scoreB) return scoreB - scoreA

        // 3. Ưu tiên tốc độ peer nhanh hơn
        return (b.speed || 0) - (a.speed || 0)
      })

      const topResults = audioOnly.slice(0, 250)

      const formatted: SoulseekFormattedResult[] = topResults.map((r) => {
        const parts = r.file.split(/[\\/]/)
        const filename = parts[parts.length - 1] || r.file
        const ext = path.extname(filename).toLowerCase()

        let bitrate = r.attribs[FileAttribute.Bitrate]
        const duration = r.attribs[FileAttribute.Duration]
        const sampleRate = r.attribs[FileAttribute.SampleRate]
        const bitDepth = r.attribs[FileAttribute.BitDepth]
        const isVbr = r.attribs[FileAttribute.VBR] === 1

        const isLossless = checkIsLossless(r.file, r.attribs)

        // Nếu peer không báo bitrate trong attribs (đặc biệt là FLAC), tính toán từ dung lượng và thời lượng
        if ((!bitrate || bitrate === 0) && duration && duration > 0 && r.size > 0) {
          bitrate = Math.round((r.size * 8) / (duration * 1000))
        }

        // Đối với MP3 thông thường, kẹp bitrate hiển thị tối đa 320 kbps chuẩn
        if (!isLossless && ext === '.mp3' && bitrate && bitrate > 320) {
          bitrate = 320
        }

        const isAlac = isLossless && ext === '.m4a'
        const extLabel = isAlac ? 'ALAC' : ext.replace('.', '').toUpperCase()

        let folderArtist = ''
        let folderAlbum = ''
        if (parts.length >= 3) {
          folderArtist = parts[parts.length - 3]
          folderAlbum = parts[parts.length - 2]
        } else if (parts.length === 2) {
          folderAlbum = parts[parts.length - 2]
        }

        return {
          id: `${r.user}::${r.file}`,
          user: r.user,
          file: r.file,
          filename,
          ext: extLabel,
          size: r.size,
          slots: r.slots,
          speed: r.speed,
          queueLength: r.queueLength ?? 0,
          bitrate,
          duration,
          sampleRate,
          bitDepth,
          isVbr,
          isLossless,
          folderArtist,
          folderAlbum
        }
      })

      return { success: true, results: formatted }
    } catch (err: any) {
      console.error('[Soulseek] Lỗi tìm kiếm:', err)
      return { success: false, error: err.message || 'Lỗi khi tìm kiếm trên mạng Soulseek' }
    }
  }

  async download(item: any): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.client || !this.connected) {
      const reconnected = await this.ensureConnected()
      if (!reconnected || !this.client || !this.connected) {
        return { success: false, error: 'Chưa kết nối đến mạng Soulseek' }
      }
    }

    let activeDownloadId = ''
    try {
      const folder = this.downloadFolder
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
      }

      const parts = item.file.split(/[\\/]/)
      const rawName = parts[parts.length - 1] || 'downloaded_track'
      const ext = path.extname(rawName)
      const baseName = sanitizeFileName(path.basename(rawName, ext))

      let destFilename = `${baseName}${ext}`
      let destPath = path.join(folder, destFilename)
      let counter = 1
      while (fs.existsSync(destPath)) {
        destFilename = `${baseName} (${counter})${ext}`
        destPath = path.join(folder, destFilename)
        counter++
      }

      const downloadId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      activeDownloadId = downloadId

      const download = this.client!.download({
        user: item.user,
        file: item.file,
        size: item.size,
        path: destPath
      })

      const downloadRecord: SoulseekDownloadItem = {
        id: downloadId,
        user: item.user,
        file: item.file,
        filename: destFilename,
        destinationPath: destPath,
        size: item.size || 0,
        receivedBytes: 0,
        progress: 0,
        speed: 0,
        status: 'requested',
        startedAt: Date.now(),
        downloadRef: download
      }

      this.activeDownloads.set(downloadId, downloadRecord)
      this.speedCalcIntervals.set(downloadId, { lastBytes: 0, lastTime: Date.now() })

      this.notifyDownloadUpdate(downloadRecord, true)

      download.on('status', (status: DownloadStatus) => {
        downloadRecord.status = status
        this.notifyDownloadUpdate(downloadRecord, true)
      })

      download.on('queue', (place: number) => {
        downloadRecord.status = 'queued_peer'
        downloadRecord.queuePlace = place
        this.notifyDownloadUpdate(downloadRecord, true)
      })

      // Throttle tiến trình: Chỉ bắn IPC tối đa 3 lần/giây thay vì 200 lần/giây
      download.on('progress', (prog: DownloadProgress) => {
        downloadRecord.receivedBytes = prog.receivedBytes
        if (prog.totalBytes) {
          downloadRecord.size = prog.totalBytes
        }
        downloadRecord.progress =
          prog.progress ?? (downloadRecord.size > 0 ? prog.receivedBytes / downloadRecord.size : 0)
        downloadRecord.status = 'downloading'

        const speedTracker = this.speedCalcIntervals.get(downloadId)
        const now = Date.now()
        if (speedTracker) {
          const timeDiff = (now - speedTracker.lastTime) / 1000
          if (timeDiff >= 0.5) {
            const bytesDiff = prog.receivedBytes - speedTracker.lastBytes
            downloadRecord.speed = Math.max(0, Math.round(bytesDiff / timeDiff))
            speedTracker.lastBytes = prog.receivedBytes
            speedTracker.lastTime = now
          }
        }

        this.notifyDownloadUpdate(downloadRecord, false)
      })

      download.on('complete', (res: DownloadResult) => {
        downloadRecord.status = 'complete'
        downloadRecord.progress = 1
        downloadRecord.receivedBytes = res.receivedBytes
        downloadRecord.completedAt = Date.now()
        downloadRecord.speed = 0
        downloadRecord.downloadRef = undefined
        this.speedCalcIntervals.delete(downloadId)
        this.notifyDownloadUpdate(downloadRecord, true)

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('soulseek:download-completed', {
            id: downloadId,
            path: res.path,
            filename: destFilename
          })
        }
      })

      download.on('failed', (err: Error) => {
        downloadRecord.status = 'error'
        downloadRecord.error = err.message || 'Lỗi truyền tải tệp'
        downloadRecord.speed = 0
        downloadRecord.downloadRef = undefined
        this.speedCalcIntervals.delete(downloadId)
        this.notifyDownloadUpdate(downloadRecord, true)
      })

      ;(download as any).on?.('error', (err: Error) => {
        downloadRecord.status = 'error'
        downloadRecord.error = err?.message || 'Lỗi truyền tải tệp'
        downloadRecord.speed = 0
        downloadRecord.downloadRef = undefined
        this.speedCalcIntervals.delete(downloadId)
        this.notifyDownloadUpdate(downloadRecord, true)
      })

      return { success: true, id: downloadId }
    } catch (err: any) {
      console.error('[Soulseek] Lỗi bắt đầu tải xuống:', err)
      if (activeDownloadId) {
        const item = this.activeDownloads.get(activeDownloadId)
        if (item) {
          item.downloadRef = undefined
          item.status = 'error'
          item.error = err?.message || 'Không thể bắt đầu tải xuống'
        }
      }
      return { success: false, error: err.message || 'Không thể bắt đầu tải xuống' }
    }
  }

  cancelDownload(id: string): boolean {
    const item = this.activeDownloads.get(id)
    if (!item) return false

    if (
      item.downloadRef &&
      (item.status === 'requested' ||
        item.status === 'queued' ||
        item.status === 'queued_peer' ||
        item.status === 'connected' ||
        item.status === 'downloading')
    ) {
      try {
        item.downloadRef.cancel('Người dùng đã hủy')
      } catch (e) {
        console.warn('[Soulseek] Lỗi khi hủy download:', e)
      }
    }

    item.status = 'cancelled'
    item.speed = 0
    item.downloadRef = undefined
    this.speedCalcIntervals.delete(id)
    this.notifyDownloadUpdate(item, true)
    return true
  }

  // Throttle phát sóng IPC xuống Renderer
  private notifyDownloadUpdate(item: SoulseekDownloadItem, force = false) {
    const now = Date.now()
    const last = this.lastNotifyTime.get(item.id) || 0
    if (!force && now - last < 350) {
      return
    }
    this.lastNotifyTime.set(item.id, now)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('soulseek:download-progress', {
        id: item.id,
        user: item.user,
        file: item.file,
        filename: item.filename,
        destinationPath: item.destinationPath,
        size: item.size,
        receivedBytes: item.receivedBytes,
        progress: item.progress,
        speed: item.speed,
        status: item.status,
        queuePlace: item.queuePlace,
        error: item.error,
        startedAt: item.startedAt,
        completedAt: item.completedAt
      })
    }
  }

  async selectDownloadFolder(): Promise<string | null> {
    if (!this.mainWindow) return null
    const res = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Chọn thư mục lưu nhạc Soulseek',
      defaultPath: this.downloadFolder,
      properties: ['openDirectory', 'createDirectory']
    })

    if (!res.canceled && res.filePaths.length > 0) {
      const selected = res.filePaths[0]
      this.downloadFolder = selected
      this.notifyStatus()
      return selected
    }
    return null
  }

  setDownloadFolder(folderPath: string) {
    if (folderPath && typeof folderPath === 'string') {
      this.downloadFolder = folderPath
      this.notifyStatus()
    }
  }

  openDownloadFolder(): void {
    if (this.downloadFolder && fs.existsSync(this.downloadFolder)) {
      shell.openPath(this.downloadFolder)
    } else {
      try {
        fs.mkdirSync(this.downloadFolder, { recursive: true })
        shell.openPath(this.downloadFolder)
      } catch {}
    }
  }

  destroy() {
    for (const [_, item] of this.activeDownloads) {
      if (
        item.downloadRef &&
        (item.status === 'downloading' || item.status === 'requested' || item.status === 'queued')
      ) {
        try {
          item.downloadRef.cancel('Application exit')
        } catch {}
      }
    }
    this.activeDownloads.clear()
    this.speedCalcIntervals.clear()
    this.lastNotifyTime.clear()
    if (this.client) {
      try {
        this.client.destroy()
      } catch {}
      this.client = null
    }
    this.connected = false
  }
}

export const soulseekManager = new SoulseekManager()
