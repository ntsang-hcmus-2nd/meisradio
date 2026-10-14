import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { EventEmitter } from 'events'
import koffi from 'koffi'

// ==========================================
// BASS CONSTANTS & FLAGS
// ==========================================
const BASS_STREAM_DECODE = 0x200000
const BASS_SAMPLE_FLOAT = 0x100
const BASS_POS_BYTE = 0
const BASS_ATTRIB_FREQ = 1
const BASS_ATTRIB_VOL = 2
const BASS_ATTRIB_VOLDSP = 19
const BASS_ACTIVE_STOPPED = 0
const BASS_UNICODE = 0x80000000

// BASS_DSD
const BASS_DSD_RAW = 0x200
const BASS_DSD_DOP = 0x400
const BASS_ATTRIB_DSD_RATE = 0x14001

// BASS_ASIO
const BASS_ASIO_THREAD = 1
const BASS_ASIO_RESET_ENABLE = 1
const BASS_ASIO_RESET_JOIN = 2
const BASS_ASIO_RESET_PAUSE = 4

// BASS_WASAPI
const BASS_WASAPI_EXCLUSIVE = 1
const BASS_WASAPI_AUTOFORMAT = 2
const BASS_WASAPI_BUFFER = 4
const BASS_WASAPI_CURVE_WINDOWS = 2

// Locate BASS DLLs directory
export function getBassDllPath(dllName: string): string {
  const isWin = process.platform === 'win32'
  const fileName = isWin ? (dllName.endsWith('.dll') ? dllName : `${dllName}.dll`) : dllName
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const exeDir = typeof app?.getPath === 'function' ? path.dirname(app.getPath('exe')) : process.cwd()
  const resPath = process.resourcesPath || ''

  const candidateDirs = [
    path.join(resPath, 'bin', 'bass'),
    path.join(resPath, 'bin'),
    path.join(resPath, 'resources', 'bin', 'bass'),
    path.join(resPath, 'resources', 'bin'),
    path.join(appPath, 'resources', 'bin', 'bass'),
    path.join(appPath, 'resources', 'bin'),
    path.join(process.cwd(), 'resources', 'bin', 'bass'),
    path.join(process.cwd(), 'resources', 'bin'),
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', 'bass'),
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin'),
    path.join(exeDir, 'resources', 'bin', 'bass'),
    path.join(exeDir, 'resources', 'bin'),
    path.join(exeDir, 'bin', 'bass'),
    path.join(exeDir, 'bin'),
    // Direct source directories in dev
    path.join(process.cwd(), 'bass', 'bass24', 'x64'),
    path.join(process.cwd(), 'bass', 'bassasio14', 'x64'),
    path.join(process.cwd(), 'bass', 'basswasapi24', 'x64'),
    path.join(process.cwd(), 'bass', 'bassdsd24', 'x64'),
    path.join(process.cwd(), 'bass', 'bassflac24', 'x64'),
    path.join(process.cwd(), 'bass', 'bassopus24', 'x64'),
    path.join(process.cwd(), 'bass', 'bassalac24', 'x64')
  ]

  for (const dir of candidateDirs) {
    if (!dir) continue
    const candidate = path.join(dir, fileName)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return path.join(appPath, 'resources', 'bin', 'bass', fileName)
}

export interface BassAudioDevice {
  id: string
  name: string
  description?: string
  driver?: string
  type: 'wasapi' | 'asio'
  isDefault?: boolean
  mixfreq?: number
}

export interface AudioOutParams {
  samplerate?: number
  format?: string
  channels?: string
  mode?: 'WASAPI' | 'ASIO'
  isDsd?: boolean
}

export class BassManager extends EventEmitter {
  private isInitialized = false
  private bassLib: any = null
  private asioLib: any = null
  private wasapiLib: any = null

  // Function pointers
  private BASS_Init: any
  private BASS_Free: any
  private BASS_PluginLoad: any
  private BASS_StreamCreateFile: any
  private BASS_StreamFree: any
  private BASS_ChannelIsActive: any
  private BASS_ChannelGetPosition: any
  private BASS_ChannelSetPosition: any
  private BASS_ChannelGetLength: any
  private BASS_ChannelBytes2Seconds: any
  private BASS_ChannelSeconds2Bytes: any
  private BASS_ChannelGetInfo: any
  private BASS_ChannelGetAttribute: any
  private BASS_ChannelSetAttribute: any
  private BASS_ChannelGetData: any
  private BASS_ErrorGetCode: any

  // DSD
  private BASS_DSD_StreamCreateFile: any

  // ASIO
  private BASS_ASIO_GetDeviceInfo: any
  private BASS_ASIO_Init: any
  private BASS_ASIO_Free: any
  private BASS_ASIO_SetRate: any
  private BASS_ASIO_Start: any
  private BASS_ASIO_Stop: any
  private BASS_ASIO_SetDSD: any
  private BASS_ASIO_ChannelReset: any
  private BASS_ASIO_ChannelEnable: any
  private BASS_ASIO_ChannelJoin: any
  private BASS_ASIO_ChannelEnableBASS: any
  private BASS_ASIO_ChannelEnableMirror: any
  private BASS_ASIO_ChannelPause: any
  private BASS_ASIO_ChannelSetVolume: any
  private BASS_ASIO_ErrorGetCode: any

  // WASAPI
  private BASS_WASAPI_GetDeviceInfo: any
  private BASS_WASAPI_GetInfo: any
  private BASS_WASAPI_Init: any
  private BASS_WASAPI_Free: any
  private BASS_WASAPI_Start: any
  private BASS_WASAPI_Stop: any
  private BASS_WASAPI_SetVolume: any
  private wasapiCallback: any = null
  private asioDsdCallback: any = null

  // Runtime State
  private currentStream = 0
  private currentMode: 'wasapi' | 'asio' = 'asio'
  private currentDeviceId = 'auto'
  private currentVolume = 1.0
  public isPlaying = false
  public isPaused = false
  private progressTimer: NodeJS.Timeout | null = null
  private activeWasapiStream = 0
  private activeAsioStream = 0

  constructor() {
    super()
    process.on('exit', () => {
      this.killSync()
    })
  }

  /**
   * Khởi tạo các thư viện BASS DLLs và add-on
   */
  public ensureLoaded(): boolean {
    if (this.isInitialized) return true

    try {
      const bassDll = getBassDllPath('bass.dll')
      const asioDll = getBassDllPath('bassasio.dll')
      const wasapiDll = getBassDllPath('basswasapi.dll')
      const dsdDll = getBassDllPath('bassdsd.dll')
      const flacDll = getBassDllPath('bassflac.dll')
      const opusDll = getBassDllPath('bassopus.dll')
      const alacDll = getBassDllPath('bassalac.dll')

      if (!fs.existsSync(bassDll)) {
        console.error(`BASS DLL not found at: ${bassDll}`)
        return false
      }

      this.bassLib = koffi.load(bassDll)
      this.asioLib = fs.existsSync(asioDll) ? koffi.load(asioDll) : null
      this.wasapiLib = fs.existsSync(wasapiDll) ? koffi.load(wasapiDll) : null

      // Structs
      koffi.struct('BASS_CHANNELINFO', {
        freq: 'uint32_t',
        chans: 'uint32_t',
        flags: 'uint32_t',
        ctype: 'uint32_t',
        origres: 'uint32_t',
        plugin: 'uint32_t',
        sample: 'uint32_t',
        filename: 'const char *'
      })

      // Core funcs
      this.BASS_Init = this.bassLib.func('bool BASS_Init(int device, uint32_t freq, uint32_t flags, void *win, void *dsguid)')
      this.BASS_Free = this.bassLib.func('bool BASS_Free()')
      this.BASS_PluginLoad = this.bassLib.func('uint32_t BASS_PluginLoad(const char *file, uint32_t flags)')
      this.BASS_StreamCreateFile = this.bassLib.func('uint32_t BASS_StreamCreateFile(bool mem, str16 file, uint64_t offset, uint64_t length, uint32_t flags)')
      this.BASS_StreamFree = this.bassLib.func('bool BASS_StreamFree(uint32_t handle)')
      this.BASS_ChannelIsActive = this.bassLib.func('uint32_t BASS_ChannelIsActive(uint32_t handle)')
      this.BASS_ChannelGetPosition = this.bassLib.func('uint64_t BASS_ChannelGetPosition(uint32_t handle, uint32_t mode)')
      this.BASS_ChannelSetPosition = this.bassLib.func('bool BASS_ChannelSetPosition(uint32_t handle, uint64_t pos, uint32_t mode)')
      this.BASS_ChannelGetLength = this.bassLib.func('uint64_t BASS_ChannelGetLength(uint32_t handle, uint32_t mode)')
      this.BASS_ChannelBytes2Seconds = this.bassLib.func('double BASS_ChannelBytes2Seconds(uint32_t handle, uint64_t pos)')
      this.BASS_ChannelSeconds2Bytes = this.bassLib.func('uint64_t BASS_ChannelSeconds2Bytes(uint32_t handle, double pos)')
      this.BASS_ChannelGetInfo = this.bassLib.func('bool BASS_ChannelGetInfo(uint32_t handle, _Out_ BASS_CHANNELINFO *info)')
      this.BASS_ChannelGetAttribute = this.bassLib.func('bool BASS_ChannelGetAttribute(uint32_t handle, uint32_t attrib, _Out_ float *value)')
      this.BASS_ChannelSetAttribute = this.bassLib.func('bool BASS_ChannelSetAttribute(uint32_t handle, uint32_t attrib, float value)')
      this.BASS_ChannelGetData = this.bassLib.func('uint32_t BASS_ChannelGetData(uint32_t handle, void *buffer, uint32_t length)')
      this.BASS_ErrorGetCode = this.bassLib.func('int BASS_ErrorGetCode()')

      // Init BASS No-Sound device 0 for decoding
      this.BASS_Init(0, 48000, 0, null, null)

      // Load plugins
      if (fs.existsSync(dsdDll)) {
        this.BASS_PluginLoad(dsdDll, 0)
        // Bind BASS_DSD functions
        const dsdLib = koffi.load(dsdDll)
        this.BASS_DSD_StreamCreateFile = dsdLib.func('uint32_t BASS_DSD_StreamCreateFile(bool mem, str16 file, uint64_t offset, uint64_t length, uint32_t flags, uint32_t freq)')
      }
      if (fs.existsSync(flacDll)) this.BASS_PluginLoad(flacDll, 0)
      if (fs.existsSync(opusDll)) this.BASS_PluginLoad(opusDll, 0)
      if (fs.existsSync(alacDll)) this.BASS_PluginLoad(alacDll, 0)

      // ASIO bindings
      if (this.asioLib) {
        koffi.struct('BASS_ASIO_DEVICEINFO', {
          name: 'const char *',
          driver: 'const char *'
        })
        this.BASS_ASIO_GetDeviceInfo = this.asioLib.func('bool BASS_ASIO_GetDeviceInfo(uint32_t device, _Out_ BASS_ASIO_DEVICEINFO *info)')
        this.BASS_ASIO_Init = this.asioLib.func('bool BASS_ASIO_Init(int device, uint32_t flags)')
        this.BASS_ASIO_Free = this.asioLib.func('bool BASS_ASIO_Free()')
        this.BASS_ASIO_SetRate = this.asioLib.func('bool BASS_ASIO_SetRate(double rate)')
        this.BASS_ASIO_Start = this.asioLib.func('bool BASS_ASIO_Start(uint32_t buflen, uint32_t threads)')
        this.BASS_ASIO_Stop = this.asioLib.func('bool BASS_ASIO_Stop()')
        this.BASS_ASIO_SetDSD = this.asioLib.func('bool BASS_ASIO_SetDSD(bool dsd)')
        this.BASS_ASIO_ChannelReset = this.asioLib.func('bool BASS_ASIO_ChannelReset(bool input, int channel, uint32_t flags)')
        const ASIOPROC = koffi.proto('uint32_t __stdcall ASIOPROC(bool input, uint32_t channel, void *buffer, uint32_t length, void *user)')
        this.BASS_ASIO_ChannelEnable = this.asioLib.func('bool BASS_ASIO_ChannelEnable(bool input, uint32_t channel, ASIOPROC *proc, void *user)')
        this.BASS_ASIO_ChannelJoin = this.asioLib.func('bool BASS_ASIO_ChannelJoin(bool input, uint32_t channel, int channel2)')
        this.BASS_ASIO_ChannelEnableBASS = this.asioLib.func('bool BASS_ASIO_ChannelEnableBASS(bool input, uint32_t channel, uint32_t handle, bool join)')
        this.BASS_ASIO_ChannelEnableMirror = this.asioLib.func('bool BASS_ASIO_ChannelEnableMirror(uint32_t channel, bool input2, uint32_t channel2)')
        this.BASS_ASIO_ChannelPause = this.asioLib.func('bool BASS_ASIO_ChannelPause(bool input, uint32_t channel)')
        this.BASS_ASIO_ChannelSetVolume = this.asioLib.func('bool BASS_ASIO_ChannelSetVolume(bool input, int channel, float volume)')
        this.BASS_ASIO_ErrorGetCode = this.asioLib.func('uint32_t BASS_ASIO_ErrorGetCode()')

        // Persistent ASIO DSD RAW callback that reads 1-bit stream from activeAsioStream
        this.asioDsdCallback = koffi.register((_input: boolean, _channel: number, buffer: any, length: number) => {
          if (!this.activeAsioStream) return 0
          try {
            const got = this.BASS_ChannelGetData(this.activeAsioStream, buffer, length)
            return got > 0 ? got : 0
          } catch {
            return 0
          }
        }, koffi.pointer(ASIOPROC))
      }

      // WASAPI bindings
      if (this.wasapiLib) {
        koffi.struct('BASS_WASAPI_DEVICEINFO', {
          name: 'const char *',
          id: 'const char *',
          type: 'uint32_t',
          flags: 'uint32_t',
          minperiod: 'float',
          defperiod: 'float',
          mixfreq: 'uint32_t',
          mixchans: 'uint32_t'
        })
        this.BASS_WASAPI_GetDeviceInfo = this.wasapiLib.func('bool BASS_WASAPI_GetDeviceInfo(uint32_t device, _Out_ BASS_WASAPI_DEVICEINFO *info)')

        koffi.struct('BASS_WASAPI_INFO', {
          initflags: 'uint32_t',
          freq: 'uint32_t',
          chans: 'uint32_t',
          format: 'uint32_t',
          buflen: 'uint32_t',
          volmax: 'float',
          volmin: 'float',
          volstep: 'float'
        })
        this.BASS_WASAPI_GetInfo = this.wasapiLib.func('bool BASS_WASAPI_GetInfo(_Out_ BASS_WASAPI_INFO *info)')
        
        const WASAPIPROC = koffi.proto('uint32_t __stdcall WASAPIPROC(void *buffer, uint32_t length, void *user)')
        this.BASS_WASAPI_Init = this.wasapiLib.func('bool BASS_WASAPI_Init(int device, uint32_t freq, uint32_t chans, uint32_t flags, float buffer, float period, WASAPIPROC *proc, void *user)')
        this.BASS_WASAPI_Free = this.wasapiLib.func('bool BASS_WASAPI_Free()')
        this.BASS_WASAPI_Start = this.wasapiLib.func('bool BASS_WASAPI_Start()')
        this.BASS_WASAPI_Stop = this.wasapiLib.func('bool BASS_WASAPI_Stop(bool reset)')
        this.BASS_WASAPI_SetVolume = this.wasapiLib.func('bool BASS_WASAPI_SetVolume(uint32_t mode, float volume)')

        // Persistent WASAPI callback that reads from activeWasapiStream
        this.wasapiCallback = koffi.register((buffer: any, length: number) => {
          if (!this.activeWasapiStream) return 0
          try {
            return this.BASS_ChannelGetData(this.activeWasapiStream, buffer, length)
          } catch {
            return 0
          }
        }, koffi.pointer(WASAPIPROC))
      }

      this.isInitialized = true
      return true
    } catch (err: any) {
      console.error('Failed to initialize BASS Audio Engine:', err)
      return false
    }
  }

  /**
   * Lấy danh sách thiết bị âm thanh khả dụng theo kiểu (ASIO hoặc WASAPI)
   */
  public getAudioDevices(preferredType: 'wasapi' | 'asio' = 'asio'): BassAudioDevice[] {
    if (!this.ensureLoaded()) return []
    const devices: BassAudioDevice[] = []

    if (preferredType === 'asio' && this.BASS_ASIO_GetDeviceInfo) {
      for (let i = 0; ; i++) {
        const info: any = {}
        if (!this.BASS_ASIO_GetDeviceInfo(i, info)) break
        if (info.name) {
          devices.push({
            id: i.toString(),
            name: info.name,
            description: `${info.name} (ASIO)`,
            driver: info.driver || '',
            type: 'asio',
            isDefault: i === 0
          })
        }
      }
      return devices
    }

    if (this.BASS_WASAPI_GetDeviceInfo) {
      for (let i = 0; ; i++) {
        const info: any = {}
        if (!this.BASS_WASAPI_GetDeviceInfo(i, info)) break
        const isInput = (info.flags & 16) !== 0
        const isEnabled = (info.flags & 1) !== 0
        if (isEnabled && !isInput && info.name) {
          devices.push({
            id: i.toString(),
            name: info.name,
            description: `${info.name} (${info.mixfreq ? `${info.mixfreq / 1000}kHz` : 'WASAPI Exclusive'})`,
            type: 'wasapi',
            isDefault: (info.flags & 2) !== 0,
            mixfreq: info.mixfreq
          })
        }
      }
    }

    return devices
  }

  /**
   * Cấu hình chế độ Bit-Perfect (ASIO vs WASAPI Exclusive)
   */
  public async init(audioDevice?: string, bitPerfect: boolean = false, initialVolume?: number, outputType: 'wasapi' | 'asio' = 'asio') {
    if (!this.ensureLoaded()) return

    this.currentMode = outputType
    if (audioDevice && audioDevice !== 'auto' && audioDevice !== 'default') {
      this.currentDeviceId = audioDevice
    } else {
      this.currentDeviceId = 'auto'
    }

    if (typeof initialVolume === 'number' && !isNaN(initialVolume)) {
      this.currentVolume = Math.max(0, Math.min(1, initialVolume))
    }

    if (!bitPerfect) {
      this.stop()
      this.releaseDevices()
      return
    }
  }

  public setOutputType(type: 'wasapi' | 'asio') {
    if (this.currentMode !== type) {
      this.stop()
      this.releaseDevices()
      this.currentMode = type
    }
  }

  public setAudioDevice(device: string) {
    const newDevice = device && device !== '' ? device : 'auto'
    if (this.currentDeviceId !== newDevice) {
      this.currentDeviceId = newDevice
      if (this.isPlaying) {
        this.stop()
      }
      this.releaseDevices()
    }
  }

  /**
   * Giải phóng thiết bị âm thanh đang giữ độc quyền
   */
  private releaseDevices() {
    try {
      if (this.BASS_ASIO_Stop) this.BASS_ASIO_Stop()
      if (this.BASS_ASIO_ChannelReset) this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
      if (this.BASS_ASIO_Free) this.BASS_ASIO_Free()
    } catch {}

    try {
      if (this.BASS_WASAPI_Stop) this.BASS_WASAPI_Stop(true)
      if (this.BASS_WASAPI_Free) this.BASS_WASAPI_Free()
    } catch {}
  }

  /**
   * Phát một bài hát cục bộ với chất lượng Bit-Perfect nguyên bản
   */
  public playTrack(urlOrPath: string, _crossfadeDuration: number = 0) {
    if (!this.ensureLoaded()) return

    this.stop()

    // BASS đọc đường dẫn file cục bộ hoặc URL
    let filePath = urlOrPath
    if (filePath.startsWith('file://')) {
      try {
        const { fileURLToPath } = require('url')
        filePath = fileURLToPath(filePath)
      } catch {
        try {
          filePath = decodeURIComponent(filePath.replace(/^file:\/\/\/?/, '').replace(/\//g, '\\'))
        } catch {}
      }
    }

    const lowerPath = filePath.toLowerCase()
    const isDsd = lowerPath.endsWith('.dsf') || lowerPath.endsWith('.dff') || lowerPath.endsWith('.dsd')

    if (this.currentMode === 'asio' && this.asioLib) {
      this.playAsio(filePath, isDsd)
    } else {
      this.playWasapi(filePath, isDsd)
    }
  }

  /**
   * Xử lý phát qua ASIO (bao gồm DSD Native, DoP, và PCM Bit-Perfect)
   */
  private playAsio(filePath: string, isDsd: boolean) {
    try {
      let devIndex = 0
      const asioDevs = this.getAudioDevices('asio')
      if (this.currentDeviceId && this.currentDeviceId !== 'auto' && this.currentDeviceId !== 'default') {
        const found = asioDevs.find((d) => d.id === this.currentDeviceId)
        if (found) {
          devIndex = parseInt(found.id, 10)
        }
      }

      // Init ASIO device
      if (this.BASS_ASIO_Init) {
        this.BASS_ASIO_Free()
        const ok = this.BASS_ASIO_Init(devIndex, BASS_ASIO_THREAD)
        if (!ok) {
          const errCode = this.BASS_ASIO_ErrorGetCode ? this.BASS_ASIO_ErrorGetCode() : 0
          console.warn(`ASIO Init failed (device ${devIndex}, code ${errCode}). Falling back to WASAPI...`)
          this.playWasapi(filePath, isDsd)
          return
        }
      }

      let chan = 0
      let outSampleRate = 44100
      let outFormat = 'PCM'
      let isNativeDsd = false

      if (isDsd && this.BASS_DSD_StreamCreateFile) {
        // 1. Thử DSD Native (BASS_DSD_RAW qua ASIOPROC callback)
        chan = this.BASS_DSD_StreamCreateFile(false, filePath, 0, 0, BASS_DSD_RAW | BASS_STREAM_DECODE | BASS_UNICODE, 0)
        let dsdRate = 2822400

        if (chan) {
          const rateBuf = [0]
          if (this.BASS_ChannelGetAttribute(chan, BASS_ATTRIB_DSD_RATE, rateBuf)) {
            dsdRate = Math.round(rateBuf[0]) || 2822400
          }

          // Kiểm tra xem driver ASIO có hỗ trợ DSD mode không
          const dsdSupported = this.BASS_ASIO_SetDSD ? this.BASS_ASIO_SetDSD(true) : false

          if (dsdSupported && this.BASS_ASIO_ChannelEnable) {
            this.BASS_ASIO_SetRate(dsdRate)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            this.activeAsioStream = chan
            const en0 = this.BASS_ASIO_ChannelEnable(false, 0, this.asioDsdCallback, null)
            const join1 = this.BASS_ASIO_ChannelJoin ? this.BASS_ASIO_ChannelJoin(false, 1, 0) : true
            if (en0 && join1) {
              outSampleRate = dsdRate
              const dsdFactor = Math.round(dsdRate / 44100)
              outFormat = `DSD${dsdFactor} Native (1-bit)`
              isNativeDsd = true
            } else {
              this.activeAsioStream = 0
              this.BASS_StreamFree(chan)
              chan = 0
            }
          } else {
            this.BASS_StreamFree(chan)
            chan = 0
          }
        }

        // 2. Không hỗ trợ DSD RAW hoặc lỗi ChannelEnable, thử DoP (DSD over PCM)
        if (!chan) {
          chan = this.BASS_DSD_StreamCreateFile(false, filePath, 0, 0, BASS_DSD_DOP | BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE, 0)
          if (chan) {
            const ci: any = {}
            this.BASS_ChannelGetInfo(chan, ci)
            this.BASS_ASIO_SetDSD(false)
            this.BASS_ASIO_SetRate(ci.freq)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            const ok = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
            if (ok) {
              outSampleRate = ci.freq
              outFormat = 'DSD (DoP)'
            } else {
              this.BASS_StreamFree(chan)
              chan = 0
            }
          }
        }

        // 3. Nếu cả Native DSD và DoP đều không được, chuyển đổi DSD sang PCM chất lượng cao (176.4kHz)
        if (!chan) {
          chan = this.BASS_DSD_StreamCreateFile(false, filePath, 0, 0, BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE, 176400)
          if (chan) {
            const ci: any = {}
            this.BASS_ChannelGetInfo(chan, ci)
            this.BASS_ASIO_SetDSD(false)
            this.BASS_ASIO_SetRate(176400)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            const ok = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
            if (ok) {
              outSampleRate = 176400
              outFormat = 'DSD-to-PCM (176.4kHz)'
            } else {
              this.BASS_StreamFree(chan)
              chan = 0
            }
          }
        }
      } else {
        // PCM (FLAC, WAV, MP3, OPUS, ALAC, etc.)
        chan = this.BASS_StreamCreateFile(false, filePath, 0, 0, BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_UNICODE)
        if (chan) {
          const ci: any = {}
          this.BASS_ChannelGetInfo(chan, ci)
          this.BASS_ASIO_SetDSD(false)
          this.BASS_ASIO_SetRate(ci.freq)
          this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
          this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
          if (ci.chans === 1 && this.BASS_ASIO_ChannelEnableMirror) {
            this.BASS_ASIO_ChannelEnableMirror(1, false, 0)
          }
          outSampleRate = ci.freq
          outFormat = `PCM Bit-Perfect (${ci.origres ? `${ci.origres}-bit` : 'Float'})`
        }
      }

      if (!chan) {
        console.warn('ASIO could not decode file, falling back to WASAPI...')
        this.playWasapi(filePath, isDsd)
        return
      }

      this.currentStream = chan
      this.setVolume(this.currentVolume)

      // Bắt đầu phát ASIO
      const started = this.BASS_ASIO_Start(0, 0)
      if (!started) {
        const err = this.BASS_ASIO_ErrorGetCode ? this.BASS_ASIO_ErrorGetCode() : 0
        console.warn(`BASS_ASIO_Start failed (code ${err}), falling back to WASAPI...`)
        this.stop()
        this.playWasapi(filePath, isDsd)
        return
      }

      this.isPlaying = true
      this.isPaused = false

      // Gửi thông số phần cứng audio ra giao diện
      this.emit('audio-out-params', {
        samplerate: outSampleRate,
        format: outFormat,
        channels: '2 ch',
        mode: 'ASIO',
        isDsd: isDsd || isNativeDsd
      })

      this.startProgressTimer()
    } catch (e: any) {
      this.emit('error', `ASIO Playback Error: ${e.message}`)
    }
  }

  /**
   * Xử lý phát qua WASAPI Exclusive (Bit-Perfect PCM)
   */
  private playWasapi(filePath: string, isDsd: boolean) {
    try {
      let chan = 0
      let outSampleRate = 44100

      if (isDsd && this.BASS_DSD_StreamCreateFile) {
        chan = this.BASS_DSD_StreamCreateFile(false, filePath, 0, 0, BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE, 176400)
        outSampleRate = 176400
      } else {
        chan = this.BASS_StreamCreateFile(false, filePath, 0, 0, BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_UNICODE)
        if (chan) {
          const ci: any = {}
          this.BASS_ChannelGetInfo(chan, ci)
          outSampleRate = ci.freq
        }
      }

      if (!chan) {
        const err = this.BASS_ErrorGetCode ? this.BASS_ErrorGetCode() : 0
        this.emit('error', `Cannot decode audio file (code ${err})`)
        return
      }

      const ci: any = {}
      this.BASS_ChannelGetInfo(chan, ci)
      const chans = ci.chans || 2
      const streamFreq = ci.freq || outSampleRate

      this.activeWasapiStream = chan
      this.currentStream = chan

      if (this.BASS_WASAPI_Free) this.BASS_WASAPI_Free()

      let devIndex = -1
      const devs = this.getAudioDevices('wasapi')
      if (this.currentDeviceId && this.currentDeviceId !== 'auto' && this.currentDeviceId !== 'default') {
        const found = devs.find((d) => d.id === this.currentDeviceId)
        if (found) {
          devIndex = parseInt(found.id, 10)
        } else {
          const def = devs.find((d) => d.isDefault) || devs[0]
          if (def) devIndex = parseInt(def.id, 10)
        }
      } else {
        // Tự động tìm thiết bị default
        const def = devs.find((d) => d.isDefault) || devs[0]
        if (def) devIndex = parseInt(def.id, 10)
      }

      // Thử Exclusive mode trước
      let ok = this.BASS_WASAPI_Init(devIndex, streamFreq, chans, BASS_WASAPI_EXCLUSIVE | BASS_WASAPI_BUFFER | BASS_WASAPI_AUTOFORMAT, 0.1, 0.05, this.wasapiCallback, null)
      let isExclusive = true

      // Nếu thiết bị đang bận hoặc không hỗ trợ Exclusive, fallback sang Shared
      if (!ok) {
        console.warn('WASAPI Exclusive failed, falling back to Shared mode...')
        ok = this.BASS_WASAPI_Init(devIndex, 0, 0, BASS_WASAPI_BUFFER | BASS_WASAPI_AUTOFORMAT, 0.4, 0.05, this.wasapiCallback, null)
        isExclusive = false
      }

      if (!ok) {
        const err = this.BASS_ErrorGetCode ? this.BASS_ErrorGetCode() : 0
        this.emit('error', `BASS_WASAPI_Init failed (code ${err})`)
        return
      }

      // Kiểm tra tần số thực tế của WASAPI device, resample nếu có chênh lệch
      let activeFreq = streamFreq
      if (this.BASS_WASAPI_GetInfo) {
        const wi: any = {}
        if (this.BASS_WASAPI_GetInfo(wi) && wi.freq) {
          activeFreq = wi.freq
          if (wi.freq !== streamFreq) {
            console.log(`WASAPI rate mismatch: hardware is ${wi.freq}Hz, stream is ${streamFreq}Hz. Resampling.`)
            this.BASS_ChannelSetAttribute(chan, BASS_ATTRIB_FREQ, wi.freq)
          }
        }
      }

      this.setVolume(this.currentVolume)
      this.BASS_WASAPI_Start()

      this.isPlaying = true
      this.isPaused = false

      this.emit('audio-out-params', {
        samplerate: activeFreq,
        format: isDsd ? 'DSD-to-PCM (176.4kHz)' : (isExclusive ? 'WASAPI Exclusive' : 'WASAPI Shared'),
        channels: `${chans} ch`,
        mode: 'WASAPI',
        isDsd: isDsd
      })

      this.startProgressTimer()
    } catch (e: any) {
      this.emit('error', `WASAPI Playback Error: ${e.message}`)
    }
  }

  /**
   * Vòng lặp cập nhật tiến trình phát nhạc (time, duration, ended)
   */
  private startProgressTimer() {
    this.stopProgressTimer()

    let totalDuration = 0
    if (this.currentStream && this.BASS_ChannelGetLength && this.BASS_ChannelBytes2Seconds) {
      const len = this.BASS_ChannelGetLength(this.currentStream, BASS_POS_BYTE)
      if (len > 0) {
        totalDuration = this.BASS_ChannelBytes2Seconds(this.currentStream, len)
        this.emit('duration', totalDuration)
      }
    }

    this.progressTimer = setInterval(() => {
      if (!this.isPlaying || !this.currentStream) return

      try {
        const pos = this.BASS_ChannelGetPosition(this.currentStream, BASS_POS_BYTE)
        const curSec = this.BASS_ChannelBytes2Seconds(this.currentStream, pos)
        this.emit('time', curSec)

        // Kiểm tra kết thúc bài
        const isActive = this.BASS_ChannelIsActive ? this.BASS_ChannelIsActive(this.currentStream) : 1
        if (isActive === BASS_ACTIVE_STOPPED || (totalDuration > 0 && curSec >= totalDuration - 0.1)) {
          this.emit('ended')
          this.stop()
        }
      } catch {}
    }, 100)
  }

  private stopProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }

  public play() {
    if (!this.currentStream) return
    if (this.currentMode === 'asio' && this.BASS_ASIO_ChannelReset) {
      this.BASS_ASIO_ChannelReset(false, 0, BASS_ASIO_RESET_PAUSE)
    } else if (this.BASS_WASAPI_Start) {
      this.BASS_WASAPI_Start()
    }
    this.isPlaying = true
    this.isPaused = false
    this.emit('paused', false)
  }

  public pause() {
    if (!this.currentStream) return
    if (this.currentMode === 'asio' && this.BASS_ASIO_ChannelPause) {
      this.BASS_ASIO_ChannelPause(false, 0)
    } else if (this.BASS_WASAPI_Stop) {
      this.BASS_WASAPI_Stop(false)
    }
    this.isPlaying = false
    this.isPaused = true
    this.emit('paused', true)
  }

  public stop() {
    this.stopProgressTimer()
    this.isPlaying = false
    this.isPaused = false

    if (this.currentMode === 'asio') {
      try {
        if (this.BASS_ASIO_Stop) this.BASS_ASIO_Stop()
        if (this.BASS_ASIO_ChannelReset) this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
        if (this.BASS_ASIO_Free) this.BASS_ASIO_Free()
      } catch {}
    } else {
      try {
        if (this.BASS_WASAPI_Stop) this.BASS_WASAPI_Stop(true)
        if (this.BASS_WASAPI_Free) this.BASS_WASAPI_Free()
      } catch {}
    }

    if (this.currentStream) {
      try {
        if (this.BASS_StreamFree) this.BASS_StreamFree(this.currentStream)
      } catch {}
      this.currentStream = 0
    }
    this.activeWasapiStream = 0
    this.activeAsioStream = 0
  }

  public seek(posSeconds: number, _mode: 'relative' | 'absolute' = 'absolute') {
    if (!this.currentStream || !this.BASS_ChannelSeconds2Bytes || !this.BASS_ChannelSetPosition) return
    try {
      const bytes = this.BASS_ChannelSeconds2Bytes(this.currentStream, Math.max(0, posSeconds))
      this.BASS_ChannelSetPosition(this.currentStream, bytes, BASS_POS_BYTE)
    } catch {}
  }

  public setVolume(vol: number) {
    const safeVol = Math.max(0, Math.min(1, typeof vol === 'number' && !isNaN(vol) ? vol : 1.0))
    this.currentVolume = safeVol

    if (this.currentStream && this.BASS_ChannelSetAttribute) {
      try {
        this.BASS_ChannelSetAttribute(this.currentStream, BASS_ATTRIB_VOL, safeVol)
        if (this.currentMode === 'wasapi') {
          this.BASS_ChannelSetAttribute(this.currentStream, BASS_ATTRIB_VOLDSP, safeVol)
        }
      } catch {}
    }

    if (this.currentMode === 'asio' && this.BASS_ASIO_ChannelSetVolume) {
      try {
        // Cân bằng âm lượng 2 kênh stereo: master (-1), kênh trái (0), kênh phải (1)
        this.BASS_ASIO_ChannelSetVolume(false, -1, safeVol)
        this.BASS_ASIO_ChannelSetVolume(false, 0, safeVol)
        this.BASS_ASIO_ChannelSetVolume(false, 1, safeVol)
      } catch {}
    } else if (this.BASS_WASAPI_SetVolume) {
      try {
        this.BASS_WASAPI_SetVolume(BASS_WASAPI_CURVE_WINDOWS, safeVol)
      } catch {}
    }
  }

  public setEqualizer(_bands: any[], _preamp: number = 0) {
    // Trong chế độ Bit-Perfect / ASIO / DSD Native, EQ được bypass nguyên bản
  }

  public killSync() {
    this.stop()
    this.releaseDevices()
    if (this.BASS_Free) {
      try {
        this.BASS_Free()
      } catch {}
    }
    this.isInitialized = false
  }
}
