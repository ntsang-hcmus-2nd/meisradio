import { useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useAudioStore } from '../stores/audioStore'
import { isDsdTrack } from '../utils/formatUtils'

interface ActiveListeningSession {
  track: any
  audioMode: string
  playedAt: number
  listenedSec: number
  savedSec: number
  eventId: number | null
  lastTick: number
}

/**
 * Hook theo dõi thời gian nghe nhạc thực tế (Actual Listening Time Tracker).
 *
 * Thay vì cộng toàn bộ độ dài của tệp track vào thống kê ngay khi bấm phát:
 * 1. Chỉ tích lũy thời gian khi âm thanh đang thực sự phát (isPlaying === true).
 * 2. Tự động bỏ qua các lượt skip chớp nhoáng (< 5s hoặc < 50% thời lượng track ngắn)
 *    để không tạo rác bản ghi và không làm phình to lượt nghe (totalPlays) ảo.
 * 3. Khi đạt ngưỡng nghe tối thiểu, ghi nhận lượt nghe và đồng bộ định kỳ mỗi 5 giây.
 * 4. Tự động cập nhật vào SQLite khi tạm dừng, chuyển bài, hết bài (kể cả lặp repeat-one),
 *    hoặc khi đóng ứng dụng (beforeunload).
 */
export function useListeningTracker(): void {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const bitPerfectType = useAudioStore((s) => s.bitPerfectType)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const repeatMode = usePlayerStore((s) => s.repeatMode)

  const sessionRef = useRef<ActiveListeningSession | null>(null)
  const prevTimeRef = useRef<number>(0)
  const prevIsPlayingRef = useRef<boolean>(false)

  // Ngưỡng thời gian tối thiểu để tính là một lượt nghe hợp lệ
  const getMinThreshold = useCallback((duration?: number): number => {
    return Math.min(5, (duration || 10) * 0.5)
  }, [])

  // Hàm đồng bộ thời gian nghe hiện tại vào SQLite
  const flushSession = useCallback(
    async (session: ActiveListeningSession | null) => {
      if (!session || !session.track) return
      const threshold = getMinThreshold(session.track.duration)
      const roundedDur = Math.round(session.listenedSec)

      // Nếu chưa đạt ngưỡng tối thiểu: bỏ qua (skip nhanh)
      if (roundedDur < threshold) return

      const filePath = session.track.filePath || session.track.id || ''

      try {
        if (session.eventId && session.eventId > 0) {
          // Bản ghi đã tồn tại trong SQLite, cập nhật thời lượng thực tế
          if (roundedDur > session.savedSec) {
            await window.api?.updatePlayEventDuration?.({
              eventId: session.eventId,
              durationSec: roundedDur,
              filePath
            })
            session.savedSec = roundedDur
          }
        } else {
          // Chưa tạo bản ghi trong SQLite, tạo mới với thời lượng thực tế đã nghe
          const res = await window.api?.recordPlayEvent?.({
            filePath,
            title: session.track.title,
            artist: session.track.artist,
            album: session.track.album,
            genre: session.track.genre,
            format: session.track.format,
            sampleRate: session.track.sampleRate,
            bitDepth: session.track.bitDepth,
            isLossless: session.track.lossless,
            isDsd: isDsdTrack(session.track),
            durationSec: roundedDur,
            playedAt: session.playedAt,
            audioMode: session.audioMode
          })
          if (res && res.eventId) {
            session.eventId = res.eventId
            session.savedSec = roundedDur
          }
        }
      } catch (err) {
        console.warn('[useListeningTracker] Failed to flush listening session:', err)
      }
    },
    [getMinThreshold]
  )

  // 1. Quản lý vòng đời phiên phát khi currentTrack thay đổi
  useEffect(() => {
    const prevSession = sessionRef.current
    const newPath = currentTrack?.filePath || currentTrack?.id

    if (prevSession) {
      const prevPath = prevSession.track?.filePath || prevSession.track?.id
      // Nếu đổi sang bài khác, flush phiên cũ và khởi tạo phiên mới
      if (prevPath !== newPath) {
        flushSession(prevSession)
        sessionRef.current = null
      }
    }

    if (currentTrack) {
      if (!sessionRef.current) {
        sessionRef.current = {
          track: currentTrack,
          audioMode:
            bitPerfectEnabled || isDsdTrack(currentTrack)
              ? bitPerfectType || 'bass'
              : 'webaudio',
          playedAt: Date.now(),
          listenedSec: 0,
          savedSec: 0,
          eventId: null,
          lastTick: Date.now()
        }
      }
    } else {
      if (sessionRef.current) {
        flushSession(sessionRef.current)
        sessionRef.current = null
      }
    }
  }, [currentTrack, bitPerfectEnabled, bitPerfectType, flushSession])

  // 2. Phát hiện lặp lại bài hát ở chế độ Repeat One (repeatMode === 2)
  useEffect(() => {
    const session = sessionRef.current
    if (session && repeatMode === 2 && session.track) {
      const dur = session.track.duration || 0
      // Nếu thời gian chạy từ gần cuối bài (> dur - 4s) đột ngột quay về đầu (< 1.5s):
      if (dur > 8 && prevTimeRef.current > dur - 4 && currentTime < 1.5) {
        // Hoàn tất lượt nghe trước và bắt đầu lượt nghe mới
        flushSession(session)
        sessionRef.current = {
          track: currentTrack,
          audioMode:
            bitPerfectEnabled || isDsdTrack(currentTrack)
              ? bitPerfectType || 'bass'
              : 'webaudio',
          playedAt: Date.now(),
          listenedSec: 0,
          savedSec: 0,
          eventId: null,
          lastTick: Date.now()
        }
      }
    }
    prevTimeRef.current = currentTime
  }, [currentTime, repeatMode, currentTrack, bitPerfectEnabled, bitPerfectType, flushSession])

  // 3. Đồng bộ khi tạm dừng phát nhạc (Pause)
  useEffect(() => {
    if (prevIsPlayingRef.current && !isPlaying) {
      // Vừa bấm tạm dừng, flush thời gian đã nghe tới mốc này
      const session = sessionRef.current
      if (session) {
        flushSession(session)
      }
    } else if (!prevIsPlayingRef.current && isPlaying) {
      // Vừa tiếp tục phát, cập nhật lastTick để không tính thời gian lúc đang dừng
      if (sessionRef.current) {
        sessionRef.current.lastTick = Date.now()
      }
    }
    prevIsPlayingRef.current = isPlaying
  }, [isPlaying, flushSession])

  // 4. Vòng lặp đếm thời gian nghe thực tế mỗi 1 giây (Heartbeat Accumulator)
  useEffect(() => {
    const interval = setInterval(() => {
      const session = sessionRef.current
      if (!session) return

      const now = Date.now()
      const elapsed = (now - session.lastTick) / 1000
      session.lastTick = now

      // Chỉ tích lũy thời gian khi đang thực sự phát (isPlaying)
      // Kẹp elapsed < 3s để chống trường hợp máy tính Sleep / Hibernate tỉnh dậy
      if (isPlaying && currentTrack && elapsed > 0 && elapsed < 3) {
        session.listenedSec += elapsed

        const threshold = getMinThreshold(session.track?.duration)

        // TH1: Vừa đạt ngưỡng nghe tối thiểu mà chưa có bản ghi DB -> tạo mới
        if (session.listenedSec >= threshold && !session.eventId) {
          const roundedDur = Math.round(session.listenedSec)
          const track = session.track
          const filePath = track.filePath || track.id || ''

          window.api?.recordPlayEvent?.({
            filePath,
            title: track.title,
            artist: track.artist,
            album: track.album,
            genre: track.genre,
            format: track.format,
            sampleRate: track.sampleRate,
            bitDepth: track.bitDepth,
            isLossless: track.lossless,
            isDsd: isDsdTrack(track),
            durationSec: roundedDur,
            playedAt: session.playedAt,
            audioMode: session.audioMode
          })
            .then((res) => {
              if (res && res.eventId) {
                if (sessionRef.current && sessionRef.current.playedAt === session.playedAt) {
                  sessionRef.current.eventId = res.eventId
                  sessionRef.current.savedSec = roundedDur
                }
              }
            })
            .catch((err) => {
              console.warn('[useListeningTracker] Periodic recordPlayEvent failed:', err)
            })
        }
        // TH2: Đã có bản ghi DB -> đồng bộ định kỳ mỗi khi nghe thêm >= 5 giây
        else if (session.eventId && session.listenedSec - session.savedSec >= 5) {
          const roundedDur = Math.round(session.listenedSec)
          if (roundedDur > session.savedSec) {
            const eventId = session.eventId
            const filePath = session.track?.filePath || session.track?.id
            window.api?.updatePlayEventDuration?.({
              eventId,
              durationSec: roundedDur,
              filePath
            })
              .then(() => {
                if (sessionRef.current && sessionRef.current.eventId === eventId) {
                  sessionRef.current.savedSec = roundedDur
                }
              })
              .catch((err) => {
                console.warn('[useListeningTracker] Periodic updatePlayEventDuration failed:', err)
              })
          }
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, currentTrack, getMinThreshold])

  // 5. Lưu phiên an toàn khi tắt / reload ứng dụng (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const session = sessionRef.current
      if (session) {
        flushSession(session)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      const session = sessionRef.current
      if (session) {
        flushSession(session)
      }
    }
  }, [flushSession])
}
