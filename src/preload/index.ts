import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Dữ liệu API tự chế của chúng ta (Custom API)
const api = {
  openMusicFolder: () => ipcRenderer.invoke('music:openFolder'),
  downloadCloudFile: (url: string, filename: string) => ipcRenderer.invoke('music:downloadCloudFile', url, filename),
  fetchDriveFiles: (folderId: string) => ipcRenderer.invoke('music:fetchDriveFiles', folderId),
  setLibraryFolder: () => ipcRenderer.invoke('music:setLibraryFolder'),
  getLibrary: () => ipcRenderer.invoke('music:getLibrary'),
  renamePlaylist: (oldName: string, newName: string) => ipcRenderer.invoke('music:renamePlaylist', oldName, newName),
  setPlaylistThumbnail: (playlistName: string) => ipcRenderer.invoke('music:setPlaylistThumbnail', playlistName),
  autoGeneratePlaylists: () => ipcRenderer.invoke('music:autoGeneratePlaylists')
}
// Kiểm tra bảo mật Isolation
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // Phơi bày api này ra Window Object của Trình duyệt (React)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (Bỏ qua lỗi TS trong môi trường không strict)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
