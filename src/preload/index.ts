import { contextBridge, ipcRenderer, webFrame } from 'electron'

const api = {
  getConfig: () => ipcRenderer.invoke('music:getConfig'),
  saveConfig: (data: any) => ipcRenderer.invoke('music:saveConfig', data),
  registerDroppedFiles: (paths: string[]) =>
    ipcRenderer.invoke('music:registerDroppedFiles', paths),

  updateTags: (filePath: string, tags: any, imagePath: string | null) =>
    ipcRenderer.invoke('music:updateTags', filePath, tags, imagePath),
  getTrackDetails: (filePath: string) => ipcRenderer.invoke('music:getTrackDetails', filePath),
  selectImageFile: () => ipcRenderer.invoke('music:selectImageFile'),

  downloadCloudFile: (url: string, filename: string, existingTracks?: any[]) =>
    ipcRenderer.invoke('music:downloadCloudFile', url, filename, existingTracks),
  downloadMultipleFiles: (files: any[], existingTracks?: any[]) =>
    ipcRenderer.invoke('music:downloadMultipleFiles', files, existingTracks),
  fetchDriveFiles: (folderId: string) => ipcRenderer.invoke('music:fetchDriveFiles', folderId),
  setLibraryFolder: () => ipcRenderer.invoke('music:setLibraryFolder'),
  addLibraryFolder: () => ipcRenderer.invoke('music:addLibraryFolder'),
  removeLibraryFolder: (folderPath: string) =>
    ipcRenderer.invoke('music:removeLibraryFolder', folderPath),
  updateLibraryFolder: (oldPath: string) =>
    ipcRenderer.invoke('music:updateLibraryFolder', oldPath),
  getLibrary: (forceRefresh?: boolean, hardRescan?: boolean) =>
    ipcRenderer.invoke('music:getLibrary', forceRefresh, hardRescan),
  renamePlaylist: (oldName: string, newName: string) =>
    ipcRenderer.invoke('music:renamePlaylist', oldName, newName),
  setPlaylistThumbnail: (playlistName: string) =>
    ipcRenderer.invoke('music:setPlaylistThumbnail', playlistName),
  autoGeneratePlaylists: () => ipcRenderer.invoke('music:autoGeneratePlaylists'),

  // User Playlists (Virtual, Zero disk duplication)
  getUserPlaylists: () => ipcRenderer.invoke('music:getUserPlaylists'),
  createUserPlaylist: (name: string, description?: string, thumbnail?: string | null) =>
    ipcRenderer.invoke('music:createUserPlaylist', name, description, thumbnail),
  deleteUserPlaylist: (playlistId: string) =>
    ipcRenderer.invoke('music:deleteUserPlaylist', playlistId),
  renameUserPlaylist: (playlistId: string, newName: string) =>
    ipcRenderer.invoke('music:renameUserPlaylist', playlistId, newName),
  updateUserPlaylist: (
    playlistId: string,
    updates: {
      name?: string
      description?: string
      thumbnail?: string | null
      customImagePath?: string
    }
  ) => ipcRenderer.invoke('music:updateUserPlaylist', playlistId, updates),
  pickImage: () => ipcRenderer.invoke('music:pickImage'),
  setUserPlaylistThumbnail: (playlistId: string, customPath?: string) =>
    ipcRenderer.invoke('music:setUserPlaylistThumbnail', playlistId, customPath),
  addTracksToUserPlaylist: (playlistId: string, trackPaths: string[]) =>
    ipcRenderer.invoke('music:addTracksToUserPlaylist', playlistId, trackPaths),
  removeTrackFromUserPlaylist: (playlistId: string, trackPath: string) =>
    ipcRenderer.invoke('music:removeTrackFromUserPlaylist', playlistId, trackPath),
  reorderUserPlaylistTracks: (playlistId: string, trackIds: string[]) =>
    ipcRenderer.invoke('music:reorderUserPlaylistTracks', playlistId, trackIds),
  readLrcFile: (filePath: string) => ipcRenderer.invoke('music:read-lyrics', filePath),
  readAudioBuffer: (filePath: string, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('music:readAudioBuffer', filePath, startTime, endTime),
  extractPlaylistThumbnail: (playlistName: string) =>
    ipcRenderer.invoke('music:extractPlaylistThumbnail', playlistName),
  fetchMusixmatchLyrics: (title: string, artist: string, album?: string, duration?: number) =>
    ipcRenderer.invoke('music:fetchMusixmatchLyrics', title, artist, album, duration),
  fetchLrclibLyrics: (title: string, artist: string, album?: string, duration?: number) =>
    ipcRenderer.invoke('music:fetchLrclibLyrics', title, artist, album, duration),
  importLocalFiles: (targetFolder?: string, existingTracks?: any[]) =>
    ipcRenderer.invoke('music:importLocalFiles', targetFolder, existingTracks),
  onGlobalShortcut: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action)
    ipcRenderer.on('global-shortcut', handler)
    return () => ipcRenderer.removeListener('global-shortcut', handler)
  },
  getTrackCover: (filePath: string) => ipcRenderer.invoke('music:getTrackCover', filePath),
  getOriginalTrackCover: (filePath: string, size?: number) =>
    ipcRenderer.invoke('music:getOriginalTrackCover', filePath, size),
  getStreamPort: () => ipcRenderer.invoke('music:getStreamPort'),
  getStreamPortSync: () => ipcRenderer.sendSync('music:getStreamPortSync'),
  checkLocalAudioFile: (filePath: string) =>
    ipcRenderer.invoke('music:checkLocalAudioFile', filePath),
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  updateTrayConfig: (config: any) => ipcRenderer.invoke('music:updateTrayConfig', config),
  toggleMiniPlayer: (isMini: boolean) => ipcRenderer.invoke('music:toggleMiniPlayer', isMini),
  createPlaylist: (playlistName: string) =>
    ipcRenderer.invoke('music:createPlaylist', playlistName),
  deletePlaylist: (playlistName: string) =>
    ipcRenderer.invoke('music:deletePlaylist', playlistName),
  deleteTrack: (trackPath: string | string[], deletePermanently?: boolean) =>
    ipcRenderer.invoke('music:deleteTrack', trackPath, deletePermanently),
  deleteTracks: (trackPaths: string[], deletePermanently?: boolean) =>
    ipcRenderer.invoke('music:deleteTrack', trackPaths, deletePermanently),
  showInFolder: (filePath: string) => ipcRenderer.invoke('music:showInFolder', filePath),
  addTrackToPlaylist: (playlistName: string, trackPath: string) =>
    ipcRenderer.invoke('music:addTrackToPlaylist', playlistName, trackPath),
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

  // BASS & Bit-Perfect Audio API (WASAPI & ASIO + DSD Native)
  bassPlay: (
    url: string,
    deviceIdOrCrossfade?: any,
    exclusive?: boolean,
    startTime?: number,
    endTime?: number
  ) => ipcRenderer.invoke('bass:play', url, deviceIdOrCrossfade, exclusive, startTime, endTime),
  bassSetGapless: (enabled: boolean) => ipcRenderer.invoke('bass:setGapless', enabled),
  bassPreloadNext: (filePath: string, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('bass:preloadNext', filePath, startTime, endTime),
  bassResume: () => ipcRenderer.invoke('bass:resume'),
  bassPause: () => ipcRenderer.invoke('bass:pause'),
  bassStop: () => ipcRenderer.invoke('bass:stop'),
  bassSeek: (pos: number, mode: 'relative' | 'absolute' = 'absolute') =>
    ipcRenderer.invoke('bass:seek', pos, mode),
  bassSetVolume: (vol: number) => ipcRenderer.invoke('bass:setVolume', vol),
  bassSetEqualizer: (bands: any[], preamp?: number) =>
    ipcRenderer.invoke('bass:setEqualizer', bands, preamp),
  setBitPerfect: (val: boolean, currentVol?: number, outputType?: 'wasapi' | 'asio') =>
    ipcRenderer.invoke('bass:setBitPerfect', val, currentVol, outputType),
  setBassBitPerfect: (val: boolean, currentVol?: number, outputType?: 'wasapi' | 'asio') =>
    ipcRenderer.invoke('bass:setBitPerfect', val, currentVol, outputType),
  setBitPerfectOutputType: (type: 'wasapi' | 'asio') =>
    ipcRenderer.invoke('bass:setOutputType', type),
  setAudioDevice: (deviceId: string) => ipcRenderer.invoke('music:setAudioDevice', deviceId),
  getAudioDevices: (type?: 'wasapi' | 'asio') => ipcRenderer.invoke('music:getAudioDevices', type),

  onBassTime: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('bass:time', handler)
    return () => ipcRenderer.removeListener('bass:time', handler)
  },
  onBassDuration: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('bass:duration', handler)
    return () => ipcRenderer.removeListener('bass:duration', handler)
  },
  onBassPaused: (callback: (val: boolean) => void) => {
    const handler = (_e: any, val: boolean) => callback(val)
    ipcRenderer.on('bass:paused', handler)
    return () => ipcRenderer.removeListener('bass:paused', handler)
  },
  onBassEnded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('bass:ended', handler)
    return () => ipcRenderer.removeListener('bass:ended', handler)
  },
  onBassError: (callback: (err: string) => void) => {
    const handler = (_e: any, err: string) => callback(err)
    ipcRenderer.on('bass:error', handler)
    return () => ipcRenderer.removeListener('bass:error', handler)
  },
  onBassAudioParams: (callback: (params: any) => void) => {
    const handler = (_e: any, params: any) => callback(params)
    ipcRenderer.on('bass:audio-out-params', handler)
    return () => ipcRenderer.removeListener('bass:audio-out-params', handler)
  },
  onBassGaplessTransition: (callback: (data: { nextPath: string; nextInfo: any }) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('bass:gapless-transition', handler)
    return () => ipcRenderer.removeListener('bass:gapless-transition', handler)
  },

  // SQLite QoL & Library Features
  getWaveformPeaks: (filePath: string, numPeaks?: number, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('music:getWaveformPeaks', filePath, numPeaks, startTime, endTime),
  convertAudioTrack: (
    track: {
      filePath: string
      title?: string
      artist?: string
      album?: string
      startTime?: number
      endTime?: number
    },
    targetFormat: 'flac' | 'mp3' | 'wav'
  ) => ipcRenderer.invoke('music:convertAudioTrack', track, targetFormat),
  getFavorites: () => ipcRenderer.invoke('music:getFavorites'),
  toggleFavorite: (filePath: string, isFavorite?: boolean) =>
    ipcRenderer.invoke('music:toggleFavorite', filePath, isFavorite),
  getLyricOffsets: () => ipcRenderer.invoke('music:getLyricOffsets'),
  setLyricOffset: (filePath: string, offsetSec: number) =>
    ipcRenderer.invoke('music:setLyricOffset', filePath, offsetSec),
  getSmartPlaylists: () => ipcRenderer.invoke('music:getSmartPlaylists'),
  saveSmartPlaylist: (playlist: any) => ipcRenderer.invoke('music:saveSmartPlaylist', playlist),
  deleteSmartPlaylist: (id: string) => ipcRenderer.invoke('music:deleteSmartPlaylist', id),
  saveUserPlaylist: (playlist: any) => ipcRenderer.invoke('music:saveUserPlaylist', playlist),
  onLibraryFsChanged: (callback: (data: { eventType: string; filename: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('library:fs-changed', handler)
    return () => ipcRenderer.removeListener('library:fs-changed', handler)
  },

  // Legacy aliases
  mpvPlay: (url: string, crossfade?: number) => ipcRenderer.invoke('bass:play', url, crossfade),
  mpvResume: () => ipcRenderer.invoke('bass:resume'),
  mpvPause: () => ipcRenderer.invoke('bass:pause'),
  mpvStop: () => ipcRenderer.invoke('bass:stop'),
  mpvSeek: (pos: number, mode: 'relative' | 'absolute' = 'absolute') =>
    ipcRenderer.invoke('bass:seek', pos, mode),
  mpvSetVolume: (vol: number) => ipcRenderer.invoke('bass:setVolume', vol),
  mpvSetEqualizer: (bands: any[], preamp?: number) =>
    ipcRenderer.invoke('bass:setEqualizer', bands, preamp),
  onMpvTime: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('bass:time', handler)
    return () => ipcRenderer.removeListener('bass:time', handler)
  },
  onMpvDuration: (callback: (val: number) => void) => {
    const handler = (_e: any, val: number) => callback(val)
    ipcRenderer.on('bass:duration', handler)
    return () => ipcRenderer.removeListener('bass:duration', handler)
  },
  onMpvPaused: (callback: (val: boolean) => void) => {
    const handler = (_e: any, val: boolean) => callback(val)
    ipcRenderer.on('bass:paused', handler)
    return () => ipcRenderer.removeListener('bass:paused', handler)
  },
  onMpvEnded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('bass:ended', handler)
    return () => ipcRenderer.removeListener('bass:ended', handler)
  },
  onMpvError: (callback: (err: string) => void) => {
    const handler = (_e: any, err: string) => callback(err)
    ipcRenderer.on('bass:error', handler)
    return () => ipcRenderer.removeListener('bass:error', handler)
  },
  onMpvAudioParams: (callback: (params: any) => void) => {
    const handler = (_e: any, params: any) => callback(params)
    ipcRenderer.on('bass:audio-out-params', handler)
    return () => ipcRenderer.removeListener('bass:audio-out-params', handler)
  },
  getThemeColorsCache: () => ipcRenderer.invoke('music:getThemeColorsCache'),
  cacheThemeColors: (trackPath: string, colors: any) =>
    ipcRenderer.invoke('music:cacheThemeColors', trackPath, colors),
  clearMemoryCache: () => ipcRenderer.invoke('app:clearMemoryCache'),
  clearWebFrameCache: () => {
    try {
      webFrame.clearCache()
    } catch (_) {}
  },
  forceRendererGC: () => {
    try {
      if (typeof (globalThis as any).gc === 'function') {
        ;(globalThis as any).gc()
      }
    } catch (_) {}
  },
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
  discordUpdatePresence: (payload: any) => ipcRenderer.invoke('discord:updatePresence', payload),
  discordClearPresence: () => ipcRenderer.invoke('discord:clearPresence'),
  discordUpdateConfig: (config: any) => ipcRenderer.invoke('discord:updateConfig', config),
  discordGetStatus: () => ipcRenderer.invoke('discord:getStatus'),

  // Soulseek Lossless Download Engine
  soulseekLogin: (credentials: { user: string; pass: string; remember?: boolean }) =>
    ipcRenderer.invoke('soulseek:login', credentials),
  soulseekLogout: () => ipcRenderer.invoke('soulseek:logout'),
  soulseekGetStatus: () => ipcRenderer.invoke('soulseek:getStatus'),
  soulseekSearch: (query: string, timeout?: number) =>
    ipcRenderer.invoke('soulseek:search', query, timeout),
  soulseekDownload: (item: any) => ipcRenderer.invoke('soulseek:download', item),
  soulseekCancelDownload: (id: string) => ipcRenderer.invoke('soulseek:cancelDownload', id),
  soulseekSelectDownloadFolder: () => ipcRenderer.invoke('soulseek:selectDownloadFolder'),
  soulseekSetDownloadFolder: (folder: string) =>
    ipcRenderer.invoke('soulseek:setDownloadFolder', folder),
  soulseekOpenDownloadFolder: () => ipcRenderer.invoke('soulseek:openDownloadFolder'),
  soulseekClearCompletedDownloads: (): Promise<any> =>
    ipcRenderer.invoke('soulseek:clearCompletedDownloads'),
  onSoulseekStatusChanged: (callback: (status: any) => void) => {
    const handler = (_event: any, status: any) => callback(status)
    ipcRenderer.on('soulseek:status-changed', handler)
    return () => ipcRenderer.removeListener('soulseek:status-changed', handler)
  },
  onSoulseekDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('soulseek:download-progress', handler)
    return () => ipcRenderer.removeListener('soulseek:download-progress', handler)
  },
  onSoulseekDownloadCompleted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('soulseek:download-completed', handler)
    return () => ipcRenderer.removeListener('soulseek:download-completed', handler)
  },

  // Analytics
  recordPlayEvent: (event: any) => ipcRenderer.invoke('music:recordPlayEvent', event),
  updatePlayEventDuration: (data: any) => ipcRenderer.invoke('music:updatePlayEventDuration', data),
  getAdvancedStats: (rangeDays?: number) => ipcRenderer.invoke('music:getAdvancedStats', rangeDays),

  // Auto-Updater
  updaterGetStatus: () => ipcRenderer.invoke('updater:getStatus'),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatusChanged: (callback: (status: any) => void) => {
    const handler = (_event: any, status: any) => callback(status)
    ipcRenderer.on('updater:status-changed', handler)
    return () => ipcRenderer.removeListener('updater:status-changed', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
