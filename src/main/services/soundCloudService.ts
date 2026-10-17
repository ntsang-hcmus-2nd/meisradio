import { BrowserWindow, ipcMain, session } from 'electron'
import { getConfig, saveConfig } from './sharedContext'
import {
  getScUserProfile,
  getScTrendingCharts,
  getScMixedSelections,
  getScUserStream,
  getScUserLikes,
  searchSoundCloud,
  getScPlaylistTracks
} from '../soundcloud'

// ==========================================
// SOUNDCLOUD IPC HANDLERS
// ==========================================
export function registerSoundCloudIpc(): void {
  // 1. API: Mở cửa sổ đăng nhập SoundCloud và trích xuất OAuth Token
  ipcMain.handle('music:scLogin', async () => {
    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 700,
        title: 'Đăng nhập SoundCloud',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      authWindow.loadURL('https://soundcloud.com/signin')

      let capturedToken: string | null = null

      authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.soundcloud.com/*'] },
        (details, callback) => {
          const auth =
            details.requestHeaders['Authorization'] || details.requestHeaders['authorization']
          if (auth && auth.startsWith('OAuth ')) {
            capturedToken = auth.replace('OAuth ', '').trim()
          }
          callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
      )

      authWindow.on('close', async () => {
        try {
          if (!capturedToken) {
            const cookies = await authWindow.webContents.session.cookies.get({
              domain: '.soundcloud.com'
            })
            const oauthCookie = cookies.find((c) => c.name === 'oauth_token')
            if (oauthCookie) capturedToken = oauthCookie.value
          }

          if (capturedToken) {
            saveConfig({ scOAuthToken: capturedToken })
            try {
              const userProfile = await getScUserProfile(capturedToken)
              saveConfig({ scUserInfo: userProfile })
              resolve({ success: true, user: userProfile })
              return
            } catch (err) {
              resolve({ success: true })
              return
            }
          }
          resolve({
            success: false,
            error: 'Chưa đăng nhập hoặc không tìm thấy mã xác thực SoundCloud'
          })
        } catch (e: any) {
          resolve({ success: false, error: e.message })
        }
      })
    })
  })

  // 2. API: Đăng xuất SoundCloud
  ipcMain.handle('music:scLogout', async () => {
    try {
      saveConfig({ scOAuthToken: null, scUserInfo: null })
      const cookies = await session.defaultSession.cookies.get({ domain: '.soundcloud.com' })
      for (const c of cookies) {
        await session.defaultSession.cookies
          .remove('https://soundcloud.com', c.name)
          .catch(() => {})
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 3. API: Lấy thông tin tài khoản SoundCloud
  ipcMain.handle('music:getScUser', async () => {
    const config = getConfig()
    if (!config.scOAuthToken) return { success: false, error: 'Chưa đăng nhập SoundCloud' }
    if (config.scUserInfo) return { success: true, user: config.scUserInfo }
    try {
      const user = await getScUserProfile(config.scOAuthToken)
      saveConfig({ scUserInfo: user })
      return { success: true, user }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 4. API: Lấy Dashboard SoundCloud (Trending, Liked Tracks, Stream, Curated Playlists)
  ipcMain.handle('music:getScDashboard', async (_, genre: string = 'all-music') => {
    const config = getConfig()
    const oauthToken = config.scOAuthToken
    const userInfo = config.scUserInfo

    try {
      const sections: any[] = []

      // 1. Nếu đã đăng nhập: Lấy Likes & Stream cá nhân
      if (oauthToken && userInfo?.id) {
        try {
          const likedTracks = await getScUserLikes(userInfo.id, oauthToken, 30)
          if (likedTracks.length > 0) {
            sections.push({
              title: 'Bài hát bạn đã thích (Liked Tracks)',
              contents: likedTracks
            })
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy Liked Tracks:', e.message)
        }

        try {
          const streamTracks = await getScUserStream(oauthToken, 30)
          if (streamTracks.length > 0) {
            sections.push({
              title: 'Bản tin theo dõi (Your Stream)',
              contents: streamTracks
            })
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy User Stream:', e.message)
        }
      }

      // 2. Lấy Bảng xếp hạng / Đề xuất theo thể loại đang chọn
      try {
        const trendingTracks = await getScTrendingCharts(genre, 30)
        if (trendingTracks.length > 0) {
          const GENRE_LABELS: Record<string, string> = {
            'all-music': 'Tất cả thịnh hành',
            electronic: 'Electronic & EDM',
            hiphoprap: 'Hip-hop & Rap',
            pop: 'Pop Hits',
            chill: 'Lo-fi & Chill',
            rock: 'Rock Classics & Hits',
            ambient: 'Ambient Relax',
            danceedm: 'Dance & EDM'
          }
          const genreLabel =
            GENRE_LABELS[genre] || (genre === 'all-music' ? 'Tất cả' : genre.toUpperCase())
          sections.push({
            title: `Bảng xếp hạng SoundCloud (${genreLabel})`,
            contents: trendingTracks
          })
        }
      } catch (e: any) {
        console.warn('[SoundCloud] Lỗi lấy Trending Tracks:', e.message)
      }

      // 3. Nếu đang ở 'all-music', bổ sung Playlist tuyển chọn từ SoundCloud (Mixed Selections)
      if (genre === 'all-music') {
        try {
          const mixedSections = await getScMixedSelections()
          for (const s of mixedSections) {
            sections.push(s)
          }
        } catch (e: any) {
          console.warn('[SoundCloud] Lỗi lấy Mixed Selections:', e.message)
        }
      }

      // 4. Lấy thêm các thể loại phổ biến nếu danh sách còn ít
      if (sections.length < 3) {
        const extraGenres = ['chill', 'electronic', 'pop', 'hiphoprap']
        for (const g of extraGenres) {
          if (g === genre) continue
          try {
            const extra = await getScTrendingCharts(g, 15)
            if (extra.length > 0) {
              const GENRE_LABELS: Record<string, string> = {
                electronic: 'Electronic & EDM',
                hiphoprap: 'Hip-Hop & Rap',
                pop: 'Pop Hits',
                chill: 'Lo-Fi Chill Beats'
              }
              sections.push({
                title: `SoundCloud ${GENRE_LABELS[g] || g}`,
                contents: extra
              })
            }
          } catch (e) {}
        }
      }

      return { success: true, data: sections }
    } catch (e: any) {
      console.error('[SoundCloud] Lỗi getScDashboard:', e.message)
      return { success: false, error: 'Lỗi tải SoundCloud: ' + e.message }
    }
  })

  // 5. API: Tìm kiếm SoundCloud
  ipcMain.handle('music:searchScOnline', async (_, query: string) => {
    const config = getConfig()
    try {
      const results = await searchSoundCloud(query, 30, config.scOAuthToken)
      return { success: true, ...results }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 6. API: Lấy chi tiết Playlist SoundCloud
  ipcMain.handle('music:getScPlaylist', async (_, playlistId: string) => {
    const config = getConfig()
    try {
      const playlist = await getScPlaylistTracks(playlistId, config.scOAuthToken)
      return { success: true, ...playlist }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
