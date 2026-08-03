import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getConfig: () => ipcRenderer.invoke('music:getConfig'),
  saveConfig: (data: any) => ipcRenderer.invoke('music:saveConfig', data),
  
  updateTags: (filePath: string, tags: any, imagePath: string | null) => ipcRenderer.invoke('music:updateTags', filePath, tags, imagePath),
  selectImageFile: () => ipcRenderer.invoke('music:selectImageFile'),

  openMusicFolder: () => ipcRenderer.invoke('music:openFolder'),
  downloadCloudFile: (url: string, filename: string) => ipcRenderer.invoke('music:downloadCloudFile', url, filename),
  fetchDriveFiles: (folderId: string) => ipcRenderer.invoke('music:fetchDriveFiles', folderId),
  setLibraryFolder: () => ipcRenderer.invoke('music:setLibraryFolder'),
  getLibrary: () => ipcRenderer.invoke('music:getLibrary'),
  renamePlaylist: (oldName: string, newName: string) => ipcRenderer.invoke('music:renamePlaylist', oldName, newName),
  setPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:setPlaylistThumbnail', playlistName),
  autoGeneratePlaylists: () => ipcRenderer.invoke('music:autoGeneratePlaylists'),
  readLrcFile: (filePath: string) => ipcRenderer.invoke('music:read-lyrics', filePath),
  extractPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:extractPlaylistThumbnail', playlistName),
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