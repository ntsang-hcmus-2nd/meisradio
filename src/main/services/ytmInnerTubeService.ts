import crypto from 'crypto'
import fs from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { BrowserWindow, session, dialog, ipcMain } from 'electron'
import axios from 'axios'
import {
  getConfig,
  saveConfig,
  ytdlp,
  getBinaryDir,
  getMainWindow
} from './sharedContext'
import { sanitizeDirectoryName, sanitizeFileName } from './libraryScanner'
import { streamUrlCache, getStreamPort, extractCovers } from './streamServer'

// ==========================================
// BÓC TÁCH NỘI DUNG YOUTUBE MUSIC & SAPISID
// ==========================================
export function generateSapisidHash(cookieStr: string): string | null {
  const match = cookieStr.match(/SAPISID=([^;]+)/)
  if (!match) return null
  const sapisid = match[1]
  const time = Math.floor(Date.now() / 1000)
  const origin = 'https://music.youtube.com'
  const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex')
  return `SAPISIDHASH ${time}_${hash}`
}

export function parseYtmItem(item: any) {
  const renderer =
    item.musicTwoRowItemRenderer ||
    item.musicResponsiveListItemRenderer ||
    item.musicCardShelfRenderer
  const style = item.musicTwoRowItemRenderer ? 'CARD' : 'LIST'
  if (!renderer) return null

  const titleRuns =
    renderer.title?.runs ||
    renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ||
    renderer.header?.musicCardShelfHeaderBasicRenderer?.title?.runs ||
    []
  const itemTitle = titleRuns.map((r: any) => r.text).join('')

  const thumbnails =
    renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    renderer.thumbnail?.thumbnails ||
    []

  const navEndpoint =
    renderer.navigationEndpoint ||
    titleRuns[0]?.navigationEndpoint ||
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint ||
    renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
      ?.navigationEndpoint ||
    renderer.buttons?.[0]?.buttonRenderer?.command

  const videoId = navEndpoint?.watchEndpoint?.videoId || renderer.playlistItemData?.videoId
  const browseId = navEndpoint?.browseEndpoint?.browseId
  const pageType =
    navEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType

  const playlistId = browseId || navEndpoint?.watchEndpoint?.playlistId
  const isArtist =
    pageType === 'MUSIC_PAGE_TYPE_ARTIST' || (browseId && browseId.startsWith('UC'))

  const subtitleRuns =
    renderer.subtitle?.runs ||
    renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ||
    []
  const subtitle = subtitleRuns.map((r: any) => r.text).join('')

  if (itemTitle && (videoId || playlistId || isArtist)) {
    const itemFallbackId =
      videoId || playlistId || crypto.createHash('md5').update(itemTitle).digest('hex')
    const covers = extractCovers(thumbnails, itemFallbackId)
    return {
      title: itemTitle,
      subtitle: subtitle,
      videoId: videoId,
      playlistId: playlistId,
      isArtist: !!isArtist,
      thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
      coverArtHighRes: covers.coverArtHighRes,
      style: style
    }
  }
  return null
}

// ==========================================
// CÁC HÀM XỬ LÝ YOUTUBE & INNERTUBE
// ==========================================
export async function searchOnline(query: string) {
  try {
    const isUrl = query.startsWith('http://') || query.startsWith('https://')

    if (isUrl) {
      const info = (await ytdlp(query, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true
      } as any)) as any
      if (info._type === 'playlist' || info.entries) {
        const tracks = (info.entries || []).map((t: any) => ({
          id: `yt-${t.id}`,
          originalId: t.id,
          title: t.title,
          artist: t.channel || t.uploader || 'YouTube',
          album: info.title || 'Playlist',
          duration: t.duration || 0,
          format: 'STREAM',
          isCloud: true,
          isOnline: true,
          platform: 'youtube',
          coverArt: t.thumbnails
            ? t.thumbnails[t.thumbnails.length - 1]?.url
            : t.thumbnail || null,
          coverArtHighRes: null
        }))
        return {
          success: true,
          isUrl: true,
          type: 'playlist',
          title: info.title || 'Playlist',
          tracks
        }
      } else {
        const track = {
          id: `yt-${info.id}`,
          originalId: info.id,
          title: info.title,
          artist: info.channel || info.uploader || 'YouTube',
          album: 'YouTube',
          duration: info.duration || 0,
          format: 'STREAM',
          isCloud: true,
          isOnline: true,
          platform: 'youtube',
          coverArt: info.thumbnails
            ? info.thumbnails[info.thumbnails.length - 1]?.url
            : info.thumbnail || null,
          coverArtHighRes: null
        }
        return { success: true, isUrl: true, type: 'song', track }
      }
    } else {
      const config = getConfig()

      const ytdlpPromise = ytdlp(`ytsearch50:${query}`, {
        dumpSingleJson: true,
        noWarnings: true,
        flatPlaylist: true
      } as any)

      const url = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
      const payload = {
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240108.01.00',
            hl: 'vi',
            gl: 'VN'
          }
        },
        query: query
      }
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com'
      }

      if (config.ytCookie) {
        headers['Cookie'] = config.ytCookie
        const authHash = generateSapisidHash(config.ytCookie)
        if (authHash) headers['Authorization'] = authHash
      }
      const ytmPromise = axios.post(url, payload, { headers })

      const [ytdlpResponse, ytmResponse] = await Promise.allSettled([ytdlpPromise, ytmPromise])

      const sections: any[] = []
      const seenTitles = new Set()

      if (ytdlpResponse.status === 'fulfilled') {
        const output = ytdlpResponse.value as any
        const results = output.entries ? output.entries : [output]
        const tracks = results.map((track: any) => {
          const covers = extractCovers(
            track.thumbnails || (track.thumbnail ? [{ url: track.thumbnail }] : []),
            track.id
          )
          return {
            title: track.title,
            subtitle: track.channel || track.uploader || 'YouTube',
            videoId: track.id,
            playlistId: null,
            isArtist: false,
            thumbnails: covers.coverArt ? [{ url: covers.coverArt }] : [],
            coverArtHighRes: covers.coverArtHighRes,
            style: 'LIST'
          }
        })

        if (tracks.length > 0) {
          seenTitles.add('bài hát')
          sections.push({ title: 'Bài hát (Mở rộng)', contents: tracks })
        }
      }

      if (ytmResponse.status === 'fulfilled') {
        const data = ytmResponse.value.data
        const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || []
        const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

        for (let section of sectionList) {
          if (section.itemSectionRenderer?.contents)
            section = section.itemSectionRenderer.contents[0]

          const shelf =
            section.musicShelfRenderer ||
            section.musicCardShelfRenderer ||
            section.musicCarouselShelfRenderer
          if (!shelf) continue

          const titleRuns =
            shelf.title?.runs ||
            shelf.header?.musicCardShelfHeaderBasicRenderer?.title?.runs ||
            []
          const title =
            titleRuns.map((r: any) => r.text).join('') || `Kết quả ${sections.length + 1}`

          if (title.toLowerCase().includes('bài hát') || title.toLowerCase() === 'songs') continue
          if (seenTitles.has(title)) continue

          const items: any[] = []
          for (const item of shelf.contents || []) {
            const parsed = parseYtmItem(item)
            if (parsed) items.push(parsed)
          }

          if (items.length === 0 && section.musicCardShelfRenderer) {
            const parsedCard = parseYtmItem({
              musicResponsiveListItemRenderer: section.musicCardShelfRenderer
            })
            if (parsedCard) items.push(parsedCard)
          }

          if (items.length > 0) {
            seenTitles.add(title)
            sections.push({ title, contents: items })
          }
        }
      }

      return { success: true, isUrl: false, data: sections }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function getStreamUrl(track: any) {
  try {
    const streamPort = getStreamPort()
    if (track.platform === 'soundcloud' || track.id?.startsWith('sc-')) {
      const rawId = track.originalId || track.id.replace(/^sc-/, '')
      return {
        success: true,
        url: `http://127.0.0.1:${streamPort}/play?id=sc-${rawId}&platform=soundcloud&url=${encodeURIComponent(track.permalinkUrl || '')}`
      }
    }
    if (track.platform === 'youtube' || !track.platform) {
      return {
        success: true,
        url: `http://127.0.0.1:${streamPort}/play?id=${track.originalId}`
      }
    }
    return { success: false, error: 'Chưa hỗ trợ nền tảng này' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function downloadOnline(track: any) {
  const rootPath = getConfig().libraryPath
  if (!rootPath) return { success: false, error: 'Chưa cấu hình Thư mục thư viện' }

  const safeAlbum = sanitizeDirectoryName(track.album || 'Singles') || 'Singles'
  const albumPath = join(rootPath, safeAlbum)
  if (!fs.existsSync(albumPath)) {
    fs.mkdirSync(albumPath, { recursive: true })
  }

  const safeTitle = sanitizeFileName(track.title || 'Unknown') || 'Unknown'
  let destPath = join(albumPath, `${safeTitle}.mp3`)

  if (fs.existsSync(destPath)) {
    const mainWindow = getMainWindow()
    const isEn = getConfig().language === 'en'
    const response = mainWindow
      ? dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: isEn
            ? ['Replace', 'Save as New File', 'Cancel']
            : ['Thay thế', 'Lưu thành tệp mới', 'Hủy'],
          defaultId: 0,
          cancelId: 2,
          title: isEn ? 'File Already Exists' : 'Tệp đã tồn tại',
          message: isEn
            ? `Track "${safeTitle}" already exists in folder "${safeAlbum}". What would you like to do?`
            : `Bài hát "${safeTitle}" đã có sẵn trong thư mục "${safeAlbum}". Bạn muốn làm gì?`
        })
      : 0

    if (response === 2) return { success: false, canceled: true }
    if (response === 1) {
      destPath = join(albumPath, `${safeTitle}_${Date.now()}.mp3`)
    } else {
      try {
        fs.unlinkSync(destPath)
      } catch (_) {}
    }
  }

  try {
    const downloadTarget =
      track.platform === 'soundcloud'
        ? track.permalinkUrl || `https://api.soundcloud.com/tracks/${track.originalId}`
        : track.originalId

    const config = getConfig()
    const downloadOptions: any = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      output: destPath,
      embedMetadata: true,
      embedThumbnail: true,
      ffmpegLocation: getBinaryDir()
    }

    if (track.platform !== 'soundcloud') {
      downloadOptions.extractorArgs = 'youtube:player-client=android,web,ios'
      if (config.ytCookie) {
        downloadOptions.addHeader = [`Cookie: ${config.ytCookie}`]
      }
    }

    await ytdlp(downloadTarget, downloadOptions as any)
    return { success: true, localPath: pathToFileURL(destPath).href }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function ytmLogin(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 800,
      height: 700,
      title: 'Đăng nhập YouTube Music',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    authWindow.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.google.com/*', '*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
      (details, callback) => {
        details.requestHeaders['User-Agent'] =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
        delete details.requestHeaders['sec-ch-ua']
        delete details.requestHeaders['sec-ch-ua-mobile']
        delete details.requestHeaders['sec-ch-ua-platform']

        callback({ cancel: false, requestHeaders: details.requestHeaders })
      }
    )

    authWindow.loadURL(
      'https://accounts.google.com/ServiceLogin?continue=https://music.youtube.com/'
    )

    authWindow.webContents.on('did-navigate', (_event, url) => {
      if (url === 'https://music.youtube.com/' || url.startsWith('https://music.youtube.com/?')) {
        setTimeout(() => {
          if (!authWindow.isDestroyed()) {
            authWindow.close()
          }
        }, 1500)
      }
    })

    authWindow.on('close', async () => {
      try {
        const cookies = await authWindow.webContents.session.cookies.get({
          domain: '.youtube.com'
        })
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

        if (cookieStr.includes('SAPISID')) {
          saveConfig({ ytCookie: cookieStr })
          resolve({ success: true })
        } else {
          resolve({
            success: false,
            error: 'Chưa đăng nhập thành công hoặc thiếu Cookie định danh.'
          })
        }
      } catch (e: any) {
        resolve({ success: false, error: e.message })
      }
    })
  })
}

export async function ytmLogout(): Promise<{ success: boolean; error?: string }> {
  try {
    saveConfig({ ytCookie: null })
    const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
    for (const c of cookies) {
      await session.defaultSession.cookies
        .remove('https://music.youtube.com', c.name)
        .catch(() => {})
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getHomeDashboard(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const config = getConfig()
  if (!config.ytCookie) return { success: false, error: 'Chưa đăng nhập' }

  try {
    const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
    const payload = {
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
      },
      browseId: 'FEmusic_home'
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://music.youtube.com'
    }

    if (config.ytCookie) {
      headers['Cookie'] = config.ytCookie
      const authHash = generateSapisidHash(config.ytCookie)
      if (authHash) headers['Authorization'] = authHash
    }

    const response = await axios.post(url, payload, { headers })
    const data = response.data

    const sections: any[] = []
    const seenTitles = new Set()
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs

    if (!tabs || tabs.length === 0) throw new Error('Cookie hết hạn hoặc bị Google từ chối')

    const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

    for (let section of sectionList) {
      if (section.itemSectionRenderer?.contents) {
        section = section.itemSectionRenderer.contents[0]
      }

      const carousel =
        section.musicCarouselShelfRenderer ||
        section.musicImmersiveCarouselShelfRenderer ||
        section.musicShelfRenderer
      if (!carousel) continue

      const header =
        carousel.header?.musicCarouselShelfBasicHeaderRenderer ||
        carousel.header?.musicImmersiveCarouselShelfBasicHeaderRenderer
      const titleRuns = header?.title?.runs
      const title = titleRuns ? titleRuns.map((r: any) => r.text).join('') : 'Gợi ý cho bạn'

      if (seenTitles.has(title)) continue

      const items: any[] = []
      for (const item of carousel.contents || []) {
        const parsed = parseYtmItem(item)
        if (parsed) items.push(parsed)
      }

      if (items.length > 0) {
        seenTitles.add(title)
        sections.push({ title, contents: items })
      }
    }

    return { success: true, data: sections }
  } catch (e: any) {
    return { success: false, error: 'Lỗi kết nối: ' + e.message }
  }
}

export async function getYtmPlaylist(playlistId: string): Promise<{ success: boolean; tracks?: any[]; error?: string }> {
  const config = getConfig()
  try {
    let targetId = playlistId
    if (targetId.startsWith('PL') || targetId.startsWith('RD') || targetId.startsWith('OL')) {
      targetId = 'VL' + targetId
    }

    const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
    const payload = {
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
      },
      browseId: targetId
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://music.youtube.com'
    }

    if (config.ytCookie) {
      headers['Cookie'] = config.ytCookie
      const authHash = generateSapisidHash(config.ytCookie)
      if (authHash) headers['Authorization'] = authHash
    }

    const response = await axios.post(url, payload, { headers })
    const data = response.data

    const tracks: any[] = []
    let contents: any[] = []

    const twoColumn =
      data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer
        ?.contents || []
    const singleColumn =
      data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
        ?.sectionListRenderer?.contents || []
    const sections = [...twoColumn, ...singleColumn]

    for (const section of sections) {
      if (section.musicPlaylistShelfRenderer) {
        contents = section.musicPlaylistShelfRenderer.contents
        break
      }
      if (section.musicShelfRenderer) {
        contents = section.musicShelfRenderer.contents
        break
      }
    }

    for (const item of contents) {
      const renderer = item.musicResponsiveListItemRenderer
      if (!renderer) continue

      const videoId =
        renderer.playlistItemData?.videoId ||
        renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId ||
        renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
          ?.navigationEndpoint?.watchEndpoint?.videoId

      if (!videoId) continue

      const titleRuns =
        renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
      const title = titleRuns ? titleRuns.map((r: any) => r.text).join('') : 'Unknown'

      const artistRuns =
        renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
      const artist = artistRuns ? artistRuns.map((r: any) => r.text).join('') : 'YouTube'

      const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []
      const covers = extractCovers(thumbnails, videoId)

      tracks.push({
        id: `yt-${videoId}`,
        originalId: videoId,
        title: title,
        artist: artist,
        album: 'YouTube Music',
        duration: 0,
        format: 'STREAM',
        isCloud: true,
        isOnline: true,
        platform: 'youtube',
        coverArt: covers.coverArt,
        coverArtHighRes: covers.coverArtHighRes
      })
    }

    return { success: true, tracks }
  } catch (e: any) {
    return { success: false, error: 'Lỗi tải danh sách: ' + e.message }
  }
}

export async function preloadStream(targetId: string): Promise<{ success: boolean }> {
  if (streamUrlCache.has(targetId) && streamUrlCache.get(targetId)!.expires > Date.now()) {
    return { success: true }
  }
  try {
    const config = getConfig()
    const ytOptions: any = {
      dumpSingleJson: true,
      format: 'bestaudio/best',
      noWarnings: true,
      extractorArgs: 'youtube:player-client=android'
    }
    if (config.ytCookie) ytOptions.addHeader = [`Cookie: ${config.ytCookie}`]

    const info = (await ytdlp(targetId, ytOptions as any)) as any
    streamUrlCache.set(targetId, { url: info.url, expires: Date.now() + 3600000 })
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function logWatchHistory(videoId: string): Promise<{ success: boolean; error?: string }> {
  const config = getConfig()
  if (!config.ytCookie) return { success: false }

  try {
    const url = 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false'
    const payload = {
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
      },
      videoId: videoId
    }
    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://music.youtube.com'
    }

    if (config.ytCookie) {
      headers['Cookie'] = config.ytCookie
      const authHash = generateSapisidHash(config.ytCookie)
      if (authHash) headers['Authorization'] = authHash
    }

    await axios.post(url, payload, { headers })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getUpNext(videoId: string): Promise<{ success: boolean; tracks?: any[]; error?: string }> {
  const config = getConfig()
  try {
    const url = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false'
    const payload = {
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
      },
      videoId: videoId,
      playlistId: `RDAMVM${videoId}`
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://music.youtube.com'
    }

    if (config.ytCookie) {
      headers['Cookie'] = config.ytCookie
      const authHash = generateSapisidHash(config.ytCookie)
      if (authHash) headers['Authorization'] = authHash
    }

    const response = await axios.post(url, payload, { headers })
    const data = response.data

    const tracks: any[] = []
    const tabs =
      data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
        ?.watchNextTabbedResultsRenderer?.tabs

    const tabContent = tabs?.[0]?.tabRenderer?.content
    const contents =
      tabContent?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ||
      tabContent?.playlistPanelRenderer?.contents ||
      []

    for (const item of contents) {
      const renderer = item.playlistPanelVideoRenderer
      if (!renderer || !renderer.videoId) continue

      const trackVideoId = renderer.videoId
      const title = renderer.title?.runs?.[0]?.text || 'Unknown'
      const artist = renderer.longBylineText?.runs?.map((r: any) => r.text).join('') || 'YouTube'
      const thumbnails = renderer.thumbnail?.thumbnails || []

      const covers = extractCovers(thumbnails, trackVideoId)

      tracks.push({
        id: `yt-${trackVideoId}`,
        originalId: trackVideoId,
        title: title,
        artist: artist,
        album: 'YouTube Music',
        duration: 0,
        format: 'STREAM',
        isCloud: true,
        isOnline: true,
        platform: 'youtube',
        coverArt: covers.coverArt,
        coverArtHighRes: covers.coverArtHighRes
      })
    }
    return { success: true, tracks }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getYtmArtist(artistId: string): Promise<{ success: boolean; tracks?: any[]; error?: string }> {
  const config = getConfig()
  try {
    const url = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false'
    const payload = {
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20240108.01.00', hl: 'vi', gl: 'VN' }
      },
      browseId: artistId
    }

    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Origin: 'https://music.youtube.com'
    }

    if (config.ytCookie) {
      headers['Cookie'] = config.ytCookie
      const authHash = generateSapisidHash(config.ytCookie)
      if (authHash) headers['Authorization'] = authHash
    }

    const response = await axios.post(url, payload, { headers })
    const data = response.data

    const tracks: any[] = []
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
    const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []

    for (const section of sections) {
      const shelf = section.musicShelfRenderer || section.musicCarouselShelfRenderer
      if (!shelf) continue

      for (const item of shelf.contents || []) {
        const parsed = parseYtmItem(item)
        if (parsed && parsed.videoId && !parsed.isArtist) {
          tracks.push({
            id: `yt-${parsed.videoId}`,
            originalId: parsed.videoId,
            title: parsed.title,
            artist: parsed.subtitle || 'Unknown',
            album: 'YouTube Music',
            duration: 0,
            format: 'STREAM',
            isCloud: true,
            isOnline: true,
            platform: 'youtube',
            coverArt: parsed.thumbnails?.[0]?.url || null,
            coverArtHighRes: parsed.coverArtHighRes
          })
        }
      }
    }
    return { success: true, tracks }
  } catch (e: any) {
    return { success: false, error: 'Lỗi tải nghệ sĩ: ' + e.message }
  }
}

// ==========================================
// IPC HANDLERS CHO YTM INNERTUBE
// ==========================================
export function registerYtmInnerTubeIpc(): void {
  ipcMain.handle('music:searchOnline', async (_, query: string) => {
    return await searchOnline(query)
  })

  ipcMain.handle('music:getStreamUrl', (_, track: any) => {
    return getStreamUrl(track)
  })

  ipcMain.handle('music:downloadOnline', async (_, track: any) => {
    return await downloadOnline(track)
  })

  ipcMain.handle('music:ytmLogin', async () => {
    return await ytmLogin()
  })

  ipcMain.handle('music:ytmLogout', async () => {
    return await ytmLogout()
  })

  ipcMain.handle('music:getHomeDashboard', async () => {
    return await getHomeDashboard()
  })

  ipcMain.handle('music:getYtmPlaylist', async (_, playlistId: string) => {
    return await getYtmPlaylist(playlistId)
  })

  ipcMain.handle('music:preloadStream', async (_, targetId: string) => {
    return await preloadStream(targetId)
  })

  ipcMain.handle('music:logWatchHistory', async (_, videoId: string) => {
    return await logWatchHistory(videoId)
  })

  ipcMain.handle('music:getUpNext', async (_, videoId: string) => {
    return await getUpNext(videoId)
  })

  ipcMain.handle('music:getYtmArtist', async (_, artistId: string) => {
    return await getYtmArtist(artistId)
  })
}
