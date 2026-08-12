import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { EventEmitter } from 'events'

const getPipeName = () => {
  const rand = Math.random().toString(36).substring(2, 10)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\mpv_ipc_${rand}`
  }
  return `/tmp/mpv_ipc_${rand}.sock`
}

export class MpvInstance extends EventEmitter {
  private mpvProcess: ChildProcess | null = null
  private socket: net.Socket | null = null
  private pipeName: string
  private reqId = 1
  private buffer = ''
  private isConnected = false
  public isPlaying = false

  constructor() {
    super()
    this.pipeName = getPipeName()
  }

  public async init(audioDevice?: string, bitPerfect: boolean = false) {
    const binName = process.platform === 'win32' ? 'mpv.exe' : 'mpv'
    const binPath = is.dev
      ? path.join(app.getAppPath(), 'resources', 'bin', binName)
      : path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', binName)

    if (!fs.existsSync(binPath)) {
      throw new Error(`MPV binary not found at ${binPath}`)
    }

    const args = [
      '--idle=yes',
      '--keep-open=yes',
      `--input-ipc-server=${this.pipeName}`,
      '--no-video',
      '--msg-level=all=no'
    ]

    // WASAPI/ASIO Exclusive
    if (bitPerfect) {
      if (audioDevice) {
        args.push('--audio-exclusive=yes')
        args.push(`--audio-device=${audioDevice}`)
      } else {
        // Default to exclusive on Windows if nothing specified to ensure bit-perfect
        if (process.platform === 'win32') {
          args.push('--audio-exclusive=yes')
          args.push('--audio-device=wasapi')
        }
      }
    } else {
      if (audioDevice) {
        args.push(`--audio-device=${audioDevice}`)
      }
    }

    this.mpvProcess = spawn(binPath, args, { stdio: 'ignore' })

    // Wait for pipe to be ready
    await new Promise((resolve) => setTimeout(resolve, 500))
    await this.connectSocket()
  }

  private connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.pipeName)
      
      this.socket.on('connect', () => {
        this.isConnected = true
        // Observe properties
        this.sendCommand(['observe_property', 1, 'time-pos'])
        this.sendCommand(['observe_property', 2, 'eof-reached'])
        this.sendCommand(['observe_property', 3, 'pause'])
        this.sendCommand(['observe_property', 4, 'duration'])
        resolve()
      })

      this.socket.on('data', (data) => {
        this.buffer += data.toString()
        let parts = this.buffer.split('\n')
        this.buffer = parts.pop() || ''
        
        for (const part of parts) {
          if (!part.trim()) continue
          try {
            const msg = JSON.parse(part)
            if (msg.event === 'property-change') {
              if (msg.name === 'time-pos') this.emit('time-pos', msg.data)
              if (msg.name === 'eof-reached' && msg.data === true) this.emit('eof')
              if (msg.name === 'pause') this.emit('pause', msg.data)
              if (msg.name === 'duration') this.emit('duration', msg.data)
            }
          } catch (e) {}
        }
      })

      this.socket.on('error', (err) => {
        console.error('MPV Socket error:', err)
        reject(err)
      })
    })
  }

  public sendCommand(cmd: any[]) {
    if (!this.isConnected || !this.socket) return
    const msg = { command: cmd, request_id: this.reqId++ }
    this.socket.write(JSON.stringify(msg) + '\n')
  }

  public load(url: string) {
    this.sendCommand(['loadfile', url])
    this.isPlaying = true
  }

  public play() {
    this.sendCommand(['set_property', 'pause', false])
    this.isPlaying = true
  }

  public pause() {
    this.sendCommand(['set_property', 'pause', true])
    this.isPlaying = false
  }

  public seek(pos: number) {
    this.sendCommand(['seek', pos, 'absolute'])
  }

  public setVolume(vol: number) {
    // vol: 0-1
    this.sendCommand(['set_property', 'volume', vol * 100])
  }

  public setEqualizer(bands: number[]) {
    // MPV equalizer filter: af=equalizer=f=32:width_type=h:width=50:g=X,...
    // Here bands is an array of gain values for frequencies:
    // [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    const eqFilters = freqs.map((f, i) => {
      const g = bands[i] || 0
      return `equalizer=f=${f}:width_type=h:width=50:g=${g}`
    })
    this.sendCommand(['af', 'set', eqFilters.join(',')])
  }

  public kill() {
    if (this.socket) {
      this.socket.destroy()
    }
    if (this.mpvProcess) {
      this.mpvProcess.kill()
    }
  }
}

export class MpvManager extends EventEmitter {
  private activeInstance: MpvInstance | null = null
  private nextInstance: MpvInstance | null = null
  private crossfadeInterval: NodeJS.Timeout | null = null

  private currentAudioDevice?: string
  private currentBitPerfect: boolean = false

  public async init(audioDevice?: string, bitPerfect: boolean = false) {
    if (this.activeInstance) {
      this.activeInstance.kill()
    }
    if (this.nextInstance) {
      this.nextInstance.kill()
    }

    this.currentAudioDevice = audioDevice
    this.currentBitPerfect = bitPerfect
    this.activeInstance = new MpvInstance()
    await this.activeInstance.init(audioDevice, bitPerfect)
    
    this.setupListeners(this.activeInstance)
  }

  private setupListeners(instance: MpvInstance) {
    instance.on('time-pos', (val) => this.emit('time', val))
    instance.on('duration', (val) => this.emit('duration', val))
    instance.on('pause', (val) => this.emit('paused', val))
    instance.on('eof', () => this.emit('ended'))
  }

  public playTrack(url: string, crossfadeDuration: number = 0) {
    if (!this.activeInstance) return

    if (crossfadeDuration > 0 && this.activeInstance.isPlaying) {
      this.startCrossfade(url, crossfadeDuration)
    } else {
      this.activeInstance.load(url)
      this.activeInstance.play()
    }
  }

  private async startCrossfade(url: string, durationSeconds: number) {
    // Create new instance for crossfade
    this.nextInstance = new MpvInstance()
    await this.nextInstance.init(this.currentAudioDevice, this.currentBitPerfect) // use same audio device
    
    // Set initial volume to 0
    this.nextInstance.setVolume(0)
    this.nextInstance.load(url)
    this.nextInstance.play()

    const fadeSteps = 20
    const stepTime = (durationSeconds * 1000) / fadeSteps
    let step = 0

    if (this.crossfadeInterval) clearInterval(this.crossfadeInterval)
    
    this.crossfadeInterval = setInterval(() => {
      step++
      const fadeRatio = step / fadeSteps
      
      // fade out old
      if (this.activeInstance) {
        this.activeInstance.setVolume(1 - fadeRatio)
      }
      
      // fade in new
      if (this.nextInstance) {
        this.nextInstance.setVolume(fadeRatio)
      }

      if (step >= fadeSteps) {
        clearInterval(this.crossfadeInterval!)
        this.crossfadeInterval = null
        
        // kill old instance
        if (this.activeInstance) {
          this.activeInstance.kill()
        }
        
        // Next becomes active
        this.activeInstance = this.nextInstance
        this.nextInstance = null
        this.setupListeners(this.activeInstance!)
      }
    }, stepTime)
  }

  public play() {
    this.activeInstance?.play()
  }

  public pause() {
    this.activeInstance?.pause()
  }

  public seek(pos: number) {
    this.activeInstance?.seek(pos)
  }

  public setVolume(vol: number) {
    this.activeInstance?.setVolume(vol)
  }

  public setEqualizer(bands: number[]) {
    this.activeInstance?.setEqualizer(bands)
  }

  public killAll() {
    this.activeInstance?.kill()
    this.nextInstance?.kill()
  }
}
