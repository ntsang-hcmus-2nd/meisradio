import { useEffect } from 'react'
import {
  usePlayerStore,
  useLyricsStore,
  useSettingsStore,
  useUIStore,
  useLibraryStore
} from '../stores'
import { useTranslation } from '../locales'
import { getTrackKey } from '../utils/trackStateUtils'
import type { LyricLine } from '../components/SyncedLyricsList'

// Chuẩn hóa mọi dạng dữ liệu lời bài hát về chuỗi
export const lyricsToText = (raw: any): string => {
  if (!raw) return ''
  let text = ''
  if (typeof raw === 'string') text = raw
  else if (Array.isArray(raw)) text = raw.map((r) => lyricsToText(r)).join('\n')
  else if (typeof raw === 'object') text = typeof raw.text === 'string' ? raw.text : ''
  return text.replace(/^\uFEFF/, '')
}

export const parseLRC = (rawText: any): LyricLine[] => {
  const lrcText = lyricsToText(rawText)
  if (!lrcText) return []

  let globalOffset = 0
  const offsetMatch = /\[offset:\s*(-?\d+)\]/i.exec(lrcText)
  if (offsetMatch) {
    globalOffset = parseInt(offsetMatch[1], 10) / 1000
  }

  const lines = lrcText.split(/\r?\n/)
  const result: LyricLine[] = []
  const timeRegexGlobal = /\[(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?\]/g

  lines.forEach((line) => {
    const matches = Array.from(line.matchAll(timeRegexGlobal))
    if (matches.length === 0) return

    const wordTagRegex = /<(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?>/g
    let words: { time: number; text: string }[] | undefined = undefined

    const contentAfterLineTimestamps = line.replace(timeRegexGlobal, '').trim()
    if (wordTagRegex.test(contentAfterLineTimestamps)) {
      words = []
      wordTagRegex.lastIndex = 0

      const firstTagIdx = contentAfterLineTimestamps.indexOf('<')
      if (firstTagIdx > 0) {
        const leading = contentAfterLineTimestamps.substring(0, firstTagIdx).trim()
        if (leading) {
          const m0 = matches[0]
          const lineStart =
            parseInt(m0[1], 10) * 60 +
            parseInt(m0[2], 10) +
            (m0[3] ? parseInt(m0[3].padEnd(3, '0'), 10) / 1000 : 0) +
            globalOffset
          words.push({ time: Math.max(0, lineStart), text: leading })
        }
      }

      const tokenRegex = /<(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g
      let tokenMatch: RegExpExecArray | null
      while ((tokenMatch = tokenRegex.exec(contentAfterLineTimestamps)) !== null) {
        const wMin = parseInt(tokenMatch[1], 10)
        const wSec = parseInt(tokenMatch[2], 10)
        const wMs = tokenMatch[3] ? parseInt(tokenMatch[3].padEnd(3, '0'), 10) : 0
        const wTime = Math.max(0, wMin * 60 + wSec + wMs / 1000 + globalOffset)
        const wText = tokenMatch[4].trim()
        if (wText) {
          words.push({ time: wTime, text: wText })
        }
      }

      if (words.length === 0) words = undefined
    }

    const text = line
      .replace(timeRegexGlobal, '')
      .replace(/<\d+:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .trim()
    if (!text) return

    for (const match of matches) {
      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0
      let time = minutes * 60 + seconds + milliseconds / 1000 + globalOffset
      if (time < 0) time = 0
      result.push({ time, text, words })
    }
  })

  return result.sort((a, b) => a.time - b.time)
}

export const parsePlainLyrics = (rawText: any): LyricLine[] => {
  const text = lyricsToText(rawText)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\[[a-z]{2,}:[^\]]*\]\s*$/i, '').trimEnd())
  const compact: string[] = []
  for (const l of lines) {
    if (!l.trim()) {
      if (compact.length > 0 && compact[compact.length - 1] !== '') compact.push('')
    } else compact.push(l)
  }
  while (compact.length > 0 && compact[compact.length - 1] === '') compact.pop()
  return compact.map((l) => ({ time: 0, text: l, unsynced: true }))
}

export const buildLyricLines = (raw: any): LyricLine[] => {
  const synced = parseLRC(raw)
  if (synced.length > 0) return synced
  return parsePlainLyrics(raw)
}

export function useLyrics() {
  const { t } = useTranslation()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setLyricOffset = usePlayerStore((s) => s.setLyricOffset)
  const showToast = useUIStore((s) => s.showToast)
  const updateTrackLyricOffset = useLibraryStore((s) => s.updateTrackLyricOffset)
  const { lyrics, setLyrics, setCurrentLyricIndex, originalCover, setOriginalCover } =
    useLyricsStore()
  const appMode = useSettingsStore((s) => s.appMode)
  const isLyricsMaximized = useUIStore((s) => s.isLyricsMaximized)
  const trackLyricOffsets = useLibraryStore((s) => s.trackLyricOffsets)

  const isLite = appMode === 'lite' || appMode === 'core'

  // Per-Track Lyric Offset: restore saved offset when track changes
  // (toàn bộ offsets đã được App preload vào trackLyricOffsets qua getLyricOffsets)
  useEffect(() => {
    if (currentTrack) {
      const trackKey = getTrackKey(currentTrack)
      if (trackKey && trackLyricOffsets[trackKey] !== undefined) {
        setLyricOffset(trackLyricOffsets[trackKey])
      } else {
        setLyricOffset(0)
      }
    }
  }, [currentTrack, currentTrack?.filePath, currentTrack?.id, setLyricOffset, trackLyricOffsets])

  // Fetch Original High-Res Cover for Fullscreen Lyrics
  useEffect(() => {
    if (!isLyricsMaximized || isLite || !currentTrack) {
      setOriginalCover(null)
      return
    }

    if (currentTrack.isOnline) {
      setOriginalCover(currentTrack.coverArtHighRes || currentTrack.coverArt || null)
      return
    }

    let isCurrent = true
    if (!currentTrack.isCloud && (currentTrack.id || currentTrack.filePath)) {
      window.api
        ?.getOriginalTrackCover?.(currentTrack.id || currentTrack.filePath)
        ?.then((cover: string | null) => {
          if (isCurrent) {
            setOriginalCover(cover || currentTrack.coverArt || null)
          }
        })
        ?.catch(() => {
          if (isCurrent) setOriginalCover(currentTrack.coverArt || null)
        })
    } else {
      setOriginalCover(currentTrack.coverArt || null)
    }

    return () => {
      isCurrent = false
    }
  }, [
    isLyricsMaximized,
    currentTrack,
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.coverArt,
    currentTrack?.coverArtHighRes,
    currentTrack?.isOnline,
    currentTrack?.isCloud,
    setOriginalCover,
    isLite
  ])

  // Load Lyrics: file .lrc -> embedded -> online APIs
  useEffect(() => {
    setCurrentLyricIndex(-1)
    if (isLite || !currentTrack) {
      setLyrics([])
      return
    }

    let cancelled = false
    const trackPath = currentTrack.id || currentTrack.filePath
    setLyrics([])

    const loadLyrics = async () => {
      // 1. File .lrc cùng thư mục
      if (trackPath && (window as any).api?.readLrcFile) {
        try {
          const externalLrc = await (window as any).api.readLrcFile(trackPath)
          if (cancelled) return
          const parsedExternal = buildLyricLines(externalLrc)
          if (parsedExternal.length > 0) {
            setLyrics(parsedExternal)
            return
          }
        } catch (e) {
          console.warn('Lỗi đọc file .lrc:', e)
        }
      }

      // 2. Lời nhúng trong metadata
      const parsedInternal = buildLyricLines(currentTrack.lyrics)
      if (parsedInternal.length > 0) {
        setLyrics(parsedInternal)
        return
      }

      // 3. Lời online
      if (
        currentTrack.title &&
        currentTrack.artist &&
        !currentTrack.artist.toLowerCase().includes('unknown')
      ) {
        try {
          // @ts-ignore
          const mmRes = await window.api?.fetchMusixmatchLyrics?.(
            currentTrack.title,
            currentTrack.artist,
            currentTrack.album,
            currentTrack.duration
          )
          if (cancelled) return
          if (mmRes?.success && mmRes.lyrics) {
            const parsedOnline = mmRes.isSynced ? parseLRC(mmRes.lyrics) : []
            if (parsedOnline.length > 0) {
              setLyrics(parsedOnline)
              return
            }
            const plainOnline = parsePlainLyrics(mmRes.lyrics)
            if (plainOnline.length > 0) {
              setLyrics([
                ...plainOnline,
                { time: 0, text: '', unsynced: true },
                {
                  time: 0,
                  text: `(${t('lyrics.sourceNote', {
                    source:
                      mmRes.source === 'lrclib'
                        ? 'LRCLIB'
                        : mmRes.source === 'netease'
                          ? 'NetEase Cloud'
                          : mmRes.source === 'kugou'
                            ? 'Kugou Music'
                            : 'Musixmatch'
                  })})`,
                  unsynced: true
                }
              ])
              return
            }
          }
        } catch (e) {
          console.error('Lỗi lấy lời Musixmatch', e)
        }
      }

      if (!cancelled) setLyrics([])
    }

    loadLyrics()
    return () => {
      cancelled = true
    }
  }, [currentTrack, isLite, setCurrentLyricIndex, setLyrics, t])

  const changeLyricOffset = (delta: number) => {
    setLyricOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10
      try {
        localStorage.setItem('meis_lyric_offset', String(next))
      } catch {}
      if (currentTrack) {
        const trackKey = getTrackKey(currentTrack)
        if (trackKey) {
          updateTrackLyricOffset(trackKey, next)
          window.api?.setLyricOffset?.(trackKey, next).catch(() => {})
        }
      }
      showToast(t('player.lyricOffsetToast', { offset: next > 0 ? `+${next}` : next }), 'info')
      return next
    })
  }

  const resetLyricOffset = () => {
    setLyricOffset(0)
    try {
      localStorage.setItem('meis_lyric_offset', '0')
    } catch {}
    if (currentTrack) {
      const trackKey = getTrackKey(currentTrack)
      if (trackKey) {
        updateTrackLyricOffset(trackKey, 0)
        window.api?.setLyricOffset?.(trackKey, 0).catch(() => {})
      }
    }
    showToast(t('player.lyricOffsetResetToast'), 'info')
  }

  return {
    lyrics,
    originalCover,
    changeLyricOffset,
    resetLyricOffset
  }
}
