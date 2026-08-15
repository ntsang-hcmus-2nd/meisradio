export interface AutoEqBand {
  id?: string
  frequency: number
  gain: number
  q?: number
  type: BiquadFilterType | 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass'
}

export interface AutoEqProfile {
  id: string
  name: string
  brand: string
  category: 'Over-ear' | 'In-ear' | 'Earbuds'
  preamp: number
  bands: AutoEqBand[]
}

/**
 * Phân tích file cấu hình EqualizerAPO / Peace Equalizer / AutoEQ (.txt / .peace)
 */
export function parsePeaceEqText(content: string): { preamp: number; bands: AutoEqBand[] } {
  const lines = content.split(/\r?\n/)
  let preamp = 0
  const bands: AutoEqBand[] = []

  let bandCounter = 1

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue

    // 1. Phân tích Preamp
    // Ví dụ: "Preamp: -6.4 dB" hoặc "Preamp: -5.0dB"
    const preampMatch = trimmed.match(/^Preamp\s*:\s*([+-]?\d+(?:\.\d+)?)\s*dB?/i)
    if (preampMatch) {
      preamp = parseFloat(preampMatch[1])
      continue
    }

    // 2. Phân tích dòng Filter EqualizerAPO / Peace
    // Ví dụ: "Filter 1: ON PK Fc 20 Hz Gain 1.2 dB Q 1.41"
    // hoặc: "Filter: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71"
    // hoặc: "Filter 2: ON HSC Fc 10000 Hz Gain -2 dB Q 0.7"
    const filterMatch = trimmed.match(/Filter(?:\s*\d+)?\s*:\s*(ON|OFF)?\s*([A-Z]+)\s+Fc\s+([0-9.]+)\s*Hz\s+Gain\s+([+-]?[0-9.]+)\s*dB\s+Q\s+([0-9.]+)/i)
    if (filterMatch) {
      const state = filterMatch[1]?.toUpperCase()
      if (state === 'OFF') continue // Bỏ qua nếu filter đang tắt

      const rawType = filterMatch[2].toUpperCase()
      const freq = parseFloat(filterMatch[3])
      const gain = parseFloat(filterMatch[4])
      const q = parseFloat(filterMatch[5])

      let filterType: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' = 'peaking'
      if (rawType === 'PK' || rawType === 'PEAK' || rawType === 'PEAKING') filterType = 'peaking'
      else if (rawType === 'LSC' || rawType === 'LS' || rawType === 'LOWSHELF') filterType = 'lowshelf'
      else if (rawType === 'HSC' || rawType === 'HS' || rawType === 'HIGHSHELF') filterType = 'highshelf'
      else if (rawType === 'LP' || rawType === 'LOWPASS') filterType = 'lowpass'
      else if (rawType === 'HP' || rawType === 'HIGHPASS') filterType = 'highpass'

      bands.push({
        id: `autoeq-import-${Date.now()}-${bandCounter++}`,
        frequency: Math.round(freq),
        gain: Math.round(gain * 10) / 10,
        q: Math.round(q * 100) / 100,
        type: filterType
      })
      continue
    }

    // 3. Phân tích định dạng đơn giản (CSV / Tabular / AutoEQ fixed band):
    // Ví dụ: "31.5 2.5 1.4 PK" hoặc "100 -3.2"
    const simpleMatch = trimmed.match(/^([0-9.]+)\s+([+-]?[0-9.]+)(?:\s+([0-9.]+))?(?:\s+([A-Z]+))?$/i)
    if (simpleMatch) {
      const freq = parseFloat(simpleMatch[1])
      const gain = parseFloat(simpleMatch[2])
      const q = simpleMatch[3] ? parseFloat(simpleMatch[3]) : 1.41
      const rawType = simpleMatch[4]?.toUpperCase() || 'PK'

      let filterType: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' = 'peaking'
      if (rawType === 'LSC' || rawType === 'LS') filterType = 'lowshelf'
      else if (rawType === 'HSC' || rawType === 'HS') filterType = 'highshelf'

      if (freq >= 20 && freq <= 20000) {
        bands.push({
          id: `autoeq-import-${Date.now()}-${bandCounter++}`,
          frequency: Math.round(freq),
          gain: Math.round(gain * 10) / 10,
          q: Math.round(q * 100) / 100,
          type: filterType
        })
      }
    }
  }

  return { preamp, bands }
}

/**
 * Xuất cấu hình EQ hiện tại ra định dạng file Peace / EqualizerAPO (.txt)
 */
export function exportPeaceEqText(preamp: number, bands: AutoEqBand[]): string {
  let output = `# Cấu hình xuất từ Meis Radio - Tương thích Peace Equalizer / EqualizerAPO\n`
  output += `Preamp: ${preamp.toFixed(1)} dB\n\n`

  bands.forEach((b, index) => {
    let typeStr = 'PK'
    if (b.type === 'lowshelf') typeStr = 'LSC'
    else if (b.type === 'highshelf') typeStr = 'HSC'
    else if (b.type === 'lowpass') typeStr = 'LP'
    else if (b.type === 'highpass') typeStr = 'HP'

    output += `Filter ${index + 1}: ON ${typeStr} Fc ${Math.round(b.frequency)} Hz Gain ${b.gain.toFixed(1)} dB Q ${(b.q || 1.4).toFixed(2)}\n`
  })

  return output
}

/**
 * Danh sách hồ sơ AutoEQ (Harman Target) cài sẵn cho các mẫu tai nghe phổ biến
 */
export const BUILTIN_AUTOEQ_PROFILES: AutoEqProfile[] = [
  // --- SONY ---
  {
    id: 'sony-wh1000xm4',
    name: 'WH-1000XM4',
    brand: 'Sony',
    category: 'Over-ear',
    preamp: -6.0,
    bands: [
      { frequency: 28, gain: -1.2, q: 1.41, type: 'peaking' },
      { frequency: 105, gain: -4.8, q: 0.71, type: 'lowshelf' },
      { frequency: 650, gain: 2.5, q: 1.8, type: 'peaking' },
      { frequency: 1100, gain: -2.1, q: 2.0, type: 'peaking' },
      { frequency: 2800, gain: 5.6, q: 1.5, type: 'peaking' },
      { frequency: 6200, gain: -3.8, q: 3.0, type: 'peaking' },
      { frequency: 9500, gain: 4.2, q: 2.2, type: 'peaking' },
      { frequency: 13000, gain: -2.5, q: 1.8, type: 'highshelf' }
    ]
  },
  {
    id: 'sony-wh1000xm5',
    name: 'WH-1000XM5',
    brand: 'Sony',
    category: 'Over-ear',
    preamp: -5.5,
    bands: [
      { frequency: 32, gain: -2.0, q: 1.4, type: 'peaking' },
      { frequency: 120, gain: -4.2, q: 0.8, type: 'lowshelf' },
      { frequency: 800, gain: 1.8, q: 1.5, type: 'peaking' },
      { frequency: 3100, gain: 4.8, q: 1.6, type: 'peaking' },
      { frequency: 5800, gain: -2.6, q: 2.5, type: 'peaking' },
      { frequency: 8400, gain: 3.2, q: 2.0, type: 'peaking' }
    ]
  },
  {
    id: 'sony-wf1000xm4',
    name: 'WF-1000XM4',
    brand: 'Sony',
    category: 'In-ear',
    preamp: -5.0,
    bands: [
      { frequency: 80, gain: -3.0, q: 0.7, type: 'lowshelf' },
      { frequency: 1500, gain: -1.5, q: 2.0, type: 'peaking' },
      { frequency: 3200, gain: 4.2, q: 1.8, type: 'peaking' },
      { frequency: 5800, gain: -4.5, q: 3.0, type: 'peaking' },
      { frequency: 9200, gain: 3.0, q: 2.5, type: 'peaking' }
    ]
  },
  {
    id: 'sony-wf1000xm5',
    name: 'WF-1000XM5',
    brand: 'Sony',
    category: 'In-ear',
    preamp: -4.5,
    bands: [
      { frequency: 100, gain: -2.5, q: 0.7, type: 'lowshelf' },
      { frequency: 2800, gain: 3.5, q: 1.6, type: 'peaking' },
      { frequency: 6500, gain: -3.2, q: 2.8, type: 'peaking' },
      { frequency: 10000, gain: 2.8, q: 2.0, type: 'peaking' }
    ]
  },

  // --- APPLE ---
  {
    id: 'apple-airpods-pro-2',
    name: 'AirPods Pro 2',
    brand: 'Apple',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 45, gain: 1.5, q: 1.2, type: 'peaking' },
      { frequency: 220, gain: -1.8, q: 1.5, type: 'peaking' },
      { frequency: 2800, gain: 2.2, q: 2.0, type: 'peaking' },
      { frequency: 6000, gain: -2.5, q: 2.5, type: 'peaking' },
      { frequency: 11000, gain: 3.0, q: 1.5, type: 'highshelf' }
    ]
  },
  {
    id: 'apple-airpods-pro',
    name: 'AirPods Pro',
    brand: 'Apple',
    category: 'In-ear',
    preamp: -3.5,
    bands: [
      { frequency: 60, gain: 2.2, q: 1.0, type: 'peaking' },
      { frequency: 250, gain: -2.0, q: 1.4, type: 'peaking' },
      { frequency: 3200, gain: 2.8, q: 1.8, type: 'peaking' },
      { frequency: 7500, gain: -3.0, q: 2.2, type: 'peaking' }
    ]
  },
  {
    id: 'apple-airpods-max',
    name: 'AirPods Max',
    brand: 'Apple',
    category: 'Over-ear',
    preamp: -4.0,
    bands: [
      { frequency: 80, gain: -2.2, q: 0.8, type: 'lowshelf' },
      { frequency: 1200, gain: 1.8, q: 1.5, type: 'peaking' },
      { frequency: 3800, gain: 3.5, q: 2.0, type: 'peaking' },
      { frequency: 7000, gain: -3.8, q: 2.5, type: 'peaking' }
    ]
  },

  // --- SENNHEISER ---
  {
    id: 'sennheiser-hd600',
    name: 'HD 600',
    brand: 'Sennheiser',
    category: 'Over-ear',
    preamp: -6.5,
    bands: [
      { frequency: 30, gain: 6.5, q: 0.71, type: 'lowshelf' },
      { frequency: 100, gain: -1.2, q: 1.4, type: 'peaking' },
      { frequency: 3200, gain: -2.0, q: 2.5, type: 'peaking' },
      { frequency: 5500, gain: 3.2, q: 1.8, type: 'peaking' },
      { frequency: 10000, gain: 2.0, q: 1.5, type: 'highshelf' }
    ]
  },
  {
    id: 'sennheiser-hd650',
    name: 'HD 650 / HD 6XX',
    brand: 'Sennheiser',
    category: 'Over-ear',
    preamp: -6.5,
    bands: [
      { frequency: 35, gain: 6.8, q: 0.71, type: 'lowshelf' },
      { frequency: 200, gain: -2.2, q: 1.2, type: 'peaking' },
      { frequency: 3500, gain: -1.8, q: 2.2, type: 'peaking' },
      { frequency: 5800, gain: 3.8, q: 1.6, type: 'peaking' },
      { frequency: 10500, gain: 2.5, q: 1.4, type: 'highshelf' }
    ]
  },
  {
    id: 'sennheiser-hd560s',
    name: 'HD 560S',
    brand: 'Sennheiser',
    category: 'Over-ear',
    preamp: -4.5,
    bands: [
      { frequency: 40, gain: 4.5, q: 0.8, type: 'lowshelf' },
      { frequency: 1300, gain: -1.5, q: 1.8, type: 'peaking' },
      { frequency: 4500, gain: -3.2, q: 2.8, type: 'peaking' },
      { frequency: 7200, gain: 2.0, q: 2.0, type: 'peaking' }
    ]
  },
  {
    id: 'sennheiser-momentum-4',
    name: 'Momentum 4 Wireless',
    brand: 'Sennheiser',
    category: 'Over-ear',
    preamp: -5.0,
    bands: [
      { frequency: 80, gain: -4.5, q: 0.7, type: 'lowshelf' },
      { frequency: 600, gain: 1.8, q: 1.5, type: 'peaking' },
      { frequency: 3200, gain: 3.8, q: 1.6, type: 'peaking' },
      { frequency: 6500, gain: -2.8, q: 2.2, type: 'peaking' }
    ]
  },

  // --- MOONDROP ---
  {
    id: 'moondrop-chu-2',
    name: 'Chu II',
    brand: 'Moondrop',
    category: 'In-ear',
    preamp: -3.5,
    bands: [
      { frequency: 80, gain: -2.5, q: 0.8, type: 'lowshelf' },
      { frequency: 2800, gain: 1.8, q: 2.0, type: 'peaking' },
      { frequency: 5800, gain: -3.5, q: 2.5, type: 'peaking' },
      { frequency: 12000, gain: 2.0, q: 1.5, type: 'highshelf' }
    ]
  },
  {
    id: 'moondrop-aria',
    name: 'Aria',
    brand: 'Moondrop',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 100, gain: -1.8, q: 0.7, type: 'lowshelf' },
      { frequency: 1200, gain: 1.2, q: 1.8, type: 'peaking' },
      { frequency: 6000, gain: -3.0, q: 2.5, type: 'peaking' },
      { frequency: 11000, gain: 2.5, q: 1.8, type: 'highshelf' }
    ]
  },
  {
    id: 'moondrop-kato',
    name: 'Kato',
    brand: 'Moondrop',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 85, gain: -1.5, q: 0.8, type: 'lowshelf' },
      { frequency: 3000, gain: 1.5, q: 2.0, type: 'peaking' },
      { frequency: 6200, gain: -2.8, q: 2.5, type: 'peaking' }
    ]
  },
  {
    id: 'moondrop-blessing-3',
    name: 'Blessing 3',
    brand: 'Moondrop',
    category: 'In-ear',
    preamp: -4.0,
    bands: [
      { frequency: 60, gain: 3.5, q: 0.7, type: 'lowshelf' },
      { frequency: 2800, gain: -1.8, q: 2.2, type: 'peaking' },
      { frequency: 6000, gain: -2.5, q: 2.5, type: 'peaking' }
    ]
  },

  // --- AUDIO-TECHNICA ---
  {
    id: 'audiotechnica-ath-m50x',
    name: 'ATH-M50x',
    brand: 'Audio-Technica',
    category: 'Over-ear',
    preamp: -6.0,
    bands: [
      { frequency: 80, gain: -4.0, q: 0.7, type: 'lowshelf' },
      { frequency: 250, gain: -2.5, q: 1.4, type: 'peaking' },
      { frequency: 1000, gain: 2.2, q: 1.6, type: 'peaking' },
      { frequency: 4200, gain: -3.5, q: 2.5, type: 'peaking' },
      { frequency: 9500, gain: -4.8, q: 3.0, type: 'peaking' }
    ]
  },

  // --- BEYERDYNAMIC ---
  {
    id: 'beyerdynamic-dt770-80',
    name: 'DT 770 Pro (80 Ohm)',
    brand: 'Beyerdynamic',
    category: 'Over-ear',
    preamp: -6.5,
    bands: [
      { frequency: 70, gain: -3.5, q: 0.8, type: 'lowshelf' },
      { frequency: 200, gain: -3.0, q: 1.2, type: 'peaking' },
      { frequency: 1200, gain: 2.5, q: 1.5, type: 'peaking' },
      { frequency: 5800, gain: -5.5, q: 3.0, type: 'peaking' },
      { frequency: 8500, gain: -6.2, q: 3.5, type: 'peaking' }
    ]
  },
  {
    id: 'beyerdynamic-dt990-250',
    name: 'DT 990 Pro (250 Ohm)',
    brand: 'Beyerdynamic',
    category: 'Over-ear',
    preamp: -7.0,
    bands: [
      { frequency: 45, gain: 5.5, q: 0.8, type: 'lowshelf' },
      { frequency: 180, gain: -3.2, q: 1.2, type: 'peaking' },
      { frequency: 1000, gain: 2.8, q: 1.4, type: 'peaking' },
      { frequency: 5900, gain: -6.8, q: 3.2, type: 'peaking' },
      { frequency: 8200, gain: -7.5, q: 3.8, type: 'peaking' }
    ]
  },

  // --- TANGZU / 7HZ / TRUTHEAR / KZ ---
  {
    id: 'tangzu-waner',
    name: 'Wan\'er S.G',
    brand: 'Tangzu',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 80, gain: -1.8, q: 0.8, type: 'lowshelf' },
      { frequency: 3200, gain: 1.5, q: 2.0, type: 'peaking' },
      { frequency: 6000, gain: -3.2, q: 2.5, type: 'peaking' },
      { frequency: 12000, gain: 2.0, q: 1.5, type: 'highshelf' }
    ]
  },
  {
    id: '7hz-zero-2',
    name: 'Zero 2',
    brand: '7Hz x Crinacle',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 100, gain: -1.5, q: 0.8, type: 'lowshelf' },
      { frequency: 2800, gain: 1.8, q: 2.0, type: 'peaking' },
      { frequency: 6200, gain: -2.5, q: 2.5, type: 'peaking' }
    ]
  },
  {
    id: 'truthear-hexa',
    name: 'Hexa',
    brand: 'Truthear',
    category: 'In-ear',
    preamp: -3.5,
    bands: [
      { frequency: 60, gain: 3.2, q: 0.7, type: 'lowshelf' },
      { frequency: 3000, gain: -1.2, q: 2.2, type: 'peaking' },
      { frequency: 6000, gain: -2.8, q: 2.5, type: 'peaking' }
    ]
  },
  {
    id: 'truthear-zero-red',
    name: 'Zero:RED',
    brand: 'Truthear x Crinacle',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 60, gain: 2.5, q: 0.7, type: 'lowshelf' },
      { frequency: 2800, gain: 1.2, q: 2.0, type: 'peaking' },
      { frequency: 5800, gain: -2.2, q: 2.8, type: 'peaking' }
    ]
  },

  // --- HIFIMAN / BOSE / SAMSUNG ---
  {
    id: 'hifiman-sundara',
    name: 'Sundara (2020)',
    brand: 'Hifiman',
    category: 'Over-ear',
    preamp: -6.0,
    bands: [
      { frequency: 35, gain: 6.0, q: 0.7, type: 'lowshelf' },
      { frequency: 1800, gain: -2.2, q: 2.0, type: 'peaking' },
      { frequency: 6000, gain: -3.0, q: 2.5, type: 'peaking' },
      { frequency: 9500, gain: 2.5, q: 1.8, type: 'peaking' }
    ]
  },
  {
    id: 'bose-qc45',
    name: 'QuietComfort 45',
    brand: 'Bose',
    category: 'Over-ear',
    preamp: -5.5,
    bands: [
      { frequency: 80, gain: -3.8, q: 0.8, type: 'lowshelf' },
      { frequency: 1200, gain: 1.5, q: 1.5, type: 'peaking' },
      { frequency: 3500, gain: 3.2, q: 2.0, type: 'peaking' },
      { frequency: 8500, gain: -5.2, q: 3.0, type: 'peaking' }
    ]
  },
  {
    id: 'samsung-galaxy-buds-2-pro',
    name: 'Galaxy Buds 2 Pro',
    brand: 'Samsung',
    category: 'In-ear',
    preamp: -3.0,
    bands: [
      { frequency: 80, gain: -1.8, q: 0.8, type: 'lowshelf' },
      { frequency: 3000, gain: 1.5, q: 2.0, type: 'peaking' },
      { frequency: 6200, gain: -2.5, q: 2.5, type: 'peaking' },
      { frequency: 11000, gain: 2.2, q: 1.5, type: 'highshelf' }
    ]
  }
]
