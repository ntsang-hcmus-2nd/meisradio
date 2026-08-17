export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ThemeColors {
  primary60: string;
  secondary30: string;
  accent10: string;
}

const colorDistance = (c1: RGB, c2: RGB) => {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
};

const getSaturation = (c: RGB): number => {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
};

const enforceDarkness = (c: RGB, maxVal: number): RGB => {
  const highest = Math.max(c.r, c.g, c.b);
  if (highest === 0) return { r: 18, g: 18, b: 24 }; // Fallback nền tối
  if (highest > maxVal) {
    const ratio = maxVal / highest;
    return {
      r: Math.max(10, Math.floor(c.r * ratio)),
      g: Math.max(10, Math.floor(c.g * ratio)),
      b: Math.max(10, Math.floor(c.b * ratio))
    };
  }
  return {
    r: Math.max(10, c.r),
    g: Math.max(10, c.g),
    b: Math.max(10, c.b)
  };
};

const enforceAccentBrightness = (c: RGB): RGB => {
  const highest = Math.max(c.r, c.g, c.b);
  if (highest === 0) {
    // Nếu hoàn toàn là màu đen, fallback sang màu Emerald mặc định
    return { r: 16, g: 185, b: 129 };
  }
  
  const minVal = 190;
  if (highest < minVal) {
    const ratio = minVal / highest;
    return {
      r: Math.min(255, Math.floor(c.r * ratio)),
      g: Math.min(255, Math.floor(c.g * ratio)),
      b: Math.min(255, Math.floor(c.b * ratio))
    };
  }
  return c;
};

const MAX_THEME_CACHE = 500
const themeColorCache = new Map<string, ThemeColors>()

export const initThemeColorCache = (initialMap: Record<string, ThemeColors>) => {
  if (!initialMap || typeof initialMap !== 'object') return
  for (const [key, val] of Object.entries(initialMap)) {
    if (val && val.primary60 && val.secondary30 && val.accent10) {
      themeColorCache.set(key, val)
    }
  }
}

const saveThemeColorToCache = (key: string, val: ThemeColors) => {
  if (themeColorCache.size >= MAX_THEME_CACHE) {
    const oldestKey = themeColorCache.keys().next().value
    if (oldestKey) themeColorCache.delete(oldestKey)
  }
  themeColorCache.set(key, val)
}

export const extractThemeColors = (imageSrc: string, trackKey?: string): Promise<ThemeColors | null> => {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve(null);
      return;
    }

    const lookupKey = trackKey || imageSrc;
    if (themeColorCache.has(lookupKey)) {
      const cached = themeColorCache.get(lookupKey)!
      themeColorCache.delete(lookupKey)
      themeColorCache.set(lookupKey, cached) // Đưa lên đầu danh sách LRU
      resolve(cached);
      return;
    }

    if (trackKey && themeColorCache.has(imageSrc)) {
      const cached = themeColorCache.get(imageSrc)!
      resolve(cached);
      return;
    }

    const img = new Image();
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    const onLoad = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        
        // Downscale for performance
        const MAX_SIZE = 100;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          resolve(null);
          return;
        }

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * (MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round(width * (MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }
        
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        let imageData: Uint8ClampedArray;
        try {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch (e) {
          console.warn("extractThemeColors: Failed to get image data (Canvas tainted).", e);
          resolve(null);
          return;
        }
        
        const pixels: RGB[] = [];
        for (let i = 0; i < imageData.length; i += 4) {
          // Bỏ qua pixel trong suốt
          if (imageData[i + 3] < 128) continue;
          pixels.push({
            r: imageData[i],
            g: imageData[i + 1],
            b: imageData[i + 2]
          });
        }
        
        if (pixels.length === 0) {
          resolve(null);
          return;
        }

        // Tìm mẫu màu có độ bão hòa (saturation) cao nhất để làm màu nhấn
        let mostVibrantPixel: RGB = pixels[0];
        let maxSaturation = -1;

        for (const p of pixels) {
          const sat = getSaturation(p);
          const maxVal = Math.max(p.r, p.g, p.b);
          // Ưu tiên màu có độ bão hòa cao và không quá tối
          const score = sat * (maxVal > 30 ? 1 : 0.2);
          if (score > maxSaturation) {
            maxSaturation = score;
            mostVibrantPixel = p;
          }
        }

        // K-Means clustering (K=3) với khởi tạo phân tán
        const step = Math.floor(pixels.length / 3);
        const centroids: RGB[] = [
          pixels[0],
          pixels[Math.min(pixels.length - 1, step)],
          pixels[Math.min(pixels.length - 1, step * 2)]
        ];
        
        const MAX_ITERATIONS = 5;
        let clusters: RGB[][] = [[], [], []];
        
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          clusters = [[], [], []];
          
          for (const pixel of pixels) {
            let minDist = Infinity;
            let minIndex = 0;
            for (let i = 0; i < 3; i++) {
              const dist = colorDistance(pixel, centroids[i]);
              if (dist < minDist) {
                minDist = dist;
                minIndex = i;
              }
            }
            clusters[minIndex].push(pixel);
          }
          
          for (let i = 0; i < 3; i++) {
            if (clusters[i].length === 0) continue;
            let r = 0, g = 0, b = 0;
            for (const p of clusters[i]) {
              r += p.r; g += p.g; b += p.b;
            }
            centroids[i] = {
              r: Math.floor(r / clusters[i].length),
              g: Math.floor(g / clusters[i].length),
              b: Math.floor(b / clusters[i].length)
            };
          }
        }
        
        const validClusters = clusters
          .map((cluster, index) => ({ centroid: centroids[index], count: cluster.length }))
          .filter(c => c.count > 0)
          .sort((a, b) => b.count - a.count);
        
        const dominant = validClusters[0]?.centroid || pixels[0];
        const secondary = validClusters[1]?.centroid || dominant;

        const c60 = enforceDarkness(dominant, 35); // Nền chính rất tối
        const c30 = enforceDarkness(secondary, 65); // Nền panel sáng hơn một chút

        // Nếu ảnh có màu rực rỡ (saturation > 0.15), dùng pixel rực rỡ nhất làm màu nhấn
        // Nếu ảnh đơn sắc / đen trắng, dùng centroid phụ hoặc fallback
        const c10_raw =
          maxSaturation > 0.15 ? mostVibrantPixel : validClusters[2]?.centroid || secondary

        const c10 = enforceAccentBrightness(c10_raw)

        const result: ThemeColors = {
          primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
          secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
          accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
        }

        saveThemeColorToCache(lookupKey, result)
        if (trackKey) saveThemeColorToCache(imageSrc, result)

        if (typeof window !== 'undefined' && (window as any).api?.cacheThemeColors) {
          (window as any).api.cacheThemeColors(trackKey || imageSrc, result)
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
    img.src = imageSrc;
  });
};
