import { useEffect, useCallback } from 'react'
import { usePlayerStore, useSettingsStore } from '../stores'
import { isDsdTrack } from '../utils/formatUtils'

interface UseDiscordRpcProps {
  audioRef: React.RefObject<HTMLAudioElement | null>
  isConfigLoaded: boolean
}

export function useDiscordRpc({ audioRef, isConfigLoaded }: UseDiscordRpcProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const setDiscordConnected = useSettingsStore((s) => s.setDiscordConnected)
  const discordRpcEnabled = useSettingsStore((s) => s.discordRpcEnabled)

  // Periodic Discord RPC connection status check
  useEffect(() => {
    if (!discordRpcEnabled) {
      setDiscordConnected(false)
      return
    }
    const checkStatus = () => {
      // @ts-ignore
      if (window.api && window.api.discordGetStatus) {
        // @ts-ignore
        window.api
          .discordGetStatus()
          .then((st: any) => {
            if (st) setDiscordConnected(Boolean(st.isConnected))
          })
          .catch(() => {})
      }
    }
    checkStatus()
    // shortcut: status ít đổi — 15s đủ, bỏ qua khi tab hidden để giảm IPC.
    const interval = setInterval(() => {
      if (document.hidden) return
      checkStatus()
    }, 15000)
    return () => clearInterval(interval)
  }, [discordRpcEnabled, setDiscordConnected])

  // Send Discord Rich Presence updates
  const sendDiscordPresence = useCallback(
    (override?: { isPlaying?: boolean; position?: number }) => {
      if (!discordRpcEnabled) return
      // @ts-ignore
      if (!window.api || !window.api.discordUpdatePresence) return

      if (!currentTrack) {
        // @ts-ignore
        window.api.discordUpdatePresence({ isPlaying: false })
        return
      }

      let onlineUrl: string | null = null
      if (currentTrack.isOnline) {
        if (currentTrack.platform === 'soundcloud') {
          onlineUrl = currentTrack.permalinkUrl || currentTrack.url || currentTrack.id
        } else if (currentTrack.videoId) {
          onlineUrl = `https://music.youtube.com/watch?v=${currentTrack.videoId}`
        }
      }

      const isDsd = isDsdTrack(currentTrack)
      const useBassTime = bitPerfectEnabled || isDsd

      const curPos =
        override?.position !== undefined
          ? override.position
          : useBassTime
            ? (audioRef.current as any)?._currentTime || 0
            : Math.max(0, (audioRef.current?.currentTime || 0) - (currentTrack.startTime || 0))

      const curPlaying = override?.isPlaying !== undefined ? override.isPlaying : isPlaying

      const curDur = useBassTime
        ? (audioRef.current as any)?._duration || currentTrack.duration || 0
        : currentTrack.duration || audioRef.current?.duration || 0

      // @ts-ignore
      window.api.discordUpdatePresence({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        duration: curDur,
        position: curPos,
        isPlaying: curPlaying,
        coverArt: currentTrack.coverArt,
        isOnline: currentTrack.isOnline,
        platform: currentTrack.platform,
        onlineUrl: onlineUrl,
        format: currentTrack.format,
        bitrate: currentTrack.bitrate,
        sampleRate: currentTrack.sampleRate,
        bitDepth: currentTrack.bitDepth
      })
    },
    [currentTrack, isPlaying, bitPerfectEnabled, audioRef, discordRpcEnabled]
  )

  useEffect(() => {
    if (isConfigLoaded) {
      sendDiscordPresence()
    }
  }, [
    currentTrack?.id,
    currentTrack?.filePath,
    currentTrack?.title,
    isPlaying,
    isConfigLoaded,
    sendDiscordPresence
  ])

  return {
    sendDiscordPresence
  }
}
