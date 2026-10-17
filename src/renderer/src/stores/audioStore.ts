import { create } from 'zustand'

export interface EQBand {
  id: string
  frequency: number
  gain: number
  type: BiquadFilterType
  q?: number
}

export interface AudioDevice {
  name: string
  description: string
  type?: 'wasapi' | 'asio'
  id?: string
}

export interface AudioState {
  isEqEnabled: boolean
  availableAudioDevices: AudioDevice[]
  selectedDeviceId: string
  bitPerfectType: 'wasapi' | 'asio'
  eqBands: EQBand[]
  preampGain: number

  // Actions
  setIsEqEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setAvailableAudioDevices: (devices: AudioDevice[] | ((prev: AudioDevice[]) => AudioDevice[])) => void
  setSelectedDeviceId: (id: string | ((prev: string) => string)) => void
  setBitPerfectType: (type: 'wasapi' | 'asio' | ((prev: 'wasapi' | 'asio') => 'wasapi' | 'asio')) => void
  setEqBands: (bands: EQBand[] | ((prev: EQBand[]) => EQBand[])) => void
  setPreampGain: (gain: number | ((prev: number) => number)) => void
}

const resolveVal = <T>(valOrFn: T | ((prev: T) => T), prev: T): T => {
  return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn
}

const defaultBands: EQBand[] = [
  { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
  { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
  { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
  { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
  { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 }
]

export const useAudioStore = create<AudioState>((set) => ({
  isEqEnabled: false,
  availableAudioDevices: [],
  selectedDeviceId: 'auto',
  bitPerfectType: 'asio',
  eqBands: defaultBands,
  preampGain: 0,

  setIsEqEnabled: (valOrFn) => set((s) => ({ isEqEnabled: resolveVal(valOrFn, s.isEqEnabled) })),
  setAvailableAudioDevices: (valOrFn) =>
    set((s) => {
      const resolved = resolveVal(valOrFn, s.availableAudioDevices)
      const safeArray = Array.isArray(resolved)
        ? resolved
        : Array.isArray((resolved as any)?.devices)
          ? (resolved as any).devices
          : []
      return { availableAudioDevices: safeArray }
    }),
  setSelectedDeviceId: (valOrFn) => set((s) => ({ selectedDeviceId: resolveVal(valOrFn, s.selectedDeviceId) })),
  setBitPerfectType: (valOrFn) => set((s) => ({ bitPerfectType: resolveVal(valOrFn, s.bitPerfectType) })),
  setEqBands: (valOrFn) => set((s) => ({ eqBands: resolveVal(valOrFn, s.eqBands) })),
  setPreampGain: (valOrFn) => set((s) => ({ preampGain: resolveVal(valOrFn, s.preampGain) }))
}))
