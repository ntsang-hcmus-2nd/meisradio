// Fast Radix-2 In-Place Cooley-Tukey FFT
function computeFFT(re: Float32Array, im: Float32Array, n: number) {
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp
      temp = im[i]; im[i] = im[j]; im[j] = temp
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const angle = (-2 * Math.PI) / len
    const wStepRe = Math.cos(angle)
    const wStepIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < half; k++) {
        const pos1 = i + k
        const pos2 = i + k + half
        const uRe = re[pos1]
        const uIm = im[pos1]
        const vRe = re[pos2] * wRe - im[pos2] * wIm
        const vIm = re[pos2] * wIm + im[pos2] * wRe
        re[pos1] = uRe + vRe
        im[pos1] = uIm + vIm
        re[pos2] = uRe - vRe
        im[pos2] = uIm - vIm
        const nextWRe = wRe * wStepRe - wIm * wStepIm
        wIm = wRe * wStepIm + wIm * wStepRe
        wRe = nextWRe
      }
    }
  }
}

// Spek / Audacity style color palette
function getColor(norm: number): [number, number, number] {
  if (norm <= 0.02) return [10, 10, 24] // Black / Navy background
  
  if (norm < 0.2) {
    const t = norm / 0.2
    return [
      Math.floor(10 + t * 40),
      Math.floor(10 + t * 20),
      Math.floor(24 + t * 140)
    ] // Deep Indigo
  } else if (norm < 0.4) {
    const t = (norm - 0.2) / 0.2
    return [
      Math.floor(50 + t * 10),
      Math.floor(30 + t * 160),
      Math.floor(164 - t * 40)
    ] // Cyan / Teal
  } else if (norm < 0.65) {
    const t = (norm - 0.4) / 0.25
    return [
      Math.floor(60 + t * 195),
      Math.floor(190 + t * 50),
      Math.floor(124 - t * 124)
    ] // Green / Lime
  } else if (norm < 0.85) {
    const t = (norm - 0.65) / 0.2
    return [
      255,
      Math.floor(240 - t * 160),
      0
    ] // Yellow / Orange
  } else {
    const t = (norm - 0.85) / 0.15
    return [
      255,
      Math.floor(80 + t * 175),
      Math.floor(t * 255)
    ] // Orange / Red / White
  }
}

self.onmessage = (e: MessageEvent) => {
  const { channelData, width, height, fftSize = 2048 } = e.data
  try {
    const W = width
    const H = height
    const totalSamples = channelData.length
    const halfFFT = fftSize / 2

    const hanning = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
    }

    const pixels = new Uint8ClampedArray(W * H * 4)
    const re = new Float32Array(fftSize)
    const im = new Float32Array(fftSize)

    for (let x = 0; x < W; x++) {
      const sampleCenter = Math.floor((x / W) * (totalSamples - fftSize))
      if (sampleCenter < 0 || sampleCenter + fftSize > totalSamples) continue

      for (let i = 0; i < fftSize; i++) {
        re[i] = channelData[sampleCenter + i] * hanning[i]
        im[i] = 0
      }

      computeFFT(re, im, fftSize)

      for (let y = 0; y < H; y++) {
        const binFloat = ((H - 1 - y) / (H - 1)) * (halfFFT - 1)
        const binStart = Math.max(0, Math.floor(binFloat))
        const binEnd = Math.min(halfFFT - 1, Math.ceil(((H - y) / (H - 1)) * (halfFFT - 1)))

        let maxMag = 0
        for (let b = binStart; b <= binEnd; b++) {
          const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b])
          if (mag > maxMag) maxMag = mag
        }

        const normalizedMag = maxMag / (halfFFT * 0.5)
        const dB = 20 * Math.log10(normalizedMag + 1e-6)
        const norm = Math.max(0, Math.min(1, (dB + 95) / 95))

        const [r, g, b] = getColor(norm)
        const pixelIndex = (y * W + x) * 4
        pixels[pixelIndex] = r
        pixels[pixelIndex + 1] = g
        pixels[pixelIndex + 2] = b
        pixels[pixelIndex + 3] = 255
      }
    }

    // Zero-copy transfer of pixels buffer back to main thread
    ;(self as any).postMessage({ success: true, pixels: pixels.buffer }, [pixels.buffer])
  } catch (err: any) {
    ;(self as any).postMessage({ success: false, error: err.message || 'Worker STFT error' })
  }
}

export {}
