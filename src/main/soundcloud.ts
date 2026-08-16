import axios from 'axios'

// SoundCloud API v2 Base URL
const SC_API_V2 = 'https://api-v2.soundcloud.com'

// Fallback client ID (SoundCloud public client ID)
let cachedClientId: string | null = null
let clientIdExpires = 0

/**
 * Trích xuất hoặc lấy Client ID động của SoundCloud từ các gói JavaScript công khai của soundcloud.com
 */
export async function getSoundCloudClientId(): Promise<string> {
  if (cachedClientId && Date.now() < clientIdExpires) {
    return cachedClientId
  }

  try {
    // 1. Tải trang chủ SoundCloud để lấy danh sách script URLs
    const htmlRes = await axios.get('https://soundcloud.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 8000
    })

    // 2. Tìm tất cả các script app-*.js
    const scriptUrls = (htmlRes.data.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[a-zA-Z0-9-]+\.js/g) || []) as string[]
    
    // Quét các file script từ cuối lên (thường client_id nằm trong file app hoặc vendor)
    for (const url of scriptUrls.slice(-6)) {
      try {
        const scriptRes = await axios.get(url, { timeout: 6000 })
        const match = scriptRes.data.match(/client_id[:=]\s*["']([a-zA-Z0-9]{32})["']/)
        if (match && match[1]) {
          const foundId: string = match[1]
          cachedClientId = foundId
          clientIdExpires = Date.now() + 3600 * 1000 * 12 // Cache 12 tiếng
          return foundId
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[SoundCloud] Không lấy được Client ID động, thử phương án dự phòng...', e)
  }

  // Phương án dự phòng: Client ID phổ biến
  const fallbackId = 'a3e059563d7fd3372b49b37f00a00bcf'
  cachedClientId = fallbackId
  clientIdExpires = Date.now() + 3600 * 1000 * 4
  return fallbackId
}

/**
 * Tạo Header gửi kèm cho SoundCloud API
 */
function getScHeaders(oauthToken?: string) {
  const headers: any = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://soundcloud.com',
    'Referer': 'https://soundcloud.com/'
  }
  if (oauthToken) {
    headers['Authorization'] = `OAuth ${oauthToken}`
  }
  return headers
}

/**
 * Chuẩn hóa Track từ định dạng SoundCloud sang định dạng bài hát nội bộ của Mei's Radio
 */
export function formatScTrack(item: any): any {
  if (!item) return null
  const track = item.track || item

  if (!track.id || !track.title) return null

  // Tìm ảnh bìa chất lượng cao (thay t500x500 hoặc large)
  let coverUrl = track.artwork_url || track.user?.avatar_url || null
  let highResCover = coverUrl
  if (coverUrl) {
    highResCover = coverUrl.replace('-large.', '-t500x500.').replace('-badge.', '-t500x500.')
  }

  const durationSec = Math.round((track.duration || 0) / 1000)

  return {
    id: `sc-${track.id}`,
    originalId: String(track.id),
    title: track.title,
    artist: track.user?.username || 'SoundCloud Artist',
    album: track.genre || 'SoundCloud Single',
    duration: durationSec,
    format: 'STREAM',
    isCloud: true,
    isOnline: true,
    platform: 'soundcloud',
    permalinkUrl: track.permalink_url,
    coverArt: highResCover || coverUrl,
    coverArtHighRes: highResCover,
    streamUrl: null,
    playCount: track.playback_count,
    likesCount: track.likes_count,
    genre: track.genre || 'SoundCloud',
    isArtist: false,
    style: 'LIST'
  }
}

/**
 * 1. Lấy thông tin tài khoản người dùng đang đăng nhập
 */
export async function getScUserProfile(oauthToken: string) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/me`, {
    params: { client_id: clientId },
    headers: getScHeaders(oauthToken)
  })
  const user = res.data
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name || user.username,
    avatarUrl: user.avatar_url?.replace('-large.', '-t500x500.') || user.avatar_url,
    permalinkUrl: user.permalink_url,
    followersCount: user.followers_count,
    likesCount: user.public_favorites_count || user.likes_count,
    trackCount: user.track_count
  }
}

/**
 * 2. Lấy danh sách bài hát Trending theo Thể loại (Charts)
 */
export async function getScTrendingCharts(genre: string = 'all-music', limit: number = 30) {
  const clientId = await getSoundCloudClientId()
  const genreQuery = genre === 'all-music' ? 'soundcloud:genres:all-music' : `soundcloud:genres:${genre}`
  
  const res = await axios.get(`${SC_API_V2}/charts`, {
    params: {
      kind: 'top',
      genre: genreQuery,
      limit,
      client_id: clientId
    },
    headers: getScHeaders()
  })

  const collection = res.data.collection || []
  return collection.map((c: any) => formatScTrack(c.track)).filter(Boolean)
}

/**
 * 3. Lấy Stream (Bản tin cá nhân các nghệ sĩ đang follow)
 */
export async function getScUserStream(oauthToken: string, limit: number = 30) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/stream`, {
    params: {
      limit,
      client_id: clientId
    },
    headers: getScHeaders(oauthToken)
  })

  const collection = res.data.collection || []
  return collection
    .map((item: any) => formatScTrack(item.track || item))
    .filter(Boolean)
}

/**
 * 4. Lấy danh sách bài hát yêu thích (Liked Tracks)
 */
export async function getScUserLikes(userId: number | string, oauthToken: string, limit: number = 50) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/users/${userId}/likes`, {
    params: {
      limit,
      client_id: clientId
    },
    headers: getScHeaders(oauthToken)
  })

  const collection = res.data.collection || []
  return collection
    .map((item: any) => formatScTrack(item.track || item))
    .filter(Boolean)
}

/**
 * 5. Lấy danh sách Playlist cá nhân của người dùng
 */
export async function getScUserPlaylists(userId: number | string, oauthToken: string) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/users/${userId}/playlists`, {
    params: {
      client_id: clientId
    },
    headers: getScHeaders(oauthToken)
  })

  const collection = res.data || []
  return collection.map((pl: any) => ({
    id: `sc-pl-${pl.id}`,
    playlistId: String(pl.id),
    title: pl.title,
    subtitle: `${pl.user?.username || 'SoundCloud'} • ${pl.track_count || 0} bài hát`,
    thumbnails: [{ url: pl.artwork_url || pl.user?.avatar_url || '' }],
    isPlaylist: true,
    platform: 'soundcloud',
    style: 'CARD'
  }))
}

/**
 * 6. Tìm kiếm SoundCloud (Bài hát, Nghệ sĩ, Playlist)
 */
export async function searchSoundCloud(query: string, limit: number = 25, oauthToken?: string) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/search`, {
    params: {
      q: query,
      limit,
      client_id: clientId
    },
    headers: getScHeaders(oauthToken)
  })

  const collection = res.data.collection || []
  const tracks: any[] = []
  const playlists: any[] = []

  for (const item of collection) {
    if (item.kind === 'track') {
      const parsed = formatScTrack(item)
      if (parsed) tracks.push(parsed)
    } else if (item.kind === 'playlist') {
      playlists.push({
        id: `sc-pl-${item.id}`,
        playlistId: String(item.id),
        title: item.title,
        subtitle: `${item.user?.username || 'SoundCloud'} • ${item.track_count || 0} bài hát`,
        thumbnails: [{ url: item.artwork_url || item.user?.avatar_url || '' }],
        isPlaylist: true,
        platform: 'soundcloud',
        style: 'CARD'
      })
    }
  }

  return { tracks, playlists }
}

/**
 * 7. Lấy chi tiết bài hát trong 1 Playlist của SoundCloud
 */
export async function getScPlaylistTracks(playlistId: string, oauthToken?: string) {
  const clientId = await getSoundCloudClientId()
  const res = await axios.get(`${SC_API_V2}/playlists/${playlistId}`, {
    params: { client_id: clientId },
    headers: getScHeaders(oauthToken)
  })

  const playlist = res.data
  const tracks: any[] = []

  for (const t of playlist.tracks || []) {
    const parsed = formatScTrack(t)
    if (parsed) tracks.push(parsed)
  }

  return {
    id: String(playlist.id),
    title: playlist.title,
    description: playlist.description,
    author: playlist.user?.username,
    artworkUrl: playlist.artwork_url,
    tracks
  }
}

/**
 * 8. Phân giải Stream URL âm thanh trực tiếp (Direct Audio URL) của SoundCloud
 */
export async function resolveScStreamUrl(trackId: string | number, permalinkUrl?: string, oauthToken?: string): Promise<string> {
  const clientId = await getSoundCloudClientId()

  try {
    // 1. Lấy thông tin track để duyệt qua danh sách transcodings
    const res = await axios.get(`${SC_API_V2}/tracks/${trackId}`, {
      params: { client_id: clientId },
      headers: getScHeaders(oauthToken)
    })

    const transcodings = res.data.media?.transcodings || []
    
    // Ưu tiên: Progressive MP3 trước (dễ play trực tiếp nhất), sau đó đến HLS MP3 / Opus
    let selectedTranscoding = transcodings.find((t: any) => t.format?.protocol === 'progressive' && t.format?.mime_type?.includes('audio/mpeg'))
    if (!selectedTranscoding) {
      selectedTranscoding = transcodings.find((t: any) => t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/mpeg'))
    }
    if (!selectedTranscoding) {
      selectedTranscoding = transcodings.find((t: any) => t.format?.protocol === 'hls' && t.format?.mime_type?.includes('audio/ogg'))
    }
    if (!selectedTranscoding) {
      selectedTranscoding = transcodings[0]
    }

    if (selectedTranscoding && selectedTranscoding.url) {
      // 2. Gọi endpoint stream URL để nhận link âm thanh CDN cuối cùng
      const streamRes = await axios.get(selectedTranscoding.url, {
        params: { client_id: clientId },
        headers: getScHeaders(oauthToken)
      })

      if (streamRes.data.url) {
        return streamRes.data.url
      }
    }
  } catch (e: any) {
    console.warn('[SoundCloud] Không thể phân giải qua v2 API transcodings:', e.message)
  }

  // Fallback nếu có permalink: Dùng permalink_url
  if (permalinkUrl) {
    return permalinkUrl
  }

  throw new Error('Không tìm thấy luồng âm thanh phát cho bài hát này')
}
