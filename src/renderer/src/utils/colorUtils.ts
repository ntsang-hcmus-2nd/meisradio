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

export const extractThemeColors = (imageSrc: string): Promise<ThemeColors | null> => {
  return new Promise((resolve) => {
    const img = new Image();

    const onLoad = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      
      // Downscale for performance
      const MAX_SIZE = 100;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch (e) {
        console.warn("extractThemeColors: Failed to get image data (Canvas tainted).", e);
        resolve(null);
        return;
      }
      const pixels: RGB[] = [];
      
      for (let i = 0; i < imageData.length; i += 4) {
        // Ignore fully transparent pixels
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

      // Simple K-Means clustering (K=3)
      let centroids = [
        pixels[0],
        pixels[Math.floor(pixels.length / 2)],
        pixels[pixels.length - 1]
      ];
      
      const MAX_ITERATIONS = 5;
      let clusters: RGB[][] = [[], [], []];
      
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        clusters = [[], [], []];
        
        // Assign pixels to nearest centroid
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
        
        // Update centroids
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
      
      // Sort clusters by size descending
      const sortedClusters = clusters
        .map((cluster, index) => ({ centroid: centroids[index], count: cluster.length }))
        .sort((a, b) => b.count - a.count);
      
      // The largest cluster is 60%, next is 30%, smallest is 10%
      // Đảm bảo màu nền đủ tối để chữ trắng dễ đọc
      const enforceDarkness = (c: RGB, maxVal: number): RGB => {
        const highest = Math.max(c.r, c.g, c.b);
        if (highest > maxVal) {
          const ratio = maxVal / highest;
          return {
            r: Math.floor(c.r * ratio),
            g: Math.floor(c.g * ratio),
            b: Math.floor(c.b * ratio)
          };
        }
        return c;
      };

      // Đảm bảo màu nhấn đủ sáng để nổi bật trên nền tối
      const enforceBrightness = (c: RGB, minVal: number): RGB => {
        const highest = Math.max(c.r, c.g, c.b);
        if (highest < minVal) {
          const ratio = minVal / Math.max(1, highest);
          return {
            r: Math.min(255, Math.floor(c.r * ratio)),
            g: Math.min(255, Math.floor(c.g * ratio)),
            b: Math.min(255, Math.floor(c.b * ratio))
          };
        }
        return c;
      };
      
      const c60 = enforceDarkness(sortedClusters[0].centroid, 45); // Nền chính rất tối
      const c30 = enforceDarkness(sortedClusters[1]?.centroid || sortedClusters[0].centroid, 75); // Panel sáng hơn một chút
      const c10_raw = sortedClusters[2]?.centroid || sortedClusters[0].centroid;
      const c10 = enforceBrightness(c10_raw, 180); // Màu nhấn phải đủ sáng

      resolve({
        primary60: `rgb(${c60.r}, ${c60.g}, ${c60.b})`,
        secondary30: `rgb(${c30.r}, ${c30.g}, ${c30.b})`,
        accent10: `rgb(${c10.r}, ${c10.g}, ${c10.b})`
      });
    };
    
    const onError = () => {
      console.warn('extractThemeColors: Failed to load image', imageSrc);
      resolve(null);
    };

    img.onload = onLoad;
    img.onerror = onError;
    img.src = imageSrc;
  });
};
