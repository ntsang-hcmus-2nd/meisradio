import { create } from 'zustand'
import { setGlobalStreamPort } from '../utils/urlUtils'

export interface SettingsState {
  appMode: 'default' | 'lite' | 'core'
  uiStyle: 'classic' | 'sleek'
  customBgImage: string | null
  useTrackCoverAsBg: boolean
  accentColorMode: 'track' | 'background' | 'custom'
  customAccentColor: string
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
  loudnessNormalization: boolean
  replayGainMode: 'off' | 'track' | 'album'
  crossfeedEnabled: boolean
  gaplessEnabled: boolean
  waveformSeekbarEnabled: boolean
  colorScheme: 'dark' | 'light'
  sidebarBgEnabled: boolean
  sidebarBgOpacity: number

  // Actions
  setAppMode: (
    mode:
      | 'default'
      | 'lite'
      | 'core'
      | ((prev: 'default' | 'lite' | 'core') => 'default' | 'lite' | 'core')
  ) => void
  setUiStyle: (
    style: 'classic' | 'sleek' | ((prev: 'classic' | 'sleek') => 'classic' | 'sleek')
  ) => void
  setCustomBgImage: (img: string | null | ((prev: string | null) => string | null)) => void
  setUseTrackCoverAsBg: (use: boolean | ((prev: boolean) => boolean)) => void
  setAccentColorMode: (
    mode:
      | 'track'
      | 'background'
      | 'custom'
      | ((prev: 'track' | 'background' | 'custom') => 'track' | 'background' | 'custom')
  ) => void
  setCustomAccentColor: (color: string | ((prev: string) => string)) => void
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
  setDownloadProgress: (
    progress: { current: number; total: number; fileName: string } | null | ((prev: any) => any)
  ) => void
  setLoudnessNormalization: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setReplayGainMode: (
    mode:
      'off' | 'track' | 'album' | ((prev: 'off' | 'track' | 'album') => 'off' | 'track' | 'album')
  ) => void
  setCrossfeedEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setGaplessEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setWaveformSeekbarEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setColorScheme: (
    scheme: 'dark' | 'light' | ((prev: 'dark' | 'light') => 'dark' | 'light')
  ) => void
  setSidebarBgEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setSidebarBgOpacity: (opacity: number | ((prev: number) => number)) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

const getInitialLoudnessNorm = (): boolean => {
  try {
    return localStorage.getItem('meis_loudness_norm') === 'true'
  } catch {
    return false
  }
}

const getInitialReplayGainMode = (): 'off' | 'track' | 'album' => {
  try {
    const saved = localStorage.getItem('meis_replaygain_mode')
    if (saved === 'off' || saved === 'track' || saved === 'album') return saved
  } catch {
    /* ignore */
  }
  return 'off'
}

const getInitialCrossfeedEnabled = (): boolean => {
  try {
    return localStorage.getItem('meis_crossfeed_enabled') === 'true'
  } catch {
    return false
  }
}

const getInitialGaplessEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem('meis_gapless_enabled')
    if (saved !== null) return saved === 'true'
  } catch {
    /* ignore */
  }
  return true
}

const getInitialWaveformSeekbarEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem('meis_waveform_seekbar_enabled')
    if (saved !== null) return saved === 'true'
  } catch {
    /* ignore */
  }
  return true
}

const getInitialStreamPort = (): number => {
  try {
    if (typeof window !== 'undefined' && (window as any).api?.getStreamPortSync) {
      return (window as any).api.getStreamPortSync() || 0
    }
  } catch {
    /* ignore */
  }
  return 0
}

const getInitialUiStyle = (): 'classic' | 'sleek' => {
  try {
    const saved = localStorage.getItem('meis_ui_style')
    if (saved === 'classic' || saved === 'sleek') return saved
  } catch {
    /* ignore */
  }
  return 'classic'
}

const getInitialAccentColorMode = (): 'track' | 'background' | 'custom' => {
  try {
    const saved = localStorage.getItem('meis_accent_color_mode')
    if (saved === 'track' || saved === 'background' || saved === 'custom') return saved
  } catch {
    /* ignore */
  }
  return 'track'
}

const getInitialCustomAccentColor = (): string => {
  try {
    const saved = localStorage.getItem('meis_custom_accent_color')
    if (saved && /^#[0-9a-fA-F]{3,6}$/.test(saved)) return saved
  } catch {
    /* ignore */
  }
  return '#10b981'
}

const getInitialColorScheme = (): 'dark' | 'light' => {
  try {
    if (localStorage.getItem('meis_color_scheme') === 'light') return 'light'
  } catch {
    /* ignore */
  }
  return 'dark'
}

const getInitialSidebarBgEnabled = (): boolean => {
  try {
    return localStorage.getItem('meis_sidebar_bg_enabled') !== 'false'
  } catch {
    return true
  }
}

const getInitialSidebarBgOpacity = (): number => {
  try {
    const saved = localStorage.getItem('meis_sidebar_bg_opacity')
    if (saved !== null) {
      const v = parseFloat(saved)
      if (!isNaN(v)) return Math.min(1, Math.max(0, v))
    }
  } catch {
    /* ignore */
  }
  return 0.8
}

// Thiết lập ngay thuộc tính data-ui-style và màu accent lên thẻ html để tránh nhấp nháy giao diện
try {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-style', getInitialUiStyle())
    document.documentElement.setAttribute('data-theme', getInitialColorScheme())
    const savedMode = localStorage.getItem('meis_accent_color_mode')
    const savedColor = localStorage.getItem('meis_custom_accent_color')
    if (savedMode === 'custom' && savedColor) {
      document.documentElement.style.setProperty('--theme-10', savedColor)
    }
  }
} catch {
  /* ignore */
}

export const useSettingsStore = create<SettingsState>((set) => ({
  appMode: 'default',
  uiStyle: getInitialUiStyle(),
  customBgImage: null,
  useTrackCoverAsBg: false,
  accentColorMode: getInitialAccentColorMode(),
  customAccentColor: getInitialCustomAccentColor(),
  bgImageInput: '',
  customBgOpacity: 1,
  customBgBlur: 0,
  isReloading: false,
  isConfigLoaded: false,
  streamPort: getInitialStreamPort(),

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
  loudnessNormalization: getInitialLoudnessNorm(),
  replayGainMode: getInitialReplayGainMode(),
  crossfeedEnabled: getInitialCrossfeedEnabled(),
  gaplessEnabled: getInitialGaplessEnabled(),
  waveformSeekbarEnabled: getInitialWaveformSeekbarEnabled(),
  colorScheme: getInitialColorScheme(),
  sidebarBgEnabled: getInitialSidebarBgEnabled(),
  sidebarBgOpacity: getInitialSidebarBgOpacity(),

  setAppMode: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.appMode)
      try {
        document.documentElement.setAttribute('data-mode', next)
      } catch {
        /* ignore */
      }
      return { appMode: next }
    }),
  setUiStyle: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.uiStyle)
      try {
        document.documentElement.setAttribute('data-ui-style', next)
        localStorage.setItem('meis_ui_style', next)
      } catch {
        /* ignore */
      }
      return { uiStyle: next }
    }),
  setCustomBgImage: (valOrFn) =>
    set((s) => ({ customBgImage: resolveVal(valOrFn, s.customBgImage) })),
  setUseTrackCoverAsBg: (valOrFn) =>
    set((s) => ({ useTrackCoverAsBg: resolveVal(valOrFn, s.useTrackCoverAsBg) })),
  setAccentColorMode: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.accentColorMode)
      try {
        localStorage.setItem('meis_accent_color_mode', next)
      } catch {
        /* ignore */
      }
      return { accentColorMode: next }
    }),
  setCustomAccentColor: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.customAccentColor)
      try {
        localStorage.setItem('meis_custom_accent_color', next)
      } catch {
        /* ignore */
      }
      return { customAccentColor: next }
    }),
  setBgImageInput: (valOrFn) => set((s) => ({ bgImageInput: resolveVal(valOrFn, s.bgImageInput) })),
  setCustomBgOpacity: (valOrFn) =>
    set((s) => ({ customBgOpacity: resolveVal(valOrFn, s.customBgOpacity) })),
  setCustomBgBlur: (valOrFn) => set((s) => ({ customBgBlur: resolveVal(valOrFn, s.customBgBlur) })),
  setIsReloading: (valOrFn) => set((s) => ({ isReloading: resolveVal(valOrFn, s.isReloading) })),
  setIsConfigLoaded: (valOrFn) =>
    set((s) => ({ isConfigLoaded: resolveVal(valOrFn, s.isConfigLoaded) })),
  setStreamPort: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.streamPort)
      if (next > 0) setGlobalStreamPort(next)
      return { streamPort: next }
    }),

  setMinimizeToTray: (valOrFn) =>
    set((s) => ({ minimizeToTray: resolveVal(valOrFn, s.minimizeToTray) })),
  setCloseToTray: (valOrFn) => set((s) => ({ closeToTray: resolveVal(valOrFn, s.closeToTray) })),

  setDiscordRpcEnabled: (valOrFn) =>
    set((s) => ({ discordRpcEnabled: resolveVal(valOrFn, s.discordRpcEnabled) })),
  setDiscordClientId: (valOrFn) =>
    set((s) => ({ discordClientId: resolveVal(valOrFn, s.discordClientId) })),
  setDiscordShowDetails: (valOrFn) =>
    set((s) => ({ discordShowDetails: resolveVal(valOrFn, s.discordShowDetails) })),
  setDiscordShowTime: (valOrFn) =>
    set((s) => ({ discordShowTime: resolveVal(valOrFn, s.discordShowTime) })),
  setDiscordShowCover: (valOrFn) =>
    set((s) => ({ discordShowCover: resolveVal(valOrFn, s.discordShowCover) })),
  setDiscordShowQuality: (valOrFn) =>
    set((s) => ({ discordShowQuality: resolveVal(valOrFn, s.discordShowQuality) })),
  setDiscordShowButtons: (valOrFn) =>
    set((s) => ({ discordShowButtons: resolveVal(valOrFn, s.discordShowButtons) })),
  setDiscordShowIdle: (valOrFn) =>
    set((s) => ({ discordShowIdle: resolveVal(valOrFn, s.discordShowIdle) })),
  setDiscordConnected: (valOrFn) =>
    set((s) => ({ discordConnected: resolveVal(valOrFn, s.discordConnected) })),

  setGoogleDriveApiKey: (valOrFn) =>
    set((s) => ({ googleDriveApiKey: resolveVal(valOrFn, s.googleDriveApiKey) })),
  setDriveLink: (valOrFn) => set((s) => ({ driveLink: resolveVal(valOrFn, s.driveLink) })),
  setIsFetchingDrive: (valOrFn) =>
    set((s) => ({ isFetchingDrive: resolveVal(valOrFn, s.isFetchingDrive) })),
  setDriveFiles: (valOrFn) => set((s) => ({ driveFiles: resolveVal(valOrFn, s.driveFiles) })),
  setCloudActionTrack: (valOrFn) =>
    set((s) => ({ cloudActionTrack: resolveVal(valOrFn, s.cloudActionTrack) })),
  setIsDownloading: (valOrFn) =>
    set((s) => ({ isDownloading: resolveVal(valOrFn, s.isDownloading) })),
  setDownloadProgress: (valOrFn) =>
    set((s) => ({ downloadProgress: resolveVal(valOrFn, s.downloadProgress) })),
  setLoudnessNormalization: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.loudnessNormalization)
      try {
        localStorage.setItem('meis_loudness_norm', String(next))
      } catch {
        /* ignore */
      }
      return { loudnessNormalization: next }
    }),
  setReplayGainMode: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.replayGainMode)
      try {
        localStorage.setItem('meis_replaygain_mode', next)
      } catch {
        /* ignore */
      }
      return { replayGainMode: next }
    }),
  setCrossfeedEnabled: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.crossfeedEnabled)
      try {
        localStorage.setItem('meis_crossfeed_enabled', String(next))
      } catch {
        /* ignore */
      }
      return { crossfeedEnabled: next }
    }),
  setGaplessEnabled: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.gaplessEnabled)
      try {
        localStorage.setItem('meis_gapless_enabled', String(next))
      } catch {
        /* ignore */
      }
      return { gaplessEnabled: next }
    }),
  setWaveformSeekbarEnabled: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.waveformSeekbarEnabled)
      try {
        localStorage.setItem('meis_waveform_seekbar_enabled', String(next))
      } catch {
        /* ignore */
      }
      return { waveformSeekbarEnabled: next }
    }),
  setColorScheme: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.colorScheme)
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', next)
        }
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem('meis_color_scheme', next)
      } catch {
        /* ignore */
      }
      return { colorScheme: next }
    }),
  setSidebarBgEnabled: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.sidebarBgEnabled)
      try {
        localStorage.setItem('meis_sidebar_bg_enabled', String(next))
      } catch {
        /* ignore */
      }
      return { sidebarBgEnabled: next }
    }),
  setSidebarBgOpacity: (valOrFn) =>
    set((s) => {
      const next = resolveVal(valOrFn, s.sidebarBgOpacity)
      try {
        localStorage.setItem('meis_sidebar_bg_opacity', String(next))
      } catch {
        /* ignore */
      }
      return { sidebarBgOpacity: next }
    })
}))
