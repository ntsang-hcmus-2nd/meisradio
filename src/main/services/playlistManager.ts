import fs from 'fs'
import path, { join } from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { dialog, nativeImage, shell, ipcMain } from 'electron'
import {
  getConfig,
  sqliteStorage,
  IMAGE_CACHE_DIR,
  USER_PLAYLISTS_PATH,
  SUPPORTED_AUDIO_EXTS,
  metadataCache,
  themeColorsCache,
  dirtyMetadataKeys,
  dirtyThemeColorKeys,
  saveMetadataCache,
  saveThemeColorsCache,
  sanitizeDirectoryName
} from './sharedContext'
import { getAudioFilesInDirectoryRecursiveAsync } from './libraryScanner'
import { fastExtractCover, fastReadMetadata } from '../fastAudioParser'

// ==========================================
// ĐỊNH NGHĨA KIỂU USER PLAYLIST
// ==========================================
export interface UserPlaylist {
  id: string
  name: string
  description?: string
  thumbnail?: string | null
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

// ==========================================
// QUẢN LÝ USER PLAYLISTS (VIRTUAL PLAYLISTS)
// ==========================================
export function getUserPlaylists(): UserPlaylist[] {
  try {
    if (fs.existsSync(USER_PLAYLISTS_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(USER_PLAYLISTS_PATH, 'utf-8'))
        if (Array.isArray(data)) {
          for (const pl of data) {
            sqliteStorage.saveUserPlaylist(pl)
          }
        }
      } catch (e) {}
      try {
        fs.renameSync(USER_PLAYLISTS_PATH, `${USER_PLAYLISTS_PATH}.migrated`)
      } catch {
        try {
          fs.unlinkSync(USER_PLAYLISTS_PATH)
        } catch {}
      }
    }
    const sqliteLists = sqliteStorage.getUserPlaylists()
    if (sqliteLists) {
      return sqliteLists
    }
  } catch (e) {}
  return []
}

export function saveUserPlaylists(playlists: UserPlaylist[]): void {
  try {
    if (fs.existsSync(USER_PLAYLISTS_PATH)) {
      try {
        fs.unlinkSync(USER_PLAYLISTS_PATH)
      } catch {}
    }
    for (const pl of playlists) {
      sqliteStorage.saveUserPlaylist(pl)
    }
  } catch (e) {}
}

export function createUserPlaylist(
  name: string,
  description?: string,
  thumbnail?: string | null
): { success: boolean; playlist?: UserPlaylist; playlists?: UserPlaylist[]; error?: string } {
  const trimmed = (name || '').trim()
  if (!trimmed) return { success: false, error: 'Tên playlist không được để trống' }
  const playlists = getUserPlaylists()
  const newPlaylist: UserPlaylist = {
    id: `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: trimmed,
    description: description?.trim() || '',
    thumbnail: thumbnail || null,
    trackIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  playlists.unshift(newPlaylist)
  saveUserPlaylists(playlists)
  return { success: true, playlist: newPlaylist, playlists }
}

export function deleteUserPlaylist(
  playlistId: string
): { success: boolean; playlists: UserPlaylist[] } {
  let playlists = getUserPlaylists()
  playlists = playlists.filter((p) => p.id !== playlistId)
  sqliteStorage.deleteUserPlaylist(playlistId)
  saveUserPlaylists(playlists)
  return { success: true, playlists }
}

export function renameUserPlaylist(
  playlistId: string,
  newName: string
): { success: boolean; playlists?: UserPlaylist[]; playlist?: UserPlaylist; error?: string } {
  const trimmed = (newName || '').trim()
  if (!trimmed) return { success: false, error: 'Tên playlist không hợp lệ' }
  const playlists = getUserPlaylists()
  const target = playlists.find((p) => p.id === playlistId)
  if (target) {
    target.name = trimmed
    target.updatedAt = Date.now()
    saveUserPlaylists(playlists)
    return { success: true, playlists, playlist: target }
  }
  return { success: false, error: 'Không tìm thấy playlist' }
}

export function updateUserPlaylist(
  playlistId: string,
  updates: {
    name?: string
    description?: string
    thumbnail?: string | null
    customImagePath?: string
  }
): { success: boolean; playlist?: UserPlaylist; playlists?: UserPlaylist[]; error?: string } {
  const playlists = getUserPlaylists()
  const target = playlists.find((p) => p.id === playlistId)
  if (!target) return { success: false, error: 'Không tìm thấy playlist' }

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim()
    if (!trimmed) return { success: false, error: 'Tên playlist không được để trống' }
    target.name = trimmed
  }

  if (updates.description !== undefined) {
    target.description = updates.description.trim()
  }

  if (updates.customImagePath) {
    const playlistHash = crypto
      .createHash('md5')
      .update('user_pl_' + playlistId)
      .digest('hex')
    const plCentralThumbPath = join(IMAGE_CACHE_DIR, `upl_${playlistHash}.jpg`)
    try {
      const img = nativeImage.createFromPath(updates.customImagePath)
      const resized = img.resize({ width: 300, height: 300, quality: 'good' })
      fs.writeFileSync(plCentralThumbPath, resized.toJPEG(85))
      target.thumbnail = `${pathToFileURL(plCentralThumbPath).href}?t=${Date.now()}`
    } catch (e) {
      target.thumbnail = `${pathToFileURL(updates.customImagePath).href}?t=${Date.now()}`
    }
  } else if (updates.thumbnail !== undefined) {
    target.thumbnail = updates.thumbnail
  }

  target.updatedAt = Date.now()
  saveUserPlaylists(playlists)
  return { success: true, playlist: target, playlists }
}

export function addTracksToUserPlaylist(
  playlistId: string,
  trackPaths: string[]
): { success: boolean; playlist?: UserPlaylist; playlists?: UserPlaylist[]; error?: string } {
  if (!Array.isArray(trackPaths) || trackPaths.length === 0) {
    return { success: true, playlists: getUserPlaylists() }
  }
  const playlists = getUserPlaylists()
  const target = playlists.find((p) => p.id === playlistId)
  if (target) {
    const set = new Set(target.trackIds)
    for (const tp of trackPaths) {
      if (tp) set.add(tp)
    }
    target.trackIds = Array.from(set)
    target.updatedAt = Date.now()
    saveUserPlaylists(playlists)
    return { success: true, playlist: target, playlists }
  }
  return { success: false, error: 'Không tìm thấy playlist' }
}

export function removeTrackFromUserPlaylist(
  playlistId: string,
  trackPath: string
): { success: boolean; playlist?: UserPlaylist; playlists?: UserPlaylist[]; error?: string } {
  const playlists = getUserPlaylists()
  const target = playlists.find((p) => p.id === playlistId)
  if (target) {
    target.trackIds = target.trackIds.filter((id) => id !== trackPath)
    target.updatedAt = Date.now()
    saveUserPlaylists(playlists)
    return { success: true, playlist: target, playlists }
  }
  return { success: false, error: 'Không tìm thấy playlist' }
}

export function reorderUserPlaylistTracks(
  playlistId: string,
  trackIds: string[]
): { success: boolean; playlist?: UserPlaylist; playlists?: UserPlaylist[]; error?: string } {
  const playlists = getUserPlaylists()
  const target = playlists.find((p) => p.id === playlistId)
  if (target) {
    target.trackIds = trackIds
    target.updatedAt = Date.now()
    saveUserPlaylists(playlists)
    return { success: true, playlist: target, playlists }
  }
  return { success: false, error: 'Không tìm thấy playlist' }
}

// ==========================================
// QUẢN LÝ FOLDER PLAYLISTS (THƯ MỤC CỤC BỘ)
// ==========================================
function getValidLibraryRoots(): string[] {
  const config = getConfig()
  const paths: string[] = []
  if (Array.isArray(config.libraryPaths)) {
    for (const p of config.libraryPaths) {
      if (typeof p === 'string' && p.trim()) paths.push(p.trim())
    }
  }
  if (typeof config.libraryPath === 'string' && config.libraryPath.trim()) {
    paths.push(config.libraryPath.trim())
  }
  return Array.from(new Set(paths)).filter((p) => fs.existsSync(p))
}

function isValidPlaylistName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return false
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return false
  return true
}

export function findExistingPlaylistFolder(
  playlistName: string
): { folderPath: string; rootPath: string } | null {
  if (!isValidPlaylistName(playlistName)) return null
  const safeName = sanitizeDirectoryName(playlistName)
  if (!safeName || safeName === 'Untitled' || !isValidPlaylistName(safeName)) return null

  const roots = getValidLibraryRoots()
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
    const candidates = Array.from(new Set([safeName, playlistName.trim()]))
    for (const cand of candidates) {
      const targetFolder = path.resolve(root, cand)
      if (targetFolder.startsWith(rootPrefix)) {
        try {
          if (fs.existsSync(targetFolder) && fs.statSync(targetFolder).isDirectory()) {
            return { folderPath: targetFolder, rootPath: root }
          }
        } catch {}
      }
    }
  }
  return null
}

export function createPlaylist(playlistName: string): { success: boolean; error?: string } {
  if (!isValidPlaylistName(playlistName)) {
    return { success: false, error: 'Tên playlist không hợp lệ!' }
  }
  const safeName = sanitizeDirectoryName(playlistName)
  if (!safeName || safeName === 'Untitled' || !isValidPlaylistName(safeName)) {
    return { success: false, error: 'Tên playlist không hợp lệ!' }
  }

  const existing = findExistingPlaylistFolder(playlistName)
  if (existing) {
    return { success: false, error: 'Playlist đã tồn tại!' }
  }

  const roots = getValidLibraryRoots()
  const rootPath = roots[0] || getConfig().libraryPath
  if (!rootPath || !fs.existsSync(rootPath)) {
    return { success: false, error: 'Chưa cấu hình thư mục thư viện!' }
  }

  const resolvedRoot = path.resolve(rootPath)
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const dirPath = path.resolve(rootPath, safeName)

  if (!dirPath.startsWith(rootPrefix)) {
    return { success: false, error: 'Đường dẫn playlist không hợp lệ!' }
  }

  if (fs.existsSync(dirPath)) {
    return { success: false, error: 'Playlist đã tồn tại!' }
  }

  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function addTrackToPlaylist(
  playlistName: string,
  trackPath: string
): { success: boolean; note?: string; error?: string } {
  if (!isValidPlaylistName(playlistName)) {
    return { success: false, error: 'Tên playlist không hợp lệ!' }
  }

  let playlistDir: string
  const existing = findExistingPlaylistFolder(playlistName)
  if (existing) {
    playlistDir = existing.folderPath
  } else {
    const roots = getValidLibraryRoots()
    const rootPath = roots[0] || getConfig().libraryPath
    if (!rootPath || !fs.existsSync(rootPath)) {
      return { success: false, error: 'Chưa cấu hình thư viện!' }
    }
    const safePlaylistName = sanitizeDirectoryName(playlistName)
    if (!safePlaylistName || safePlaylistName === 'Untitled' || !isValidPlaylistName(safePlaylistName)) {
      return { success: false, error: 'Tên playlist không hợp lệ!' }
    }
    const resolvedRoot = path.resolve(rootPath)
    const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
    playlistDir = path.resolve(rootPath, safePlaylistName)
    if (!playlistDir.startsWith(rootPrefix)) {
      return { success: false, error: 'Đường dẫn không hợp lệ!' }
    }
    if (!fs.existsSync(playlistDir)) {
      fs.mkdirSync(playlistDir, { recursive: true })
    }
  }

  let rawPath = trackPath.replace(/^file:\/\/\/?/, '')
  if (process.platform === 'win32') {
    rawPath = decodeURIComponent(rawPath)
    if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
    rawPath = rawPath.replace(/\//g, '\\')
  }

  if (!fs.existsSync(rawPath)) return { success: false, error: 'File nguồn không tồn tại!' }

  const fileName = path.basename(rawPath)
  const destPath = join(playlistDir, fileName)

  if (fs.existsSync(destPath)) {
    return { success: true, note: 'Bài hát đã có trong playlist này rồi!' }
  }

  try {
    try {
      fs.linkSync(rawPath, destPath)
    } catch {
      fs.copyFileSync(rawPath, destPath)
    }

    const lrcSource = rawPath.replace(/\.[^/.]+$/, '.lrc')
    const lrcDest = destPath.replace(/\.[^/.]+$/, '.lrc')
    if (fs.existsSync(lrcSource) && !fs.existsSync(lrcDest)) {
      try {
        try {
          fs.linkSync(lrcSource, lrcDest)
        } catch {
          fs.copyFileSync(lrcSource, lrcDest)
        }
      } catch (e) {}
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function renamePlaylist(
  oldName: string,
  newName: string
): { success: boolean; error?: string } {
  if (!isValidPlaylistName(oldName) || !isValidPlaylistName(newName)) {
    return { success: false, error: 'Tên playlist không hợp lệ!' }
  }
  const safeNewName = sanitizeDirectoryName(newName)
  if (!safeNewName || safeNewName === 'Untitled' || !isValidPlaylistName(safeNewName)) {
    return { success: false, error: 'Tên playlist không hợp lệ!' }
  }

  const existing = findExistingPlaylistFolder(oldName)
  if (!existing) {
    return { success: false, error: 'Không tìm thấy playlist cần đổi tên!' }
  }

  const resolvedRoot = path.resolve(existing.rootPath)
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const oldDirPath = existing.folderPath
  const newDirPath = path.resolve(existing.rootPath, safeNewName)

  if (!oldDirPath.startsWith(rootPrefix) || !newDirPath.startsWith(rootPrefix)) {
    return { success: false, error: 'Đường dẫn không hợp lệ!' }
  }

  try {
    if (oldDirPath !== newDirPath) {
      if (fs.existsSync(newDirPath) && oldDirPath.toLowerCase() !== newDirPath.toLowerCase()) {
        return { success: false, error: 'Playlist với tên mới đã tồn tại!' }
      }
      fs.renameSync(oldDirPath, newDirPath)
    }
    const exts = ['.jpg', '.png', '.jpeg', '.webp']
    for (const ext of exts) {
      const oldImgPath = join(newDirPath, `${oldName}${ext}`)
      if (fs.existsSync(oldImgPath)) {
        fs.renameSync(oldImgPath, join(newDirPath, `${safeNewName}${ext}`))
      }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function setPlaylistThumbnail(
  playlistName: string
): Promise<{ success: boolean; error?: string }> {
  const existing = findExistingPlaylistFolder(playlistName)
  if (!existing) {
    return { success: false, error: 'Không tìm thấy thư mục Playlist!' }
  }

  const resolvedRoot = path.resolve(existing.rootPath)
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const playlistPath = existing.folderPath

  if (!playlistPath.startsWith(rootPrefix)) {
    return { success: false, error: 'Đường dẫn không hợp lệ!' }
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
  })
  if (canceled || filePaths.length === 0) return { success: false }
  try {
    const sourcePath = filePaths[0]
    const ext = sourcePath.split('.').pop()?.toLowerCase() || 'jpg'
    const folderBaseName = path.basename(playlistPath)
    const destPath = join(playlistPath, `${folderBaseName}.${ext}`)
    const exts = ['jpg', 'png', 'jpeg', 'webp']
    for (const e of exts) {
      const oldImg = join(playlistPath, `${folderBaseName}.${e}`)
      if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
    }
    const playlistHash = crypto
      .createHash('md5')
      .update('playlist_' + playlistPath)
      .digest('hex')
    const plCentralThumbPath = join(IMAGE_CACHE_DIR, `pl_${playlistHash}.jpg`)
    try {
      const img = nativeImage.createFromPath(sourcePath)
      const resized = img.resize({ width: 200, height: 200, quality: 'good' })
      fs.writeFileSync(plCentralThumbPath, resized.toJPEG(80))
    } catch (e) {}

    fs.copyFileSync(sourcePath, destPath)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deletePlaylist(
  playlistName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isValidPlaylistName(playlistName)) {
      return { success: false, error: 'Tên playlist không hợp lệ!' }
    }
    const safeName = sanitizeDirectoryName(playlistName)
    if (!safeName || safeName === 'Untitled' || !isValidPlaylistName(safeName)) {
      return { success: false, error: 'Tên playlist không hợp lệ!' }
    }

    const roots = getValidLibraryRoots()
    let deleted = false
    for (const root of roots) {
      const resolvedRoot = path.resolve(root)
      const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
      const candidates = Array.from(new Set([safeName, playlistName.trim()]))
      for (const cand of candidates) {
        const playlistFolder = path.resolve(root, cand)
        if (!playlistFolder.startsWith(rootPrefix)) continue
        if (fs.existsSync(playlistFolder)) {
          try {
            await shell.trashItem(playlistFolder)
          } catch (_err) {
            fs.rmSync(playlistFolder, { recursive: true, force: true })
          }
          deleted = true

          sqliteStorage.removeTracksByDirectoryPrefix(playlistFolder)

          const normDir = playlistFolder.replace(/\\/g, '/').toLowerCase()
          for (const key of Object.keys(metadataCache)) {
            const normKey = key.replace(/\\/g, '/').toLowerCase()
            if (normKey.startsWith(normDir)) {
              delete metadataCache[key]
              dirtyMetadataKeys.delete(key)
            }
          }
          for (const key of Object.keys(themeColorsCache)) {
            const normKey = key.replace(/\\/g, '/').toLowerCase()
            if (normKey.startsWith(normDir)) {
              delete themeColorsCache[key]
              dirtyThemeColorKeys.delete(key)
            }
          }
        }
      }
    }

    if (!deleted) {
      return { success: false, error: 'Không tìm thấy thư mục Playlist' }
    }

    saveMetadataCache()
    saveThemeColorsCache()

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function extractPlaylistThumbnail(
  playlistName: string
): Promise<{ success: boolean; error?: string }> {
  const existing = findExistingPlaylistFolder(playlistName)
  if (!existing) {
    return { success: false, error: 'Không tìm thấy thư mục Playlist!' }
  }

  const resolvedRoot = path.resolve(existing.rootPath)
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const playlistPath = existing.folderPath

  if (!playlistPath.startsWith(rootPrefix)) {
    return { success: false, error: 'Đường dẫn không hợp lệ!' }
  }

  try {
    const supportedExts = SUPPORTED_AUDIO_EXTS
    const allAudioFiles = await getAudioFilesInDirectoryRecursiveAsync(
      playlistPath,
      supportedExts
    )

    const firstTrack = allAudioFiles[0]
    if (!firstTrack) {
      return { success: false, error: 'Playlist đang trống, không có bài hát nào!' }
    }

    const trackPath = firstTrack
    const cover = await fastExtractCover(trackPath)

    if (cover && cover.data && cover.data.length > 0) {
      const ext = cover.format.split('/')[1] || 'jpg'
      const folderBaseName = path.basename(playlistPath)
      const destPath = join(playlistPath, `${folderBaseName}.${ext}`)

      const exts = ['jpg', 'png', 'jpeg', 'webp']
      for (const e of exts) {
        const oldImg = join(playlistPath, `${folderBaseName}.${e}`)
        if (fs.existsSync(oldImg)) fs.unlinkSync(oldImg)
      }

      fs.writeFileSync(destPath, cover.data)
      return { success: true }
    }
    return { success: false, error: 'Bài hát đầu tiên trong thư mục không có thẻ ảnh bìa!' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function autoGeneratePlaylists(): Promise<{
  success: boolean
  movedCount?: number
  error?: string
}> {
  const rootPath = getConfig().libraryPath
  if (!rootPath || !fs.existsSync(rootPath)) {
    return { success: false, error: 'Chưa cấu hình thư mục thư viện!' }
  }
  const items = await fs.promises.readdir(rootPath)
  const supportedExts = SUPPORTED_AUDIO_EXTS
  let movedCount = 0
  let fileCount = 0
  for (const item of items) {
    const itemPath = join(rootPath, item)
    try {
      const stat = await fs.promises.stat(itemPath)
      if (!stat.isFile()) continue
    } catch {
      continue
    }

    if (supportedExts.some((ext) => item.toLowerCase().endsWith(ext))) {
      fileCount++
      if (fileCount % 10 === 0) {
        await new Promise((r) => setImmediate(r))
      }
      try {
        const metadata = await fastReadMetadata(itemPath, { skipCovers: true })
        const albumName = metadata.common?.album || (metadata as any).album
        if (albumName && typeof albumName === 'string' && albumName.trim() !== '') {
          const safeAlbumName = sanitizeDirectoryName(albumName) || 'Unknown Album'
          const albumDirPath = join(rootPath, safeAlbumName)
          if (!fs.existsSync(albumDirPath)) {
            await fs.promises.mkdir(albumDirPath, { recursive: true })
          }
          const hasExistingCover = ['.jpg', '.jpeg', '.png', '.webp'].some((ext) =>
            fs.existsSync(join(albumDirPath, `${safeAlbumName}${ext}`))
          )
          if (!hasExistingCover) {
            try {
              const cover = await fastExtractCover(itemPath)
              if (cover && cover.data && cover.data.length > 0) {
                const imgExt = cover.format.split('/')[1] || 'jpg'
                const imgDest = join(albumDirPath, `${safeAlbumName}.${imgExt}`)
                await fs.promises.writeFile(imgDest, cover.data)
              }
            } catch {}
          }
          const destAudioPath = join(albumDirPath, item)
          if (!fs.existsSync(destAudioPath)) {
            try {
              await fs.promises.rename(itemPath, destAudioPath)
            } catch {
              try {
                await fs.promises.copyFile(itemPath, destAudioPath)
                await fs.promises.unlink(itemPath)
              } catch {}
            }
          }
          const fileNameWithoutExt = item.replace(/\.[^/.]+$/, '')
          const lrcPath = join(rootPath, `${fileNameWithoutExt}.lrc`)
          if (fs.existsSync(lrcPath)) {
            const destLrcPath = join(albumDirPath, `${fileNameWithoutExt}.lrc`)
            if (!fs.existsSync(destLrcPath)) {
              try {
                await fs.promises.rename(lrcPath, destLrcPath)
              } catch {
                try {
                  await fs.promises.copyFile(lrcPath, destLrcPath)
                  await fs.promises.unlink(lrcPath)
                } catch {}
              }
            }
          }
          movedCount++
        }
      } catch (e) {}
    }
  }
  return { success: true, movedCount }
}

export async function deleteTrack(
  trackPath: string,
  _deletePermanently: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    let cleanPath = trackPath
    const isCueTrack = cleanPath.includes('#track-')
    if (isCueTrack) {
      cleanPath = cleanPath.split('#track-')[0]
    }
    let rawPath = cleanPath.replace(/^file:\/\/\/?/, '')
    if (process.platform === 'win32') {
      rawPath = decodeURIComponent(rawPath)
      if (/^\/[a-zA-Z]:/.test(rawPath)) rawPath = rawPath.slice(1)
      rawPath = rawPath.replace(/\//g, '\\')
    }

    if (fs.existsSync(rawPath)) {
      try {
        await shell.trashItem(rawPath)
      } catch (_err) {
        try {
          fs.unlinkSync(rawPath)
        } catch (e) {}
      }

      const lrcPath = rawPath.replace(/\.[^/.]+$/, '.lrc')
      if (fs.existsSync(lrcPath)) {
        try {
          await shell.trashItem(lrcPath)
        } catch {
          try {
            fs.unlinkSync(lrcPath)
          } catch {}
        }
      }

      const cuePath = rawPath.replace(/\.[^/.]+$/, '.cue')
      if (fs.existsSync(cuePath)) {
        try {
          await shell.trashItem(cuePath)
        } catch {
          try {
            fs.unlinkSync(cuePath)
          } catch {}
        }
      }
    }

    sqliteStorage.removeLibraryTracks([trackPath, cleanPath, rawPath])

    delete metadataCache[rawPath]
    delete metadataCache[cleanPath]
    delete metadataCache[trackPath]
    delete themeColorsCache[rawPath]
    delete themeColorsCache[cleanPath]
    delete themeColorsCache[trackPath]
    dirtyMetadataKeys.delete(rawPath)
    dirtyMetadataKeys.delete(cleanPath)
    dirtyMetadataKeys.delete(trackPath)
    dirtyThemeColorKeys.delete(rawPath)
    dirtyThemeColorKeys.delete(cleanPath)
    dirtyThemeColorKeys.delete(trackPath)
    saveMetadataCache()
    saveThemeColorsCache()

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ==========================================
// IPC HANDLERS CHO PLAYLIST MANAGER
// ==========================================
export function registerPlaylistManagerIpc(): void {
  ipcMain.handle('music:getUserPlaylists', () => {
    const lists = getUserPlaylists()
    const res: any = lists
    res.success = true
    res.playlists = lists
    return res
  })

  ipcMain.handle('music:saveUserPlaylist', async (_, playlist: any) => {
    sqliteStorage.saveUserPlaylist(playlist)
    return { success: true }
  })

  ipcMain.handle(
    'music:createUserPlaylist',
    async (_, name: string, description?: string, thumbnail?: string | null) => {
      return createUserPlaylist(name, description, thumbnail)
    }
  )

  ipcMain.handle('music:deleteUserPlaylist', async (_, playlistId: string) => {
    return deleteUserPlaylist(playlistId)
  })

  ipcMain.handle('music:renameUserPlaylist', async (_, playlistId: string, newName: string) => {
    return renameUserPlaylist(playlistId, newName)
  })

  ipcMain.handle(
    'music:updateUserPlaylist',
    async (
      _,
      playlistId: string,
      updates: {
        name?: string
        description?: string
        thumbnail?: string | null
        customImagePath?: string
      }
    ) => {
      return updateUserPlaylist(playlistId, updates)
    }
  )

  ipcMain.handle('music:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    })
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    const imagePath = filePaths[0]
    try {
      const img = nativeImage.createFromPath(imagePath)
      const resized = img.resize({ width: 300, height: 300, quality: 'good' })
      const buffer = resized.toJPEG(85)
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
      return {
        success: true,
        filePath: imagePath,
        dataUrl,
        previewUrl: pathToFileURL(imagePath).href
      }
    } catch (e) {
      return {
        success: true,
        filePath: imagePath,
        dataUrl: pathToFileURL(imagePath).href,
        previewUrl: pathToFileURL(imagePath).href
      }
    }
  })

  ipcMain.handle(
    'music:setUserPlaylistThumbnail',
    async (_, playlistId: string, customPath?: string) => {
      let imagePath = customPath
      if (!imagePath) {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
        })
        if (canceled || filePaths.length === 0) return { success: false }
        imagePath = filePaths[0]
      }
      const playlists = getUserPlaylists()
      const target = playlists.find((p) => p.id === playlistId)
      if (target) {
        const playlistHash = crypto
          .createHash('md5')
          .update('user_pl_' + playlistId)
          .digest('hex')
        const plCentralThumbPath = join(IMAGE_CACHE_DIR, `upl_${playlistHash}.jpg`)
        try {
          const img = nativeImage.createFromPath(imagePath)
          const resized = img.resize({ width: 200, height: 200, quality: 'good' })
          fs.writeFileSync(plCentralThumbPath, resized.toJPEG(80))
          target.thumbnail = `${pathToFileURL(plCentralThumbPath).href}?t=${Date.now()}`
        } catch (e) {
          target.thumbnail = `${pathToFileURL(imagePath).href}?t=${Date.now()}`
        }
        target.updatedAt = Date.now()
        saveUserPlaylists(playlists)
        return { success: true, thumbnail: target.thumbnail, playlists, playlist: target }
      }
      return { success: false, error: 'Không tìm thấy playlist' }
    }
  )

  ipcMain.handle(
    'music:addTracksToUserPlaylist',
    async (_, playlistId: string, trackPaths: string[]) => {
      return addTracksToUserPlaylist(playlistId, trackPaths)
    }
  )

  ipcMain.handle(
    'music:removeTrackFromUserPlaylist',
    async (_, playlistId: string, trackPath: string) => {
      return removeTrackFromUserPlaylist(playlistId, trackPath)
    }
  )

  ipcMain.handle(
    'music:reorderUserPlaylistTracks',
    async (_, playlistId: string, trackIds: string[]) => {
      return reorderUserPlaylistTracks(playlistId, trackIds)
    }
  )

  ipcMain.handle('music:renamePlaylist', async (_, oldName, newName) => {
    return renamePlaylist(oldName, newName)
  })

  ipcMain.handle('music:setPlaylistThumbnail', async (_, playlistName) => {
    return await setPlaylistThumbnail(playlistName)
  })

  ipcMain.handle('music:deletePlaylist', async (_, playlistName: string) => {
    return await deletePlaylist(playlistName)
  })

  ipcMain.handle('music:extractPlaylistThumbnail', async (_, playlistName) => {
    return await extractPlaylistThumbnail(playlistName)
  })

  ipcMain.handle('music:createPlaylist', async (_, playlistName) => {
    return createPlaylist(playlistName)
  })

  ipcMain.handle('music:addTrackToPlaylist', async (_, playlistName, trackPath) => {
    return addTrackToPlaylist(playlistName, trackPath)
  })

  ipcMain.handle('music:autoGeneratePlaylists', async () => {
    return await autoGeneratePlaylists()
  })

  ipcMain.handle(
    'music:deleteTrack',
    async (_, trackPath: string, deletePermanently: boolean = false) => {
      return await deleteTrack(trackPath, deletePermanently)
    }
  )

  ipcMain.handle('music:recordPlayEvent', (_, event: any) => {
    try {
      const eventId = sqliteStorage.recordPlayEvent(event)
      return { success: true, eventId }
    } catch (e) {
      console.error('[Main] Error recording play event:', e)
      return { success: false, eventId: 0 }
    }
  })
  ipcMain.handle('music:updatePlayEventDuration', (_, data: any) => {
    try {
      if (data && typeof data.eventId === 'number' && typeof data.durationSec === 'number') {
        sqliteStorage.updatePlayEventDuration(data.eventId, data.durationSec, data.filePath)
        return { success: true }
      }
    } catch (e) {
      console.error('[Main] Error updating play event duration:', e)
    }
    return { success: false }
  })
  ipcMain.handle('music:getAdvancedStats', (_, rangeDays?: number) => {
    try {
      return sqliteStorage.getAdvancedListeningStats(rangeDays)
    } catch (e) {
      console.error('[Main] Error getting advanced stats:', e)
      return null
    }
  })
  ipcMain.handle('music:getFavorites', () => sqliteStorage.getFavoriteTracks())
  ipcMain.handle('music:toggleFavorite', (_, filePath: string, isFavorite?: boolean) =>
    sqliteStorage.toggleFavoriteTrack(filePath, isFavorite)
  )
  ipcMain.handle('music:getLyricOffsets', () => sqliteStorage.getAllTrackLyricOffsets())
  ipcMain.handle('music:setLyricOffset', (_, filePath: string, offsetSec: number) => {
    sqliteStorage.setTrackLyricOffset(filePath, offsetSec)
    return { success: true }
  })
  ipcMain.handle('music:getSmartPlaylists', () => sqliteStorage.getSmartPlaylists())
  ipcMain.handle('music:saveSmartPlaylist', (_, playlist: any) => {
    sqliteStorage.saveSmartPlaylist(playlist)
    return { success: true }
  })
  ipcMain.handle('music:deleteSmartPlaylist', (_, id: string) => {
    sqliteStorage.deleteSmartPlaylist(id)
    return { success: true }
  })
}
