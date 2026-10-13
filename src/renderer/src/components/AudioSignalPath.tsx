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
  const { isEqEnabled, eqBands, preampGain, selectedDeviceId, availableAudioDevices } = useAudioStore()
  const { bitPerfectEnabled, mpvOutParams } = usePlayerStore()

  // Format Helper
  const formatSampleRate = (sr: number): string => {
    if (!sr) return '44.1 kHz'
    if (sr >= 1000000) return `${(sr / 1000000).toFixed(2)} MHz`
    if (sr >= 1000) return `${(sr / 1000).toFixed(1).replace('.0', '')} kHz`
    return `${sr} Hz`
  }

  // DSD Detection
  const isDsd = Boolean(
    (currentTrack?.format && /^(dsd|dsf|dff)$/i.test(currentTrack.format)) ||
    (currentTrack?.filePath && /\.(dsf|dff)$/i.test(currentTrack.filePath)) ||
    (activeSampleRate >= 2000000) ||
    (currentTrack?.bitDepth === 1)
  )

  const getDsdLabel = (sampleRate: number): string => {
    if (sampleRate >= 22579200) return 'DSD512 (22.58 MHz)'
    if (sampleRate >= 11289600) return 'DSD256 (11.29 MHz)'
    if (sampleRate >= 5644800) return 'DSD128 (5.64 MHz)'
    if (sampleRate >= 2822400) return 'DSD64 (2.82 MHz)'
    return 'DSD Bitstream'
  }

  // Bit depth calculation
  const effectiveBitDepth = detectedBitDepth || currentTrack?.bitDepth || (isDsd ? 1 : 16)
  const isHiRes = isDsd || (activeSampleRate >= 88200) || (effectiveBitDepth >= 24)
  const isLossless = Boolean(currentTrack?.lossless || isDsd || ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes(currentTrack?.format?.toUpperCase() || ''))

  // Output Device friendly name
  const getDeviceDisplayName = (): string => {
    if (!selectedDeviceId || selectedDeviceId === 'auto' || selectedDeviceId === 'default') {
      const autoDev = availableAudioDevices.find(d => d.name === 'auto')
      if (autoDev && autoDev.description && !autoDev.description.includes('Auto') && !autoDev.description.includes('Tự động')) {
        return autoDev.description
      }
      const firstRealDev = availableAudioDevices.find(d => d.name !== 'auto' && d.description)
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
  const outputSampleRate = (bitPerfectEnabled && mpvOutParams?.samplerate)
    ? mpvOutParams.samplerate
    : activeSampleRate

  const outputFormatString = (bitPerfectEnabled && mpvOutParams?.format)
    ? mpvOutParams.format.toUpperCase()
    : (bitPerfectEnabled ? 'Direct' : 'Float32')

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
          {bitPerfectEnabled ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-emerald-400">
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isPlaying ? 'animate-ping' : ''}`} />
              <ShieldCheck size={12} className="text-emerald-400" />
              <span>{t('modals.spectrogram.bitPerfectBadge')}</span>
            </div>
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
                ? (bitPerfectEnabled ? t('modals.spectrogram.dsdStream') : 'DSD ➔ PCM Transcode')
                : (bitPerfectEnabled ? `Linear PCM (${effectiveBitDepth}-bit)` : 'Linear PCM (Float32)')
              }
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {bitPerfectEnabled ? 'MPV libavcodec Core' : 'WebAudio Native Decoder'}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{bitPerfectEnabled ? 'Bit-for-bit lossless' : 'IEEE 32-bit Float'}</span>
            <span className="font-mono text-zinc-400">Stereo</span>
          </div>
        </div>

        {/* CONNECTOR 2 -> 3 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 3: XỬ LÝ DSP (DSP ENGINE / EQ) */}
        <div className={`rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm border ${
          bitPerfectEnabled 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : isEqEnabled 
              ? 'bg-sky-950/20 border-sky-500/30' 
              : 'bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700/80'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                bitPerfectEnabled 
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
              bitPerfectEnabled 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : isEqEnabled 
                  ? 'bg-sky-500/10 text-sky-400' 
                  : 'bg-zinc-800 text-zinc-400'
            }`}>
              {bitPerfectEnabled ? 'BYPASS' : isEqEnabled ? 'ACTIVE' : 'FLAT'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate">
              {bitPerfectEnabled 
                ? t('modals.spectrogram.bypassDsp')
                : isEqEnabled 
                  ? t('modals.spectrogram.parametricEq').replace('{count}', String(eqBands.length))
                  : t('modals.spectrogram.eqBypassed')
              }
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {bitPerfectEnabled ? (
                <span className="text-emerald-400/90">{t('modals.spectrogram.dspNoFilter')}</span>
              ) : isEqEnabled ? (
                <span className="text-sky-300/90">Preamp: {preampGain >= 0 ? `+${preampGain.toFixed(1)}` : preampGain.toFixed(1)} dB</span>
              ) : (
                <span>{t('modals.spectrogram.dspDirect')}</span>
              )}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{bitPerfectEnabled ? t('modals.spectrogram.dspBitAccurate') : (isEqEnabled ? 'Compressor On' : 'Unity Gain')}</span>
            <span className="font-mono text-zinc-400">
              {bitPerfectEnabled ? 'Pure' : (isEqEnabled ? `${eqBands.length} Filters` : 'Direct')}
            </span>
          </div>
        </div>

        {/* CONNECTOR 3 -> 4 */}
        <div className="flex items-center justify-center text-zinc-600 shrink-0 px-0.5">
          <ChevronRight size={16} className={isPlaying ? "text-theme-10 animate-pulse" : "text-zinc-600"} />
        </div>

        {/* STAGE 4: GIAO THỨC DRIVER (OUTPUT DRIVER / ENGINE) */}
        <div className={`rounded-xl p-2.5 flex-1 min-w-[170px] max-w-[210px] flex flex-col justify-between transition-all group shadow-sm border ${
          bitPerfectEnabled 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : 'bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700/80'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                bitPerfectEnabled 
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
              bitPerfectEnabled 
                ? 'bg-emerald-500/10 text-emerald-400 font-bold' 
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {bitPerfectEnabled ? 'EXCLUSIVE' : 'SHARED'}
            </span>
          </div>

          <div className="my-0.5">
            <div className="text-xs font-bold text-white truncate">
              {bitPerfectEnabled ? t('modals.spectrogram.wasapiExclusive') : t('modals.spectrogram.wasapiShared')}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
              {bitPerfectEnabled ? t('modals.spectrogram.exclusiveDesc') : t('modals.spectrogram.sharedDesc')}
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{bitPerfectEnabled ? 'Bypass Windows Mixer' : 'OS Audio Session'}</span>
            <span className="font-mono text-zinc-400">{bitPerfectEnabled ? 'Direct' : 'Mixer'}</span>
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
            <span className="truncate max-w-[100px]">{bitPerfectEnabled ? 'Hardware DAC' : 'Default Endpoint'}</span>
            <span className="font-mono text-zinc-400">L / R</span>
          </div>
        </div>

      </div>
    </div>
  )
})

AudioSignalPath.displayName = 'AudioSignalPath'
