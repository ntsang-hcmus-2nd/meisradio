import { create } from 'zustand'

export interface SettingsState {
  appMode: 'default' | 'lite' | 'core'
  customBgImage: string | null
  useTrackCoverAsBg: boolean
  bgImageInput: string
  customBgOpacity: number
  customBgBlur: number
  isReloading: boolean
  isConfigLoaded: boolean
  streamPort: number

  minimizeToTray: boolean
  closeToTray: boolean

  // Discord Rich Presence States
  discordRpcEnabled: boolean
  discordClientId: string
  discordShowDetails: boolean
  discordShowTime: boolean
  discordShowCover: boolean
  discordShowQuality: boolean
  discordShowButtons: boolean
  discordShowIdle: boolean
  discordConnected: boolean

  // Google Drive & Cloud States
  googleDriveApiKey: string
  driveLink: string
  isFetchingDrive: boolean
  driveFiles: any[]
  cloudActionTrack: any | null
  isDownloading: boolean
  downloadProgress: { current: number; total: number; fileName: string } | null

  // Actions
  setAppMode: (mode: 'default' | 'lite' | 'core' | ((prev: 'default' | 'lite' | 'core') => 'default' | 'lite' | 'core')) => void
  setCustomBgImage: (img: string | null | ((prev: string | null) => string | null)) => void
  setUseTrackCoverAsBg: (use: boolean | ((prev: boolean) => boolean)) => void
  setBgImageInput: (input: string | ((prev: string) => string)) => void
  setCustomBgOpacity: (opacity: number | ((prev: number) => number)) => void
  setCustomBgBlur: (blur: number | ((prev: number) => number)) => void
  setIsReloading: (reloading: boolean | ((prev: boolean) => boolean)) => void
  setIsConfigLoaded: (loaded: boolean | ((prev: boolean) => boolean)) => void
  setStreamPort: (port: number | ((prev: number) => number)) => void

  setMinimizeToTray: (minimize: boolean | ((prev: boolean) => boolean)) => void
  setCloseToTray: (close: boolean | ((prev: boolean) => boolean)) => void

  setDiscordRpcEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setDiscordClientId: (id: string | ((prev: string) => string)) => void
  setDiscordShowDetails: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordShowTime: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordShowCover: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordShowQuality: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordShowButtons: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordShowIdle: (show: boolean | ((prev: boolean) => boolean)) => void
  setDiscordConnected: (connected: boolean | ((prev: boolean) => boolean)) => void

  setGoogleDriveApiKey: (key: string | ((prev: string) => string)) => void
  setDriveLink: (link: string | ((prev: string) => string)) => void
  setIsFetchingDrive: (fetching: boolean | ((prev: boolean) => boolean)) => void
  setDriveFiles: (files: any[] | ((prev: any[]) => any[])) => void
  setCloudActionTrack: (track: any | null | ((prev: any) => any)) => void
  setIsDownloading: (downloading: boolean | ((prev: boolean) => boolean)) => void
  setDownloadProgress: (progress: { current: number; total: number; fileName: string } | null | ((prev: any) => any)) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

export const useSettingsStore = create<SettingsState>((set) => ({
  appMode: 'default',
  customBgImage: null,
  useTrackCoverAsBg: false,
  bgImageInput: '',
  customBgOpacity: 1,
  customBgBlur: 0,
  isReloading: false,
  isConfigLoaded: false,
  streamPort: 0,

  minimizeToTray: false,
  closeToTray: false,

  discordRpcEnabled: true,
  discordClientId: '1539993441851670589',
  discordShowDetails: true,
  discordShowTime: true,
  discordShowCover: true,
  discordShowQuality: true,
  discordShowButtons: true,
  discordShowIdle: true,
  discordConnected: false,

  googleDriveApiKey: '',
  driveLink: '',
  isFetchingDrive: false,
  driveFiles: [],
  cloudActionTrack: null,
  isDownloading: false,
  downloadProgress: null,

  setAppMode: (valOrFn) => set((s) => {
    const next = resolveVal(valOrFn, s.appMode)
    try { document.documentElement.setAttribute('data-mode', next) } catch {}
    return { appMode: next }
  }),
  setCustomBgImage: (valOrFn) => set((s) => ({ customBgImage: resolveVal(valOrFn, s.customBgImage) })),
  setUseTrackCoverAsBg: (valOrFn) => set((s) => ({ useTrackCoverAsBg: resolveVal(valOrFn, s.useTrackCoverAsBg) })),
  setBgImageInput: (valOrFn) => set((s) => ({ bgImageInput: resolveVal(valOrFn, s.bgImageInput) })),
  setCustomBgOpacity: (valOrFn) => set((s) => ({ customBgOpacity: resolveVal(valOrFn, s.customBgOpacity) })),
  setCustomBgBlur: (valOrFn) => set((s) => ({ customBgBlur: resolveVal(valOrFn, s.customBgBlur) })),
  setIsReloading: (valOrFn) => set((s) => ({ isReloading: resolveVal(valOrFn, s.isReloading) })),
  setIsConfigLoaded: (valOrFn) => set((s) => ({ isConfigLoaded: resolveVal(valOrFn, s.isConfigLoaded) })),
  setStreamPort: (valOrFn) => set((s) => ({ streamPort: resolveVal(valOrFn, s.streamPort) })),

  setMinimizeToTray: (valOrFn) => set((s) => ({ minimizeToTray: resolveVal(valOrFn, s.minimizeToTray) })),
  setCloseToTray: (valOrFn) => set((s) => ({ closeToTray: resolveVal(valOrFn, s.closeToTray) })),

  setDiscordRpcEnabled: (valOrFn) => set((s) => ({ discordRpcEnabled: resolveVal(valOrFn, s.discordRpcEnabled) })),
  setDiscordClientId: (valOrFn) => set((s) => ({ discordClientId: resolveVal(valOrFn, s.discordClientId) })),
  setDiscordShowDetails: (valOrFn) => set((s) => ({ discordShowDetails: resolveVal(valOrFn, s.discordShowDetails) })),
  setDiscordShowTime: (valOrFn) => set((s) => ({ discordShowTime: resolveVal(valOrFn, s.discordShowTime) })),
  setDiscordShowCover: (valOrFn) => set((s) => ({ discordShowCover: resolveVal(valOrFn, s.discordShowCover) })),
  setDiscordShowQuality: (valOrFn) => set((s) => ({ discordShowQuality: resolveVal(valOrFn, s.discordShowQuality) })),
  setDiscordShowButtons: (valOrFn) => set((s) => ({ discordShowButtons: resolveVal(valOrFn, s.discordShowButtons) })),
  setDiscordShowIdle: (valOrFn) => set((s) => ({ discordShowIdle: resolveVal(valOrFn, s.discordShowIdle) })),
  setDiscordConnected: (valOrFn) => set((s) => ({ discordConnected: resolveVal(valOrFn, s.discordConnected) })),

  setGoogleDriveApiKey: (valOrFn) => set((s) => ({ googleDriveApiKey: resolveVal(valOrFn, s.googleDriveApiKey) })),
  setDriveLink: (valOrFn) => set((s) => ({ driveLink: resolveVal(valOrFn, s.driveLink) })),
  setIsFetchingDrive: (valOrFn) => set((s) => ({ isFetchingDrive: resolveVal(valOrFn, s.isFetchingDrive) })),
  setDriveFiles: (valOrFn) => set((s) => ({ driveFiles: resolveVal(valOrFn, s.driveFiles) })),
  setCloudActionTrack: (valOrFn) => set((s) => ({ cloudActionTrack: resolveVal(valOrFn, s.cloudActionTrack) })),
  setIsDownloading: (valOrFn) => set((s) => ({ isDownloading: resolveVal(valOrFn, s.isDownloading) })),
  setDownloadProgress: (valOrFn) => set((s) => ({ downloadProgress: resolveVal(valOrFn, s.downloadProgress) }))
}))
