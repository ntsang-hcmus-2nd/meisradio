export interface RGB {
  r: number
  g: number
  b: number
}

export interface ThemeColors {
  primary60: string
  secondary30: string
  accent10: string
}

const enforceDarkness = (c: RGB, maxVal: number): RGB => {
  const highest = Math.max(c.r, c.g, c.b)
  if (highest === 0) return { r: 18, g: 18, b: 24 } // Fallback nền tối
  if (highest > maxVal) {
    const ratio = maxVal / highest
    return {
      r: Math.max(10, Math.floor(c.r * ratio)),
      g: Math.max(10, Math.floor(c.g * ratio)),
      b: Math.max(10, Math.floor(c.b * ratio))
    }
  }
  return {
    r: Math.max(10, c.r),
    g: Math.max(10, c.g),
    b: Math.max(10, c.b)
  }
}

const enforceAccentBrightness = (c: RGB): RGB => {
  const highest = Math.max(c.r, c.g, c.b)
  if (highest === 0) {
    // Nếu hoàn toàn là màu đen, fallback sang màu Emerald mặc định
    return { r: 16, g: 185, b: 129 }
  }

  const minVal = 190
  if (highest < minVal) {
    const ratio = minVal / highest
    return {
      r: Math.min(255, Math.floor(c.r * ratio)),
      g: Math.min(255, Math.floor(c.g * ratio)),
      b: Math.min(255, Math.floor(c.b * ratio))
    }
  }
  return c
}

export const enforceLightness = (c: RGB, minVal: number): RGB => {
  return {
    r: Math.min(250, Math.max(minVal, Math.floor(255 - (255 - c.r) * 0.12))),
    g: Math.min(250, Math.max(minVal, Math.floor(255 - (255 - c.g) * 0.12))),
    b: Math.min(250, Math.max(minVal, Math.floor(255 - (255 - c.b) * 0.12)))
  }
}

export const enforceAccentForLight = (c: RGB): RGB => {
  const highest = Math.max(c.r, c.g, c.b)
  if (highest === 0) return { r: 5, g: 150, b: 105 }
  // Darken saturated accent so it stays readable on light backgrounds
  const maxChannel = 175
  if (highest > maxChannel) {
    const ratio = maxChannel / highest
    return {
      r: Math.floor(c.r * ratio),
      g: Math.floor(c.g * ratio),
      b: Math.floor(c.b * ratio)
    }
  }
  return c
}

const MAX_THEME_CACHE = 500
const themeColorCache = new Map<string, ThemeColors>()
let sharedThemeCanvas: HTMLCanvasElement | null = null
let sharedThemeCtx: CanvasRenderingContext2D | null = null

export const getThemeColorCacheSize = (): number => themeColorCache.size

export const initThemeColorCache = (initialMap: Record<string, ThemeColors>) => {
  if (!initialMap || typeof initialMap !== 'object') return
  for (const [key, val] of Object.entries(initialMap)) {
    if (val && val.primary60 && val.secondary30 && val.accent10) {
      saveThemeColorToCache(key, val)
    }
  }
}

const saveThemeColorToCache = (key: string, val: ThemeColors) => {
  if (themeColorCache.has(key)) {
    themeColorCache.delete(key)
  } else if (themeColorCache.size >= MAX_THEME_CACHE) {
    const oldestKey = themeColorCache.keys().next().value
    if (oldestKey) themeColorCache.delete(oldestKey)
  }
  themeColorCache.set(key, val)
}

export const extractThemeColors = (
  imageSrc: string,
  trackKey?: string,
  colorScheme: 'dark' | 'light' = 'dark'
): Promise<ThemeColors | null> => {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve(null)
      return
    }

    const lookupKey = trackKey || imageSrc
    const cacheKey = `${lookupKey}_${colorScheme}`
    if (themeColorCache.has(cacheKey)) {
      const cached = themeColorCache.get(cacheKey)!
      themeColorCache.delete(cacheKey)
      themeColorCache.set(cacheKey, cached) // Đưa lên đầu danh sách LRU
      resolve(cached)
      return
    }

    if (trackKey && themeColorCache.has(`${imageSrc}_${colorScheme}`)) {
      const cached = themeColorCache.get(`${imageSrc}_${colorScheme}`)!
      resolve(cached)
      return
    }

    const img = new Image()
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }

    const onLoad = () => {
      try {
        if (!sharedThemeCanvas) {
          sharedThemeCanvas = document.createElement('canvas')
          sharedThemeCtx = sharedThemeCanvas.getContext('2d', { willReadFrequently: true })
        }
        const canvas = sharedThemeCanvas
        const ctx = sharedThemeCtx
        if (!ctx) {
          resolve(null)
          return
        }

        // Downscale for performance (48px đủ cho theme, GPU upscale khi hiển thị)
        const MAX_SIZE = 48
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        if (!width || !height) {
          resolve(null)
          return
        }

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width))
            width = MAX_SIZE
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height))
            height = MAX_SIZE
          }
        }

        canvas.width = Math.max(1, width)
        canvas.height = Math.max(1, height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        let imageData: Uint8ClampedArray
        try {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        } catch (e) {
          console.warn('extractThemeColors: Failed to get image data (Canvas tainted).', e)
          resolve(null)
          return
        }

        // Lấy mẫu thưa 1/4 pixel trực tiếp trên TypedArray, không cấp phát mảng object {r,g,b}
        const sampleOffsets: number[] = []
        let mostVibrantR = 0
        let mostVibrantG = 0
        let mostVibrantB = 0
        let maxSaturation = -1

        for (let i = 0; i < imageData.length; i += 16) {
          if (imageData[i + 3] < 128) continue
          sampleOffsets.push(i)
          const r = imageData[i]
          const g = imageData[i + 1]
          const b = imageData[i + 2]
          const maxVal = r > g ? (r > b ? r : b) : g > b ? g : b
          const minVal = r < g ? (r < b ? r : b) : g < b ? g : b
          const sat = maxVal === 0 ? 0 : (maxVal - minVal) / maxVal
          const score = sat * (maxVal > 30 ? 1 : 0.2)
          if (score > maxSaturation) {
            maxSaturation = score
            mostVibrantR = r
            mostVibrantG = g
            mostVibrantB = b
          }
        }

        if (sampleOffsets.length === 0) {
          resolve(null)
          return
        }

        const firstPixel: RGB = {
          r: imageData[sampleOffsets[0]],
          g: imageData[sampleOffsets[0] + 1],
          b: imageData[sampleOffsets[0] + 2]
        }
        const mostVibrantPixel: RGB = { r: mostVibrantR, g: mostVibrantG, b: mostVibrantB }

        // K-Means clustering (K=3) với khởi tạo phân tán
        const step = Math.floor(sampleOffsets.length / 3)
        const s1 = sampleOffsets[Math.min(sampleOffsets.length - 1, step)]
        const s2 = sampleOffsets[Math.min(sampleOffsets.length - 1, step * 2)]
        const cr = [firstPixel.r, imageData[s1], imageData[s2]]
        const cg = [firstPixel.g, imageData[s1 + 1], imageData[s2 + 1]]
        const cb = [firstPixel.b, imageData[s1 + 2], imageData[s2 + 2]]

        const MAX_ITERATIONS = 3
        let count0 = 0
        let count1 = 0
        let count2 = 0

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          let sr0 = 0,
            sg0 = 0,
            sb0 = 0,
            n0 = 0
          let sr1 = 0,
            sg1 = 0,
            sb1 = 0,
            n1 = 0
          let sr2 = 0,
            sg2 = 0,
            sb2 = 0,
            n2 = 0

          for (let j = 0; j < sampleOffsets.length; j++) {
            const off = sampleOffsets[j]
            const r = imageData[off]
            const g = imageData[off + 1]
            const b = imageData[off + 2]

            const dr0 = r - cr[0],
              dg0 = g - cg[0],
              db0 = b - cb[0]
            const d0 = dr0 * dr0 + dg0 * dg0 + db0 * db0
            const dr1 = r - cr[1],
              dg1 = g - cg[1],
              db1 = b - cb[1]
            const d1 = dr1 * dr1 + dg1 * dg1 + db1 * db1
            const dr2 = r - cr[2],
              dg2 = g - cg[2],
              db2 = b - cb[2]
            const d2 = dr2 * dr2 + dg2 * dg2 + db2 * db2

            if (d0 <= d1 && d0 <= d2) {
              sr0 += r
              sg0 += g
              sb0 += b
              n0++
            } else if (d1 <= d2) {
              sr1 += r
              sg1 += g
              sb1 += b
              n1++
            } else {
              sr2 += r
              sg2 += g
              sb2 += b
              n2++
            }
          }

          if (n0 > 0) {
            cr[0] = Math.floor(sr0 / n0)
            cg[0] = Math.floor(sg0 / n0)
            cb[0] = Math.floor(sb0 / n0)
          }
          if (n1 > 0) {
            cr[1] = Math.floor(sr1 / n1)
            cg[1] = Math.floor(sg1 / n1)
            cb[1] = Math.floor(sb1 / n1)
          }
          if (n2 > 0) {
            cr[2] = Math.floor(sr2 / n2)
            cg[2] = Math.floor(sg2 / n2)
            cb[2] = Math.floor(sb2 / n2)
          }
          count0 = n0
          count1 = n1
          count2 = n2
        }

        const counts = [count0, count1, count2]
        const validClusters = [0, 1, 2]
          .map((idx) => ({
            centroid: { r: cr[idx], g: cg[idx], b: cb[idx] },
            count: counts[idx]
          }))
          .filter((c) => c.count > 0)
          .sort((a, b) => b.count - a.count)

        const dominant = validClusters[0]?.centroid || firstPixel
        const secondary = validClusters[1]?.centroid || dominant

        // Nếu ảnh có màu rực rỡ (saturation > 0.15), dùng pixel rực rỡ nhất làm màu nhấn
        // Nếu ảnh đơn sắc / đen trắng, dùng centroid phụ hoặc fallback
        const c10_raw =
          maxSaturation > 0.15 ? mostVibrantPixel : validClusters[2]?.centroid || secondary

        let result: ThemeColors
        if (colorScheme === 'light') {
          const c60 = enforceLightness(dominant, 238)
          const c30 = enforceLightness(secondary, 218)
          const c10 = enforceAccentForLight(c10_raw)
          result = {
            primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
            secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
            accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
          }
        } else {
          const c60 = enforceDarkness(dominant, 35) // Nền chính rất tối
          const c30 = enforceDarkness(secondary, 65) // Nền panel sáng hơn một chút
          const c10 = enforceAccentBrightness(c10_raw)
          result = {
            primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
            secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
            accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
          }
        }

        saveThemeColorToCache(cacheKey, result)
        if (trackKey) saveThemeColorToCache(`${imageSrc}_${colorScheme}`, result)

        if (typeof window !== 'undefined' && (window as any).api?.cacheThemeColors) {
          ;(window as any).api.cacheThemeColors(trackKey || imageSrc, result)
        }

        resolve(result)
      } catch (err) {
        console.warn('extractThemeColors error:', err)
        resolve(null)
      }
    }

    const onError = (): void => {
      console.warn('extractThemeColors: Failed to load image', imageSrc)
      resolve(null)
    }

    img.onload = onLoad
    img.onerror = onError
    img.src = imageSrc
  })
}

export const parseColorToRgb = (color: string): RGB | null => {
  if (!color) return null
  const clean = color.trim()
  if (clean.startsWith('#')) {
    const raw = clean.substring(1)
    if (raw.length === 3) {
      const r = parseInt(raw[0] + raw[0], 16)
      const g = parseInt(raw[1] + raw[1], 16)
      const b = parseInt(raw[2] + raw[2], 16)
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null
      return { r, g, b }
    }
    if (raw.length === 6) {
      const r = parseInt(raw.substring(0, 2), 16)
      const g = parseInt(raw.substring(2, 4), 16)
      const b = parseInt(raw.substring(4, 6), 16)
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null
      return { r, g, b }
    }
  }
  const rgbMatch = clean.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10)
    const g = parseInt(rgbMatch[2], 10)
    const b = parseInt(rgbMatch[3], 10)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b }
    }
  }
  return null
}

export const generateThemeFromColor = (
  color: string,
  colorScheme: 'dark' | 'light' = 'dark'
): ThemeColors => {
  const rgb = parseColorToRgb(color) || { r: 16, g: 185, b: 129 }
  if (colorScheme === 'light') {
    const c60 = enforceLightness(rgb, 238)
    const c30 = enforceLightness(rgb, 218)
    const c10 = enforceAccentForLight(rgb)
    return {
      primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
      secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
      accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
    }
  }
  const c60 = enforceDarkness(rgb, 35)
  const c30 = enforceDarkness(rgb, 65)
  return {
    primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
    secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
    accent10: color
  }
}
