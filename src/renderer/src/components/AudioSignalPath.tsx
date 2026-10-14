/* eslint-disable react/prop-types */
import React from 'react'
import { 
  FileAudio, 
  Cpu, 
  Sliders, 
  Zap, 
  Speaker, 
  ChevronRight, 
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
  const { bitPerfectEnabled, mpvOutParams } = usePlayerStore()

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
  const actualDriverMode: 'wasapi' | 'asio' = (mpvOutParams?.mode?.toLowerCase() === 'asio' || (!mpvOutParams?.mode && bitPerfectType === 'asio')) ? 'asio' : 'wasapi'

  // Output Device friendly name
  const getDeviceDisplayName = (): string => {
    if (!isBASS) {
      return t('modals.spectrogram.defaultDevice')
    }
    if (!selectedDeviceId || selectedDeviceId === 'auto' || selectedDeviceId === 'default' || selectedDeviceId === '0') {
      const autoDev = availableAudioDevices.find(d => d.name === 'auto')
      if (autoDev && autoDev.description && !autoDev.description.includes('Auto') && !autoDev.description.includes('Tự động')) {
        return autoDev.description
      }
      const firstRealDev = availableAudioDevices.find(d => d.name !== 'auto' && d.name !== '0' && d.description)
      if (firstRealDev) {
        return firstRealDev.description
      }
      return t('modals.spectrogram.autoDevice')
    }
    const match = availableAudioDevices.find(d => d.name === selectedDeviceId)
    if (match) return match.description
    if (selectedDeviceId.startsWith('wasapi/')) {
      return 'WASAPI Endpoint'
    }
    return selectedDeviceId
  }

  // Output sample rate
  const outputSampleRate = (isBASS && mpvOutParams?.samplerate)
    ? mpvOutParams.samplerate
    : activeSampleRate

  // Output format string
  const outputFormatString = isBASS
    ? (mpvOutParams?.format
        ? mpvOutParams.format.toUpperCase()
        : (isDsd
            ? (actualDriverMode === 'asio' ? 'DSD NATIVE 1-BIT' : 'DSD-TO-PCM (176.4kHz)')
            : (actualDriverMode === 'asio' ? 'ASIO DIRECT' : 'EXCLUSIVE PCM')))
    : 'WASAPI SHARED (PCM)'

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950/80 px-5 py-3 shrink-0 flex flex-col gap-2.5">
      {/* SECTION HEADER & QUALITY BADGE */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-theme-10" />
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
              <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-amber-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-amber-400 ${isPlaying ? 'animate-ping' : ''}`} />
                <ShieldCheck size={12} className="text-amber-400" />
                <span>{t('modals.spectrogram.dsdNativeBadge')}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-emerald-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isPlaying ? 'animate-ping' : ''}`} />
                <ShieldCheck size={12} className="text-emerald-400" />
                <span>{t('modals.spectrogram.bitPerfectBadge')}</span>
              </div>
            )
          ) : isEqEnabled ? (
            <div className="inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-sky-400">
              <span className={`w-1.5 h-1.5 rounded-full bg-sky-400 ${isPlaying ? 'animate-pulse' : ''}`} />
              <Sparkles size={12} className="text-sky-400" />
              <span>{t('modals.spectrogram.dspActiveBadge')}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>{t('modals.spectrogram.directBadge')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5-STAGE SIGNAL PATH PIPELINE */}
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        
        {/* STAGE 1: NGUỒN PHÁT (SOURCE) */}
        <div className="bg-zinc-900/90 border border-zinc-800/90 hover:border-zinc-700/80 rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <FileAudio size={13} />
              </div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                1. {t('modals.spectrogram.sourceStage')}
              </span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
              {isDsd ? 'DSD' : isLossless ? 'LOSSLESS' : 'LOSSY'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate" title={currentTrack?.title || 'Unknown'}>
              {isDsd ? getDsdLabel(activeSampleRate) : (currentTrack?.format?.toUpperCase() || 'AUDIO')}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {isDsd ? (
                <span>1-bit • {formatSampleRate(activeSampleRate)}</span>
              ) : (
                <span>
                  {effectiveBitDepth}-bit • {formatSampleRate(activeSampleRate)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span className="truncate max-w-[100px]">
              {currentTrack?.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : (isHiRes ? 'Hi-Res Master' : 'CD Quality')}
            </span>
            <span className="font-mono text-zinc-400">2.0 Ch</span>
          </div>
        </div>

        {/* CONNECTOR 1 -> 2 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 2: GIẢI MÃ TÍN HIỆU (PCM / DSD DECODER) */}
        <div className="bg-zinc-900/90 border border-zinc-800/90 hover:border-zinc-700/80 rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Cpu size={13} />
              </div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                2. {t('modals.spectrogram.decodeStage')}
              </span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400">
              {isDsd ? 'DSD' : 'PCM'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate">
              {isDsd 
                ? (actualDriverMode === 'asio' ? t('modals.spectrogram.dsdStream') : 'DSD ➔ PCM (176.4kHz)')
                : (isBASS ? `Linear PCM (${effectiveBitDepth}-bit)` : 'Linear PCM (Float32)')
              }
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {isBASS 
                ? (isDsd 
                    ? (actualDriverMode === 'asio' ? 'BASS_DSD 1-Bit Raw Engine' : 'BASS_DSD PCM Engine')
                    : 'BASS Audio Core (Native C-FFI)')
                : 'WebAudio Native Decoder'
              }
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              {isBASS 
                ? (isDsd && actualDriverMode === 'asio' ? 'Bit-for-bit raw bitstream' : 'Bit-for-bit lossless') 
                : 'IEEE 32-bit Float'
              }
            </span>
            <span className="font-mono text-zinc-400">Stereo</span>
          </div>
        </div>

        {/* CONNECTOR 2 -> 3 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 3: XỬ LÝ DSP (DSP ENGINE / EQ) */}
        <div className={`rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm border ${
          isBASS 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : isEqEnabled 
              ? 'bg-sky-950/20 border-sky-500/30' 
              : 'bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700/80'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                isBASS 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : isEqEnabled 
                    ? 'bg-sky-500/10 text-sky-400' 
                    : 'bg-zinc-800 text-zinc-400'
              }`}>
                <Sliders size={13} />
              </div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                3. {t('modals.spectrogram.dspStage')}
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
              isBASS 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : isEqEnabled 
                  ? 'bg-sky-500/10 text-sky-400' 
                  : 'bg-zinc-800 text-zinc-400'
            }`}>
              {isBASS ? 'BYPASS' : isEqEnabled ? 'ACTIVE' : 'FLAT'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate">
              {isBASS 
                ? t('modals.spectrogram.bypassDsp')
                : isEqEnabled 
                  ? t('modals.spectrogram.parametricEq').replace('{count}', String(eqBands.length))
                  : t('modals.spectrogram.eqBypassed')
              }
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {isBASS ? (
                <span className="text-emerald-400/90">{t('modals.spectrogram.dspNoFilter')}</span>
              ) : isEqEnabled ? (
                <span className="text-sky-300/90">Preamp: {preampGain >= 0 ? `+${preampGain.toFixed(1)}` : preampGain.toFixed(1)} dB</span>
              ) : (
                <span>{t('modals.spectrogram.dspDirect')}</span>
              )}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{isBASS ? t('modals.spectrogram.dspBitAccurate') : (isEqEnabled ? 'Compressor On' : 'Unity Gain')}</span>
            <span className="font-mono text-zinc-400">
              {isBASS ? 'Pure' : (isEqEnabled ? `${eqBands.length} Filters` : 'Direct')}
            </span>
          </div>
        </div>

        {/* CONNECTOR 3 -> 4 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 4: GIAO THỨC DRIVER (OUTPUT DRIVER / ENGINE) */}
        <div className={`rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm border ${
          isBASS 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : 'bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700/80'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                isBASS 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                <Zap size={13} />
              </div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                4. {t('modals.spectrogram.driverStage')}
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
              isBASS 
                ? (actualDriverMode === 'asio' ? 'bg-purple-500/10 text-purple-400 font-bold' : 'bg-emerald-500/10 text-emerald-400 font-bold') 
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {isBASS ? (actualDriverMode === 'asio' ? 'ASIO DIRECT' : 'EXCLUSIVE') : 'SHARED'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate">
              {isBASS 
                ? (actualDriverMode === 'asio' ? t('modals.spectrogram.asioDriver') : t('modals.spectrogram.wasapiExclusive')) 
                : t('modals.spectrogram.wasapiShared')}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
              {isBASS 
                ? (actualDriverMode === 'asio' ? t('modals.spectrogram.asioDriverDesc') : t('modals.spectrogram.exclusiveDesc')) 
                : t('modals.spectrogram.sharedDesc')}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{isBASS ? (actualDriverMode === 'asio' ? 'Dedicated ASIO Driver' : 'Bypass Windows Mixer') : 'OS Audio Session'}</span>
            <span className="font-mono text-zinc-400">{isBASS ? (actualDriverMode === 'asio' ? 'ASIO' : 'Direct') : 'Mixer'}</span>
          </div>
        </div>

        {/* CONNECTOR 4 -> 5 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 5: THIẾT BỊ ĐẦU RA (OUTPUT DEVICE / DAC) */}
        <div className="bg-zinc-900/90 border border-zinc-800/90 hover:border-zinc-700/80 rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Speaker size={13} />
              </div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                5. {t('modals.spectrogram.outputStage')}
              </span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
              DAC / OUTPUT
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate" title={getDeviceDisplayName()}>
              {getDeviceDisplayName()}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              <span>{formatSampleRate(outputSampleRate)}</span>
              <span className="text-zinc-500 mx-1">•</span>
              <span className="text-emerald-400 font-mono">{outputFormatString}</span>
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span className="truncate max-w-[100px]">{isBASS ? (actualDriverMode === 'asio' ? 'ASIO Hardware DAC' : 'Hardware DAC (Exclusive)') : t('modals.spectrogram.defaultDevice')}</span>
            <span className="font-mono text-zinc-400">L / R</span>
          </div>
        </div>

      </div>
    </div>
  )
})

AudioSignalPath.displayName = 'AudioSignalPath'
