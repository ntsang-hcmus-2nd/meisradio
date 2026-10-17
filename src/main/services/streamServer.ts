import http from 'http'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path, { dirname, join } from 'path'
import { spawn } from 'child_process'
import { pathToFileURL } from 'url'
import { nativeImage, ipcMain } from 'electron'
import * as mm from 'music-metadata'
import {
  getConfig,
  isAllowedLocalPath,
  getFfmpegPath,
  IMAGE_CACHE_DIR,
  SUPPORTED_AUDIO_EXTS,
  ytdlp
} from './sharedContext'
import { resolveScStreamUrl } from '../soundcloud'
import { fastExtractCover, findFolderCoverImage } from '../fastAudioParser'

// ==========================================
// TRẠNG THÁI SERVER & BỘ NHỚ ĐỆM RAM
// ==========================================
let streamServerInstance: http.Server | null = null
let currentStreamPort = 0

export const streamUrlCache = new Map<string, { url: string; expires: number }>()

// BỘ NHỚ ĐỆM RAM PHÂN TẦNG (Tối ưu giới hạn tránh tích tụ heap):
// - smallCoverCache: Lưu trữ tới 400 ảnh nhỏ (<=128px) ~1MB RAM cho cuộn danh sách.
// - largeCoverCache: Lưu trữ tới 200 ảnh lớn (>128px) chất lượng cao cho PlayerBar, Grid, Vinyl (~2.5MB RAM).
// - folderCoverCache: Lưu trữ tới 150 ảnh bìa thư mục album/playlist tránh fs.readdirSync lặp lại.
export const smallCoverCache = new Map<string, Buffer>()
export const largeCoverCache = new Map<string, Buffer>()
export const folderCoverCache = new Map<string, { buffer: Buffer; mime: string }>()

export function clearStreamCoverCache(): void {
  smallCoverCache.clear()
  largeCoverCache.clear()
  folderCoverCache.clear()
}

// Concurrency Limiter: Giới hạn tối đa 3 tác vụ đọc/trích xuất metadata file âm thanh đồng thời
// Triệt tiêu hoàn toàn đỉnh nhọn 100% Disk Usage và Disk Head Thrashing trên ổ cứng
class TaskQueue {
  private concurrency: number
  private running: number = 0
  private queue: Array<() => void> = []

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

export const audioCoverExtractionQueue = new TaskQueue(3)

export function getCoverFromCache(key: string): Buffer | undefined {
  return smallCoverCache.get(key) || largeCoverCache.get(key)
}

export function setCoverResizeCache(key: string, buf: Buffer, targetSize: number): void {
  if (targetSize > 0 && targetSize <= 128) {
    if (smallCoverCache.size >= 400) {
      const oldestKey = smallCoverCache.keys().next().value
      if (oldestKey) smallCoverCache.delete(oldestKey)
    }
    smallCoverCache.set(key, buf)
  } else {
    if (largeCoverCache.size >= 200) {
      const oldestKey = largeCoverCache.keys().next().value
      if (oldestKey) largeCoverCache.delete(oldestKey)
    }
    largeCoverCache.set(key, buf)
  }
}

export function getProxyImageUrl(url: string | null | undefined, id: string): string | null {
  if (!url || !currentStreamPort) return url || null
  return `http://127.0.0.1:${currentStreamPort}/image?url=${encodeURIComponent(url)}&id=${id}`
}

export function extractCovers(thumbnails: any[], fallbackId: string) {
  if (!thumbnails || thumbnails.length === 0) return { coverArt: null, coverArtHighRes: null }
  const medIndex = thumbnails.length > 1 ? 1 : 0
  const medUrl = thumbnails[medIndex].url
  let highUrl = thumbnails[thumbnails.length - 1].url
  if (highUrl.includes('=w') || highUrl.includes('=s')) {
    highUrl = highUrl.split('=w')[0].split('=s')[0] + '=w1200-h1200-l90-rj'
  } else if (highUrl.includes('hqdefault.jpg')) {
    highUrl = highUrl.replace('hqdefault.jpg', 'maxresdefault.jpg')
  }
  return {
    coverArt: getProxyImageUrl(medUrl, `med_${fallbackId}`),
    coverArtHighRes: getProxyImageUrl(highUrl, `high_${fallbackId}`)
  }
}

export function getStreamPort(): number {
  return currentStreamPort
}

export function getStreamServer(): http.Server | null {
  return streamServerInstance
}

export function stopStreamServer(): void {
  if (streamServerInstance) {
    try {
      streamServerInstance.close()
    } catch (_) {}
    streamServerInstance = null
    currentStreamPort = 0
  }
}

// ==========================================
// SSRF PROTECTION HELPER
// ==========================================
export function isBlockedSsrfHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return true
  const host = hostname.toLowerCase().trim()
  const cleanHost = host.replace(/^\[|\]$/g, '')

  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === '0.0.0.0' ||
    cleanHost === '::1' ||
    cleanHost === '::' ||
    host === '[::1]' ||
    cleanHost.startsWith('127.') ||
    cleanHost.startsWith('10.') ||
    cleanHost.startsWith('192.168.') ||
    cleanHost.startsWith('169.254.')
  ) {
    return true
  }

  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(cleanHost)) {
    return true
  }

  // IPv6 local/mapped addresses
  if (
    /^::ffff:/i.test(cleanHost) ||
    /^\[?::ffff:/i.test(host) ||
    /^\[?fe80:/i.test(host) ||
    /^\[?fe80:/i.test(cleanHost) ||
    /^\[?fc00:/i.test(host) ||
    /^\[?fc00:/i.test(cleanHost) ||
    /^\[?fd[0-9a-f]{2}:/i.test(host) ||
    /^\[?fd[0-9a-f]{2}:/i.test(cleanHost)
  ) {
    return true
  }

  return false
}

// ==========================================
// KHỞI TẠO HTTP STREAM SERVER NỘI BỘ
// ==========================================
export async function startStreamServer(preferredPort: number = 49876): Promise<number> {
  if (streamServerInstance && currentStreamPort > 0) {
    return currentStreamPort
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Origin')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    )
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`)

    // --- LUỒNG 1: TRUYỀN TẢI NHẠC ---
    if (parsedUrl.pathname === '/play') {
      const targetId = parsedUrl.searchParams.get('id')
      const platform =
        parsedUrl.searchParams.get('platform') ||
        (targetId?.startsWith('sc-') ? 'soundcloud' : 'youtube')
      if (!targetId) {
        res.writeHead(400).end('Thiếu ID bài hát')
        return
      }

      try {
        let directUrl = ''
        const cached = streamUrlCache.get(targetId)
        if (cached && cached.expires > Date.now()) directUrl = cached.url
        else {
          const config = getConfig()
          if (platform === 'soundcloud') {
            const permalink = parsedUrl.searchParams.get('url') || undefined
            const rawScId = targetId.replace(/^sc-/, '')
            directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken)
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
          } else {
            const ytOptions: any = {
              dumpSingleJson: true,
              format: 'bestaudio/best',
              noWarnings: true,
              extractorArgs: 'youtube:player-client=android'
            }
            if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

            const info = (await ytdlp(targetId, ytOptions as any)) as any
            directUrl = info.url
            streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
          }
        }

        // Xử lý stream HLS (.m3u8) bằng FFmpeg chuyển đổi tức thì sang MP3 stream cho thẻ Audio
        if (directUrl.includes('.m3u8') || directUrl.includes('/hls/')) {
          const ffmpegExe = getFfmpegPath()
          const seekParam = parsedUrl.searchParams.get('seek')
          const ffmpegArgs: string[] = [
            '-reconnect',
            '1',
            '-reconnect_streamed',
            '1',
            '-reconnect_delay_max',
            '5'
          ]
          if (seekParam && !isNaN(parseFloat(seekParam))) {
            ffmpegArgs.push('-ss', parseFloat(seekParam).toString())
          }
          ffmpegArgs.push(
            '-i',
            directUrl,
            '-f',
            'mp3',
            '-acodec',
            'libmp3lame',
            '-b:a',
            '192k',
            '-vn',
            'pipe:1'
          )

          const ffmpegProcess = spawn(ffmpegExe, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })

          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache'
          })

          ffmpegProcess.stdout.pipe(res)
          req.on('close', () => {
            try {
              ffmpegProcess.kill()
            } catch (e) {}
          })
          return
        }

        const requestHeaders: any = {}
        if (req.headers.range) requestHeaders['Range'] = req.headers.range

        let proxyRes
        try {
          proxyRes = await axios({
            method: 'GET',
            url: directUrl,
            headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' },
            responseType: 'stream',
            decompress: false
          })
        } catch (axiosErr: any) {
          if (axiosErr.response && axiosErr.response.status === 403) {
            streamUrlCache.delete(targetId)

            const config = getConfig()
            if (platform === 'soundcloud') {
              const permalink = parsedUrl.searchParams.get('url') || undefined
              const rawScId = targetId.replace(/^sc-/, '')
              directUrl = await resolveScStreamUrl(rawScId, permalink, config.scOAuthToken)
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
            } else {
              const ytOptions: any = {
                dumpSingleJson: true,
                format: 'bestaudio/best',
                noWarnings: true,
                extractorArgs: 'youtube:player-client=android'
              }
              if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

              const newInfo = (await ytdlp(targetId, ytOptions as any)) as any
              directUrl = newInfo.url
              streamUrlCache.set(targetId, { url: directUrl, expires: Date.now() + 3600000 })
            }

            proxyRes = await axios({
              method: 'GET',
              url: directUrl,
              headers: { ...requestHeaders, 'User-Agent': 'Mozilla/5.0' },
              responseType: 'stream',
              decompress: false
            })
          } else throw axiosErr
        }

        const responseHeaders: any = {
          'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
          'Accept-Ranges': proxyRes.headers['accept-ranges'] || 'bytes',
          'Cache-Control': 'no-cache'
        }
        if (proxyRes.headers['content-length'])
          responseHeaders['Content-Length'] = proxyRes.headers['content-length']
        if (proxyRes.headers['content-range'])
          responseHeaders['Content-Range'] = proxyRes.headers['content-range']

        res.writeHead(proxyRes.status, responseHeaders)
        proxyRes.data.pipe(res)
        proxyRes.data.on('error', () => {
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
        res.on('error', () => proxyRes.data.destroy())
        req.on('close', () => proxyRes.data.destroy())
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 2: PROXY TẢI ẢNH BÌA ---
    else if (parsedUrl.pathname === '/image') {
      const targetUrl = parsedUrl.searchParams.get('url')
      const targetId = parsedUrl.searchParams.get('id')
      if (!targetUrl) {
        res.writeHead(400).end('Thiếu URL')
        return
      }

      let parsedTarget: URL
      try {
        parsedTarget = new URL(targetUrl)
      } catch {
        res.writeHead(400).end('URL không hợp lệ')
        return
      }

      if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
        res.writeHead(400).end('Giao thức không hợp lệ')
        return
      }

      if (isBlockedSsrfHost(parsedTarget.hostname)) {
        res.writeHead(403).end('Truy cập bị từ chối')
        return
      }

      const safeId = targetId
        ? targetId.replace(/[^a-zA-Z0-9_-]/g, '')
        : crypto.createHash('md5').update(targetUrl).digest('hex')
      const cachedImgPath = join(IMAGE_CACHE_DIR, `${safeId}.jpg`)
      res.setHeader('Cache-Control', 'public, max-age=31536000')

      if (fs.existsSync(cachedImgPath)) {
        try {
          if (fs.statSync(cachedImgPath).size > 0) {
            res.setHeader('Content-Type', 'image/jpeg')
            fs.createReadStream(cachedImgPath).pipe(res)
            return
          } else {
            try {
              fs.unlinkSync(cachedImgPath)
            } catch {}
          }
        } catch {
          // If stat failed or file locked, continue to download
        }
      }

      try {
        const imgRes = await axios({
          method: 'GET',
          url: targetUrl,
          responseType: 'stream',
          decompress: false,
          beforeRedirect: (options: any) => {
            if (isBlockedSsrfHost(options.hostname || '')) {
              throw new Error('SSRF redirect blocked')
            }
          }
        })
        const contentType = (imgRes.headers['content-type'] as string) || 'image/jpeg'
        res.setHeader('Content-Type', contentType)

        const tmpPath = `${cachedImgPath}.tmp.${Date.now()}`
        const fileStream = fs.createWriteStream(tmpPath)

        let cleanedUp = false
        const cleanupTmp = () => {
          if (!cleanedUp) {
            cleanedUp = true
            try {
              if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
            } catch {}
          }
        }

        fileStream.on('finish', () => {
          try {
            if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
              fs.renameSync(tmpPath, cachedImgPath)
            } else {
              cleanupTmp()
            }
          } catch {
            cleanupTmp()
          }
        })

        fileStream.on('error', () => {
          cleanupTmp()
        })

        imgRes.data.on('error', () => {
          cleanupTmp()
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })

        res.on('error', () => {
          cleanupTmp()
        })

        imgRes.data.pipe(fileStream)
        imgRes.data.pipe(res)
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 3: TRUYỀN TẢI ẢNH BÌA DYNAMIC SCALING & GỐC IN-MEMORY (0 BYTES Ổ ĐĨA) ---
    else if (parsedUrl.pathname === '/cover') {
      const rawTrackPath = parsedUrl.searchParams.get('path')
      const targetSize = parseInt(parsedUrl.searchParams.get('size') || '0', 10)
      if (!rawTrackPath) {
        res.writeHead(400).end('Thiếu đường dẫn bài hát')
        return
      }

      let targetPath = rawTrackPath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!isAllowedLocalPath(targetPath, true)) {
        res.writeHead(403)
        res.end('Access Denied: Path outside allowed library')
        return
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('File không tồn tại')
        return
      }

      const cacheKey = `${targetPath}_size_${targetSize}`
      const cached = targetSize > 0 ? getCoverFromCache(cacheKey) : undefined
      if (cached) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=604800, immutable',
          'Content-Length': cached.length
        })
        res.end(cached)
        return
      }

      try {
        let rawBuffer: Buffer | null = null
        let mime = 'image/jpeg'
        const directImgMimes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml'
        }

        let isDir = false
        try {
          isDir = fs.statSync(targetPath).isDirectory()
        } catch (_) {}

        if (isDir) {
          const cachedFolder = folderCoverCache.get(targetPath)
          if (cachedFolder) {
            rawBuffer = cachedFolder.buffer
            mime = cachedFolder.mime
          } else {
            const playlistHash = crypto
              .createHash('md5')
              .update('playlist_' + targetPath)
              .digest('hex')
            const userPlHash = crypto
              .createHash('md5')
              .update('user_pl_' + targetPath)
              .digest('hex')
            const dirThumb = join(targetPath, '.thumbnails', `pl_${playlistHash}.jpg`)
            const parentThumb = join(dirname(targetPath), '.thumbnails', `pl_${playlistHash}.jpg`)
            const centralPlThumb = join(IMAGE_CACHE_DIR, `pl_${playlistHash}.jpg`)
            const centralUserPlThumb = join(IMAGE_CACHE_DIR, `upl_${userPlHash}.jpg`)

            const candidateThumbs = [dirThumb, parentThumb, centralPlThumb, centralUserPlThumb]
            for (const c of candidateThumbs) {
              if (fs.existsSync(c)) {
                try {
                  rawBuffer = fs.readFileSync(c)
                  mime = 'image/jpeg'
                  break
                } catch (_) {}
              }
            }

            // Fallback 1: Tìm các file ảnh bìa phổ biến trong thư mục
            if (!rawBuffer) {
              const commonCoverNames = [
                'cover',
                'folder',
                'front',
                'artwork',
                'album',
                'thumb',
                'thumbnail',
                path.basename(targetPath)
              ]
              const possibleExts = ['.jpg', '.jpeg', '.png', '.webp']
              for (const name of commonCoverNames) {
                for (const ext of possibleExts) {
                  const candidate = join(targetPath, `${name}${ext}`)
                  if (fs.existsSync(candidate)) {
                    try {
                      rawBuffer = fs.readFileSync(candidate)
                      mime = directImgMimes[ext] || 'image/jpeg'
                      break
                    } catch (_) {}
                  }
                }
                if (rawBuffer) break
              }
            }

            // Fallback 2: Quét bất kỳ file ảnh nào trong thư mục
            if (!rawBuffer) {
              try {
                const files = fs.readdirSync(targetPath)
                for (const file of files) {
                  const ext = path.extname(file).toLowerCase()
                  if (directImgMimes[ext]) {
                    const candidate = join(targetPath, file)
                    try {
                      rawBuffer = fs.readFileSync(candidate)
                      mime = directImgMimes[ext]
                      break
                    } catch (_) {}
                  }
                }
              } catch (_) {}
            }

            // Fallback 3: Lấy cover từ bài hát đầu tiên trong thư mục (KHÔNG gọi mm.parseFile trên thư mục!)
            if (!rawBuffer) {
              try {
                const files = fs.readdirSync(targetPath)
                const supportedAudioExts = SUPPORTED_AUDIO_EXTS
                for (const file of files) {
                  const ext = path.extname(file).toLowerCase()
                  if (supportedAudioExts.includes(ext)) {
                    const audioPath = join(targetPath, file)
                    const trackHash = crypto.createHash('md5').update(audioPath).digest('hex')
                    const audioThumb1 = join(targetPath, '.thumbnails', `${trackHash}.jpg`)
                    const audioThumb2 = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)
                    if (fs.existsSync(audioThumb1)) {
                      try {
                        rawBuffer = fs.readFileSync(audioThumb1)
                        mime = 'image/jpeg'
                        break
                      } catch (_) {}
                    } else if (fs.existsSync(audioThumb2)) {
                      try {
                        rawBuffer = fs.readFileSync(audioThumb2)
                        mime = 'image/jpeg'
                        break
                      } catch (_) {}
                    }
                    if (!rawBuffer) {
                      try {
                        const meta = await audioCoverExtractionQueue.run(async () => {
                          return await mm.parseFile(audioPath, {
                            skipCovers: false,
                            duration: false
                          })
                        })
                        if (meta.common.picture && meta.common.picture.length > 0) {
                          const pic = meta.common.picture[0]
                          mime = pic.format || 'image/jpeg'
                          if (!mime.includes('/')) mime = `image/${mime}`
                          rawBuffer = Buffer.from(pic.data)
                          break
                        }
                      } catch (_) {}
                    }
                  }
                }
              } catch (_) {}
            }

            if (rawBuffer) {
              if (folderCoverCache.size >= 150) {
                const oldestKey = folderCoverCache.keys().next().value
                if (oldestKey) folderCoverCache.delete(oldestKey)
              }
              folderCoverCache.set(targetPath, { buffer: rawBuffer, mime })
            }
          }
        } else {
          // XỬ LÝ KHI TARGETPATH LÀ TỆP
          const extLower = path.extname(targetPath).toLowerCase()
          if (directImgMimes[extLower]) {
            try {
              rawBuffer = fs.readFileSync(targetPath)
              mime = directImgMimes[extLower]
            } catch (_) {}
          }

          const trackHash = crypto.createHash('md5').update(targetPath).digest('hex')
          const centralThumbPath = join(IMAGE_CACHE_DIR, `${trackHash}.jpg`)
          let foundThumb: string | null = null

          // 1. Kiểm tra thumbnail có sẵn trên đĩa trước (Áp dụng đa tầng tra cứu)
          if (!rawBuffer) {
            if (fs.existsSync(centralThumbPath)) {
              foundThumb = centralThumbPath
            } else {
              const localThumbPath = join(dirname(targetPath), '.thumbnails', `${trackHash}.jpg`)
              if (fs.existsSync(localThumbPath)) {
                foundThumb = localThumbPath
              } else {
                const config = getConfig()
                const roots: string[] =
                  config.libraryPaths && config.libraryPaths.length > 0
                    ? config.libraryPaths
                    : config.libraryPath
                      ? [config.libraryPath]
                      : []
                for (const r of roots) {
                  const candidate = join(r, '.thumbnails', `${trackHash}.jpg`)
                  if (fs.existsSync(candidate)) {
                    foundThumb = candidate
                    break
                  }
                }
                if (!foundThumb) {
                  let currDir = dirname(targetPath)
                  let prevDir = ''
                  while (currDir && currDir !== prevDir && currDir !== path.parse(currDir).root) {
                    const candidate = join(currDir, '.thumbnails', `${trackHash}.jpg`)
                    if (fs.existsSync(candidate)) {
                      foundThumb = candidate
                      break
                    }
                    prevDir = currDir
                    currDir = dirname(currDir)
                  }
                }
              }
            }

            if (targetSize > 0 && targetSize <= 256 && foundThumb) {
              try {
                rawBuffer = fs.readFileSync(foundThumb)
                mime = 'image/jpeg'
                setCoverResizeCache(cacheKey, rawBuffer, targetSize)
                res.writeHead(200, {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=604800, immutable',
                  'Content-Length': rawBuffer.length
                })
                res.end(rawBuffer)
                return
              } catch (_) {}
            }
          }

          // 2. Nếu targetSize > 256 HOẶC chưa có thumbnail nào:
          if (!rawBuffer) {
            const trackDir = dirname(targetPath)
            const folderImgPath = findFolderCoverImage(trackDir)
            if (folderImgPath && fs.existsSync(folderImgPath)) {
              try {
                rawBuffer = fs.readFileSync(folderImgPath)
                const ext = path.extname(folderImgPath).toLowerCase()
                mime = directImgMimes[ext] || 'image/jpeg'
              } catch (_) {}
            }

            if (!rawBuffer) {
              let extractedPic: { data: Buffer | Uint8Array; format?: string } | null = null
              extractedPic = await audioCoverExtractionQueue.run(async () => {
                return await fastExtractCover(targetPath)
              })

              if (extractedPic) {
                mime = extractedPic.format || 'image/jpeg'
                if (!mime.includes('/')) mime = `image/${mime}`
                rawBuffer = Buffer.from(extractedPic.data)

                if (!fs.existsSync(centralThumbPath)) {
                  try {
                    const nativeThumb = nativeImage.createFromBuffer(rawBuffer)
                    const resizedThumb = nativeThumb.resize({
                      width: 128,
                      height: 128,
                      quality: 'good'
                    })
                    fs.promises.writeFile(centralThumbPath, resizedThumb.toJPEG(80)).catch(() => {})
                  } catch (_) {}
                }
              }
            }

            if (!rawBuffer && foundThumb) {
              try {
                rawBuffer = fs.readFileSync(foundThumb)
                mime = 'image/jpeg'
              } catch (_) {}
            }
          }
        }

        if (!rawBuffer) {
          res.writeHead(404).end('Không tìm thấy ảnh bìa')
          return
        }

        if (targetSize > 0) {
          try {
            const nativeImg = nativeImage.createFromBuffer(rawBuffer)
            const curSize = nativeImg.getSize()
            if (curSize.width > 0 && curSize.height > 0) {
              if (curSize.width > targetSize || curSize.height > targetSize) {
                let newW = targetSize
                let newH = targetSize
                if (curSize.width >= curSize.height) {
                  newH = Math.max(1, Math.round((curSize.height / curSize.width) * targetSize))
                } else {
                  newW = Math.max(1, Math.round((curSize.width / curSize.height) * targetSize))
                }
                const resized = nativeImg.resize({ width: newW, height: newH, quality: 'good' })
                const jpegBuf = resized.toJPEG(85)
                setCoverResizeCache(cacheKey, jpegBuf, targetSize)
                res.writeHead(200, {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=604800, immutable',
                  'Content-Length': jpegBuf.length
                })
                res.end(jpegBuf)
                return
              }
            }
          } catch (resizeErr) {
            console.warn('[Cover Stream] Resize thất bại, trả về ảnh gốc:', resizeErr)
          }
        }

        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400',
          'Content-Length': rawBuffer.length
        })
        res.end(rawBuffer)
        return
      } catch (e) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 4: STREAM AUDIO CỤC BỘ (HỖ TRỢ WEBSECURITY: TRUE & RANGE HEADERS HTTP 206) ---
    else if (parsedUrl.pathname === '/local-audio') {
      const rawTrackPath = parsedUrl.searchParams.get('path')
      if (!rawTrackPath) {
        res.writeHead(400).end('Thiếu đường dẫn bài hát')
        return
      }

      let targetPath = rawTrackPath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!isAllowedLocalPath(targetPath)) {
        res.writeHead(403).end('Truy cập bị từ chối: Đường dẫn không hợp lệ')
        return
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('File không tồn tại')
        return
      }

      try {
        const stat = fs.statSync(targetPath)
        const fileSize = stat.size
        const ext = path.extname(targetPath).toLowerCase()
        const isBin = ext === '.bin'
        const effectiveFileSize = isBin ? fileSize + 44 : fileSize

        let binWavHeader: Buffer | null = null
        if (isBin) {
          binWavHeader = Buffer.alloc(44)
          binWavHeader.write('RIFF', 0)
          binWavHeader.writeUInt32LE(fileSize + 36, 4)
          binWavHeader.write('WAVE', 8)
          binWavHeader.write('fmt ', 12)
          binWavHeader.writeUInt32LE(16, 16)
          binWavHeader.writeUInt16LE(1, 20)
          binWavHeader.writeUInt16LE(2, 22)
          binWavHeader.writeUInt32LE(44100, 24)
          binWavHeader.writeUInt32LE(176400, 28)
          binWavHeader.writeUInt16LE(4, 32)
          binWavHeader.writeUInt16LE(16, 34)
          binWavHeader.write('data', 36)
          binWavHeader.writeUInt32LE(fileSize, 40)
        }

        const mimeMap: Record<string, string> = {
          '.mp3': 'audio/mpeg',
          '.flac': 'audio/flac',
          '.wav': 'audio/wav',
          '.bin': 'audio/wav',
          '.ape': 'audio/ape',
          '.m4a': 'audio/mp4',
          '.aac': 'audio/aac',
          '.ogg': 'audio/ogg',
          '.opus': 'audio/opus',
          '.alac': 'audio/alac',
          '.aiff': 'audio/aiff',
          '.wma': 'audio/x-ms-wma',
          '.dsf': 'audio/dsf',
          '.dff': 'audio/x-dff',
          '.dsd': 'audio/dsd'
        }
        const contentType = isBin ? 'audio/wav' : mimeMap[ext] || 'application/octet-stream'

        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'Content-Length': effectiveFileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })
          res.end()
          return
        }

        const range = req.headers.range
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : effectiveFileSize - 1

          if (
            isNaN(start) ||
            start >= effectiveFileSize ||
            (parts[1] && (isNaN(end) || end >= effectiveFileSize || start > end))
          ) {
            res
              .writeHead(416, {
                'Content-Range': `bytes */${effectiveFileSize}`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
              })
              .end()
            return
          }

          const chunksize = end - start + 1
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${effectiveFileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })

          if (isBin && binWavHeader) {
            if (start < 44) {
              const headerSlice = binWavHeader.subarray(start, Math.min(44, end + 1))
              res.write(headerSlice)
              if (end >= 44) {
                const fileStream = fs.createReadStream(targetPath, { start: 0, end: end - 44 })
                fileStream.pipe(res)
                req.on('close', () => fileStream.destroy())
                fileStream.on('error', () => {
                  if (!res.headersSent) res.writeHead(500).end()
                })
              } else {
                res.end()
              }
            } else {
              const fileStream = fs.createReadStream(targetPath, {
                start: start - 44,
                end: end - 44
              })
              fileStream.pipe(res)
              req.on('close', () => fileStream.destroy())
              fileStream.on('error', () => {
                if (!res.headersSent) res.writeHead(500).end()
              })
            }
          } else {
            const fileStream = fs.createReadStream(targetPath, { start, end })
            fileStream.pipe(res)
            req.on('close', () => {
              fileStream.destroy()
            })
            fileStream.on('error', () => {
              if (!res.headersSent) res.writeHead(500).end()
            })
          }
        } else {
          res.writeHead(200, {
            'Content-Length': effectiveFileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers':
              'Content-Range, Accept-Ranges, Content-Length, Content-Type'
          })
          if (isBin && binWavHeader) {
            res.write(binWavHeader)
          }
          const fileStream = fs.createReadStream(targetPath)
          fileStream.pipe(res)
          req.on('close', () => {
            fileStream.destroy()
          })
          fileStream.on('error', () => {
            if (!res.headersSent) res.writeHead(500).end()
          })
        }
      } catch (err) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
    // --- LUỒNG 5: TRUYỀN TẢI FILE TĨNH CỤC BỘ (BACKGROUND IMAGE / CUSTOM COVERS) ---
    else if (parsedUrl.pathname === '/local-file') {
      const rawFilePath = parsedUrl.searchParams.get('path')
      if (!rawFilePath) {
        res.writeHead(400).end('Thiếu đường dẫn tệp')
        return
      }

      let targetPath = rawFilePath
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
      targetPath = targetPath.split('?')[0]
      try {
        targetPath = decodeURIComponent(targetPath)
      } catch (_) {}
      if (process.platform === 'win32') {
        if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
        targetPath = targetPath.replace(/\//g, '\\')
      }

      if (!isAllowedLocalPath(targetPath)) {
        res.writeHead(403).end('Truy cập bị từ chối: Đường dẫn không hợp lệ')
        return
      }

      if (!fs.existsSync(targetPath)) {
        res.writeHead(404).end('Tệp không tồn tại')
        return
      }

      try {
        const stat = fs.statSync(targetPath)
        const ext = path.extname(targetPath).toLowerCase()
        const imgMimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml'
        }
        const contentType = imgMimeMap[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Type'
        })
        const fileStream = fs.createReadStream(targetPath)
        fileStream.pipe(res)
        req.on('close', () => {
          fileStream.destroy()
        })
        fileStream.on('error', () => {
          if (!res.headersSent) res.writeHead(500).end()
        })
      } catch (err) {
        if (!res.headersSent) res.writeHead(500).end()
      }
    }
  })

  streamServerInstance = server

  return new Promise<number>((resolve) => {
    let hasResolved = false
    const safeResolve = () => {
      if (!hasResolved) {
        hasResolved = true
        resolve(currentStreamPort)
      }
    }

    const onError = (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(
          `[StreamServer] Cổng ${preferredPort} đã được sử dụng, fallback sang cổng động 0...`
        )
        server.removeListener('error', onError)
        server.listen(0, '127.0.0.1', () => {
          currentStreamPort = (server.address() as any).port
          console.log(`[StreamServer Fallback] Listening on http://127.0.0.1:${currentStreamPort}`)
          safeResolve()
        })
      } else {
        console.error('[StreamServer] Lỗi khởi động:', err)
        safeResolve()
      }
    }

    server.once('error', onError)
    server.listen(preferredPort, '127.0.0.1', () => {
      server.removeListener('error', onError)
      currentStreamPort = (server.address() as any).port
      console.log(`[StreamServer] Listening on http://127.0.0.1:${currentStreamPort}`)
      safeResolve()
    })
  })
}

// ==========================================
// IPC HANDLERS CHO STREAM SERVER
// ==========================================
export function registerStreamServerIpc(): void {
  ipcMain.handle('music:getStreamPort', () => currentStreamPort)
  ipcMain.on('music:getStreamPortSync', (event) => {
    event.returnValue = currentStreamPort
  })

  ipcMain.handle('music:getTrackCover', async (_, filePath: string) => {
    try {
      if (!filePath || filePath.startsWith('http')) return null

      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      rawPath = rawPath.split('?')[0]
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (_) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }

      if (currentStreamPort > 0) {
        return `http://127.0.0.1:${currentStreamPort}/cover?path=${encodeURIComponent(rawPath)}&size=128`
      }

      const rootPath = getConfig().libraryPath
      if (!rootPath) return null
      const thumbDir = join(rootPath, '.thumbnails')
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })

      const trackHash = crypto.createHash('md5').update(rawPath).digest('hex')
      const thumbPath = join(thumbDir, `${trackHash}.jpg`)

      if (fs.existsSync(thumbPath)) {
        return pathToFileURL(thumbPath).href
      }

      const extractedPic = await fastExtractCover(rawPath)
      if (extractedPic && extractedPic.data && extractedPic.data.length > 0) {
        const img = nativeImage.createFromBuffer(extractedPic.data)
        const resized = img.resize({ width: 128, height: 128, quality: 'good' })
        fs.writeFileSync(thumbPath, resized.toJPEG(80))
        return pathToFileURL(thumbPath).href
      }
    } catch (e) {}
    return null
  })

  ipcMain.handle('music:getOriginalTrackCover', async (_, filePath: string, size?: number) => {
    try {
      if (!filePath || filePath.startsWith('http') || !currentStreamPort) return null
      let rawPath = filePath.replace(/^file:\/\/\/?/, '')
      rawPath = rawPath.split('?')[0]
      if (process.platform === 'win32') {
        try {
          rawPath = decodeURIComponent(rawPath)
        } catch (_) {}
        if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
        rawPath = rawPath.replace(/\//g, '\\')
      }

      if (!fs.existsSync(rawPath)) return null

      const sizeQuery = typeof size === 'number' && size > 0 ? `&size=${Math.round(size)}` : ''
      return `http://127.0.0.1:${currentStreamPort}/cover?path=${encodeURIComponent(rawPath)}${sizeQuery}`
    } catch (e) {}
    return null
  })
}
