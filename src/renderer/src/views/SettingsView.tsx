import React, { useState, useEffect } from 'react'
import {
  Palette,
  LayoutTemplate,
  Sparkles,
  Disc,
  Image as ImageIcon,
  Check,
  Trash2,
  Folder,
  Edit2,
  FolderOpen,
  Plus,
  RefreshCw,
  Cpu,
  Leaf,
  Download,
  BarChart2,
  Shuffle
} from 'lucide-react'
import { CustomSelect } from '../components/CustomSelect'
import { extractRawFilePath } from '../utils/urlUtils'
import { isDsdTrack } from '../utils/formatUtils'
import { sliderToGain } from '../utils/audioUtils'
import {
  useSettingsStore,
  useAudioStore,
  useLibraryStore,
  useUIStore,
  usePlayerStore
} from '../stores'
import { useTranslation } from '../locales'

const PRESET_ACCENT_COLORS = [
  { name: 'Emerald', color: '#10b981' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Orange', color: '#f97316' }
]

export interface SettingsViewProps {
  handleUpdateLibraryFolder: (fPath: string) => void
  handleRemoveLibraryFolder: (fPath: string) => void
  handleAddLibraryFolder: () => void
  handleReloadLibrary: (reset?: boolean) => void
  showToast: (msg: string, type?: 'info' | 'error' | 'success') => void
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioCtxRef: React.MutableRefObject<AudioContext | null>
  pendingSeekTimeRef: React.MutableRefObject<number | null>
  resetWebAudioPipeline: () => Promise<void>
  setShowBackupModal: (show: boolean) => void
  setShowInsightsModal: (show: boolean) => void
  updaterStatus: any
  setUpdaterStatus: (fn: any) => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  handleUpdateLibraryFolder,
  handleRemoveLibraryFolder,
  handleAddLibraryFolder,
  handleReloadLibrary,
  showToast,
  audioRef,
  audioCtxRef,
  pendingSeekTimeRef,
  resetWebAudioPipeline,
  setShowBackupModal,
  setShowInsightsModal,
  updaterStatus,
  setUpdaterStatus
}) => {
  const { t, language, setLanguage } = useTranslation()
  const customBgImage = useSettingsStore((state) => state.customBgImage)
  const [bgImageInput, setBgImageInput] = useState(
    () => extractRawFilePath(customBgImage) || customBgImage || ''
  )

  useEffect(() => {
    if (customBgImage) {
      setBgImageInput(extractRawFilePath(customBgImage) || customBgImage)
    } else {
      setBgImageInput('')
    }
  }, [customBgImage])

  // Settings Store
  const uiStyle = useSettingsStore((state) => state.uiStyle)
  const setUiStyle = useSettingsStore((state) => state.setUiStyle)
  const colorScheme = useSettingsStore((state) => state.colorScheme)
  const setColorScheme = useSettingsStore((state) => state.setColorScheme)
  const sidebarBgEnabled = useSettingsStore((state) => state.sidebarBgEnabled)
  const setSidebarBgEnabled = useSettingsStore((state) => state.setSidebarBgEnabled)
  const sidebarBgOpacity = useSettingsStore((state) => state.sidebarBgOpacity)
  const setSidebarBgOpacity = useSettingsStore((state) => state.setSidebarBgOpacity)
  const appMode = useSettingsStore((state) => state.appMode)
  const setAppMode = useSettingsStore((state) => state.setAppMode)
  const isCore = appMode === 'core'

  const accentColorMode = useSettingsStore((state) => state.accentColorMode)
  const setAccentColorMode = useSettingsStore((state) => state.setAccentColorMode)
  const customAccentColor = useSettingsStore((state) => state.customAccentColor)
  const setCustomAccentColor = useSettingsStore((state) => state.setCustomAccentColor)
  const useTrackCoverAsBg = useSettingsStore((state) => state.useTrackCoverAsBg)
  const setUseTrackCoverAsBg = useSettingsStore((state) => state.setUseTrackCoverAsBg)
  const setCustomBgImage = useSettingsStore((state) => state.setCustomBgImage)
  const customBgOpacity = useSettingsStore((state) => state.customBgOpacity)
  const setCustomBgOpacity = useSettingsStore((state) => state.setCustomBgOpacity)
  const customBgBlur = useSettingsStore((state) => state.customBgBlur)
  const setCustomBgBlur = useSettingsStore((state) => state.setCustomBgBlur)
  const waveformSeekbarEnabled = useSettingsStore((state) => state.waveformSeekbarEnabled)
  const setWaveformSeekbarEnabled = useSettingsStore((state) => state.setWaveformSeekbarEnabled)
  const minimizeToTray = useSettingsStore((state) => state.minimizeToTray)
  const setMinimizeToTray = useSettingsStore((state) => state.setMinimizeToTray)
  const closeToTray = useSettingsStore((state) => state.closeToTray)
  const setCloseToTray = useSettingsStore((state) => state.setCloseToTray)
  const discordRpcEnabled = useSettingsStore((state) => state.discordRpcEnabled)
  const setDiscordRpcEnabled = useSettingsStore((state) => state.setDiscordRpcEnabled)
  const setDiscordClientId = useSettingsStore((state) => state.setDiscordClientId)
  const discordShowDetails = useSettingsStore((state) => state.discordShowDetails)
  const setDiscordShowDetails = useSettingsStore((state) => state.setDiscordShowDetails)
  const discordShowTime = useSettingsStore((state) => state.discordShowTime)
  const setDiscordShowTime = useSettingsStore((state) => state.setDiscordShowTime)
  const discordShowCover = useSettingsStore((state) => state.discordShowCover)
  const setDiscordShowCover = useSettingsStore((state) => state.setDiscordShowCover)
  const discordShowQuality = useSettingsStore((state) => state.discordShowQuality)
  const setDiscordShowQuality = useSettingsStore((state) => state.setDiscordShowQuality)
  const discordShowButtons = useSettingsStore((state) => state.discordShowButtons)
  const setDiscordShowButtons = useSettingsStore((state) => state.setDiscordShowButtons)
  const discordShowIdle = useSettingsStore((state) => state.discordShowIdle)
  const setDiscordShowIdle = useSettingsStore((state) => state.setDiscordShowIdle)
  const discordConnected = useSettingsStore((state) => state.discordConnected)
  const googleDriveApiKey = useSettingsStore((state) => state.googleDriveApiKey)
  const setGoogleDriveApiKey = useSettingsStore((state) => state.setGoogleDriveApiKey)
  const loudnessNormalization = useSettingsStore((state) => state.loudnessNormalization)
  const setLoudnessNormalization = useSettingsStore((state) => state.setLoudnessNormalization)
  const gaplessEnabled = useSettingsStore((state) => state.gaplessEnabled)
  const setGaplessEnabled = useSettingsStore((state) => state.setGaplessEnabled)
  const replayGainMode = useSettingsStore((state) => state.replayGainMode)
  const setReplayGainMode = useSettingsStore((state) => state.setReplayGainMode)
  const isReloading = useSettingsStore((state) => state.isReloading)

  // Audio Store
  const bitPerfectType = useAudioStore((state) => state.bitPerfectType)
  const setBitPerfectType = useAudioStore((state) => state.setBitPerfectType)
  const availableAudioDevices = useAudioStore((state) => state.availableAudioDevices)
  const safeAudioDevices = Array.isArray(availableAudioDevices) ? availableAudioDevices : []
  const setAvailableAudioDevices = useAudioStore((state) => state.setAvailableAudioDevices)
  const selectedDeviceId = useAudioStore((state) => state.selectedDeviceId)
  const setSelectedDeviceId = useAudioStore((state) => state.setSelectedDeviceId)

  // Player Store
  const bitPerfectEnabled = usePlayerStore((state) => state.bitPerfectEnabled)
  const setBitPerfectEnabled = usePlayerStore((state) => state.setBitPerfectEnabled)
  const setBassOutParams = usePlayerStore((state) => state.setBassOutParams)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying)
  const volume = usePlayerStore((state) => state.volume)

  // Library Store
  const libraryPaths = useLibraryStore((state) => state.libraryPaths)
  const libraryTracks = useLibraryStore((state) => state.libraryTracks)

  // UI Store
  const setShowVisualizer = useUIStore((state) => state.setShowVisualizer)
  const setShowLyricsPanel = useUIStore((state) => state.setShowLyricsPanel)
  const setIsLyricsMaximized = useUIStore((state) => state.setIsLyricsMaximized)
  const setShowEQ = useUIStore((state) => state.setShowEQ)
  const setActiveView = useUIStore((state) => state.setActiveView)

  const updateDiscordSettings = (
    updates: Partial<{
      enabled: boolean
      clientId: string
      showDetails: boolean
      showTime: boolean
      showCover: boolean
      showQuality: boolean
      showButtons: boolean
      showIdle: boolean
    }>
  ) => {
    if (updates.enabled !== undefined) setDiscordRpcEnabled(updates.enabled)
    if (updates.clientId !== undefined) setDiscordClientId(updates.clientId)
    if (updates.showDetails !== undefined) setDiscordShowDetails(updates.showDetails)
    if (updates.showTime !== undefined) setDiscordShowTime(updates.showTime)
    if (updates.showCover !== undefined) setDiscordShowCover(updates.showCover)
    if (updates.showQuality !== undefined) setDiscordShowQuality(updates.showQuality)
    if (updates.showButtons !== undefined) setDiscordShowButtons(updates.showButtons)
    if (updates.showIdle !== undefined) setDiscordShowIdle(updates.showIdle)

    if (window.api && (window.api as any).discordUpdateConfig) {
      ;(window.api as any).discordUpdateConfig(updates)
    }
  }

  return (
    <div className="w-full max-w-5xl space-y-6 pb-20">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white truncate flex items-center gap-3">
            <span>{t('settings.title')}</span>
          </h2>
        </div>
      </div>

      {/* ISLAND 1: CÁ NHÂN HÓA (PERSONALIZATION) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-white truncate">
              {t('settings.customBg.title')}
            </h3>
          </div>
        </div>

        {/* BẢNG CHỌN CHẾ ĐỘ HIỂN THỊ HỆ THỐNG: CLASSIC VS SLEEK */}
        <div className="pt-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-theme-10 mb-2.5">
            {t('settings.customBg.uiStyleTitle')}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. Chế độ Classic (Cổ điển) */}
            <div
              onClick={() => setUiStyle('classic')}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                uiStyle === 'classic'
                  ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-white flex items-center gap-2 text-sm">
                    <LayoutTemplate
                      size={16}
                      className={uiStyle === 'classic' ? 'text-theme-10' : 'text-zinc-400'}
                    />
                    {t('settings.customBg.classicMode')}
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${uiStyle === 'classic' ? 'border-theme-10 bg-theme-10/20' : 'border-zinc-700'}`}
                  >
                    {uiStyle === 'classic' && <div className="w-2 h-2 rounded-full bg-theme-10" />}
                  </div>
                </div>
              </div>

              {/* Minh họa trực quan Chế độ Classic */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                  {language === 'vi' ? 'Xem trước:' : 'Preview:'}
                </span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs border border-zinc-700/60">
                  <Shuffle size={12} className="text-theme-10" />
                  <span>{t('songsView.randomPlay')}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-theme-10/20 text-theme-10 text-xs border border-theme-10/30">
                  <Plus size={12} />
                  <span>{t('songsView.addMusic')}</span>
                </div>
              </div>
            </div>

            {/* 2. Chế độ Sleek (Tinh gọn) */}
            <div
              onClick={() => setUiStyle('sleek')}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                uiStyle === 'sleek'
                  ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-white flex items-center gap-2 text-sm">
                    <Sparkles
                      size={16}
                      className={uiStyle === 'sleek' ? 'text-theme-10' : 'text-zinc-400'}
                    />
                    {t('settings.customBg.sleekMode')}
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${uiStyle === 'sleek' ? 'border-theme-10 bg-theme-10/20' : 'border-zinc-700'}`}
                  >
                    {uiStyle === 'sleek' && <div className="w-2 h-2 rounded-full bg-theme-10" />}
                  </div>
                </div>
              </div>

              {/* Minh họa trực quan Chế độ Sleek */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                  {language === 'vi' ? 'Xem trước:' : 'Preview:'}
                </span>
                <div
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-zinc-200 text-xs border border-zinc-700/60"
                  title={t('songsView.randomPlay')}
                >
                  <Shuffle size={13} className="text-theme-10" />
                </div>
                <div
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-theme-10/20 text-theme-10 text-xs border border-theme-10/30"
                  title={t('songsView.addMusic')}
                >
                  <Plus size={13} />
                </div>
                <span className="text-[11px] text-emerald-400 font-medium ml-1">
                  {language === 'vi' ? '✓ Giữ nguyên tên bài hát' : '✓ Preserves song text'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CHỌN GIAO DIỆN SÁNG / TỐI (COLOR SCHEME) */}
        <div className="pt-4 border-t border-theme-30/40">
          <label className="block text-xs font-semibold uppercase tracking-wider text-theme-10 mb-2.5">
            {language === 'vi' ? 'Giao diện Sáng / Tối' : 'Color Scheme'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div
              onClick={() => setColorScheme('dark')}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                colorScheme === 'dark'
                  ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
              }`}
            >
              <span className="font-bold text-white text-sm">
                {language === 'vi' ? 'Chế độ Tối (Dark Mode)' : 'Dark Mode'}
              </span>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${colorScheme === 'dark' ? 'border-theme-10 bg-theme-10/20' : 'border-zinc-700'}`}
              >
                {colorScheme === 'dark' && <div className="w-2 h-2 rounded-full bg-theme-10" />}
              </div>
            </div>
            <div
              onClick={() => setColorScheme('light')}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                colorScheme === 'light'
                  ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
              }`}
            >
              <span className="font-bold text-white text-sm">
                {language === 'vi' ? 'Chế độ Sáng (Light Mode)' : 'Light Mode'}
              </span>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${colorScheme === 'light' ? 'border-theme-10 bg-theme-10/20' : 'border-zinc-700'}`}
              >
                {colorScheme === 'light' && <div className="w-2 h-2 rounded-full bg-theme-10" />}
              </div>
            </div>
          </div>
        </div>

        {/* TÙY CHỈNH HÌNH NỀN & MÀU SẮC */}
        <div className="pt-4 border-t border-theme-30/40">
          {isCore ? (
            <p className="text-xs text-zinc-400 italic bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
              {language === 'vi'
                ? 'Tính năng hình nền & giao diện màu sắc bị tắt hoàn toàn ở Chế độ tối giản để tối ưu hiệu năng.'
                : 'Background and dynamic theme are completely disabled in Core Mode for maximum performance.'}
            </p>
          ) : (
            <>
              {/* PHẦN 1: TÙY CHỌN MÀU ACCENT & CHỦ ĐẠO */}
              <div className="mb-5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-theme-10 mb-2.5">
                  {t('settings.customBg.accentTitle')}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1. Theo bài hát */}
                  <div
                    onClick={() => setAccentColorMode('track')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      accentColorMode === 'track'
                        ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white flex items-center gap-2 text-sm">
                        <Disc
                          size={16}
                          className={
                            accentColorMode === 'track' ? 'text-theme-10' : 'text-zinc-400'
                          }
                        />
                        {t('settings.customBg.accentTrack')}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          accentColorMode === 'track'
                            ? 'border-theme-10 bg-theme-10/20'
                            : 'border-zinc-700'
                        }`}
                      >
                        {accentColorMode === 'track' && (
                          <div className="w-2 h-2 rounded-full bg-theme-10" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. Theo hình nền */}
                  <div
                    onClick={() => setAccentColorMode('background')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      accentColorMode === 'background'
                        ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white flex items-center gap-2 text-sm">
                        <ImageIcon
                          size={16}
                          className={
                            accentColorMode === 'background' ? 'text-theme-10' : 'text-zinc-400'
                          }
                        />
                        {t('settings.customBg.accentBg')}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          accentColorMode === 'background'
                            ? 'border-theme-10 bg-theme-10/20'
                            : 'border-zinc-700'
                        }`}
                      >
                        {accentColorMode === 'background' && (
                          <div className="w-2 h-2 rounded-full bg-theme-10" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. Tùy chỉnh */}
                  <div
                    onClick={() => setAccentColorMode('custom')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      accentColorMode === 'custom'
                        ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white flex items-center gap-2 text-sm">
                        <Palette
                          size={16}
                          className={
                            accentColorMode === 'custom' ? 'text-theme-10' : 'text-zinc-400'
                          }
                        />
                        {t('settings.customBg.accentCustom')}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          accentColorMode === 'custom'
                            ? 'border-theme-10 bg-theme-10/20'
                            : 'border-zinc-700'
                        }`}
                      >
                        {accentColorMode === 'custom' && (
                          <div className="w-2 h-2 rounded-full bg-theme-10" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bảng chọn màu khi ở chế độ Tùy chỉnh */}
                {accentColorMode === 'custom' && (
                  <div className="mt-3.5 p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-wrap items-center gap-3">
                    {/* Các ô màu gợi ý nhanh */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_ACCENT_COLORS.map((preset) => {
                        const isSelected =
                          customAccentColor.toLowerCase() === preset.color.toLowerCase()
                        return (
                          <button
                            key={preset.color}
                            type="button"
                            onClick={() => setCustomAccentColor(preset.color)}
                            title={preset.name}
                            className={`w-7 h-7 rounded-full transition-transform cursor-pointer relative flex items-center justify-center ${
                              isSelected
                                ? 'scale-110 ring-2 ring-white shadow-md'
                                : 'hover:scale-105 opacity-80 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: preset.color }}
                          >
                            {isSelected && <Check size={14} className="text-white drop-shadow" />}
                          </button>
                        )
                      })}
                    </div>

                    {/* Hộp chọn màu tự do & mã HEX */}
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <div className="relative flex items-center">
                        <input
                          type="color"
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(customAccentColor)
                              ? customAccentColor
                              : '#10b981'
                          }
                          onChange={(e) => setCustomAccentColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                          title={t('settings.customBg.customColorPicker')}
                        />
                      </div>
                      <input
                        type="text"
                        value={customAccentColor}
                        onChange={(e) => {
                          const val = e.target.value
                          if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                            setCustomAccentColor(val)
                          }
                        }}
                        placeholder="#10b981"
                        maxLength={7}
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-200 uppercase focus:border-theme-10 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* PHẦN 2: HÌNH NỀN ỨNG DỤNG */}
              <div className="pt-4 border-t border-theme-30/40">
                <label className="block text-xs font-semibold uppercase tracking-wider text-theme-10 mb-2">
                  {t('settings.customBg.wallpaperTitle')}
                </label>
                {/* Checkbox tùy chọn dùng ảnh bìa bài hát */}
                <label className="flex items-center gap-3 cursor-pointer mb-4 select-none group w-fit">
                  <input
                    type="checkbox"
                    checked={useTrackCoverAsBg}
                    onChange={(e) => setUseTrackCoverAsBg(e.target.checked)}
                    className="w-4 h-4 accent-theme-10 rounded cursor-pointer"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-white transition">
                    {t('settings.customBg.useTrackCover')}
                  </span>
                </label>

                {/* Phần dán link & chọn file: Ẩn khi bật chế độ dùng ảnh bìa */}
                {!useTrackCoverAsBg && (
                  <div className="flex gap-2.5 sm:gap-3 items-center mb-4 flex-wrap">
                    <input
                      type="text"
                      value={bgImageInput}
                      onChange={(e) => setBgImageInput(e.target.value)}
                      placeholder={t('settings.customBg.placeholder')}
                      className="flex-1 min-w-[200px] bg-zinc-950 border border-zinc-700 rounded-xl p-2.5 text-sm text-zinc-300 focus:border-theme-10 outline-none"
                    />
                    <button
                      onClick={() => {
                        const trimmed = bgImageInput.trim()
                        if (trimmed) {
                          const cleanPath = extractRawFilePath(trimmed) || trimmed
                          setBgImageInput(cleanPath)
                          setCustomBgImage(cleanPath)
                          if (
                            !cleanPath.startsWith('http://') &&
                            !cleanPath.startsWith('https://')
                          ) {
                            // @ts-ignore
                            window.api?.registerDroppedFiles?.([cleanPath])
                          }
                        }
                      }}
                      className="sys-btn flex items-center gap-1.5 bg-theme-30 hover:bg-theme-10/20 text-white hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                      title={t('settings.customBg.applyLink')}
                    >
                      <Check size={15} />
                      <span className="btn-text">{t('settings.customBg.applyLink')}</span>
                    </button>
                    <button
                      onClick={async () => {
                        // @ts-ignore
                        const filePath = await window.api.selectImageFile()
                        if (filePath) {
                          setBgImageInput(filePath)
                          setCustomBgImage(filePath)
                          // @ts-ignore
                          window.api?.registerDroppedFiles?.([filePath])
                        }
                      }}
                      className="sys-btn flex items-center gap-1.5 bg-theme-10 hover:bg-theme-10/90 text-white px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer shadow-lg shadow-theme-10/20"
                      title={t('settings.customBg.chooseImage')}
                    >
                      <ImageIcon size={15} />
                      <span className="btn-text">{t('settings.customBg.chooseImage')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setCustomBgImage(null)
                        setBgImageInput('')
                      }}
                      className="sys-btn flex items-center gap-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
                      title={t('settings.customBg.removeBg')}
                    >
                      <Trash2 size={15} />
                      <span className="btn-text">{t('settings.customBg.removeBg')}</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-300 w-32">
                      {t('settings.customBg.opacity')}:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={customBgOpacity}
                      onChange={(e) => setCustomBgOpacity(parseFloat(e.target.value))}
                      onWheel={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const delta = e.deltaY < 0 ? 0.05 : -0.05
                        setCustomBgOpacity((prev) =>
                          Math.max(0, Math.min(1, Math.round((prev + delta) * 100) / 100))
                        )
                      }}
                      className="flex-1 accent-theme-10"
                    />
                    <span className="text-sm font-mono text-zinc-400 w-12 text-right">
                      {Math.round(customBgOpacity * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-300 w-32">
                      {t('settings.customBg.blur')}:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={customBgBlur}
                      onChange={(e) => setCustomBgBlur(parseInt(e.target.value))}
                      onWheel={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const delta = e.deltaY < 0 ? 2 : -2
                        setCustomBgBlur((prev) => Math.max(0, Math.min(100, prev + delta)))
                      }}
                      className="flex-1 accent-theme-10"
                    />
                    <span className="text-sm font-mono text-zinc-400 w-12 text-right">
                      {customBgBlur}px
                    </span>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={sidebarBgEnabled}
                      onChange={(e) => setSidebarBgEnabled(e.target.checked)}
                      className="w-4 h-4 accent-theme-10 rounded cursor-pointer"
                    />
                    <span className="text-sm text-zinc-300">
                      {language === 'vi'
                        ? 'Bật nền cho thanh bên (Sidebar)'
                        : 'Enable Sidebar Background'}
                    </span>
                  </label>
                  {sidebarBgEnabled && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-zinc-300 w-32">
                        {language === 'vi' ? 'Độ trong suốt thanh bên' : 'Sidebar Opacity'}:
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={sidebarBgOpacity}
                        onChange={(e) => setSidebarBgOpacity(parseFloat(e.target.value))}
                        onWheel={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const delta = e.deltaY < 0 ? 0.05 : -0.05
                          setSidebarBgOpacity((prev) =>
                            Math.max(0, Math.min(1, Math.round((prev + delta) * 100) / 100))
                          )
                        }}
                        className="flex-1 accent-theme-10"
                      />
                      <span className="text-sm font-mono text-zinc-400 w-12 text-right">
                        {Math.round(sidebarBgOpacity * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Thanh tiến trình dạng sóng âm (Waveform Seekbar Toggle) */}
          <div className="flex items-center justify-between pt-4 border-t border-theme-30/40">
            <div className="flex flex-col pr-4">
              <span className="text-zinc-300 text-sm font-medium">
                {t('settings.customBg.waveformSeekbar')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={waveformSeekbarEnabled}
              onChange={(e) => setWaveformSeekbarEnabled(e.target.checked)}
              className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
            />
          </div>
        </div>
      </div>

      {/* ISLAND 2: NGÔN NGỮ (LANGUAGE) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white truncate">
            {t('settings.language.title')}
          </h3>
        </div>
        <div className="w-72 pt-1">
          <CustomSelect
            value={language}
            onChange={(val) => setLanguage(val as any)}
            options={[
              { value: 'en', label: t('settings.language.english') },
              { value: 'vi', label: t('settings.language.vietnamese') }
            ]}
          />
        </div>
      </div>

      {/* ISLAND 3: THƯ VIỆN NHẠC (MUSIC LIBRARY) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-white truncate">
              {t('settings.library.title')}
            </h3>
          </div>
          <span className="text-xs text-zinc-400 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800">
            {libraryPaths.length} {t('settings.library.folderCount')} • {libraryTracks.length}{' '}
            {t('common.songs')}
          </span>
        </div>

        <div className="space-y-2.5">
          {libraryPaths.length === 0 ? (
            <p className="text-zinc-500 italic text-sm p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
              {t('settings.library.notSet')}
            </p>
          ) : (
            libraryPaths.map((fPath, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 hover:border-zinc-700 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Folder size={18} className="text-theme-10 shrink-0" />
                  <span className="text-sm text-zinc-200 truncate font-mono">{fPath}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleUpdateLibraryFolder(fPath)}
                    className="sys-btn flex items-center gap-1 px-3 py-1.5 bg-theme-30/60 hover:bg-theme-30 text-xs font-medium text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
                    title={t('settings.library.updateFolder')}
                  >
                    <Edit2 size={13} />
                    <span className="btn-text">{t('settings.library.change')}</span>
                  </button>
                  <button
                    onClick={async () => {
                      // @ts-ignore
                      await window.api.showInFolder(fPath)
                    }}
                    className="p-1.5 bg-theme-30/60 hover:bg-theme-30 text-zinc-400 hover:text-white rounded-xl transition cursor-pointer"
                    title={t('settings.library.openFolder')}
                  >
                    <FolderOpen size={15} />
                  </button>
                  <button
                    onClick={() => handleRemoveLibraryFolder(fPath)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition cursor-pointer"
                    title={t('settings.library.removeFolder')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap pt-2">
          <button
            onClick={handleAddLibraryFolder}
            className="sys-btn flex items-center gap-2 bg-theme-10 hover:bg-theme-10/90 text-white px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-theme-10/20 cursor-pointer"
            title={t('settings.library.addFolder')}
          >
            <Plus size={16} />
            <span className="btn-text">{t('settings.library.addFolder')}</span>
          </button>
          <button
            onClick={() => handleReloadLibrary(false)}
            disabled={isReloading}
            className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
            title={t('settings.library.rescan')}
          >
            <RefreshCw size={15} className={isReloading ? 'animate-spin' : ''} />
            <span className="btn-text">{t('settings.library.rescan')}</span>
          </button>
        </div>
      </div>

      {/* ISLAND 4: ĐỘNG CƠ ÂM THANH & BIT-PERFECT */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-white truncate">
              {t('settings.bitPerfect.title')}
            </h3>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span className="text-zinc-300 text-sm font-medium">
              {t('settings.bitPerfect.label')}
            </span>
            <input
              type="checkbox"
              checked={bitPerfectEnabled}
              onChange={async (e) => {
                const val = e.target.checked
                const prevTrack = currentTrack
                // Chuẩn hóa về thời gian TƯƠNG ĐỐI của bài: BASS _currentTime đã
                // tương đối, còn HTML5 currentTime là tuyệt đối trong file nên phải
                // trừ startTime của CUE Sheet (pendingSeek/BASS seek đều cộng lại sau).
                const startOffset = prevTrack?.startTime || 0
                const currentPlaybackTime = val
                  ? Math.max(0, (audioRef.current?.currentTime || 0) - startOffset)
                  : ((audioRef.current as any)?._currentTime ??
                    Math.max(0, (audioRef.current?.currentTime || 0) - startOffset))
                const wasPlaying = isPlaying

                try {
                  await window.api.setBitPerfect(val, volume, bitPerfectType)
                } catch (err: any) {
                  showToast(
                    `${language === 'vi' ? 'Không thể cấu hình Bit-perfect' : 'Could not configure Bit-perfect'}: ${err?.message || err}`,
                    'error'
                  )
                  return
                }

                if (currentPlaybackTime > 0) {
                  pendingSeekTimeRef.current = currentPlaybackTime
                }
                setBitPerfectEnabled(val)

                if (prevTrack && prevTrack.filePath) {
                  if (val) {
                    if (audioRef.current) audioRef.current.pause()
                  } else {
                    if (isDsdTrack(prevTrack)) {
                      await window.api.bassStop().catch(() => {})
                      setIsPlaying(false)
                      setBassOutParams(null)
                      showToast(
                        language === 'vi'
                          ? 'Đã dừng phát vì định dạng DSD yêu cầu bật chế độ Bit-Perfect (WASAPI / ASIO)!'
                          : 'Stopped playback because DSD format requires Bit-Perfect mode (WASAPI / ASIO)!',
                        'error'
                      )
                    } else {
                      // Nhạc PCM: Dừng BASS và giải phóng thiết bị độc quyền ngay lập tức
                      await window.api.bassStop().catch(() => {})
                      await resetWebAudioPipeline()
                      setTimeout(() => {
                        if (audioRef.current) {
                          audioRef.current.volume = Math.max(0, Math.min(1, sliderToGain(volume)))
                          audioRef.current.currentTime = startOffset + currentPlaybackTime
                          pendingSeekTimeRef.current = null
                          if (wasPlaying) {
                            if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                              audioCtxRef.current.resume().catch(() => {})
                            }
                            audioRef.current.play().catch(console.warn)
                          }
                        }
                      }, 100)
                    }
                  }
                }
              }}
              className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer"
            />
          </label>
        </div>

        {/* Khi bật Bit-Perfect: Cung cấp 2 lựa chọn WASAPI và ASIO */}
        {bitPerfectEnabled && (
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-theme-30/60 space-y-4">
            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('settings.bitPerfect.outputType')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option WASAPI */}
                <button
                  type="button"
                  onClick={async () => {
                    if (bitPerfectType === 'wasapi') return
                    const currentPlaybackTime =
                      (audioRef.current as any)?._currentTime || audioRef.current?.currentTime || 0
                    if (currentPlaybackTime > 0) pendingSeekTimeRef.current = currentPlaybackTime
                    setBitPerfectType('wasapi')
                    await window.api.setBitPerfectOutputType('wasapi')
                    const res = await window.api.getAudioDevices('wasapi')
                    if (res?.success && Array.isArray(res.devices)) {
                      setAvailableAudioDevices(res.devices)
                      setSelectedDeviceId('auto')
                      window.api.setAudioDevice('auto')
                    }
                  }}
                  className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                    bitPerfectType === 'wasapi'
                      ? 'bg-theme-10/10 border-theme-10 text-white shadow-sm ring-1 ring-theme-10/30'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-zinc-100">
                      {t('settings.bitPerfect.wasapiOption')}
                    </span>
                    {bitPerfectType === 'wasapi' && (
                      <span className="w-2 h-2 rounded-full bg-theme-10" />
                    )}
                  </div>
                </button>

                {/* Option ASIO */}
                <button
                  type="button"
                  onClick={async () => {
                    if (bitPerfectType === 'asio') return
                    const currentPlaybackTime =
                      (audioRef.current as any)?._currentTime || audioRef.current?.currentTime || 0
                    if (currentPlaybackTime > 0) pendingSeekTimeRef.current = currentPlaybackTime
                    setBitPerfectType('asio')
                    await window.api.setBitPerfectOutputType('asio')
                    const res = await window.api.getAudioDevices('asio')
                    if (res?.success && Array.isArray(res.devices)) {
                      setAvailableAudioDevices(res.devices)
                      setSelectedDeviceId('auto')
                      window.api.setAudioDevice('auto')
                    }
                  }}
                  className={`flex flex-col items-start p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                    bitPerfectType === 'asio'
                      ? 'bg-theme-10/10 border-theme-10 text-white shadow-sm ring-1 ring-theme-10/30'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-zinc-100">
                      {t('settings.bitPerfect.asioOption')}
                    </span>
                    {bitPerfectType === 'asio' && (
                      <span className="w-2 h-2 rounded-full bg-theme-10" />
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Lựa chọn thiết bị đầu ra âm thanh / DAC */}
            <div>
              <label className="block text-zinc-300 text-xs font-medium mb-1.5">
                {t('settings.bitPerfect.deviceLabel')} (
                {bitPerfectType === 'asio' ? 'ASIO Driver' : 'WASAPI Endpoint'})
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  const newDev = e.target.value
                  setSelectedDeviceId(newDev)
                  if (window.api && (window.api as any).setAudioDevice) {
                    ;(window.api as any).setAudioDevice(newDev)
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-theme-10 transition-colors"
              >
                <option value="auto">{t('settings.bitPerfect.deviceAuto')}</option>
                {safeAudioDevices
                  .filter((d) => d.name !== 'auto')
                  .map((dev) => (
                    <option key={dev.name} value={dev.name}>
                      {dev.description || dev.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {/* Lựa chọn thiết bị khi không bật Bit-Perfect */}
        {!bitPerfectEnabled && (
          <div className="pt-2">
            <label className="block text-zinc-300 text-xs font-medium mb-1.5">
              {t('settings.bitPerfect.deviceLabel')}
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                const newDev = e.target.value
                setSelectedDeviceId(newDev)
                if (window.api && (window.api as any).setAudioDevice) {
                  ;(window.api as any).setAudioDevice(newDev)
                }
              }}
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-theme-10 transition-colors"
            >
              <option value="auto">{t('settings.bitPerfect.deviceAuto')}</option>
              {safeAudioDevices
                .filter((d) => d.name !== 'auto')
                .map((dev) => (
                  <option key={dev.name} value={dev.name}>
                    {dev.description || dev.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Cân bằng âm lượng (Loudness Normalization) */}
        <div className="flex items-center justify-between pt-4 border-t border-theme-30/40">
          <span className="text-zinc-300 text-sm font-medium">
            {language === 'vi'
              ? 'Cân bằng âm lượng (Loudness Normalization)'
              : 'Loudness Normalization'}
          </span>
          <input
            type="checkbox"
            checked={loudnessNormalization}
            onChange={(e) => setLoudnessNormalization(e.target.checked)}
            className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer"
          />
        </div>

        {/* Phát nhạc liền mạch (Gapless Playback) */}
        <div className="flex flex-col gap-2 pt-4 border-t border-theme-30/40">
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4">
              <span className="text-zinc-300 text-sm font-medium">
                {t('settings.gaplessPlayback')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={gaplessEnabled}
              onChange={(e) => setGaplessEnabled(e.target.checked)}
              className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
            />
          </div>
        </div>

        {/* ReplayGain (Chuẩn hóa âm lượng theo đo lường ReplayGain) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-theme-30/40">
          <div className="flex flex-col pr-4">
            <span className="text-zinc-300 text-sm font-medium">
              ReplayGain{' '}
              {bitPerfectEnabled && (
                <span className="text-xs text-zinc-500 font-normal">
                  (
                  {language === 'vi'
                    ? 'Bỏ qua khi bật Bit-Perfect'
                    : 'Bypassed in Bit-Perfect mode'}
                  )
                </span>
              )}
            </span>
          </div>
          <select
            disabled={bitPerfectEnabled}
            value={replayGainMode}
            onChange={(e) => setReplayGainMode(e.target.value as 'off' | 'track' | 'album')}
            className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-theme-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <option value="off">{language === 'vi' ? 'Tắt (Off)' : 'Off'}</option>
            <option value="track">
              {language === 'vi' ? 'Theo bài (Track Gain)' : 'Track Gain'}
            </option>
            <option value="album">
              {language === 'vi' ? 'Theo Album (Album Gain)' : 'Album Gain'}
            </option>
          </select>
        </div>
      </div>

      {/* ISLAND 5: HIỆU NĂNG & CHẾ ĐỘ HOẠT ĐỘNG (APP MODE) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white truncate">
            {t('settings.appMode.title')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
          {/* 1. Tiêu chuẩn (Standard) */}
          <div
            onClick={() => {
              setAppMode('default')
              setShowVisualizer(true)
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
              appMode === 'default'
                ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold text-white flex items-center gap-2">
              <Sparkles
                size={16}
                className={appMode === 'default' ? 'text-theme-10' : 'text-zinc-400'}
              />
              {t('settings.appMode.standard')}
            </span>
            {appMode === 'default' && <span className="w-2 h-2 rounded-full bg-theme-10" />}
          </div>

          {/* 2. Tiết kiệm (Lite) */}
          <div
            onClick={() => {
              setAppMode('lite')
              setShowVisualizer(false)
              setShowLyricsPanel(false)
              setIsLyricsMaximized(false)
              // @ts-ignore
              if (window.api && window.api.forceGC) setTimeout(() => window.api.forceGC(), 100)
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
              appMode === 'lite'
                ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold text-white flex items-center gap-2">
              <Leaf size={16} className={appMode === 'lite' ? 'text-theme-10' : 'text-zinc-400'} />
              {t('settings.appMode.lite')}
            </span>
            {appMode === 'lite' && <span className="w-2 h-2 rounded-full bg-theme-10" />}
          </div>

          {/* 3. Cốt lõi (Core) */}
          <div
            onClick={() => {
              setAppMode('core')
              setShowVisualizer(false)
              setShowLyricsPanel(false)
              setIsLyricsMaximized(false)
              setShowEQ(false)
              const currentView = useUIStore.getState().activeView
              if (
                currentView === 'home' ||
                currentView === 'home-ytm' ||
                currentView === 'home-soundcloud' ||
                currentView === 'drive'
              ) {
                setActiveView('songs')
              }
              // @ts-ignore
              if (window.api && window.api.forceGC) setTimeout(() => window.api.forceGC(), 100)
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
              appMode === 'core'
                ? 'bg-theme-10/15 border-theme-10 shadow-lg shadow-theme-10/10 ring-1 ring-theme-10/40'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold text-white flex items-center gap-2">
              <Cpu size={16} className={appMode === 'core' ? 'text-theme-10' : 'text-zinc-400'} />
              {t('settings.appMode.core')}
            </span>
            {appMode === 'core' && <span className="w-2 h-2 rounded-full bg-theme-10" />}
          </div>
        </div>
      </div>

      {/* ISLAND 6: HÀNH VI CỬA SỔ (WINDOW BEHAVIOR) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white truncate">
            {t('settings.windowBehavior.title')}
          </h3>
        </div>

        <div className="flex flex-col gap-4 pt-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-zinc-200 text-sm font-medium">
              {t('settings.windowBehavior.onMinimize')}
            </p>
            <div className="w-72">
              <CustomSelect
                value={minimizeToTray ? 'tray' : 'taskbar'}
                onChange={(val) => setMinimizeToTray(val === 'tray')}
                options={[
                  {
                    value: 'taskbar',
                    label: t('settings.windowBehavior.minimizeTaskbar')
                  },
                  {
                    value: 'tray',
                    label: t('settings.windowBehavior.minimizeTray')
                  }
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-theme-30/30">
            <p className="text-zinc-200 text-sm font-medium">
              {t('settings.windowBehavior.onClose')}
            </p>
            <div className="w-72">
              <CustomSelect
                value={closeToTray ? 'tray' : 'quit'}
                onChange={(val) => setCloseToTray(val === 'tray')}
                options={[
                  { value: 'quit', label: t('settings.windowBehavior.closeQuit') },
                  { value: 'tray', label: t('settings.windowBehavior.closeTray') }
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ISLAND 7: DISCORD RICH PRESENCE */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                {t('settings.discordRpc.title')}
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                  discordConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${discordConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}
                />
                {discordConnected
                  ? t('settings.discordRpc.connectedStatus')
                  : t('settings.discordRpc.disconnectedStatus')}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={discordRpcEnabled}
            onChange={(e) => updateDiscordSettings({ enabled: e.target.checked })}
            className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer"
          />
        </div>

        {discordRpcEnabled && (
          <div className="space-y-4 pt-1">
            {/* Toggles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 1. Show Details */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showDetails')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowDetails}
                  onChange={(e) => updateDiscordSettings({ showDetails: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>

              {/* 2. Show Live Progress Time */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showTime')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowTime}
                  onChange={(e) => updateDiscordSettings({ showTime: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>

              {/* 3. Show Cover Art */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showCover')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowCover}
                  onChange={(e) => updateDiscordSettings({ showCover: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>

              {/* 4. Show Quality */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showQuality')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowQuality}
                  onChange={(e) => updateDiscordSettings({ showQuality: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>

              {/* 5. Show Buttons */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showButtons')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowButtons}
                  onChange={(e) => updateDiscordSettings({ showButtons: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>

              {/* 6. Show Idle */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-theme-30/40 hover:border-zinc-700 cursor-pointer transition">
                <p className="text-zinc-200 text-sm font-medium pr-2">
                  {t('settings.discordRpc.showIdle')}
                </p>
                <input
                  type="checkbox"
                  checked={discordShowIdle}
                  onChange={(e) => updateDiscordSettings({ showIdle: e.target.checked })}
                  className="w-4 h-4 text-theme-10 bg-theme-30 border-zinc-700 rounded focus:ring-theme-10 focus:ring-2 cursor-pointer shrink-0"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ISLAND 8: GOOGLE DRIVE */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white truncate">
            {t('settings.googleDrive.title')}
          </h3>
        </div>
        <div className="pt-1">
          <input
            type="text"
            value={googleDriveApiKey}
            onChange={(e) => setGoogleDriveApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-theme-10 transition-colors"
          />
        </div>
      </div>

      {/* ISLAND 9: DỮ LIỆU, THỐNG KÊ & SAO LƯU */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white truncate">
            {language === 'vi' ? 'Dữ liệu, Thống kê & Sao lưu' : 'Data, Insights & Backup'}
          </h3>
        </div>

        <div className="flex flex-wrap gap-2.5 sm:gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowBackupModal(true)}
            className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-theme-10/20 text-white hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
            title={
              language === 'vi'
                ? 'Sao lưu & Khôi phục (M3U8 / Config)'
                : 'Backup & Restore (M3U8 / Config)'
            }
          >
            <Download size={16} className="shrink-0" />
            <span className="btn-text">
              {language === 'vi'
                ? 'Sao lưu & Khôi phục (M3U8 / Config)'
                : 'Backup & Restore (M3U8 / Config)'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowInsightsModal(true)}
            className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-theme-10/20 text-white hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-medium transition cursor-pointer"
            title={language === 'vi' ? 'Xem thống kê nghe nhạc (Insights)' : 'View Music Insights'}
          >
            <BarChart2 size={16} className="shrink-0" />
            <span className="btn-text">
              {language === 'vi' ? 'Xem thống kê nghe nhạc (Insights)' : 'View Music Insights'}
            </span>
          </button>
        </div>
      </div>

      {/* ISLAND 10: CẬP NHẬT PHẦN MỀM (AUTO-UPDATER) */}
      <div className="bg-theme-60/40 border border-theme-30/70 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md transition-all hover:border-theme-30 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white truncate">
                  {language === 'vi'
                    ? 'Cập nhật phần mềm (Auto-Updater)'
                    : 'Software Update (Auto-Updater)'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-theme-10/20 text-theme-10 border border-theme-10/30">
                  v{updaterStatus?.currentVersion || '1.0.0'}
                </span>
              </div>
              {updaterStatus?.status && updaterStatus.status !== 'idle' && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  {updaterStatus?.status === 'checking'
                    ? language === 'vi'
                      ? 'Đang kiểm tra bản cập nhật mới...'
                      : 'Checking for updates...'
                    : updaterStatus?.status === 'available'
                      ? language === 'vi'
                        ? `Có bản cập nhật mới: v${updaterStatus?.latestVersion || ''}`
                        : `New update available: v${updaterStatus?.latestVersion || ''}`
                      : updaterStatus?.status === 'downloading'
                        ? language === 'vi'
                          ? `Đang tải: ${updaterStatus?.progressPercent || 0}%`
                          : `Downloading: ${updaterStatus?.progressPercent || 0}%`
                        : updaterStatus?.status === 'downloaded'
                          ? language === 'vi'
                            ? 'Sẵn sàng cài đặt'
                            : 'Ready to install'
                          : updaterStatus?.status === 'not-available'
                            ? language === 'vi'
                              ? 'Đã là phiên bản mới nhất'
                              : 'You are on the latest version'
                            : updaterStatus?.status === 'error'
                              ? language === 'vi'
                                ? `Lỗi: ${updaterStatus?.error || 'Không thể kiểm tra'}`
                                : `Error: ${updaterStatus?.error || 'Failed to check'}`
                              : null}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={
                updaterStatus?.status === 'checking' || updaterStatus?.status === 'downloading'
              }
              onClick={async () => {
                try {
                  setUpdaterStatus((prev: any) => ({ ...prev, status: 'checking' }))
                  const res = await window.api?.updaterCheck?.()
                  if (res?.status?.status === 'not-available') {
                    showToast(
                      language === 'vi'
                        ? 'Bạn đang sử dụng phiên bản mới nhất!'
                        : 'You are running the latest version!',
                      'info'
                    )
                  }
                } catch (e: any) {
                  showToast(e?.message || 'Update check failed', 'error')
                }
              }}
              className="sys-btn flex items-center gap-2 bg-theme-30 hover:bg-theme-10/20 text-white hover:text-theme-10 border border-zinc-700 hover:border-theme-10/50 px-3.5 py-2 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={`shrink-0 ${updaterStatus?.status === 'checking' ? 'animate-spin' : ''}`}
              />
              <span>{language === 'vi' ? 'Kiểm tra cập nhật' : 'Check for Updates'}</span>
            </button>

            {updaterStatus?.status === 'available' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    showToast(
                      language === 'vi'
                        ? 'Bắt đầu tải bản cập nhật...'
                        : 'Starting update download...',
                      'info'
                    )
                    await window.api?.updaterDownload?.()
                  } catch (e: any) {
                    showToast(e?.message || 'Download failed', 'error')
                  }
                }}
                className="sys-btn flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition cursor-pointer"
              >
                <Download size={16} className="shrink-0" />
                <span>{language === 'vi' ? 'Tải bản cập nhật' : 'Download Update'}</span>
              </button>
            )}

            {updaterStatus?.status === 'downloaded' && (
              <button
                type="button"
                onClick={() => {
                  window.api?.updaterInstall?.()
                }}
                className="sys-btn flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition cursor-pointer animate-pulse"
              >
                <RefreshCw size={16} className="shrink-0" />
                <span>{language === 'vi' ? 'Khởi động lại & Cài đặt' : 'Restart & Install'}</span>
              </button>
            )}
          </div>
        </div>

        {updaterStatus?.status === 'downloading' && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{language === 'vi' ? 'Tiến trình tải xuống' : 'Download progress'}</span>
              <span>{updaterStatus?.progressPercent || 0}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-theme-10 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, updaterStatus?.progressPercent || 0))}%`
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default SettingsView
