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
  /**
   * Hàng đợi tuần tự hóa các IPC ghi DB cho phiên này.
   * Lần flush sau luôn đợi IPC trước hoàn tất -> chống chèn trùng (duplicate insert)
   * khi Pause / chuyển bài xảy ra đúng lúc IPC recordPlayEvent đang xử lý.
   */
  syncQueue: Promise<void>
  /** Đang có IPC ghi DB của phiên này đang chạy (chặn flush spam trong heartbeat) */
  syncing: boolean
}

/**
 * Khóa định danh duy nhất của track.
 * LƯU Ý: các bài trong cùng một CUE Sheet dùng CHUNG filePath (file audio gốc)
 * và chỉ phân biệt nhau bằng id (`file://...#track-N`) cùng startTime —
 * vì vậy KHÔNG ĐƯỢC so sánh bằng `filePath || id` (sẽ coi cả album CUE là 1 bài).
 */
const getTrackKey = (track: any): string => {
  if (!track) return ''
  const base = String(track.id || track.filePath || track.path || '')
  if (track.isCueTrack || track.cueFilePath || track.startTime != null) {
    return `${base}|cue|${track.startTime ?? ''}|${track.endTime ?? ''}`
  }
  return base
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

  // Hàm đồng bộ thời gian nghe hiện tại vào SQLite.
  // Các IPC ghi (recordPlayEvent / updatePlayEventDuration) được TUẦN TỰ HÓA theo từng phiên
  // qua hàng đợi session.syncQueue: flush nào cũng đợi IPC trước của phiên đó hoàn tất
  // rồi mới chạy và tính thời lượng MỚI NHẤT ngay lúc ghi (không phải lúc xếp hàng).
  // Nhờ vậy, Pause / chuyển bài xảy ra đúng lúc IPC đang xử lý sẽ trở thành UPDATE
  // bản ghi đã chèn thay vì chèn thêm bản ghi trùng.
  const flushSession = useCallback(
    (session: ActiveListeningSession | null): Promise<void> => {
      // Gán vào hằng cục bộ để giữ narrowing kiểu bên trong closure
      const sess = session
      if (!sess || !sess.track) return Promise.resolve()

      const runSync = async (): Promise<void> => {
        try {
          const threshold = getMinThreshold(sess.track.duration)
          // Tính thời lượng lúc THỰC SỰ ghi = giá trị mới nhất (mọi việc trước đó đã hoàn tất)
          const roundedDur = Math.round(sess.listenedSec)

          // Nếu chưa đạt ngưỡng tối thiểu: bỏ qua (skip nhanh)
          if (roundedDur < threshold) return

          const filePath = sess.track.id || sess.track.filePath || ''
          // Đánh dấu IPC đang bay TRƯỚC khi await để các nhịp heartbeat
          // và các lần flush khác thấy được trạng thái này
          sess.syncing = true

          if (sess.eventId && sess.eventId > 0) {
            // Bản ghi đã tồn tại trong SQLite, cập nhật thời lượng thực tế
            if (roundedDur > sess.savedSec) {
              await window.api?.updatePlayEventDuration?.({
                eventId: sess.eventId,
                durationSec: roundedDur,
                filePath
              })
              sess.savedSec = roundedDur
            }
          } else {
            // Chưa tạo bản ghi trong SQLite, tạo mới với thời lượng thực tế đã nghe
            // (luôn chạy sau IPC trước đã hoàn tất => không bao giờ chèn 2 lần cho 1 phiên)
            const res = await window.api?.recordPlayEvent?.({
              filePath,
              title: sess.track.title,
              artist: sess.track.artist,
              album: sess.track.album,
              genre: sess.track.genre,
              format: sess.track.format,
              sampleRate: sess.track.sampleRate,
              bitDepth: sess.track.bitDepth,
              isLossless: sess.track.lossless,
              isDsd: isDsdTrack(sess.track),
              durationSec: roundedDur,
              playedAt: sess.playedAt,
              audioMode: sess.audioMode
            })
            if (res && res.eventId) {
              sess.eventId = res.eventId
              sess.savedSec = roundedDur
            }
          }
        } catch (err) {
          console.warn('[useListeningTracker] Failed to flush listening session:', err)
        } finally {
          sess.syncing = false
        }
      }

      // Xếp hàng đợi sau IPC trước đó của phiên này
      const task = sess.syncQueue.then(runSync)
      sess.syncQueue = task.catch(() => undefined)
      return task
    },
    [getMinThreshold]
  )

  // 1. Quản lý vòng đời phiên phát khi currentTrack thay đổi
  useEffect(() => {
    const prevSession = sessionRef.current
    const newKey = getTrackKey(currentTrack)

    if (prevSession) {
      const prevKey = getTrackKey(prevSession.track)
      // Nếu đổi sang bài khác (kể cả bài kế tiếp trong cùng CUE Sheet):
      // flush phiên cũ và khởi tạo phiên mới
      if (prevKey !== newKey) {
        void flushSession(prevSession)
        sessionRef.current = null
      }
    }

    if (currentTrack) {
      if (!sessionRef.current) {
        sessionRef.current = {
          track: currentTrack,
          audioMode:
            bitPerfectEnabled || isDsdTrack(currentTrack) ? bitPerfectType || 'bass' : 'webaudio',
          playedAt: Date.now(),
          listenedSec: 0,
          savedSec: 0,
          eventId: null,
          lastTick: Date.now(),
          syncQueue: Promise.resolve(),
          syncing: false
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
            bitPerfectEnabled || isDsdTrack(currentTrack) ? bitPerfectType || 'bass' : 'webaudio',
          playedAt: Date.now(),
          listenedSec: 0,
          savedSec: 0,
          eventId: null,
          lastTick: Date.now(),
          syncQueue: Promise.resolve(),
          syncing: false
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

        // TH1: Vừa đạt ngưỡng nghe tối thiểu mà chưa có bản ghi DB -> tạo mới.
        // Không gọi recordPlayEvent trực tiếp: đi qua hàng đợi flushSession của phiên
        // và bỏ qua nếu IPC trước (insert/update) đang xử lý -> không chèn trùng.
        if (session.listenedSec >= threshold && !session.eventId && !session.syncing) {
          void flushSession(session)
        }
        // TH2: Đã có bản ghi DB -> đồng bộ định kỳ mỗi khi nghe thêm >= 5 giây
        else if (
          session.eventId &&
          !session.syncing &&
          session.listenedSec - session.savedSec >= 5
        ) {
          void flushSession(session)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, currentTrack, getMinThreshold, flushSession])

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
