import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getConfig: () => ipcRenderer.invoke('music:getConfig'),
  saveConfig: (data: any) => ipcRenderer.invoke('music:saveConfig', data),
  
  updateTags: (filePath: string, tags: any, imagePath: string | null) => ipcRenderer.invoke('music:updateTags', filePath, tags, imagePath),
  selectImageFile: () => ipcRenderer.invoke('music:selectImageFile'),

  openMusicFolder: () => ipcRenderer.invoke('music:openFolder'),
downloadCloudFile: (url: string, filename: string, existingTracks?: any[]) => ipcRenderer.invoke('music:downloadCloudFile', url, filename, existingTracks),
  downloadMultipleFiles: (files: any[], existingTracks?: any[]) => ipcRenderer.invoke('music:downloadMultipleFiles', files, existingTracks),
  fetchDriveFiles: (folderId: string) => ipcRenderer.invoke('music:fetchDriveFiles', folderId),
  setLibraryFolder: () => ipcRenderer.invoke('music:setLibraryFolder'),
  addLibraryFolder: () => ipcRenderer.invoke('music:addLibraryFolder'),
  removeLibraryFolder: (folderPath: string) => ipcRenderer.invoke('music:removeLibraryFolder', folderPath),
  updateLibraryFolder: (oldPath: string) => ipcRenderer.invoke('music:updateLibraryFolder', oldPath),
  getLibrary: (forceRefresh?: boolean) => ipcRenderer.invoke('music:getLibrary', forceRefresh),
  renamePlaylist: (oldName: string, newName: string) => ipcRenderer.invoke('music:renamePlaylist', oldName, newName),
  setPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:setPlaylistThumbnail', playlistName),
  autoGeneratePlaylists: () => ipcRenderer.invoke('music:autoGeneratePlaylists'),
  
  // User Playlists (Virtual, Zero disk duplication)
  getUserPlaylists: () => ipcRenderer.invoke('music:getUserPlaylists'),
  createUserPlaylist: (name: string, description?: string, thumbnail?: string | null) => ipcRenderer.invoke('music:createUserPlaylist', name, description, thumbnail),
  deleteUserPlaylist: (playlistId: string) => ipcRenderer.invoke('music:deleteUserPlaylist', playlistId),
  renameUserPlaylist: (playlistId: string, newName: string) => ipcRenderer.invoke('music:renameUserPlaylist', playlistId, newName),
  updateUserPlaylist: (playlistId: string, updates: { name?: string; description?: string; thumbnail?: string | null; customImagePath?: string }) => ipcRenderer.invoke('music:updateUserPlaylist', playlistId, updates),
  pickImage: () => ipcRenderer.invoke('music:pickImage'),
  setUserPlaylistThumbnail: (playlistId: string, customPath?: string) => ipcRenderer.invoke('music:setUserPlaylistThumbnail', playlistId, customPath),
  addTracksToUserPlaylist: (playlistId: string, trackPaths: string[]) => ipcRenderer.invoke('music:addTracksToUserPlaylist', playlistId, trackPaths),
  removeTrackFromUserPlaylist: (playlistId: string, trackPath: string) => ipcRenderer.invoke('music:removeTrackFromUserPlaylist', playlistId, trackPath),
  reorderUserPlaylistTracks: (playlistId: string, trackIds: string[]) => ipcRenderer.invoke('music:reorderUserPlaylistTracks', playlistId, trackIds),
  readLrcFile: (filePath: string) => ipcRenderer.invoke('music:read-lyrics', filePath),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('music:readAudioBuffer', filePath),
  extractPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:extractPlaylistThumbnail', playlistName),
  fetchMusixmatchLyrics: (title: string, artist: string) => ipcRenderer.invoke('music:fetchMusixmatchLyrics', title, artist),
  importLocalFiles: (targetFolder?: string, existingTracks?: any[]) => ipcRenderer.invoke('music:importLocalFiles', targetFolder, existingTracks),
  onGlobalShortcut: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action)
    ipcRenderer.on('global-shortcut', handler)
    return () => ipcRenderer.removeListener('global-shortcut', handler)
  },
  getTrackCover: (filePath: string) => ipcRenderer.invoke('music:getTrackCover', filePath),
  getOriginalTrackCover: (filePath: string) => ipcRenderer.invoke('music:getOriginalTrackCover', filePath),
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  updateTrayConfig: (config: any) => ipcRenderer.invoke('music:updateTrayConfig', config),
  toggleMiniPlayer: (isMini: boolean) => ipcRenderer.invoke('music:toggleMiniPlayer', isMini),
  createPlaylist: (playlistName: string) => ipcRenderer.invoke('music:createPlaylist', playlistName),
  deletePlaylist: (playlistName: string) => ipcRenderer.invoke('music:deletePlaylist', playlistName),
  deleteTrack: (trackPath: string, deletePermanently?: boolean) => ipcRenderer.invoke('music:deleteTrack', trackPath, deletePermanently),
  showInFolder: (filePath: string) => ipcRenderer.invoke('music:showInFolder', filePath),
  addTrackToPlaylist: (playlistName: string, trackPath: string) => ipcRenderer.invoke('music:addTrackToPlaylist', playlistName, trackPath),
  forceGC: () => ipcRenderer.invoke('music:forceGC'),
  searchOnline: (query: string) => ipcRenderer.invoke('music:searchOnline', query),
  getStreamUrl: (track: any) => ipcRenderer.invoke('music:getStreamUrl', track),
  downloadOnline: (track: any) => ipcRenderer.invoke('music:downloadOnline', track),
  ytmLogin: () => ipcRenderer.invoke('music:ytmLogin'),
  ytmLogout: () => ipcRenderer.invoke('music:ytmLogout'),
  scLogin: () => ipcRenderer.invoke('music:scLogin'),
  scLogout: () => ipcRenderer.invoke('music:scLogout'),
  getScUser: () => ipcRenderer.invoke('music:getScUser'),
  getScDashboard: (genre?: string) => ipcRenderer.invoke('music:getScDashboard', genre),
  searchScOnline: (query: string) => ipcRenderer.invoke('music:searchScOnline', query),
  getScPlaylist: (playlistId: string) => ipcRenderer.invoke('music:getScPlaylist', playlistId),
  getHomeDashboard: () => ipcRenderer.invoke('music:getHomeDashboard'),
  logWatchHistory: (videoId: string) => ipcRenderer.invoke('music:logWatchHistory', videoId),
  getUpNext: (videoId: string) => ipcRenderer.invoke('music:getUpNext', videoId),
  // Chèn vào cuối danh sách các hàm API
  getYtmPlaylist: (playlistId: string) => ipcRenderer.invoke('music:getYtmPlaylist', playlistId),
  getYtmArtist: (artistId: string) => ipcRenderer.invoke('music:getYtmArtist', artistId), // <-- DÒNG MỚI NÀY
  preloadStream: (targetId: string) => ipcRenderer.invoke('music:preloadStream', targetId),

  // MPV API
  mpvPlay: (url: string, crossfade: number) => ipcRenderer.invoke('mpv:play', url, crossfade),
  mpvResume: () => ipcRenderer.invoke('mpv:resume'),
  mpvPause: () => ipcRenderer.invoke('mpv:pause'),
  mpvSeek: (pos: number) => ipcRenderer.invoke('mpv:seek', pos),
  mpvSetVolume: (vol: number) => ipcRenderer.invoke('mpv:setVolume', vol),
  mpvSetEqualizer: (bands: number[], preamp?: number) => ipcRenderer.invoke('mpv:setEqualizer', bands, preamp),
  setBitPerfect: (val: boolean) => ipcRenderer.invoke('mpv:setBitPerfect', val),
  setAudioDevice: (deviceId: string) => ipcRenderer.invoke('music:setAudioDevice', deviceId),
  
  onMpvTime: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('mpv:time', handler)
    return () => ipcRenderer.removeListener('mpv:time', handler)
  },
  onMpvDuration: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('mpv:duration', handler)
    return () => ipcRenderer.removeListener('mpv:duration', handler)
  },
  onMpvPaused: (callback: (val: boolean) => void) => {
    const handler = (_e: any, val: boolean) => callback(val)
    ipcRenderer.on('mpv:paused', handler)
    return () => ipcRenderer.removeListener('mpv:paused', handler)
  },
  onMpvEnded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('mpv:ended', handler)
    return () => ipcRenderer.removeListener('mpv:ended', handler)
  },
  getThemeColorsCache: () => ipcRenderer.invoke('music:getThemeColorsCache'),
  cacheThemeColors: (trackPath: string, colors: any) => ipcRenderer.invoke('music:cacheThemeColors', trackPath, colors),
  clearMemoryCache: () => ipcRenderer.invoke('app:clearMemoryCache'),
  onDeepClean: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:onDeepClean', handler)
    return () => ipcRenderer.removeListener('app:onDeepClean', handler)
  },
  onNavBack: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('nav:back', handler)
    return () => ipcRenderer.removeListener('nav:back', handler)
  },
  onNavForward: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('nav:forward', handler)
    return () => ipcRenderer.removeListener('nav:forward', handler)
  },
  onLibraryChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },
  discordUpdatePresence: (payload: any) => ipcRenderer.invoke('discord:updatePresence', payload),
  discordClearPresence: () => ipcRenderer.invoke('discord:clearPresence'),
  discordUpdateConfig: (config: any) => ipcRenderer.invoke('discord:updateConfig', config),
  discordGetStatus: () => ipcRenderer.invoke('discord:getStatus'),
}

const safeElectron = {
  process: {
    versions: process.versions
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', safeElectron)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) { console.error(error) }
} else {
  // @ts-ignore
  window.electron = safeElectron
  // @ts-ignore
  window.api = api
}