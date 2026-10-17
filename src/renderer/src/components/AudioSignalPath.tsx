/* eslint-disable react/prop-types */
import React from 'react'
import { 
  FileAudio, 
  Cpu, 
  Sliders, 
  Zap, 
  Speaker, 
  ArrowRight,
  ShieldCheck, 
  Sparkles,
  Layers
} from 'lucide-react'
import { useAudioStore } from '../stores/audioStore'
import { usePlayerStore } from '../stores/playerStore'
import { useTranslation } from '../locales'

import { isDsdTrack, formatAudioSampleRate } from '../utils/formatUtils'

export interface SignalPathTrack {
  id?: string
  filePath?: string
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  duration?: number
  format?: string
  bitrate?: number
  sampleRate?: number
  bitDepth?: number
  lossless?: boolean
  channels?: number
}

interface AudioSignalPathProps {
  currentTrack?: SignalPathTrack | null
  activeSampleRate?: number
  detectedBitDepth?: number
  isPlaying?: boolean
}

export const AudioSignalPath: React.FC<AudioSignalPathProps> = React.memo(({
  currentTrack,
  activeSampleRate = 44100,
  detectedBitDepth,
  isPlaying = false
}) => {
  const { t } = useTranslation()
  const { isEqEnabled, eqBands, preampGain, selectedDeviceId, availableAudioDevices, bitPerfectType } = useAudioStore()
  const { bitPerfectEnabled, bassOutParams } = usePlayerStore()
  const audioOutParams = bassOutParams

  // Format Helper
  const formatSampleRate = (sr: number): string => {
    return formatAudioSampleRate(sr) || '44.1 kHz'
  }

  // DSD Detection
  const isDsd = Boolean(
    isDsdTrack(currentTrack) ||
    (activeSampleRate >= 2000000) ||
    (currentTrack?.bitDepth === 1)
  )

  const getDsdLabel = (sampleRate: number): string => {
    if (sampleRate >= 45158400) return 'DSD1024 (45.16 MHz)'
    if (sampleRate >= 22579200) return 'DSD512 (22.58 MHz)'
    if (sampleRate >= 11289600) return 'DSD256 (11.29 MHz)'
    if (sampleRate >= 5644800) return 'DSD128 (5.64 MHz)'
    if (sampleRate >= 2822400) return 'DSD64 (2.82 MHz)'
    if (sampleRate >= 2000000) {
      const factor = Math.round(sampleRate / 44100)
      return `DSD${factor} (${(sampleRate / 1000000).toFixed(2)} MHz)`
    }
    return 'DSD Bitstream'
  }

  // Bit depth calculation
  const effectiveBitDepth = detectedBitDepth || currentTrack?.bitDepth || (isDsd ? 1 : 16)
  const isHiRes = isDsd || (activeSampleRate >= 88200) || (effectiveBitDepth >= 24)
  const isLossless = Boolean(currentTrack?.lossless || isDsd || ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes(currentTrack?.format?.toUpperCase() || ''))

  // Is using BASS Audio engine (Audiophile pipeline: Bit-Perfect or DSD Native)
  const isBASS = Boolean(bitPerfectEnabled || isDsd)
  const actualDriverMode: 'wasapi' | 'asio' = (audioOutParams?.mode?.toLowerCase() === 'asio' || (!audioOutParams?.mode && bitPerfectType === 'asio')) ? 'asio' : 'wasapi'

  // Output Device friendly name
  const safeAudioDevices = Array.isArray(availableAudioDevices) ? availableAudioDevices : []
  const getDeviceDisplayName = (): string => {
    if (!isBASS) {
      return t('modals.spectrogram.defaultDevice')
    }
    if (!selectedDeviceId || selectedDeviceId === 'auto' || selectedDeviceId === 'default' || selectedDeviceId === '0') {
      const autoDev = safeAudioDevices.find(d => d.name === 'auto')
      if (autoDev && autoDev.description && !autoDev.description.includes('Auto') && !autoDev.description.includes('Tự động')) {
        return autoDev.description
      }
      const firstRealDev = safeAudioDevices.find(d => d.name !== 'auto' && d.name !== '0' && d.description)
      if (firstRealDev) {
        return firstRealDev.description
      }
      return t('modals.spectrogram.autoDevice')
    }
    const match = safeAudioDevices.find(d => d.name === selectedDeviceId)
    if (match) return match.description
    if (selectedDeviceId.startsWith('wasapi/')) {
      return 'WASAPI Endpoint'
    }
    return selectedDeviceId
  }

  // Output sample rate
  const outputSampleRate = (isBASS && audioOutParams?.samplerate)
    ? audioOutParams.samplerate
    : activeSampleRate

  // Output format string
  const outputFormatString = isBASS
    ? (audioOutParams?.format
        ? audioOutParams.format.toUpperCase()
        : (isDsd
            ? (actualDriverMode === 'asio' ? 'DSD NATIVE 1-BIT' : 'DSD-TO-PCM (176.4kHz)')
            : (actualDriverMode === 'asio' ? 'ASIO DIRECT' : 'EXCLUSIVE PCM')))
    : 'WASAPI SHARED (PCM)'

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-2.5 shrink-0 flex flex-col gap-2 select-none overflow-hidden">
      {/* SECTION HEADER & QUALITY BADGE */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-theme-10" />
          <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
            {t('modals.spectrogram.signalPathTitle')}
          </h3>
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            — {t('modals.spectrogram.signalPathSub')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isBASS ? (
            isDsd ? (
              <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-amber-400 ${isPlaying ? 'animate-ping' : ''}`} />
                <ShieldCheck size={11} className="text-amber-400" />
                <span>{t('modals.spectrogram.dsdNativeBadge')}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isPlaying ? 'animate-ping' : ''}`} />
                <ShieldCheck size={11} className="text-emerald-400" />
                <span>{t('modals.spectrogram.bitPerfectBadge')}</span>
              </div>
            )
          ) : isEqEnabled ? (
            <div className="inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px] font-medium text-sky-400">
              <span className={`w-1.5 h-1.5 rounded-full bg-sky-400 ${isPlaying ? 'animate-pulse' : ''}`} />
              <Sparkles size={11} className="text-sky-400" />
              <span>{t('modals.spectrogram.dspActiveBadge')}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full text-[10px] font-medium text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>{t('modals.spectrogram.directBadge')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5-STAGE POWERAMP-STYLE HORIZONTAL SIGNAL FLOW */}
      <div className="flex items-start justify-between gap-1.5 w-full overflow-hidden no-scrollbar">
        
        {/* STAGE 1: NGUỒN PHÁT (SOURCE) */}
        <div className="flex-1 min-w-0 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-xl p-2.5 flex flex-col justify-between transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
              isDsd ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : isLossless ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <FileAudio size={12} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 truncate">
              {t('modals.spectrogram.sourceStage')}
            </span>
          </div>

          <div className="mt-1">
            <div className="text-xs font-bold text-white truncate" title={currentTrack?.title || 'Unknown'}>
              {isDsd ? getDsdLabel(activeSampleRate) : (currentTrack?.format?.toUpperCase() || 'AUDIO')}
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              {isDsd ? (
                <span>1-bit • {formatSampleRate(activeSampleRate)}</span>
              ) : (
                <span>{effectiveBitDepth}-bit • {formatSampleRate(activeSampleRate)}</span>
              )}
            </div>
          </div>

          <div className="mt-1 pt-1 border-t border-zinc-800/40 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
            <span className="truncate">{currentTrack?.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : (isHiRes ? 'Hi-Res' : 'CD Quality')}</span>
            <span className="text-zinc-400">2.0 Ch</span>
          </div>
        </div>

        {/* CONNECTOR 1 -> 2 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 pt-4 px-0.5">
          <ArrowRight size={13} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 2: GIẢI MÃ TÍN HIỆU (DECODER) */}
        <div className="flex-1 min-w-0 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-xl p-2.5 flex flex-col justify-between transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
              <Cpu size={12} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 truncate">
              {t('modals.spectrogram.decodeStage')}
            </span>
          </div>

          <div className="mt-1">
            <div className="text-xs font-bold text-white truncate">
              {isDsd 
                ? (actualDriverMode === 'asio' ? t('modals.spectrogram.dsdStream') : 'DSD ➔ PCM')
                : (isBASS ? `Linear PCM (${effectiveBitDepth}-bit)` : 'Linear PCM (Float32)')
              }
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              {isBASS 
                ? (isDsd ? (actualDriverMode === 'asio' ? 'BASS_DSD 1-Bit Raw' : 'BASS_DSD PCM Engine') : 'BASS Audio Core C-FFI')
                : 'WebAudio Native Decoder'
              }
            </div>
          </div>

          <div className="mt-1 pt-1 border-t border-zinc-800/40 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
            <span className="truncate">{isBASS ? (isDsd ? 'Raw bitstream' : 'Bit-for-bit') : 'IEEE Float32'}</span>
            <span className="text-zinc-400">Stereo</span>
          </div>
        </div>

        {/* CONNECTOR 2 -> 3 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 pt-4 px-0.5">
          <ArrowRight size={13} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 3: XỬ LÝ DSP (DSP / EQ) */}
        <div className="flex-1 min-w-0 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-xl p-2.5 flex flex-col justify-between transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
              isBASS 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
                : isEqEnabled 
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-400' 
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <Sliders size={12} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 truncate">
              {t('modals.spectrogram.dspStage')}
            </span>
          </div>

          <div className="mt-1">
            <div className="text-xs font-bold text-white truncate">
              {isBASS 
                ? t('modals.spectrogram.bypassDsp')
                : isEqEnabled 
                  ? t('modals.spectrogram.parametricEq').replace('{count}', String(eqBands.length))
                  : t('modals.spectrogram.eqBypassed')
              }
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              {isBASS ? (
                <span className="text-emerald-400/90">{t('modals.spectrogram.dspNoFilter')}</span>
              ) : isEqEnabled ? (
                <span className="text-sky-300/90">Preamp: {preampGain >= 0 ? `+${preampGain.toFixed(1)}` : preampGain.toFixed(1)} dB</span>
              ) : (
                <span>{t('modals.spectrogram.dspDirect')}</span>
              )}
            </div>
          </div>

          <div className="mt-1 pt-1 border-t border-zinc-800/40 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
            <span className="truncate">{isBASS ? 'Unity Gain' : (isEqEnabled ? 'Compressor' : 'Flat')}</span>
            <span className="text-zinc-400">{isBASS ? '0 dB' : (isEqEnabled ? `${eqBands.length}B` : 'Direct')}</span>
          </div>
        </div>

        {/* CONNECTOR 3 -> 4 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 pt-4 px-0.5">
          <ArrowRight size={13} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 4: GIAO THỨC XUẤT (DRIVER / OUTPUT) */}
        <div className="flex-1 min-w-0 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-xl p-2.5 flex flex-col justify-between transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
              isBASS 
                ? (actualDriverMode === 'asio' ? 'bg-purple-500/10 border-purple-500/40 text-purple-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400') 
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <Zap size={12} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 truncate">
              {t('modals.spectrogram.driverStage')}
            </span>
          </div>

          <div className="mt-1">
            <div className="text-xs font-bold text-white truncate">
              {isBASS 
                ? (actualDriverMode === 'asio' ? t('modals.spectrogram.asioDriver') : t('modals.spectrogram.wasapiExclusive')) 
                : t('modals.spectrogram.wasapiShared')}
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              {isBASS 
                ? (actualDriverMode === 'asio' ? 'Direct ASIO Hardware' : 'Bypass Windows Mixer') 
                : 'Windows Audio Session'}
            </div>
          </div>

          <div className="mt-1 pt-1 border-t border-zinc-800/40 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
            <span className="truncate">{isBASS ? 'Lock Exclusive' : 'Shared Session'}</span>
            <span className="text-zinc-400">{isBASS ? (actualDriverMode === 'asio' ? 'ASIO' : 'WASAPI') : 'Mixer'}</span>
          </div>
        </div>

        {/* CONNECTOR 4 -> 5 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 pt-4 px-0.5">
          <ArrowRight size={13} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 5: THIẾT BỊ ĐẦU RA (OUTPUT DEVICE / DAC) */}
        <div className="flex-1 min-w-0 bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-xl p-2.5 flex flex-col justify-between transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-teal-500/10 border border-teal-500/40 text-teal-400 flex items-center justify-center shrink-0">
              <Speaker size={12} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 truncate">
              {t('modals.spectrogram.outputStage')}
            </span>
          </div>

          <div className="mt-1">
            <div className="text-xs font-bold text-white truncate" title={getDeviceDisplayName()}>
              {getDeviceDisplayName()}
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              <span>{formatSampleRate(outputSampleRate)}</span>
              <span className="text-zinc-600 mx-1">•</span>
              <span className="text-emerald-400 font-bold">{outputFormatString}</span>
            </div>
          </div>

          <div className="mt-1 pt-1 border-t border-zinc-800/40 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
            <span className="truncate">{isBASS ? 'DAC Hardware' : 'Default Endpoint'}</span>
            <span className="text-zinc-400">L / R</span>
          </div>
        </div>

      </div>
    </div>
  )
})

AudioSignalPath.displayName = 'AudioSignalPath'
