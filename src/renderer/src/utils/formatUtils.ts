/**
 * Tiện ích nhận diện và định dạng âm thanh (Hỗ trợ chuyên sâu DSD / Lossless / PCM)
 */

/**
 * Tính phạm vi toạ độ tua hợp lệ của một track trên thẻ audio (toạ độ vật lý):
 * - Track CUE: [startTime, endTime] là đoạn bên trong tệp vật lý dùng chung.
 * - Track thường: [0, thời lượng tệp].
 * Fallback khi thiếu endTime: start + duration (độ dài ảo của track), cuối cùng
 * là thời lượng vật lý đang biết của thẻ audio.
 */
export function getTrackSeekRange(
  track: any,
  physicalDuration?: number
): { start: number; end: number } {
  const start =
    typeof track?.startTime === 'number' && !isNaN(track.startTime) && track.startTime > 0
      ? track.startTime
      : 0
  const endTime = typeof track?.endTime === 'number' && !isNaN(track.endTime) ? track.endTime : 0
  let end = endTime > start ? endTime : 0
  if (!end && typeof track?.duration === 'number' && !isNaN(track.duration) && track.duration > 0) {
    end = start + track.duration
  }
  if (
    !end &&
    typeof physicalDuration === 'number' &&
    !isNaN(physicalDuration) &&
    physicalDuration > 0
  ) {
    end = physicalDuration
  }
  return { start, end }
}

/**
 * Kẹp một vị trí tua (toạ độ vật lý của thẻ audio) vào phạm vi [start, end]
 * của track. Trả về start nếu giá trị không hợp lệ.
 */
export function clampSeekRange(value: number, range: { start: number; end: number }): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return range.start
  const clamped = Math.max(range.start, value)
  return range.end > 0 ? Math.min(range.end, clamped) : clamped
}

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

  const badgeLabel = isDsd ? dsdRate : track?.format ? track.format.toUpperCase() : 'MP3'

  const bitDepthLabel = isDsd
    ? '1-BIT'
    : track?.bitDepth && track.bitDepth > 0
      ? `${track.bitDepth}-BIT`
      : undefined

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

/**
 * Định dạng thời lượng giây sang mm:ss (hoặc hh:mm:ss nếu > 1 giờ)
 */
export function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

/**
 * Định dạng kích thước tệp byte sang B, KB, MB, GB
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

/**
 * Định dạng bitrate sang kbps hoặc Mbps
 */
export function formatBitrate(bitrate?: number): string {
  if (!bitrate || isNaN(bitrate) || bitrate <= 0) return ''
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(2)} Mbps`
  }
  return `${Math.round(bitrate / 1000)} kbps`
}

/**
 * Định dạng ngày giờ chuẩn
 */
export function formatDate(val?: number | string | Date): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString()
  } catch {
    return ''
  }
}
