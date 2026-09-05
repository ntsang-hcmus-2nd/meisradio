export function toMediaUrl(path: string | undefined | null): string {
  if (!path) return ''
  const trimmed = path.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed
  }
  if (trimmed.startsWith('media:///')) {
    return trimmed
  }
  if (trimmed.startsWith('media://')) {
    return trimmed.replace(/^media:\/\//, 'media:///')
  }
  if (trimmed.startsWith('file:///')) {
    return trimmed.replace(/^file:\/\/\//, 'media:///')
  }
  if (trimmed.startsWith('file://')) {
    return trimmed.replace(/^file:\/\//, 'media:///')
  }
  let clean = trimmed.replace(/\\/g, '/')
  if (!clean.startsWith('/')) {
    clean = '/' + clean
  }
  return `media://${encodeURI(clean).replace(/#/g, '%23')}`
}
