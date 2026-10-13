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
