import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
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
    const candidateDirs = [
      path.join(process.resourcesPath, 'bin'),
      path.join(process.resourcesPath, 'resources', 'bin'),
      path.join(app.getAppPath(), 'resources', 'bin'),
      path.join(process.cwd(), 'resources', 'bin'),
      path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin'),
      path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'bin'),
      path.join(path.dirname(app.getPath('exe')), 'resources', 'bin'),
      path.join(path.dirname(app.getPath('exe')), 'bin')
    ]

    let binPath = path.join(app.getAppPath(), 'resources', 'bin', binName)
    for (const dir of candidateDirs) {
      const candidate = path.join(dir, binName)
      if (fs.existsSync(candidate)) {
        binPath = candidate
        break
      }
    }

    if (!fs.existsSync(binPath)) {
      throw new Error(`MPV binary not found at ${binPath}`)
    }

    const args = [
      '--idle=yes',
      '--keep-open=yes',
      `--input-ipc-server=${this.pipeName}`,
      '--no-video',
      '--hwdec=auto',
      '--msg-level=all=no'
    ]

    // WASAPI Exclusive Bit-perfect
    if (bitPerfect) {
      if (process.platform === 'win32') {
        args.push('--ao=wasapi')
        args.push('--audio-exclusive=yes')
        args.push('--audio-samplerate=0')
        args.push('--audio-format=auto')
        args.push('--audio-resample=no')
      }
      if (audioDevice && audioDevice !== 'default') {
        args.push(`--audio-device=${audioDevice}`)
      } else {
        args.push('--audio-device=auto')
      }
    } else {
      if (audioDevice && audioDevice !== 'default') {
        args.push(`--audio-device=${audioDevice}`)
      }
    }

    this.mpvProcess = spawn(binPath, args, { stdio: 'ignore' })

    // Wait for pipe to be ready with retry
    await this.connectSocket()
  }

  private async connectSocket(): Promise<void> {
    const maxRetries = 12
    const retryDelay = 150

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection(this.pipeName)

          const onConnect = () => {
            this.socket = socket
            this.isConnected = true
            socket.removeListener('error', onError)

            // Setup persistent handlers
            socket.on('data', (data) => {
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

            socket.on('error', (err) => {
              console.warn('MPV Socket runtime warning:', err.message)
            })

            socket.on('close', () => {
              this.isConnected = false
            })

            // Observe properties
            this.sendCommand(['observe_property', 1, 'time-pos'])
            this.sendCommand(['observe_property', 2, 'eof-reached'])
            this.sendCommand(['observe_property', 3, 'pause'])
            this.sendCommand(['observe_property', 4, 'duration'])
            resolve()
          }

          const onError = (err: Error) => {
            socket.destroy()
            reject(err)
          }

          socket.once('connect', onConnect)
          socket.once('error', onError)
        })
        return
      } catch (err) {
        if (attempt === maxRetries) {
          console.error(`Failed to connect to MPV pipe after ${maxRetries} attempts:`, err)
          throw err
        }
        await new Promise((r) => setTimeout(r, retryDelay))
      }
    }
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

  public setAudioDevice(device: string) {
    this.sendCommand(['set_property', 'audio-device', device])
  }

  public setEqualizer(bands: number[], preamp: number = 0) {
    // MPV equalizer filter: af=volume=volume=XdB,equalizer=f=32:width_type=h:width=50:g=X,...
    const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    const filters: string[] = []
    if (preamp !== 0) {
      filters.push(`volume=volume=${preamp}dB:precision=fixed`)
    }
    freqs.forEach((f, i) => {
      const g = bands[i] || 0
      filters.push(`equalizer=f=${f}:width_type=h:width=50:g=${g}`)
    })
    this.sendCommand(['af', 'set', filters.join(',')])
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

  public setAudioDevice(device: string) {
    this.currentAudioDevice = device
    this.activeInstance?.setAudioDevice(device)
  }

  public setEqualizer(bands: number[], preamp: number = 0) {
    this.activeInstance?.setEqualizer(bands, preamp)
  }

  public killAll() {
    this.activeInstance?.kill()
    this.nextInstance?.kill()
  }
}
