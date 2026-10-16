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

/**
 * Danh sách tên các nhóm nhạc / nghệ sĩ đặc biệt chứa ký tự nối (&, and, +, /, ...)
 * cần bảo toàn nguyên vẹn, không bị phân tách nhầm.
 */
export const PRESERVED_ARTIST_NAMES = [
  'AC/DC',
  'Tyler, The Creator',
  'Earth, Wind & Fire',
  'Earth Wind & Fire',
  'Simon & Garfunkel',
  'Hall & Oates',
  'Daryl Hall & John Oates',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Blood, Sweat & Tears',
  'Brooks & Dunn',
  'Bell, Book & Candle',
  'K/DA',
  'Panic! At The Disco',
  'Florence + The Machine',
  'Florence and the Machine',
  'Tom Petty and the Heartbreakers',
  'KC & The Sunshine Band',
  'K-Ci & JoJo',
  'Meg & Dia',
  'Katrina and the Waves',
  'Huey Lewis & The News',
  'Joan Jett & the Blackhearts',
  'Bob Marley & The Wailers',
  'Marina & The Diamonds',
  'Of Monsters and Men',
  'Above & Beyond',
  'Arms and Sleepers',
  'Me & My',
  'Jack & Jack',
  'Dan + Shay',
  'King & Prince',
  'Sunstroke Project & Olia Tira'
]

/**
 * Phân tách chuỗi nghệ sĩ chứa nhiều tên (feat, ft, &, virgule, comma...)
 * đồng thời bảo tồn các nghệ sĩ đặc biệt trong PRESERVED_ARTIST_NAMES.
 */
export const splitArtistString = (raw: string): string[] => {
  if (!raw || typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'unknown' ||
    trimmed.toLowerCase() === 'unknown artist'
  ) {
    return []
  }

  for (const preserved of PRESERVED_ARTIST_NAMES) {
    if (trimmed.toLowerCase() === preserved.toLowerCase()) {
      return [preserved]
    }
  }

  let working = trimmed
  const placeholders: { token: string; original: string }[] = []
  PRESERVED_ARTIST_NAMES.forEach((preserved, idx) => {
    const regex = new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    if (regex.test(working)) {
      const token = `__PRESERVED_ARTIST_${idx}__`
      working = working.replace(regex, token)
      placeholders.push({ token, original: preserved })
    }
  })

  // Bảo vệ hậu tố danh xưng đi kèm dấu phẩy (ví dụ: Grover Washington, Jr. hoặc Sammy Davis, Jr.)
  working = working.replace(
    /,\s*(Jr\.?|Sr\.?|III|II|IV)(?=$|[\s,;\/|)\]])/gi,
    (_, g1) => `___JRSR___${g1}`
  )

  // Chuẩn hóa định dạng feat / ft trong ngoặc: (feat. X) -> feat. X
  working = working.replace(
    /[\(\[\{]\s*(?:feat\.?|ft\.?|featuring)\s+([^()\]\}]+)[\)\]\}]/gi,
    ' feat. $1'
  )

  // Tách bằng các ký hiệu phân cách phổ biến
  const splitRegex =
    /(?:\s*;\s*|\0+|\s*[\/\\]+\s*|\s*\|\s*|\s+(?:feat\.?|ft\.?|featuring|with|vs\.?)\s+|\s+[&xX+]\s+|[，、；]|\s*,\s*)/i
  const parts = working.split(splitRegex)
  const result: string[] = []

  for (let part of parts) {
    for (const p of placeholders) {
      part = part.replace(new RegExp(p.token, 'g'), p.original)
    }
    part = part.replace(/___JRSR___/g, ', ')

    const clean = part
      .trim()
      .replace(/^[\(\[\{]/, '')
      .replace(/[\)\]\}]$/, '')
      .trim()
    if (clean && clean.toLowerCase() !== 'unknown' && clean.toLowerCase() !== 'unknown artist') {
      if (/^(jr\.?|sr\.?|iii|ii|iv)$/i.test(clean)) continue

      if (!result.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
        result.push(clean)
      }
    }
  }

  return result.length > 0 ? result : [trimmed]
}
