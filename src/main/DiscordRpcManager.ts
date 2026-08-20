import { Client } from '@xhayper/discord-rpc'
import https from 'https'

export const DEFAULT_DISCORD_CLIENT_ID = '1539993441851670589'

export interface DiscordRpcConfig {
  enabled?: boolean
  clientId?: string
  showDetails?: boolean
  showTime?: boolean
  showCover?: boolean
  showQuality?: boolean
  showButtons?: boolean
  showIdle?: boolean
}

export interface DiscordPresencePayload {
  title?: string
  artist?: string
  album?: string
  duration?: number // seconds
  position?: number // seconds
  isPlaying?: boolean
  coverArt?: string | null
  isOnline?: boolean
  platform?: 'youtube' | 'soundcloud' | 'drive' | 'local' | string
  onlineUrl?: string | null
  format?: string
  bitrate?: number
  sampleRate?: number
  bitDepth?: number
}

export class DiscordRpcManager {
  private client: Client | null = null
  private config: DiscordRpcConfig = {
    enabled: true,
    clientId: DEFAULT_DISCORD_CLIENT_ID,
    showDetails: true,
    showTime: true,
    showCover: true,
    showQuality: true,
    showButtons: true,
    showIdle: true
  }

  private isConnected = false
  private isConnecting = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private lastPayload: DiscordPresencePayload | null = null
  private updateThrottleTimer: NodeJS.Timeout | null = null
  private pendingUpdate = false
  private appIconUrl: string | null = null
  private availableAssets: Set<string> = new Set()
  private appStartTime: number = Math.floor(Date.now() / 1000) * 1000

  constructor() {}

  public init(initialConfig?: DiscordRpcConfig): void {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig }
    }

    if (this.config.enabled) {
      this.connect()
    }
  }

  public updateConfig(newConfig: Partial<DiscordRpcConfig>): void {
    const wasEnabled = this.config.enabled
    const oldClientId = this.config.clientId || DEFAULT_DISCORD_CLIENT_ID

    this.config = { ...this.config, ...newConfig }
    const newClientId = this.config.clientId || DEFAULT_DISCORD_CLIENT_ID

    if (this.config.enabled !== wasEnabled || oldClientId !== newClientId) {
      this.appIconUrl = null
      this.availableAssets.clear()
      if (this.config.enabled) {
        this.reconnect()
      } else {
        this.disconnect()
      }
    } else if (this.isConnected && this.config.enabled) {
      this.refreshPresence()
    }
  }

  public getConfig(): DiscordRpcConfig {
    return { ...this.config }
  }

  public getStatus(): { isConnected: boolean; isConnecting: boolean; enabled: boolean } {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      enabled: this.config.enabled ?? true
    }
  }

  private fetchAppInfo(clientId: string): void {
    try {
      // 1. Fetch RPC info to get Application Icon URL from Discord CDN
      https.get(`https://discord.com/api/v10/applications/${clientId}/rpc`, res => {
        let raw = ''
        res.on('data', chunk => raw += chunk)
        res.on('end', () => {
          try {
            const data = JSON.parse(raw)
            if (data.icon) {
              this.appIconUrl = `https://cdn.discordapp.com/app-icons/${clientId}/${data.icon}.png`
              this.refreshPresence()
            }
          } catch (e) {}
        })
      }).on('error', () => {})

      // 2. Fetch Art Assets
      https.get(`https://discord.com/api/v10/oauth2/applications/${clientId}/assets`, res => {
        let raw = ''
        res.on('data', chunk => raw += chunk)
        res.on('end', () => {
          try {
            const list = JSON.parse(raw)
            if (Array.isArray(list)) {
              this.availableAssets = new Set(list.map((a: any) => a.name))
              this.refreshPresence()
            }
          } catch (e) {}
        })
      }).on('error', () => {})
    } catch (e) {}
  }

  private connect(): void {
    if (this.isConnected || this.isConnecting || !this.config.enabled) return

    const targetClientId = (this.config.clientId && this.config.clientId.trim()) ? this.config.clientId.trim() : DEFAULT_DISCORD_CLIENT_ID
    this.isConnecting = true
    this.fetchAppInfo(targetClientId)

    try {
      if (this.client) {
        try { this.client.destroy() } catch (e) {}
        this.client = null
      }

      this.client = new Client({ clientId: targetClientId })

      this.client.on('ready', () => {
        this.isConnected = true
        this.isConnecting = false
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer)
          this.reconnectTimer = null
        }
        this.fetchAppInfo(targetClientId)
        this.refreshPresence()
      })

      this.client.on('disconnected', () => {
        this.handleDisconnect()
      })

      this.client.on('error', () => {
        this.handleDisconnect()
      })

      this.client.login().catch(() => {
        this.handleDisconnect()
      })
    } catch (err) {
      this.handleDisconnect()
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false
    this.isConnecting = false
    if (this.client) {
      try { this.client.destroy() } catch (e) {}
      this.client = null
    }

    if (this.config.enabled && !this.reconnectTimer) {
      this.reconnectTimer = setInterval(() => {
        if (!this.isConnected && !this.isConnecting && this.config.enabled) {
          this.connect()
        }
      }, 15000)
    }
  }

  private reconnect(): void {
    this.disconnect()
    if (this.config.enabled) {
      this.connect()
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.isConnected = false
    this.isConnecting = false

    if (this.client) {
      try {
        if (this.client.user) {
          this.client.user.clearActivity().catch(() => {})
        }
        this.client.destroy()
      } catch (e) {}
      this.client = null
    }
  }

  public updatePresence(payload: DiscordPresencePayload): void {
    this.lastPayload = payload

    if (!this.config.enabled) return

    if (!this.isConnected) {
      if (!this.isConnecting) {
        this.connect()
      }
      return
    }

    // Throttle presence updates (Discord rate limits to 1 req / 1.5s)
    if (this.updateThrottleTimer) {
      this.pendingUpdate = true
      return
    }

    this.sendPresence(payload)

    this.updateThrottleTimer = setTimeout(() => {
      this.updateThrottleTimer = null
      if (this.pendingUpdate && this.lastPayload) {
        this.pendingUpdate = false
        this.sendPresence(this.lastPayload)
      }
    }, 1200)
  }

  public clearPresence(): void {
    this.lastPayload = null
    if (this.client && this.client.user && this.isConnected) {
      this.client.user.clearActivity().catch(() => {})
    }
  }

  private refreshPresence(): void {
    if (this.lastPayload) {
      this.sendPresence(this.lastPayload)
    } else if (this.config.showIdle) {
      this.sendIdlePresence()
    }
  }

  private sendPresence(payload: DiscordPresencePayload): void {
    if (!this.client || !this.client.user || !this.isConnected || !this.config.enabled) return

    const {
      title,
      artist,
      album,
      isPlaying = false,
      coverArt,
      isOnline,
      platform,
      onlineUrl,
      format,
      sampleRate,
      bitDepth,
      bitrate
    } = payload

    if (!title && !artist) {
      if (this.config.showIdle) {
        this.sendIdlePresence()
      } else {
        this.clearPresence()
      }
      return
    }

    const showDetails = this.config.showDetails ?? true
    const showTime = this.config.showTime ?? true
    const showCover = this.config.showCover ?? true
    const showQuality = this.config.showQuality ?? true
    const showButtons = this.config.showButtons ?? true

    const activity: any = {
      instance: false
    }

    // 1. Details & State
    if (showDetails) {
      activity.details = title ? (title.length > 120 ? title.substring(0, 117) + '...' : title) : 'Unknown Title'
      
      let stateStr = ''
      if (artist && artist !== 'Unknown' && artist !== 'Unknown Artist') {
        stateStr = `by ${artist}`
      }
      if (album && album !== 'Unknown' && album !== 'Unknown Album' && album !== title) {
        stateStr = stateStr ? `${stateStr} • ${album}` : album
      }
      if (!stateStr) {
        stateStr = "Mei's Radio"
      }
      activity.state = stateStr.length > 120 ? stateStr.substring(0, 117) + '...' : stateStr
    } else {
      activity.details = "Listening to Music"
      activity.state = "Mei's Radio"
    }

    // 2. Timestamps (Thời gian sử dụng ứng dụng - App Uptime / Elapsed Time)
    if (showTime) {
      activity.startTimestamp = this.appStartTime
    }

    // 3. Large Image (Cover Art or App Icon)
    let largeImage: string | undefined = undefined
    if (showCover && coverArt && (coverArt.startsWith('http://') || coverArt.startsWith('https://'))) {
      largeImage = coverArt
    } else if (this.appIconUrl) {
      largeImage = this.appIconUrl
    } else if (this.availableAssets.has('icon')) {
      largeImage = 'icon'
    } else if (this.availableAssets.has('app_icon')) {
      largeImage = 'app_icon'
    } else if (this.availableAssets.has('logo')) {
      largeImage = 'logo'
    }

    if (largeImage) {
      activity.largeImageKey = largeImage
      activity.largeImageText = album && album !== 'Unknown' ? album : (title || "Mei's Radio")
    }

    // 4. Small Image (Status & Audio Quality)
    let qualityParts: string[] = []
    if (showQuality) {
      if (format) qualityParts.push(format.toUpperCase())
      if (bitDepth && bitDepth > 0) qualityParts.push(`${bitDepth}-bit`)
      if (sampleRate && sampleRate > 0) {
        qualityParts.push(sampleRate >= 1000 ? `${(sampleRate / 1000).toFixed(1).replace('.0', '')}kHz` : `${sampleRate}Hz`)
      }
      if (bitrate && bitrate > 0 && !bitDepth) {
        qualityParts.push(`${Math.round(bitrate / 1000)}kbps`)
      }
    }
    const qualityStr = qualityParts.length > 0 ? ` • ${qualityParts.join('/')}` : ''

    const smallKey = isPlaying ? 'play' : 'pause'
    if (this.availableAssets.has(smallKey)) {
      activity.smallImageKey = smallKey
      activity.smallImageText = isPlaying ? `Playing${qualityStr}` : `Paused${qualityStr}`
    } else if (this.availableAssets.has('emoji')) {
      activity.smallImageKey = 'emoji'
      activity.smallImageText = isPlaying ? `Playing${qualityStr}` : `Paused${qualityStr}`
    } else if (this.appIconUrl && largeImage && largeImage !== this.appIconUrl) {
      activity.smallImageKey = this.appIconUrl
      activity.smallImageText = isPlaying ? `Playing${qualityStr}` : `Paused${qualityStr}`
    }

    if (!isPlaying && showDetails) {
      activity.state = `(Paused) ${activity.state || ''}`.trim()
    }

    // 5. Buttons (Max 2 buttons allowed by Discord)
    const buttons: { label: string; url: string }[] = []
    if (showButtons) {
      if (isOnline && onlineUrl && (onlineUrl.startsWith('http://') || onlineUrl.startsWith('https://'))) {
        let label = 'Listen Along'
        if (platform === 'youtube') label = 'YouTube Music'
        else if (platform === 'soundcloud') label = 'SoundCloud'
        buttons.push({ label, url: onlineUrl })
      }
      
      buttons.push({
        label: "Mei's Radio",
        url: 'https://github.com/subzerofroze/meisradio'
      })
    }

    if (buttons.length > 0) {
      activity.buttons = buttons.slice(0, 2)
    }

    try {
      this.client.user.setActivity(activity).catch(() => {})
    } catch (e) {}
  }

  private sendIdlePresence(): void {
    if (!this.client || !this.client.user || !this.isConnected || !this.config.enabled) return

    try {
      const idleActivity: any = {
        details: "Browsing Library",
        state: "Mei's Radio",
        instance: false,
        buttons: [
          {
            label: "Mei's Radio",
            url: 'https://github.com/subzerofroze/meisradio'
          }
        ]
      }

      if (this.config.showTime) {
        idleActivity.startTimestamp = this.appStartTime
      }

      if (this.appIconUrl) {
        idleActivity.largeImageKey = this.appIconUrl
        idleActivity.largeImageText = "Mei's Radio"
      } else if (this.availableAssets.has('icon')) {
        idleActivity.largeImageKey = 'icon'
        idleActivity.largeImageText = "Mei's Radio"
      }

      this.client.user.setActivity(idleActivity).catch(() => {})
    } catch (e) {}
  }

  public destroy(): void {
    this.disconnect()
    this.lastPayload = null
    this.appIconUrl = null
    this.availableAssets.clear()
    if (this.updateThrottleTimer) {
      clearTimeout(this.updateThrottleTimer)
      this.updateThrottleTimer = null
    }
  }
}
