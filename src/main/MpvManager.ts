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

import { execFile } from 'child_process'

export function getMpvBinaryPath(): string {
  const isWin = process.platform === 'win32'
  const binNames = isWin ? ['mpv.com', 'mpv.exe'] : ['mpv']
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const exeDir = typeof app?.getPath === 'function' ? path.dirname(app.getPath('exe')) : process.cwd()
  const resPath = process.resourcesPath || ''

  const candidateDirs = [
    path.join(resPath, 'bin'),
    path.join(resPath, 'resources', 'bin'),
    path.join(appPath, 'resources', 'bin'),
    path.join(process.cwd(), 'resources', 'bin'),
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin'),
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'bin'),
    path.join(exeDir, 'resources', 'bin'),
    path.join(exeDir, 'bin')
  ]

  for (const binName of binNames) {
    for (const dir of candidateDirs) {
      if (!dir) continue
      const candidate = path.join(dir, binName)
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return path.join(appPath, 'resources', 'bin', isWin ? 'mpv.exe' : 'mpv')
}

export async function getMpvAudioDevices(): Promise<{ name: string; description: string }[]> {
  const binPath = getMpvBinaryPath()
  if (!fs.existsSync(binPath)) {
    return [{ name: 'auto', description: 'Tự động chọn (Auto / Default)' }]
  }

  return new Promise((resolve) => {
    execFile(binPath, ['--audio-device=help'], { timeout: 4000 }, (err, stdout) => {
      if (err && !stdout) {
        return resolve([{ name: 'auto', description: 'Tự động chọn (Auto / Default)' }])
      }
      const lines = (stdout || '').split('\n')
      const devices: { name: string; description: string }[] = []
      for (const line of lines) {
        const match = line.match(/^\s*'([^']+)'\s+\((.+)\)\s*$/)
        if (match) {
          const name = match[1]
          const description = match[2]
          if (name === 'auto' || name.startsWith('wasapi/')) {
            devices.push({ name, description })
          }
        }
      }
      if (devices.length === 0) {
        devices.push({ name: 'auto', description: 'Tự động chọn (Auto / Default)' })
      }
      resolve(devices)
    })
  })
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
    const binPath = getMpvBinaryPath()

    if (!fs.existsSync(binPath)) {
      throw new Error(`MPV binary not found at ${binPath}`)
    }

    const args = [
      '--idle=yes',
      '--keep-open=yes',
      `--input-ipc-server=${this.pipeName}`,
      '--no-video',
      '--gapless-audio=weak',
      '--msg-level=all=warn,ao=v'
    ]

    // WASAPI Exclusive Bit-perfect
    if (bitPerfect) {
      if (process.platform === 'win32') {
        args.push('--ao=wasapi')
        args.push('--audio-exclusive=yes')
      }
      args.push('--audio-pitch-correction=no')
      if (audioDevice && audioDevice !== 'default' && audioDevice !== 'auto') {
        args.push(`--audio-device=${audioDevice}`)
      } else {
        args.push('--audio-device=auto')
      }
    } else {
      if (audioDevice && audioDevice !== 'default' && audioDevice !== 'auto') {
        args.push(`--audio-device=${audioDevice}`)
      }
    }

    this.mpvProcess = spawn(binPath, args, { stdio: 'ignore' })
    this.mpvProcess.on('error', (err) => {
      this.emit('audio-error', `MPV error: ${err.message}`)
    })
    this.mpvProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.emit('audio-error', `MPV terminated with exit code ${code}`)
      }
    })

    // Wait for pipe to be ready with retry
    await this.connectSocket()
  }

  private commandQueue: any[][] = []

  private async connectSocket(): Promise<void> {
    const maxRetries = 15
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
                    if (msg.name === 'audio-out-params' && msg.data) this.emit('audio-out-params', msg.data)
                  }
                  if (msg.event === 'log-message') {
                    const text = msg.text || ''
                    if (msg.prefix === 'ao/wasapi' || msg.prefix === 'ao') {
                      if (text.includes("doesn't support") || text.includes('failed') || text.includes('Failed') || text.includes('Error')) {
                        this.emit('audio-error', text.trim())
                      }
                    }
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

            // Observe properties & subscribe to warning logs
            this.sendCommand(['observe_property', 1, 'time-pos'])
            this.sendCommand(['observe_property', 2, 'eof-reached'])
            this.sendCommand(['observe_property', 3, 'pause'])
            this.sendCommand(['observe_property', 4, 'duration'])
            this.sendCommand(['observe_property', 5, 'audio-out-params'])
            this.sendCommand(['request_log_messages', 'warn'])

            // Flush queued commands
            while (this.commandQueue.length > 0) {
              const cmd = this.commandQueue.shift()
              if (cmd) {
                const msg = { command: cmd, request_id: this.reqId++ }
                socket.write(JSON.stringify(msg) + '\n')
              }
            }

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
    if (!this.isConnected || !this.socket) {
      this.commandQueue.push(cmd)
      return
    }
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

  public stop() {
    this.sendCommand(['stop'])
    this.isPlaying = false
  }

  public seek(pos: number, mode: 'relative' | 'absolute' = 'absolute') {
    this.sendCommand(['seek', pos, mode])
  }

  public setVolume(vol: number) {
    // vol: 0-1
    const safeVol = Math.max(0, Math.min(1, typeof vol === 'number' && !isNaN(vol) ? vol : 1.0))
    this.sendCommand(['set_property', 'volume', safeVol * 100])
  }

  public setAudioDevice(device: string) {
    this.sendCommand(['set_property', 'audio-device', device])
  }

  public setEqualizer(bands: any[], preamp: number = 0) {
    if (!bands || bands.length === 0) {
      this.sendCommand(['af', 'set', ''])
      return
    }

    const filters: string[] = []
    if (preamp !== 0) {
      filters.push(`volume=volume=${preamp}dB:precision=fixed`)
    }

    if (typeof bands[0] === 'object' && bands[0] !== null) {
      bands.forEach((b: any) => {
        const freq = b.frequency || 1000
        const gain = b.gain || 0
        const q = b.q || 1.4
        filters.push(`equalizer=f=${freq}:width_type=q:width=${q}:g=${gain}`)
      })
    } else {
      const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      freqs.forEach((f, i) => {
        const g = bands[i] || 0
        filters.push(`equalizer=f=${f}:width_type=h:width=50:g=${g}`)
      })
    }

    this.sendCommand(['af', 'set', filters.join(',')])
  }

  public kill() {
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch (e) {}
      this.socket = null
    }
    if (this.mpvProcess) {
      try {
        this.mpvProcess.kill()
      } catch (e) {}
      this.mpvProcess = null
    }
    this.isConnected = false
  }
}

export class MpvManager extends EventEmitter {
  private activeInstance: MpvInstance | null = null
  private nextInstance: MpvInstance | null = null
  private crossfadeInterval: NodeJS.Timeout | null = null

  private currentAudioDevice?: string
  private currentBitPerfect: boolean = false
  private currentVolume: number = 1.0

  public async init(audioDevice?: string, bitPerfect: boolean = false, initialVolume?: number) {
    if (this.activeInstance) {
      this.activeInstance.kill()
      this.activeInstance = null
    }
    if (this.nextInstance) {
      this.nextInstance.kill()
      this.nextInstance = null
    }

    this.currentAudioDevice = audioDevice
    this.currentBitPerfect = bitPerfect
    if (typeof initialVolume === 'number' && !isNaN(initialVolume)) {
      this.currentVolume = Math.max(0, Math.min(1, initialVolume))
    }

    if (!bitPerfect) {
      // Khi tắt Bit-perfect, giải phóng hoàn toàn tiến trình MPV và khóa phần cứng WASAPI
      return
    }

    this.activeInstance = new MpvInstance()
    await this.activeInstance.init(audioDevice, bitPerfect)
    this.activeInstance.setVolume(this.currentVolume)
    
    this.setupListeners(this.activeInstance)
  }

  private setupListeners(instance: MpvInstance) {
    instance.on('time-pos', (val) => this.emit('time', val))
    instance.on('duration', (val) => this.emit('duration', val))
    instance.on('pause', (val) => this.emit('paused', val))
    instance.on('eof', () => this.emit('ended'))
    instance.on('audio-error', (msg) => this.emit('error', msg))
    instance.on('audio-out-params', (params) => this.emit('audio-out-params', params))
  }

  public playTrack(url: string, crossfadeDuration: number = 0) {
    if (!this.activeInstance) return

    // WASAPI Exclusive mode cannot run two simultaneous instances on the same device without AUDCLNT_E_DEVICE_IN_USE hardware conflict.
    // Also, true bit-perfect bypasses digital mixing. Therefore, disable dual-instance crossfade in bit-perfect mode.
    if (!this.currentBitPerfect && crossfadeDuration > 0 && this.activeInstance.isPlaying) {
      this.startCrossfade(url, crossfadeDuration)
    } else {
      if (this.crossfadeInterval) {
        clearInterval(this.crossfadeInterval)
        this.crossfadeInterval = null
      }
      if (this.nextInstance) {
        this.nextInstance.kill()
        this.nextInstance = null
      }
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

  public stop() {
    this.activeInstance?.stop()
  }

  public seek(pos: number, mode: 'relative' | 'absolute' = 'absolute') {
    this.activeInstance?.seek(pos, mode)
  }

  public setVolume(vol: number) {
    const safeVol = Math.max(0, Math.min(1, typeof vol === 'number' && !isNaN(vol) ? vol : 1.0))
    this.currentVolume = safeVol
    this.activeInstance?.setVolume(safeVol)
  }

  public setAudioDevice(device: string) {
    this.currentAudioDevice = device
    this.activeInstance?.setAudioDevice(device)
  }

  public setEqualizer(bands: any[], preamp: number = 0) {
    this.activeInstance?.setEqualizer(bands, preamp)
  }

  public killAll() {
    this.activeInstance?.kill()
    this.nextInstance?.kill()
  }
}
