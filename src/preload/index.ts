import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  getLibrary: (forceRefresh?: boolean) => ipcRenderer.invoke('music:getLibrary', forceRefresh),
  renamePlaylist: (oldName: string, newName: string) => ipcRenderer.invoke('music:renamePlaylist', oldName, newName),
  setPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:setPlaylistThumbnail', playlistName),
  autoGeneratePlaylists: () => ipcRenderer.invoke('music:autoGeneratePlaylists'),
  readLrcFile: (filePath: string) => ipcRenderer.invoke('music:read-lyrics', filePath),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('music:readAudioBuffer', filePath),
  extractPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:extractPlaylistThumbnail', playlistName),
  fetchMusixmatchLyrics: (title: string, artist: string) => ipcRenderer.invoke('music:fetchMusixmatchLyrics', title, artist),
  importLocalFiles: (targetFolder?: string, existingTracks?: any[]) => ipcRenderer.invoke('music:importLocalFiles', targetFolder, existingTracks),
  onGlobalShortcut: (callback: (action: string) => void) => {
    ipcRenderer.removeAllListeners('global-shortcut') // Dọn dẹp để tránh trùng lặp sự kiện
    ipcRenderer.on('global-shortcut', (_event, action) => callback(action))
  },
  getTrackCover: (filePath: string) => ipcRenderer.invoke('music:getTrackCover', filePath),
  getOriginalTrackCover: (filePath: string) => ipcRenderer.invoke('music:getOriginalTrackCover', filePath),
  onDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.on('download-progress', (_event, data) => callback(data))
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
    ipcRenderer.removeAllListeners('mpv:time')
    ipcRenderer.on('mpv:time', (_e, val) => callback(val))
  },
  onMpvDuration: (callback: (val: number) => void) => {
    ipcRenderer.removeAllListeners('mpv:duration')
    ipcRenderer.on('mpv:duration', (_e, val) => callback(val))
  },
  onMpvPaused: (callback: (val: boolean) => void) => {
    ipcRenderer.removeAllListeners('mpv:paused')
    ipcRenderer.on('mpv:paused', (_e, val) => callback(val))
  },
  onMpvEnded: (callback: () => void) => {
    ipcRenderer.removeAllListeners('mpv:ended')
    ipcRenderer.on('mpv:ended', () => callback())
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) { console.error(error) }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}