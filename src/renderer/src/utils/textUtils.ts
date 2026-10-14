/**
 * Loại bỏ dấu tiếng Việt và chuẩn hóa chuỗi để tìm kiếm thông minh
 */
export function removeAccents(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .trim()
}

/**
 * Tạo chuỗi tìm kiếm chuẩn hóa một lần duy nhất cho bài hát
 */
export function buildTrackSearchKey(track: any): string {
  if (!track) return ''
  const title = track.title || ''
  const artist = track.artist || ''
  const album = track.album || ''
  const artists = Array.isArray(track.artists) ? track.artists.join(' ') : ''
  return removeAccents(`${title} ${artist} ${album} ${artists}`)
}

/**
 * Kiểm tra xem chuỗi nguồn có chứa từ khóa tìm kiếm (hỗ trợ không dấu) hay không
 */
export function matchesQuery(
  source: string | null | undefined,
  normalizedQuery: string
): boolean {
  if (!source || !normalizedQuery) return false
  const normalizedSource = removeAccents(source)
  return normalizedSource.includes(normalizedQuery)
}

/**
 * So khớp bài hát với từ khóa tìm kiếm sử dụng chuỗi chỉ mục _searchKey được lưu sẵn
 */
export function matchesTrackQuery(
  track: any,
  normalizedQuery: string
): boolean {
  if (!track || !normalizedQuery) return false
  if (!track._searchKey) {
    track._searchKey = buildTrackSearchKey(track)
  }
  return (track._searchKey as string).includes(normalizedQuery)
}
