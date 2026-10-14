/**
 * Tiện ích nhận diện và định dạng âm thanh (Hỗ trợ chuyên sâu DSD / Lossless / PCM)
 */

/**
 * Kiểm tra xem một bài hát có phải là định dạng DSD (Direct Stream Digital: .dsf, .dff, .dsd) hay không
 */
export function isDsdTrack(track?: any): boolean {
  if (!track) return false

  // 1. Kiểm tra đuôi file từ filePath hoặc id
  const targetPath = (track.filePath || track.id || '').toString()
  if (/\.(dsf|dff|dsd)($|[?#])/i.test(targetPath)) {
    return true
  }

  // 2. Kiểm tra thuộc tính format / container
  const fmt = (track.format || '').toString().trim()
  if (/^(dsd|dsf|dff|dsdiff)/i.test(fmt) || /dsd/i.test(fmt)) {
    return true
  }

  // 3. Tần số lấy mẫu siêu cao (DSD64: 2.8224MHz trở lên)
  if (track.sampleRate && typeof track.sampleRate === 'number' && track.sampleRate >= 2000000) {
    return true
  }

  // 4. Độ sâu bit 1-bit nguyên bản của luồng DSD
  if (track.bitDepth === 1) {
    return true
  }

  return false
}

/**
 * Lấy nhãn phân cấp tốc độ lấy mẫu chuẩn của DSD (DSD64, DSD128, DSD256, DSD512, DSD1024)
 */
export function getDsdRateLabel(sampleRate?: number): string {
  if (!sampleRate || sampleRate <= 0) return 'DSD'
  if (sampleRate >= 45158400) return 'DSD1024'
  if (sampleRate >= 22579200) return 'DSD512'
  if (sampleRate >= 11289600) return 'DSD256'
  if (sampleRate >= 5644800) return 'DSD128'
  if (sampleRate >= 2822400) return 'DSD64'
  if (sampleRate >= 2000000) {
    const factor = Math.round(sampleRate / 44100)
    return `DSD${factor}`
  }
  return 'DSD'
}

/**
 * Chuẩn hóa hiển thị tần số lấy mẫu (MHz cho DSD, kHz cho PCM, Hz cho dải thấp)
 */
export function formatAudioSampleRate(sampleRate?: number): string {
  if (!sampleRate || sampleRate <= 0) return ''
  if (sampleRate >= 1000000) {
    return `${(sampleRate / 1000000).toFixed(2)} MHz`
  }
  if (sampleRate >= 1000) {
    return `${(sampleRate / 1000).toFixed(1).replace('.0', '')} kHz`
  }
  return `${sampleRate} Hz`
}

/**
 * Thông tin chi tiết để hiển thị huy hiệu (Quality Badge) trên toàn bộ ứng dụng
 */
export interface TrackFormatDisplayInfo {
  isDsd: boolean
  dsdRateLabel: string
  badgeLabel: string
  bitDepthLabel?: string
  sampleRateLabel: string
  isLossless: boolean
  isHiRes: boolean
}

export function getTrackFormatDisplay(track: any): TrackFormatDisplayInfo {
  const isDsd = isDsdTrack(track)
  const dsdRate = isDsd ? getDsdRateLabel(track?.sampleRate) : ''
  const isLossless = Boolean(
    track?.lossless ||
    isDsd ||
    ['FLAC', 'WAV', 'ALAC', 'AIFF', 'APE'].includes((track?.format || '').toUpperCase())
  )
  const isHiRes = Boolean(
    isDsd ||
    (track?.sampleRate && track.sampleRate >= 88200) ||
    (track?.bitDepth && track.bitDepth >= 24)
  )

  const badgeLabel = isDsd
    ? dsdRate
    : (track?.format ? track.format.toUpperCase() : 'MP3')

  const bitDepthLabel = isDsd
    ? '1-BIT'
    : (track?.bitDepth && track.bitDepth > 0 ? `${track.bitDepth}-BIT` : undefined)

  const sampleRateLabel = formatAudioSampleRate(track?.sampleRate)

  return {
    isDsd,
    dsdRateLabel: dsdRate,
    badgeLabel,
    bitDepthLabel,
    sampleRateLabel,
    isLossless,
    isHiRes
  }
}
