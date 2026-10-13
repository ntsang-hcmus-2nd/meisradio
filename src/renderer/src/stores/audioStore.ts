import { create } from 'zustand'

export interface EQBand {
  id: string
  frequency: number
  gain: number
  type: BiquadFilterType
  q?: number
}

export interface AudioState {
  isEqEnabled: boolean
  availableAudioDevices: { name: string; description: string }[]
  selectedDeviceId: string
  eqBands: EQBand[]
  preampGain: number

  // Actions
  setIsEqEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setAvailableAudioDevices: (devices: { name: string; description: string }[] | ((prev: any[]) => any[])) => void
  setSelectedDeviceId: (id: string | ((prev: string) => string)) => void
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
  eqBands: defaultBands,
  preampGain: 0,

  setIsEqEnabled: (valOrFn) => set((s) => ({ isEqEnabled: resolveVal(valOrFn, s.isEqEnabled) })),
  setAvailableAudioDevices: (valOrFn) => set((s) => ({ availableAudioDevices: resolveVal(valOrFn, s.availableAudioDevices) })),
  setSelectedDeviceId: (valOrFn) => set((s) => ({ selectedDeviceId: resolveVal(valOrFn, s.selectedDeviceId) })),
  setEqBands: (valOrFn) => set((s) => ({ eqBands: resolveVal(valOrFn, s.eqBands) })),
  setPreampGain: (valOrFn) => set((s) => ({ preampGain: resolveVal(valOrFn, s.preampGain) }))
}))
