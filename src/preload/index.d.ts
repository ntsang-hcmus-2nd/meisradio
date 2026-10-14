import { ElectronAPI } from '@electron-toolkit/preload'

export interface MeisRadioApi {
  getConfig: () => Promise<any>
  saveConfig: (data: any) => Promise<any>
  updateTags: (filePath: string, tags: any, imagePath: string | null) => Promise<any>
  selectImageFile: () => Promise<string | null>
  openMusicFolder: () => Promise<any>
  downloadCloudFile: (url: string, filename: string, existingTracks?: any[]) => Promise<any>
  downloadMultipleFiles: (files: any[], existingTracks?: any[]) => Promise<any>
  fetchDriveFiles: (folderId: string) => Promise<any>
  setLibraryFolder: () => Promise<any>
  addLibraryFolder: () => Promise<any>
  removeLibraryFolder: (folderPath: string) => Promise<any>
  updateLibraryFolder: (oldPath: string) => Promise<any>
  getLibrary: (forceRefresh?: boolean, hardRescan?: boolean) => Promise<any>
  renamePlaylist: (oldName: string, newName: string) => Promise<any>
  setPlaylistThumbnail: (playlistName: string) => Promise<any>
  autoGeneratePlaylists: () => Promise<any>

  // User Playlists
  getUserPlaylists: () => Promise<any[]>
  createUserPlaylist: (name: string, description?: string, thumbnail?: string | null) => Promise<any>
  deleteUserPlaylist: (playlistId: string) => Promise<any>
  renameUserPlaylist: (playlistId: string, newName: string) => Promise<any>
  updateUserPlaylist: (
    playlistId: string,
    updates: { name?: string; description?: string; thumbnail?: string | null; customImagePath?: string }
  ) => Promise<any>
  pickImage: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; dataUrl?: string; previewUrl?: string }>
  setUserPlaylistThumbnail: (playlistId: string, customPath?: string) => Promise<any>
  addTracksToUserPlaylist: (playlistId: string, trackPaths: string[]) => Promise<any>
  removeTrackFromUserPlaylist: (playlistId: string, trackPath: string) => Promise<any>
  reorderUserPlaylistTracks: (playlistId: string, trackIds: string[]) => Promise<any>
  readLrcFile: (filePath: string) => Promise<string | null>
  readAudioBuffer: (filePath: string) => Promise<any>
  extractPlaylistThumbnail: (playlistName: string) => Promise<any>
  fetchMusixmatchLyrics: (title: string, artist: string, album?: string, duration?: number) => Promise<any>
  fetchLrclibLyrics: (title: string, artist: string, album?: string, duration?: number) => Promise<any>
  importLocalFiles: (targetFolder?: string, existingTracks?: any[]) => Promise<any>
  onGlobalShortcut: (callback: (action: string) => void) => () => void
  getTrackCover: (filePath: string) => Promise<any>
  getOriginalTrackCover: (filePath: string, size?: number) => Promise<any>
  getStreamPort: () => Promise<number>
  getStreamPortSync: () => number
  onDownloadProgress: (callback: (data: any) => void) => () => void
  updateTrayConfig: (config: any) => Promise<any>
  toggleMiniPlayer: (isMini: boolean) => Promise<any>
  createPlaylist: (playlistName: string) => Promise<any>
  deletePlaylist: (playlistName: string) => Promise<any>
  deleteTrack: (trackPath: string, deletePermanently?: boolean) => Promise<any>
  showInFolder: (filePath: string) => Promise<any>
  addTrackToPlaylist: (playlistName: string, trackPath: string) => Promise<any>
  forceGC: () => Promise<any>
  searchOnline: (query: string) => Promise<any>
  getStreamUrl: (track: any) => Promise<{ success: boolean; url?: string; error?: string }>
  downloadOnline: (track: any) => Promise<any>
  ytmLogin: () => Promise<any>
  ytmLogout: () => Promise<any>
  scLogin: () => Promise<any>
  scLogout: () => Promise<any>
  getScUser: () => Promise<any>
  getScDashboard: (genre?: string) => Promise<any>
  searchScOnline: (query: string) => Promise<any>
  getScPlaylist: (playlistId: string) => Promise<any>
  getHomeDashboard: () => Promise<any>
  logWatchHistory: (videoId: string) => Promise<any>
  getUpNext: (videoId: string) => Promise<any>
  getYtmPlaylist: (playlistId: string) => Promise<any>
  getYtmArtist: (artistId: string) => Promise<any>
  preloadStream: (targetId: string) => Promise<any>

  // BASS & Bit-Perfect Audio API (WASAPI & ASIO + DSD Native)
  mpvPlay: (url: string, crossfade: number) => Promise<any>
  mpvResume: () => Promise<any>
  mpvPause: () => Promise<any>
  mpvStop: () => Promise<any>
  mpvSeek: (pos: number, mode?: 'relative' | 'absolute') => Promise<any>
  mpvSetVolume: (vol: number) => Promise<any>
  mpvSetEqualizer: (bands: any[], preamp?: number) => Promise<any>
  setBitPerfect: (val: boolean, currentVol?: number, outputType?: 'wasapi' | 'asio') => Promise<any>
  setBitPerfectOutputType: (type: 'wasapi' | 'asio') => Promise<any>
  setAudioDevice: (deviceId: string) => Promise<any>
  getAudioDevices: (type?: 'wasapi' | 'asio') => Promise<{ name: string; description: string; type?: 'wasapi' | 'asio' }[]>

  bassPlay: (url: string, crossfade?: number) => Promise<any>
  bassResume: () => Promise<any>
  bassPause: () => Promise<any>
  bassStop: () => Promise<any>
  bassSeek: (pos: number, mode?: 'relative' | 'absolute') => Promise<any>
  bassSetVolume: (vol: number) => Promise<any>
  setBassBitPerfect: (val: boolean, currentVol?: number, outputType?: 'wasapi' | 'asio') => Promise<any>

  onMpvTime: (callback: (val: number) => void) => () => void
  onMpvDuration: (callback: (val: number) => void) => () => void
  onMpvPaused: (callback: (val: boolean) => void) => () => void
  onMpvEnded: (callback: () => void) => () => void
  onMpvError: (callback: (err: string) => void) => () => void
  onMpvAudioParams: (callback: (params: any) => void) => () => void
  onBassAudioParams: (callback: (params: any) => void) => () => void

  getThemeColorsCache: () => Promise<any>
  cacheThemeColors: (trackPath: string, colors: any) => Promise<any>
  clearMemoryCache: () => Promise<any>
  onDeepClean: (callback: () => void) => () => void
  onNavBack: (callback: () => void) => () => void
  onNavForward: (callback: () => void) => () => void
  discordUpdatePresence: (payload: any) => Promise<any>
  discordClearPresence: () => Promise<any>
  discordUpdateConfig: (config: any) => Promise<any>
  discordGetStatus: () => Promise<any>

  // Soulseek Lossless Download Engine
  soulseekLogin: (credentials: { user: string; pass: string; remember?: boolean }) => Promise<{ success: boolean; username?: string; error?: string }>
  soulseekLogout: () => Promise<{ success: boolean }>
  soulseekGetStatus: () => Promise<any>
  soulseekSearch: (query: string, timeout?: number) => Promise<{ success: boolean; results?: any[]; error?: string }>
  soulseekDownload: (item: any) => Promise<{ success: boolean; id?: string; error?: string }>
  soulseekCancelDownload: (id: string) => Promise<boolean>
  soulseekSelectDownloadFolder: () => Promise<string | null>
  soulseekSetDownloadFolder: (folder: string) => Promise<{ success: boolean }>
  soulseekOpenDownloadFolder: () => Promise<{ success: boolean }>
  onSoulseekStatusChanged: (callback: (status: any) => void) => () => void
  onSoulseekDownloadProgress: (callback: (data: any) => void) => () => void
  onSoulseekDownloadCompleted: (callback: (data: any) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MeisRadioApi
  }
}
