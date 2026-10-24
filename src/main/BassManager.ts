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
const BASS_WASAPI_CURVE_LINEAR = 0

// Locate BASS DLLs directory
export function getBassDllPath(dllName: string): string {
  const isWin = process.platform === 'win32'
  const fileName = isWin ? (dllName.endsWith('.dll') ? dllName : `${dllName}.dll`) : dllName
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const exeDir =
    typeof app?.getPath === 'function' ? path.dirname(app.getPath('exe')) : process.cwd()
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

export interface PreloadTrackInfo {
  freq: number
  chans: number
  origres: number
  isDsd: boolean
  dsdRate: number
  startTime?: number
  endTime?: number
}

export interface PreloadResult {
  preloaded: boolean
  reason?: string
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

  // Raw CD-DA BIN Stream
  private BASS_StreamCreateFileUser: any
  private binFileProcs: any = null
  private binContexts: Map<
    number,
    { fd: number; curPos: number; header: Buffer; fileSize: number; totalLen: number }
  > = new Map()
  private nextBinContextId: number = 1

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
  private BASS_ASIO_ChannelSetFormat: any
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
  private wasapiProcPtr: any = null
  private asioDsdCallback: any = null
  private asioCallback: any = null

  // Runtime State
  private currentStream = 0
  private currentMode: 'wasapi' | 'asio' = 'wasapi'
  private currentDeviceId = 'auto'
  private currentVolume = 1.0
  public isPlaying = false
  public isPaused = false
  private progressTimer: NodeJS.Timeout | null = null
  private activeWasapiStream = 0
  private activeAsioStream = 0
  private currentAsioDevice = -1

  // Gapless & Bit-Perfect State
  private gaplessEnabled: boolean = true
  private isTransitioningStream: boolean = false
  private preloadedStream: number = 0
  // Tăng mỗi lần stop()/playFile() để hủy bỏ transition và deferred-free lỗi thời,
  // chống use-after-free/double-free khi chuyển bài tay trong lúc audio thread
  // đang chuyển gapless (dẫn tới crash native ngẫu nhiên).
  private streamEpoch: number = 0
  // Stream chờ giải phóng: free trực tiếp trong stop() có thể trúng lúc audio
  // thread đang GetData trên chính handle đó -> park lại, xả ở lần stop() sau.
  private parkedStreams: number[] = []
  private lastKnownWasapiDevices: BassAudioDevice[] = []
  private wasapiInitKey: string | null = null

  private parkStreamForDeferredFree(handle: number): void {
    if (handle) this.parkedStreams.push(handle)
  }

  private flushParkedStreams(): void {
    if (this.parkedStreams.length === 0) return
    const batch = this.parkedStreams
    this.parkedStreams = []
    for (const h of batch) {
      if (h && h !== this.currentStream && h !== this.preloadedStream) {
        try {
          this.BASS_StreamFree(h)
        } catch {}
      }
    }
  }

  // Liệt kê thiết bị WASAPI có chịu lỗi thoáng qua: USB DAC khi churn
  // Free/Init exclusive liên tục có thể biến mất khỏi danh sách vài chục ms.
  private getWasapiDevicesResilient(): BassAudioDevice[] {
    let devs: BassAudioDevice[] = []
    try {
      devs = this.getAudioDevices('wasapi')
    } catch {}
    if (devs.length > 0) {
      this.lastKnownWasapiDevices = devs
      return devs
    }
    for (let attempt = 0; attempt < 3 && devs.length === 0; attempt++) {
      const start = Date.now()
      while (Date.now() - start < 50) {
        // Chờ ngắn đồng bộ, chỉ đi vào nhánh lỗi hiếm này
      }
      try {
        devs = this.getAudioDevices('wasapi')
      } catch {}
    }
    if (devs.length > 0) {
      this.lastKnownWasapiDevices = devs
      return devs
    }
    return this.lastKnownWasapiDevices
  }

  private get activeStream(): number {
    return this.currentStream
  }
  private set activeStream(val: number) {
    this.currentStream = val
  }

  private get nextActiveStream(): number {
    return this.preloadedStream
  }
  private set nextActiveStream(val: number) {
    this.preloadedStream = val
  }
  private preloadedFilePath: string | null = null
  private preloadedInfo: PreloadTrackInfo | null = null
  private currentStartTime: number = 0
  private currentEndTime: number = 0
  private currentEndByte: bigint | number = 0
  private currentFilePath: string | null = null
  private currentIsDsd: boolean = false
  private currentTrackInfo: {
    freq: number
    chans: number
    origres: number
    isDsd: boolean
    dsdRate: number
    isNativeDsd?: boolean
    isDoP?: boolean
  } | null = null
  private onGaplessTransitionCallback: ((nextFilePath: string, info: any) => void) | null = null

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
      this.BASS_Init = this.bassLib.func(
        'bool BASS_Init(int device, uint32_t freq, uint32_t flags, void *win, void *dsguid)'
      )
      this.BASS_Free = this.bassLib.func('bool BASS_Free()')
      this.BASS_PluginLoad = this.bassLib.func(
        'uint32_t BASS_PluginLoad(const char *file, uint32_t flags)'
      )
      this.BASS_StreamCreateFile = this.bassLib.func(
        'uint32_t BASS_StreamCreateFile(bool mem, str16 file, uint64_t offset, uint64_t length, uint32_t flags)'
      )
      this.BASS_StreamFree = this.bassLib.func('bool BASS_StreamFree(uint32_t handle)')
      this.BASS_ChannelIsActive = this.bassLib.func(
        'uint32_t BASS_ChannelIsActive(uint32_t handle)'
      )
      this.BASS_ChannelGetPosition = this.bassLib.func(
        'uint64_t BASS_ChannelGetPosition(uint32_t handle, uint32_t mode)'
      )
      this.BASS_ChannelSetPosition = this.bassLib.func(
        'bool BASS_ChannelSetPosition(uint32_t handle, uint64_t pos, uint32_t mode)'
      )
      this.BASS_ChannelGetLength = this.bassLib.func(
        'uint64_t BASS_ChannelGetLength(uint32_t handle, uint32_t mode)'
      )
      this.BASS_ChannelBytes2Seconds = this.bassLib.func(
        'double BASS_ChannelBytes2Seconds(uint32_t handle, uint64_t pos)'
      )
      this.BASS_ChannelSeconds2Bytes = this.bassLib.func(
        'uint64_t BASS_ChannelSeconds2Bytes(uint32_t handle, double pos)'
      )
      this.BASS_ChannelGetInfo = this.bassLib.func(
        'bool BASS_ChannelGetInfo(uint32_t handle, _Out_ BASS_CHANNELINFO *info)'
      )
      this.BASS_ChannelGetAttribute = this.bassLib.func(
        'bool BASS_ChannelGetAttribute(uint32_t handle, uint32_t attrib, _Out_ float *value)'
      )
      this.BASS_ChannelSetAttribute = this.bassLib.func(
        'bool BASS_ChannelSetAttribute(uint32_t handle, uint32_t attrib, float value)'
      )
      this.BASS_ChannelGetData = this.bassLib.func(
        'uint32_t BASS_ChannelGetData(uint32_t handle, void *buffer, uint32_t length)'
      )
      this.BASS_ErrorGetCode = this.bassLib.func('int BASS_ErrorGetCode()')

      // Init BASS No-Sound device 0 for decoding
      this.BASS_Init(0, 48000, 0, null, null)

      // Raw CD-DA .bin stream support via BASS_StreamCreateFileUser
      const PFILECLOSEPROC = koffi.proto('void __stdcall FILECLOSEPROC(uint64_t user)')
      const PFILELENPROC = koffi.proto('uint64 __stdcall FILELENPROC(uint64_t user)')
      const PFILEREADPROC = koffi.proto(
        'uint32 __stdcall PFILEREADPROC(void *buffer, uint32 length, uint64_t user)'
      )
      const PFILESEEKPROC = koffi.proto('int __stdcall PFILESEEKPROC(uint64 offset, uint64_t user)')

      koffi.struct('BASS_FILEPROCS', {
        close: koffi.pointer(PFILECLOSEPROC),
        length: koffi.pointer(PFILELENPROC),
        read: koffi.pointer(PFILEREADPROC),
        seek: koffi.pointer(PFILESEEKPROC)
      })

      this.BASS_StreamCreateFileUser = this.bassLib.func(
        'uint32_t BASS_StreamCreateFileUser(uint32_t system, uint32_t flags, _In_ BASS_FILEPROCS *procs, uint64_t user)'
      )

      const closeCb = koffi.register((user: any) => {
        try {
          const id = Number(user)
          const ctx = this.binContexts.get(id)
          if (ctx) {
            try {
              fs.closeSync(ctx.fd)
            } catch {}
            this.binContexts.delete(id)
          }
        } catch (err) {
          console.error('[BassManager] Error in closeCb:', err)
        }
      }, koffi.pointer(PFILECLOSEPROC))

      const lenCb = koffi.register((user: any) => {
        try {
          const ctx = this.binContexts.get(Number(user))
          return BigInt(ctx ? ctx.totalLen : 0)
        } catch (err) {
          console.error('[BassManager] Error in lenCb:', err)
          return 0n
        }
      }, koffi.pointer(PFILELENPROC))

      const readCb = koffi.register((bufPtr: any, length: number, user: any) => {
        try {
          const ctx = this.binContexts.get(Number(user))
          if (!ctx || !bufPtr || length <= 0) return 0
          if (ctx.curPos >= ctx.totalLen) return 0
          const toRead = Math.min(length, ctx.totalLen - ctx.curPos)
          if (toRead <= 0) return 0

          let bytesWritten = 0
          const outBuf = Buffer.alloc(toRead)

          if (ctx.curPos < 44) {
            const headerAvail = 44 - ctx.curPos
            const headerToCopy = Math.min(toRead, headerAvail)
            ctx.header.copy(outBuf, 0, ctx.curPos, ctx.curPos + headerToCopy)
            bytesWritten += headerToCopy
            ctx.curPos += headerToCopy
          }

          if (bytesWritten < toRead) {
            const fileOffset = ctx.curPos - 44
            const remaining = toRead - bytesWritten
            try {
              const n = fs.readSync(ctx.fd, outBuf, bytesWritten, remaining, fileOffset)
              bytesWritten += n
              ctx.curPos += n
            } catch {
              // Ignore read error (closed fd or EOF)
            }
          }

          if (bytesWritten > 0) {
            koffi.encode(bufPtr, koffi.array('uint8', bytesWritten), outBuf)
          }
          return bytesWritten
        } catch (err) {
          console.error('[BassManager] Error in readCb:', err)
          return 0
        }
      }, koffi.pointer(PFILEREADPROC))

      const seekCb = koffi.register((offset: any, user: any) => {
        try {
          const ctx = this.binContexts.get(Number(user))
          if (!ctx) return 0
          const off = Number(offset)
          if (off > ctx.totalLen) return 0
          ctx.curPos = off
          return 1
        } catch (err) {
          console.error('[BassManager] Error in seekCb:', err)
          return 0
        }
      }, koffi.pointer(PFILESEEKPROC))

      this.binFileProcs = {
        close: closeCb,
        length: lenCb,
        read: readCb,
        seek: seekCb
      }

      // Load plugins
      if (fs.existsSync(dsdDll)) {
        this.BASS_PluginLoad(dsdDll, 0)
        // Bind BASS_DSD functions
        const dsdLib = koffi.load(dsdDll)
        this.BASS_DSD_StreamCreateFile = dsdLib.func(
          'uint32_t BASS_DSD_StreamCreateFile(bool mem, str16 file, uint64_t offset, uint64_t length, uint32_t flags, uint32_t freq)'
        )
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
        this.BASS_ASIO_GetDeviceInfo = this.asioLib.func(
          'bool BASS_ASIO_GetDeviceInfo(uint32_t device, _Out_ BASS_ASIO_DEVICEINFO *info)'
        )
        this.BASS_ASIO_Init = this.asioLib.func('bool BASS_ASIO_Init(int device, uint32_t flags)')
        this.BASS_ASIO_Free = this.asioLib.func('bool BASS_ASIO_Free()')
        this.BASS_ASIO_SetRate = this.asioLib.func('bool BASS_ASIO_SetRate(double rate)')
        this.BASS_ASIO_Start = this.asioLib.func(
          'bool BASS_ASIO_Start(uint32_t buflen, uint32_t threads)'
        )
        this.BASS_ASIO_Stop = this.asioLib.func('bool BASS_ASIO_Stop()')
        this.BASS_ASIO_SetDSD = this.asioLib.func('bool BASS_ASIO_SetDSD(bool dsd)')
        this.BASS_ASIO_ChannelReset = this.asioLib.func(
          'bool BASS_ASIO_ChannelReset(bool input, int channel, uint32_t flags)'
        )
        const ASIOPROC = koffi.proto(
          'uint32_t __stdcall ASIOPROC(bool input, uint32_t channel, void *buffer, uint32_t length, void *user)'
        )
        this.BASS_ASIO_ChannelEnable = this.asioLib.func(
          'bool BASS_ASIO_ChannelEnable(bool input, uint32_t channel, ASIOPROC *proc, void *user)'
        )
        this.BASS_ASIO_ChannelJoin = this.asioLib.func(
          'bool BASS_ASIO_ChannelJoin(bool input, uint32_t channel, int channel2)'
        )
        this.BASS_ASIO_ChannelEnableBASS = this.asioLib.func(
          'bool BASS_ASIO_ChannelEnableBASS(bool input, uint32_t channel, uint32_t handle, bool join)'
        )
        this.BASS_ASIO_ChannelEnableMirror = this.asioLib.func(
          'bool BASS_ASIO_ChannelEnableMirror(uint32_t channel, bool input2, uint32_t channel2)'
        )
        this.BASS_ASIO_ChannelPause = this.asioLib.func(
          'bool BASS_ASIO_ChannelPause(bool input, uint32_t channel)'
        )
        this.BASS_ASIO_ChannelSetVolume = this.asioLib.func(
          'bool BASS_ASIO_ChannelSetVolume(bool input, int channel, float volume)'
        )
        this.BASS_ASIO_ChannelSetFormat = this.asioLib.func(
          'bool BASS_ASIO_ChannelSetFormat(bool input, uint32_t channel, uint32_t format)'
        )
        this.BASS_ASIO_ErrorGetCode = this.asioLib.func('uint32_t BASS_ASIO_ErrorGetCode()')

        // Persistent ASIO callback supporting gapless Bit-Perfect playback
        this.asioCallback = koffi.register(
          (_input: boolean, _channel: number, buffer: any, length: number) => {
            try {
              return this.processAudioData(buffer, length)
            } catch {
              return 0
            }
          },
          koffi.pointer(ASIOPROC)
        )
        this.asioDsdCallback = this.asioCallback
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
        this.BASS_WASAPI_GetDeviceInfo = this.wasapiLib.func(
          'bool BASS_WASAPI_GetDeviceInfo(uint32_t device, _Out_ BASS_WASAPI_DEVICEINFO *info)'
        )

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
        this.BASS_WASAPI_GetInfo = this.wasapiLib.func(
          'bool BASS_WASAPI_GetInfo(_Out_ BASS_WASAPI_INFO *info)'
        )

        const WASAPIPROC = koffi.proto(
          'uint32_t __stdcall WASAPIPROC(void *buffer, uint32_t length, void *user)'
        )
        this.BASS_WASAPI_Init = this.wasapiLib.func(
          'bool BASS_WASAPI_Init(int device, uint32_t freq, uint32_t chans, uint32_t flags, float buffer, float period, WASAPIPROC *proc, void *user)'
        )
        this.BASS_WASAPI_Free = this.wasapiLib.func('bool BASS_WASAPI_Free()')
        this.BASS_WASAPI_Start = this.wasapiLib.func('bool BASS_WASAPI_Start()')
        this.BASS_WASAPI_Stop = this.wasapiLib.func('bool BASS_WASAPI_Stop(bool reset)')
        this.BASS_WASAPI_SetVolume = this.wasapiLib.func(
          'bool BASS_WASAPI_SetVolume(uint32_t mode, float volume)'
        )

        // Persistent WASAPI callback supporting gapless Bit-Perfect playback
        this.wasapiCallback = koffi.register((buffer: any, length: number) => {
          return this.processAudioData(buffer, length)
        }, koffi.pointer(WASAPIPROC))
        this.wasapiProcPtr = this.wasapiCallback
      }

      this.isInitialized = true
      return true
    } catch (err: any) {
      console.error('Failed to initialize BASS Audio Engine:', err)
      return false
    }
  }

  private isValidBytesRead(bytes: number, maxLength: number): boolean {
    return (
      typeof bytes === 'number' &&
      bytes > 0 &&
      bytes !== 0xffffffff &&
      bytes !== 4294967295 &&
      bytes <= maxLength
    )
  }

  /**
   * Bộ xử lý buffer âm thanh thời gian thực (WASAPI & ASIO) hỗ trợ Gapless Bit-Perfect
   */
  private processAudioData(buffer: any, length: number): number {
    if (!this.currentStream || !this.isPlaying) return 0

    try {
      // 1. Giới hạn CUE sheet ảo (currentEndTime)
      if (this.currentEndTime > 0 && this.currentEndByte > 0) {
        const curBytePos = this.BASS_ChannelGetPosition(this.currentStream, BASS_POS_BYTE)
        if (curBytePos >= this.currentEndByte) {
          // Track ảo trong CUE đã đến điểm kết thúc
          if (this.gaplessEnabled && this.preloadedStream) {
            this.transitionToPreloadedStream()
            const got = this.BASS_ChannelGetData(this.currentStream, buffer, length)
            return this.isValidBytesRead(got, length) ? got : 0
          }
          return 0
        }

        // Chưa đến điểm kết thúc, nhưng buffer này có thể chạm currentEndByte
        const bytesLeft = Number(BigInt(this.currentEndByte) - BigInt(curBytePos))
        const toRead = Math.min(length, Math.max(0, bytesLeft))
        const got = this.BASS_ChannelGetData(this.currentStream, buffer, toRead)

        if (!this.isValidBytesRead(got, toRead)) {
          // Stream kết thúc sớm hơn dự kiến
          if (this.gaplessEnabled && this.preloadedStream) {
            this.transitionToPreloadedStream()
            const secondRead = this.BASS_ChannelGetData(this.currentStream, buffer, length)
            return this.isValidBytesRead(secondRead, length) ? secondRead : 0
          }
          return 0
        }

        // Đã đọc đến đúng ranh giới CUE track ảo và buffer DAC còn trống
        if (got === toRead && toRead < length) {
          if (this.gaplessEnabled && this.preloadedStream) {
            this.transitionToPreloadedStream()
            const remaining = length - got
            try {
              const baseAddr = koffi.address(buffer)
              if (baseAddr) {
                const offsetPtr = koffi.as(baseAddr + BigInt(got), 'void *')
                const secondRead = this.BASS_ChannelGetData(
                  this.currentStream,
                  offsetPtr,
                  remaining
                )
                if (this.isValidBytesRead(secondRead, remaining)) {
                  return got + secondRead
                }
              }
            } catch {}
          }
          return got
        }

        return got
      }

      // 2. Track vật lý thông thường
      const got = this.BASS_ChannelGetData(this.currentStream, buffer, length)

      // Stream đã đọc hết (EOF hoặc lỗi)
      if (!this.isValidBytesRead(got, length)) {
        if (this.gaplessEnabled && this.preloadedStream) {
          this.transitionToPreloadedStream()
          const nextRead = this.BASS_ChannelGetData(this.currentStream, buffer, length)
          return this.isValidBytesRead(nextRead, length) ? nextRead : 0
        }
        return 0
      }

      // Stream đọc được nhưng ít hơn số byte yêu cầu (chạm EOF ở giữa buffer)
      if (got < length) {
        if (this.gaplessEnabled && this.preloadedStream) {
          this.transitionToPreloadedStream()
          const remaining = length - got
          try {
            const baseAddr = koffi.address(buffer)
            if (baseAddr) {
              const offsetPtr = koffi.as(baseAddr + BigInt(got), 'void *')
              const secondRead = this.BASS_ChannelGetData(this.currentStream, offsetPtr, remaining)
              if (this.isValidBytesRead(secondRead, remaining)) {
                return got + secondRead
              }
            }
          } catch {}
        }
        return got
      }

      return got
    } catch {
      return 0
    }
  }

  /**
   * Chuyển đổi luồng không khoảng lặng (Seamless Gapless Stream Transition)
   */
  private transitionToPreloadedStream(): boolean {
    if (this.isTransitioningStream || !this.nextActiveStream || !this.bassLib) return false
    this.isTransitioningStream = true
    const epoch = this.streamEpoch

    try {
      const oldStream = this.activeStream
      const nextStream = this.nextActiveStream
      const nextPath = this.preloadedFilePath
      const nextInfo = this.preloadedInfo

      // Bài khác đã stop()/play trong lúc chờ -> bỏ transition lỗi thời
      if (!nextStream) return false

      this.activeStream = this.nextActiveStream
      this.nextActiveStream = 0
      this.activeWasapiStream = nextStream
      this.activeAsioStream = nextStream

      this.preloadedFilePath = null
      this.preloadedInfo = null

      this.currentStartTime = nextInfo?.startTime || 0
      this.currentEndTime = nextInfo?.endTime || 0
      if (this.currentEndTime > 0 && this.BASS_ChannelSeconds2Bytes) {
        this.currentEndByte = this.BASS_ChannelSeconds2Bytes(this.activeStream, this.currentEndTime)
      } else {
        this.currentEndByte = 0
      }

      if (nextInfo) {
        this.currentTrackInfo = {
          freq: nextInfo.freq,
          chans: nextInfo.chans,
          origres: nextInfo.origres,
          isDsd: nextInfo.isDsd,
          dsdRate: nextInfo.dsdRate,
          isNativeDsd: this.currentTrackInfo?.isNativeDsd,
          isDoP: this.currentTrackInfo?.isDoP
        }
        this.currentIsDsd = nextInfo.isDsd
      }
      this.currentFilePath = nextPath

      // Phần nặng (ASIO re-enable, volume thiết bị, emit) KHÔNG chạy trên audio
      // thread: BASS cấm gọi device API trong callback, dễ deadlock/crash.
      // Chỉ swap handle + mốc thời gian ở đây, phần còn lại dời xuống setImmediate.
      const mode = this.currentMode
      const isNativeDsd = this.currentTrackInfo?.isNativeDsd
      const vol = this.currentVolume
      setImmediate(() => {
        // Bài đã đổi trong lúc chờ -> stream hiện tại không còn là của transition này
        if (this.streamEpoch !== epoch || !nextStream) return
        if (mode === 'asio') {
          try {
            if (this.BASS_ASIO_ChannelReset) {
              this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            }
            let en = false
            if (this.BASS_ASIO_ChannelEnableBASS) {
              en = this.BASS_ASIO_ChannelEnableBASS(false, 0, nextStream, true)
            }
            if (!en && this.BASS_ASIO_ChannelEnable) {
              if (this.BASS_ASIO_ChannelSetFormat && !isNativeDsd) {
                this.BASS_ASIO_ChannelSetFormat(false, 0, 19)
              }
              this.BASS_ASIO_ChannelEnable(false, 0, this.asioCallback, null)
              if (this.BASS_ASIO_ChannelJoin) this.BASS_ASIO_ChannelJoin(false, 1, 0)
            }
          } catch (err) {
            console.error('Error re-enabling ASIO channel on gapless transition:', err)
          }
        }

        // Defer freeing oldStream: chỉ giải phóng khi handle đó không còn là
        // stream đang phát/preload (BASS tái chế số handle, free nhầm = crash/mất tiếng).
        if (oldStream && oldStream !== this.currentStream && oldStream !== this.preloadedStream) {
          try {
            this.BASS_StreamFree(oldStream)
          } catch {}
        }

        // Áp dụng âm lượng cho stream mới
        this.setVolume(vol)

        // Thông báo cho Main process & Renderer qua callback và event mà không làm nghẽn audio thread
        if (nextPath) {
          if (this.onGaplessTransitionCallback) {
            try {
              this.onGaplessTransitionCallback(nextPath, nextInfo)
            } catch (e) {
              console.error('Error in onGaplessTransitionCallback:', e)
            }
          }
          this.emit('gapless-transition', nextPath, nextInfo)
          this.emit('track-transition', nextPath, nextInfo)
        }
        const dur = this.getDuration()
        if (dur > 0) {
          this.emit('duration', dur)
        }
      })

      return true
    } finally {
      this.isTransitioningStream = false
    }
  }

  /**
   * Cấu hình bật/tắt Gapless Playback từ phía người dùng
   */
  public setGapless(enabled: boolean): void {
    this.gaplessEnabled = !!enabled
    if (!this.gaplessEnabled && this.preloadedStream) {
      try {
        this.BASS_StreamFree(this.preloadedStream)
      } catch {}
      this.preloadedStream = 0
      this.preloadedFilePath = null
      this.preloadedInfo = null
    }
  }

  public getGapless(): boolean {
    return this.gaplessEnabled
  }

  public onGaplessTransition(cb: (nextFilePath: string, info: any) => void): void {
    this.onGaplessTransitionCallback = cb
  }

  /**
   * Nạp trước bài hát kế tiếp cho Gapless Playback với kiểm tra nghiêm ngặt Bit-Perfect
   */
  public preloadNextTrack(filePath: string, startTime?: number, endTime?: number): PreloadResult {
    if (!this.gaplessEnabled) {
      return { preloaded: false, reason: 'gapless-disabled' }
    }
    if (!this.isInitialized || !this.currentStream || !this.isPlaying) {
      return { preloaded: false, reason: 'not-ready' }
    }
    // Không đụng vào preload khi transition đang diễn ra trên audio thread
    if (this.isTransitioningStream) {
      return { preloaded: false, reason: 'transition-in-flight' }
    }
    if (!filePath) {
      return { preloaded: false, reason: 'invalid-path' }
    }

    let resolvedPath = filePath
    if (resolvedPath.startsWith('file://')) {
      try {
        const { fileURLToPath } = require('url')
        resolvedPath = fileURLToPath(resolvedPath)
      } catch {
        try {
          resolvedPath = decodeURIComponent(
            resolvedPath.replace(/^file:\/\/\/?/, '').replace(/\//g, '\\')
          )
        } catch {}
      }
    }

    const startSec =
      typeof startTime === 'number' && !isNaN(startTime) && startTime > 0 ? startTime : 0
    const endSec = typeof endTime === 'number' && !isNaN(endTime) && endTime > 0 ? endTime : 0

    // Nếu bài này đã được preload chính xác trước đó
    if (
      this.preloadedStream &&
      this.preloadedFilePath === resolvedPath &&
      (this.preloadedInfo?.startTime || 0) === startSec &&
      (this.preloadedInfo?.endTime || 0) === endSec
    ) {
      return { preloaded: true }
    }

    // Nếu đã có preloadedStream khác, giải phóng trước
    if (this.preloadedStream) {
      this.parkStreamForDeferredFree(this.preloadedStream)
      this.preloadedStream = 0
      this.preloadedFilePath = null
      this.preloadedInfo = null
    }

    const lowerNext = resolvedPath.toLowerCase()
    const nextIsDsd =
      lowerNext.endsWith('.dsf') || lowerNext.endsWith('.dff') || lowerNext.endsWith('.dsd')

    let nextChan = 0
    if (nextIsDsd && this.BASS_DSD_StreamCreateFile) {
      if (this.currentMode === 'asio' && this.currentTrackInfo?.isNativeDsd) {
        nextChan = this.BASS_DSD_StreamCreateFile(
          false,
          resolvedPath,
          0,
          0,
          BASS_DSD_RAW | BASS_STREAM_DECODE | BASS_UNICODE,
          0
        )
      } else if (this.currentMode === 'asio' && this.currentTrackInfo?.isDoP) {
        nextChan = this.BASS_DSD_StreamCreateFile(
          false,
          resolvedPath,
          0,
          0,
          BASS_DSD_DOP | BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE,
          0
        )
      } else {
        const targetRate = this.currentTrackInfo?.freq || 176400
        nextChan = this.BASS_DSD_StreamCreateFile(
          false,
          resolvedPath,
          0,
          0,
          BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE,
          targetRate
        )
      }
    } else if (lowerNext.endsWith('.bin')) {
      nextChan = this.createBinStream(resolvedPath, BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT)
    } else {
      nextChan = this.BASS_StreamCreateFile(
        false,
        resolvedPath,
        0,
        0,
        BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_UNICODE
      )
    }

    if (!nextChan) {
      const err = this.BASS_ErrorGetCode ? this.BASS_ErrorGetCode() : 0
      return { preloaded: false, reason: `decode-failed-code-${err}` }
    }

    // Lấy thông số kỹ thuật của stream kế tiếp
    const nextCi: any = {}
    this.BASS_ChannelGetInfo(nextChan, nextCi)
    let nextDsdRate = 0
    if (nextIsDsd && this.BASS_ChannelGetAttribute) {
      const rateBuf = [0]
      if (this.BASS_ChannelGetAttribute(nextChan, BASS_ATTRIB_DSD_RATE, rateBuf)) {
        nextDsdRate = Math.round(rateBuf[0]) || 0
      }
    }

    // Lấy thông số kỹ thuật hiện tại của activeStream đang phát
    const curCi: any = {}
    this.BASS_ChannelGetInfo(this.currentStream, curCi)
    let curDsdRate = 0
    if (this.currentIsDsd && this.BASS_ChannelGetAttribute) {
      const rateBuf = [0]
      if (this.BASS_ChannelGetAttribute(this.currentStream, BASS_ATTRIB_DSD_RATE, rateBuf)) {
        curDsdRate = Math.round(rateBuf[0]) || 0
      }
    }

    const curFreq = curCi.freq || this.currentTrackInfo?.freq || 0
    const curChans = curCi.chans || this.currentTrackInfo?.chans || 0
    const curOrigRes = curCi.origres ?? this.currentTrackInfo?.origres ?? 0
    const curIsDsd = this.currentIsDsd
    const curDsdR = curDsdRate || this.currentTrackInfo?.dsdRate || 0

    // KIỂM TRA NGHIÊM NGẶT BIT-PERFECT:
    // Nếu bất kỳ thông số nào khác biệt (sample rate, bit depth, channels, PCM vs DSD, DSD rate)
    // thì KHÔNG ĐƯỢC PHÉP gapless vì sẽ làm DAC bị resample hoặc click do đổi clock phần cứng!
    const matches =
      nextCi.freq === curFreq &&
      nextCi.chans === curChans &&
      nextCi.origres === curOrigRes &&
      nextIsDsd === curIsDsd &&
      nextDsdRate === curDsdR

    if (!matches) {
      console.log(
        `[Gapless Bit-Perfect] Format mismatch - Next: ${nextCi.freq}Hz/${nextCi.origres}bit/${nextCi.chans}ch (DSD: ${nextIsDsd}), Current: ${curFreq}Hz/${curOrigRes}bit/${curChans}ch (DSD: ${curIsDsd}). Non-resampling rule active: skipping gapless.`
      )
      try {
        this.BASS_StreamFree(nextChan)
      } catch {}
      return { preloaded: false, reason: 'format-mismatch-no-resample' }
    }

    // Ráp điểm bắt đầu cho CUE virtual track nếu có
    if (startSec > 0 && this.BASS_ChannelSeconds2Bytes && this.BASS_ChannelSetPosition) {
      try {
        const startBytes = this.BASS_ChannelSeconds2Bytes(nextChan, startSec)
        this.BASS_ChannelSetPosition(nextChan, startBytes, BASS_POS_BYTE)
      } catch (err) {
        console.warn('Could not seek preloaded stream to startTime:', err)
      }
    }

    this.preloadedStream = nextChan
    this.preloadedFilePath = resolvedPath
    this.preloadedInfo = {
      freq: nextCi.freq,
      chans: nextCi.chans,
      origres: nextCi.origres,
      isDsd: nextIsDsd,
      dsdRate: nextDsdRate,
      startTime: startSec,
      endTime: endSec
    }

    return { preloaded: true }
  }

  /**
   * Lấy danh sách thiết bị âm thanh khả dụng theo kiểu (ASIO hoặc WASAPI)
   */
  public getAudioDevices(preferredType: 'wasapi' | 'asio' = 'wasapi'): BassAudioDevice[] {
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
  public async init(
    audioDevice?: string,
    bitPerfect: boolean = false,
    initialVolume?: number,
    outputType: 'wasapi' | 'asio' = 'asio'
  ) {
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
    this.currentAsioDevice = -1
    this.wasapiInitKey = null
    try {
      if (this.BASS_ASIO_Stop) this.BASS_ASIO_Stop()
      if (this.BASS_ASIO_ChannelReset)
        this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
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
  public playTrack(
    urlOrPath: string,
    _crossfadeDuration: number = 0,
    startTime?: number,
    endTime?: number
  ): boolean {
    return this.playFile(
      urlOrPath,
      this.currentDeviceId,
      this.currentMode === 'wasapi',
      startTime,
      endTime
    )
  }

  /**
   * Phát file âm thanh với hỗ trợ thiết bị, chế độ độc quyền, và ranh giới CUE sheet ảo
   */
  public playFile(
    filePath: string,
    deviceId?: number | string,
    _exclusive?: boolean,
    startTime?: number,
    endTime?: number
  ): boolean {
    if (!this.ensureLoaded()) return false

    this.stop()

    if (
      deviceId !== undefined &&
      deviceId !== null &&
      deviceId !== 'auto' &&
      deviceId !== 'default'
    ) {
      this.currentDeviceId = deviceId.toString()
    }

    this.currentStartTime =
      typeof startTime === 'number' && !isNaN(startTime) && startTime > 0 ? startTime : 0
    this.currentEndTime =
      typeof endTime === 'number' && !isNaN(endTime) && endTime > 0 ? endTime : 0

    let targetPath = filePath
    if (targetPath.startsWith('file://')) {
      try {
        const { fileURLToPath } = require('url')
        targetPath = fileURLToPath(targetPath)
      } catch {
        try {
          targetPath = decodeURIComponent(
            targetPath.replace(/^file:\/\/\/?/, '').replace(/\//g, '\\')
          )
        } catch {}
      }
    }

    const lowerPath = targetPath.toLowerCase()
    const isDsd =
      lowerPath.endsWith('.dsf') || lowerPath.endsWith('.dff') || lowerPath.endsWith('.dsd')

    if (this.currentMode === 'asio' && this.asioLib) {
      return this.playAsio(targetPath, isDsd, this.currentStartTime, this.currentEndTime)
    } else {
      return this.playWasapi(targetPath, isDsd, this.currentStartTime, this.currentEndTime)
    }
  }

  /**
   * Tạo header RIFF WAV giả lập 44-byte cho CD-DA raw PCM 16-bit 44.1kHz Stereo
   */
  private createWavHeader(
    dataSize: number,
    sampleRate: number = 44100,
    numChannels: number = 2,
    bitsPerSample: number = 16
  ): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)
    const buf = Buffer.alloc(44)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(Math.min(0xffffffff, dataSize + 36), 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(numChannels, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(byteRate, 28)
    buf.writeUInt16LE(blockAlign, 32)
    buf.writeUInt16LE(bitsPerSample, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(Math.min(0xffffffff, dataSize), 40)
    return buf
  }

  /**
   * Tạo stream giải mã BASS cho tệp ảnh đĩa CD-DA raw PCM (.bin) qua BASS_StreamCreateFileUser
   */
  private createBinStream(filePath: string, flags: number): number {
    if (!this.BASS_StreamCreateFileUser || !this.binFileProcs) return 0
    // Theo dõi fd bên ngoài try để nhánh catch luôn đóng được khi fs.openSync đã thành công
    // (ví dụ createWavHeader/BASS_StreamCreateFileUser throw), tránh rò rỉ file descriptor.
    let fd: number = -1
    let id: number = 0
    try {
      const stat = fs.statSync(filePath)
      fd = fs.openSync(filePath, 'r')
      const header = this.createWavHeader(stat.size, 44100, 2, 16)
      id = this.nextBinContextId++
      const ctx = {
        fd,
        curPos: 0,
        header,
        fileSize: stat.size,
        totalLen: stat.size + 44
      }
      this.binContexts.set(id, ctx)

      const chan = this.BASS_StreamCreateFileUser(0, flags, this.binFileProcs, id)
      if (!chan) {
        // Nếu BASS đã tự gọi FILECLOSEPROC, closeCb đã đóng fd và xóa ctx.
        // Chỉ dọn dẹp khi ctx vẫn còn để tránh đóng nhầm fd số đã bị tái sử dụng.
        const stale = this.binContexts.get(id)
        if (stale) {
          try {
            fs.closeSync(stale.fd)
          } catch {}
          this.binContexts.delete(id)
        }
        id = 0
        fd = -1
        return 0
      }
      // Stream tạo thành công: quyền sở hữu fd chuyển cho BASS, sẽ được đóng qua FILECLOSEPROC
      id = 0
      fd = -1
      return chan
    } catch (e) {
      console.error('Failed to create BIN stream:', e)
      // Dọn dẹp mọi tài nguyên đã cấp phát trước khi exception xảy ra (chỉ khi ctx còn tồn tại)
      if (id !== 0) {
        const stale = this.binContexts.get(id)
        if (stale) {
          try {
            fs.closeSync(stale.fd)
          } catch {}
          this.binContexts.delete(id)
        }
        id = 0
      }
      if (fd >= 0) {
        try {
          fs.closeSync(fd)
        } catch {}
        fd = -1
      }
      return 0
    }
  }

  private cleanupAllBinContexts(): void {
    for (const ctx of this.binContexts.values()) {
      try {
        fs.closeSync(ctx.fd)
      } catch {}
    }
    this.binContexts.clear()
  }

  /**
   * Xử lý phát qua ASIO (bao gồm DSD Native, DoP, và PCM Bit-Perfect)
   */
  private playAsio(
    filePath: string,
    isDsd: boolean,
    startTime: number = 0,
    endTime: number = 0
  ): boolean {
    try {
      let devIndex = 0
      const asioDevs = this.getAudioDevices('asio')
      if (asioDevs.length === 0) {
        console.warn('No ASIO devices found, falling back to WASAPI...')
        return this.playWasapi(filePath, isDsd, startTime, endTime)
      }
      if (
        this.currentDeviceId &&
        this.currentDeviceId !== 'auto' &&
        this.currentDeviceId !== 'default'
      ) {
        const found = asioDevs.find((d) => d.id === this.currentDeviceId)
        if (found) {
          devIndex = parseInt(found.id, 10)
        }
      }

      // Init ASIO device only if not already initialized on this device
      if (this.BASS_ASIO_Init) {
        if (this.currentAsioDevice !== devIndex) {
          try {
            if (this.BASS_ASIO_Free) this.BASS_ASIO_Free()
          } catch {}
          const ok = this.BASS_ASIO_Init(devIndex, BASS_ASIO_THREAD)
          if (!ok) {
            const errCode = this.BASS_ASIO_ErrorGetCode ? this.BASS_ASIO_ErrorGetCode() : 0
            console.warn(
              `ASIO Init failed (device ${devIndex}, code ${errCode}). Falling back to WASAPI...`
            )
            return this.playWasapi(filePath, isDsd, startTime, endTime)
          }
          this.currentAsioDevice = devIndex
        }
      }

      let chan = 0
      let outSampleRate = 44100
      let outFormat = 'PCM'
      let isNativeDsd = false
      let isDoP = false
      let dsdRate = 0

      if (isDsd && this.BASS_DSD_StreamCreateFile) {
        // 1. Thử DSD Native (BASS_DSD_RAW qua ASIOPROC callback)
        chan = this.BASS_DSD_StreamCreateFile(
          false,
          filePath,
          0,
          0,
          BASS_DSD_RAW | BASS_STREAM_DECODE | BASS_UNICODE,
          0
        )
        dsdRate = 2822400

        if (chan) {
          const rateBuf = [0]
          if (this.BASS_ChannelGetAttribute(chan, BASS_ATTRIB_DSD_RATE, rateBuf)) {
            dsdRate = Math.round(rateBuf[0]) || 2822400
          }

          // Kiểm tra xem driver ASIO có hỗ trợ DSD mode không
          const dsdSupported = this.BASS_ASIO_SetDSD ? this.BASS_ASIO_SetDSD(true) : false

          if (dsdSupported) {
            this.BASS_ASIO_SetRate(dsdRate)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            this.activeAsioStream = chan
            let en0 = false
            if (this.BASS_ASIO_ChannelEnableBASS) {
              en0 = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
            }
            if (!en0 && this.BASS_ASIO_ChannelEnable) {
              en0 = this.BASS_ASIO_ChannelEnable(false, 0, this.asioDsdCallback, null)
              if (this.BASS_ASIO_ChannelJoin) this.BASS_ASIO_ChannelJoin(false, 1, 0)
            }
            if (en0) {
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
          chan = this.BASS_DSD_StreamCreateFile(
            false,
            filePath,
            0,
            0,
            BASS_DSD_DOP | BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE,
            0
          )
          if (chan) {
            const ci: any = {}
            this.BASS_ChannelGetInfo(chan, ci)
            this.BASS_ASIO_SetDSD(false)
            this.BASS_ASIO_SetRate(ci.freq)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            this.activeAsioStream = chan
            let en0 = false
            if (this.BASS_ASIO_ChannelEnableBASS) {
              en0 = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
            }
            if (!en0 && this.BASS_ASIO_ChannelEnable) {
              if (this.BASS_ASIO_ChannelSetFormat) {
                this.BASS_ASIO_ChannelSetFormat(false, 0, 19) // BASS_ASIO_FORMAT_FLOAT
              }
              en0 = this.BASS_ASIO_ChannelEnable(false, 0, this.asioCallback, null)
              if (ci.chans > 1 && this.BASS_ASIO_ChannelJoin)
                this.BASS_ASIO_ChannelJoin(false, 1, 0)
            }
            outSampleRate = ci.freq
            outFormat = 'DSD (DoP)'
            isDoP = true
          }
        }

        // 3. Nếu cả Native DSD và DoP đều không được, chuyển đổi DSD sang PCM chất lượng cao (176.4kHz)
        if (!chan) {
          chan = this.BASS_DSD_StreamCreateFile(
            false,
            filePath,
            0,
            0,
            BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE,
            176400
          )
          if (chan) {
            const ci: any = {}
            this.BASS_ChannelGetInfo(chan, ci)
            this.BASS_ASIO_SetDSD(false)
            this.BASS_ASIO_SetRate(176400)
            this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
            this.activeAsioStream = chan
            let en0 = false
            if (this.BASS_ASIO_ChannelEnableBASS) {
              en0 = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
            }
            if (!en0 && this.BASS_ASIO_ChannelEnable) {
              if (this.BASS_ASIO_ChannelSetFormat) {
                this.BASS_ASIO_ChannelSetFormat(false, 0, 19) // BASS_ASIO_FORMAT_FLOAT
              }
              en0 = this.BASS_ASIO_ChannelEnable(false, 0, this.asioCallback, null)
              if (ci.chans > 1 && this.BASS_ASIO_ChannelJoin)
                this.BASS_ASIO_ChannelJoin(false, 1, 0)
            }
            outSampleRate = 176400
            outFormat = 'DSD-to-PCM (176.4kHz)'
          }
        }
      } else {
        // PCM (FLAC, WAV, MP3, OPUS, ALAC, BIN, etc.)
        if (filePath.toLowerCase().endsWith('.bin')) {
          chan = this.createBinStream(filePath, BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT)
        } else {
          chan = this.BASS_StreamCreateFile(
            false,
            filePath,
            0,
            0,
            BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_UNICODE
          )
        }
        if (chan) {
          const ci: any = {}
          this.BASS_ChannelGetInfo(chan, ci)
          this.BASS_ASIO_SetDSD(false)
          this.BASS_ASIO_SetRate(ci.freq)
          this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
          this.activeAsioStream = chan
          let en0 = false
          if (this.BASS_ASIO_ChannelEnableBASS) {
            en0 = this.BASS_ASIO_ChannelEnableBASS(false, 0, chan, true)
          }
          if (!en0 && this.BASS_ASIO_ChannelEnable) {
            if (this.BASS_ASIO_ChannelSetFormat) {
              this.BASS_ASIO_ChannelSetFormat(false, 0, 19) // BASS_ASIO_FORMAT_FLOAT
            }
            en0 = this.BASS_ASIO_ChannelEnable(false, 0, this.asioCallback, null)
            if (ci.chans > 1 && this.BASS_ASIO_ChannelJoin) this.BASS_ASIO_ChannelJoin(false, 1, 0)
          }
          if (ci.chans === 1 && this.BASS_ASIO_ChannelEnableMirror) {
            this.BASS_ASIO_ChannelEnableMirror(1, false, 0)
          }
          outSampleRate = ci.freq
          outFormat = `PCM Bit-Perfect (${ci.origres ? `${ci.origres}-bit` : 'Float'})`
        }
      }

      if (!chan) {
        console.warn('ASIO could not decode file, falling back to WASAPI...')
        return this.playWasapi(filePath, isDsd, startTime, endTime)
      }

      // Ráp vị trí bắt đầu cho CUE sheet ảo trước khi xuất ra DAC
      if (startTime > 0 && this.BASS_ChannelSeconds2Bytes && this.BASS_ChannelSetPosition) {
        const startBytes = this.BASS_ChannelSeconds2Bytes(chan, startTime)
        this.BASS_ChannelSetPosition(chan, startBytes, BASS_POS_BYTE)
      }

      // Tính toán byte kết thúc cho CUE sheet ảo
      if (endTime > 0 && this.BASS_ChannelSeconds2Bytes) {
        this.currentEndByte = this.BASS_ChannelSeconds2Bytes(chan, endTime)
      } else {
        this.currentEndByte = 0
      }

      const ci: any = {}
      this.BASS_ChannelGetInfo(chan, ci)
      this.currentStream = chan
      this.currentIsDsd = isDsd || isNativeDsd
      this.currentFilePath = filePath
      this.currentTrackInfo = {
        freq: outSampleRate,
        chans: ci.chans || 2,
        origres: ci.origres || 0,
        isDsd: this.currentIsDsd,
        dsdRate,
        isNativeDsd,
        isDoP
      }

      this.setVolume(this.currentVolume)

      // Bắt đầu phát ASIO
      const started = this.BASS_ASIO_Start(0, 0)
      if (!started) {
        const err = this.BASS_ASIO_ErrorGetCode ? this.BASS_ASIO_ErrorGetCode() : 0
        console.warn(`BASS_ASIO_Start failed (code ${err}), falling back to WASAPI...`)
        this.stop()
        return this.playWasapi(filePath, isDsd, startTime, endTime)
      }

      this.isPlaying = true
      this.isPaused = false

      // Gửi thông số phần cứng audio ra giao diện
      this.emit('audio-out-params', {
        samplerate: outSampleRate,
        format: outFormat,
        channels: `${ci.chans || 2} ch`,
        mode: 'ASIO',
        isDsd: isDsd || isNativeDsd
      })

      this.startProgressTimer()
      return true
    } catch (e: any) {
      this.emit('error', `ASIO Playback Error: ${e.message}`)
      return false
    }
  }

  /**
   * Xử lý phát qua WASAPI Exclusive (Bit-Perfect PCM)
   */
  private playWasapi(
    filePath: string,
    isDsd: boolean,
    startTime: number = 0,
    endTime: number = 0
  ): boolean {
    try {
      let chan = 0
      let outSampleRate = 44100

      if (isDsd && this.BASS_DSD_StreamCreateFile) {
        chan = this.BASS_DSD_StreamCreateFile(
          false,
          filePath,
          0,
          0,
          BASS_SAMPLE_FLOAT | BASS_STREAM_DECODE | BASS_UNICODE,
          176400
        )
        outSampleRate = 176400
      } else {
        if (filePath.toLowerCase().endsWith('.bin')) {
          chan = this.createBinStream(filePath, BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT)
        } else {
          chan = this.BASS_StreamCreateFile(
            false,
            filePath,
            0,
            0,
            BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_UNICODE
          )
        }
        if (chan) {
          const ci: any = {}
          this.BASS_ChannelGetInfo(chan, ci)
          outSampleRate = ci.freq
        }
      }

      if (!chan) {
        const err = this.BASS_ErrorGetCode ? this.BASS_ErrorGetCode() : 0
        this.emit('error', `Cannot decode audio file (code ${err})`)
        return false
      }

      // Ráp vị trí bắt đầu cho CUE sheet ảo trước khi xuất ra DAC
      if (startTime > 0 && this.BASS_ChannelSeconds2Bytes && this.BASS_ChannelSetPosition) {
        const startBytes = this.BASS_ChannelSeconds2Bytes(chan, startTime)
        this.BASS_ChannelSetPosition(chan, startBytes, BASS_POS_BYTE)
      }

      // Tính toán byte kết thúc cho CUE sheet ảo
      if (endTime > 0 && this.BASS_ChannelSeconds2Bytes) {
        this.currentEndByte = this.BASS_ChannelSeconds2Bytes(chan, endTime)
      } else {
        this.currentEndByte = 0
      }

      const ci: any = {}
      this.BASS_ChannelGetInfo(chan, ci)
      const chans = ci.chans || 2
      const streamFreq = ci.freq || outSampleRate

      this.activeWasapiStream = chan
      this.currentStream = chan
      this.currentIsDsd = isDsd
      this.currentFilePath = filePath
      this.currentTrackInfo = {
        freq: streamFreq,
        chans,
        origres: ci.origres || 0,
        isDsd,
        dsdRate: 0,
        isNativeDsd: false,
        isDoP: false
      }

      let devIndex = -1
      // Liệt kê TRƯỚC khi Free: Free có thể làm enumerator của BASS trả về
      // rỗng thoáng qua trên USB DAC khi churn exclusive nhanh -> dialog sai.
      const devs = this.getWasapiDevicesResilient()
      if (devs.length === 0) {
        if (chan) {
          try {
            this.BASS_StreamFree(chan)
          } catch {}
          this.activeWasapiStream = 0
          this.currentStream = 0
        }
        this.isPlaying = false
        this.emit(
          'error',
          'Không tìm thấy thiết bị xuất âm thanh khả dụng (DAC/Loa/Tai nghe chưa được kết nối hoặc đã bị ngắt).'
        )
        return false
      }

      if (
        this.currentDeviceId &&
        this.currentDeviceId !== 'auto' &&
        this.currentDeviceId !== 'default'
      ) {
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

      // Tái dùng thiết bị đang init nếu cùng device + format + exclusive:
      // bỏ qua Free/Init mỗi bài -> hết churn làm DAC rớt/USB reset khi chuyển nhanh.
      const desiredKey = `${devIndex}|${streamFreq}|${chans}|ex`
      if (this.wasapiInitKey === desiredKey) {
        let devAlive = true
        if (this.BASS_WASAPI_GetDeviceInfo) {
          const probe: any = {}
          try {
            devAlive = !!this.BASS_WASAPI_GetDeviceInfo(devIndex, probe)
          } catch {
            devAlive = false
          }
        }
        if (devAlive) {
          this.setVolume(this.currentVolume)
          if (this.BASS_WASAPI_Start) this.BASS_WASAPI_Start()
          this.isPlaying = true
          this.isPaused = false
          this.emit('audio-out-params', {
            samplerate: streamFreq,
            format: isDsd ? 'DSD-to-PCM (176.4kHz)' : 'WASAPI Exclusive',
            channels: `${chans} ch`,
            mode: 'WASAPI',
            isDsd: isDsd
          })
          this.startProgressTimer()
          return true
        }
        this.wasapiInitKey = null
      }

      if (this.BASS_WASAPI_Free) this.BASS_WASAPI_Free()

      // Thử Exclusive mode trước (0.4s buffer, 0.05s period, KHÔNG AUTOFORMAT để đảm bảo Bit-Perfect)
      let ok = this.BASS_WASAPI_Init(
        devIndex,
        streamFreq,
        chans,
        BASS_WASAPI_EXCLUSIVE | BASS_WASAPI_BUFFER,
        0.4,
        0.05,
        this.wasapiProcPtr || this.wasapiCallback,
        null
      )
      let isExclusive = true

      // Nếu thiết bị đang bận hoặc không hỗ trợ Exclusive, fallback sang Shared
      if (!ok) {
        console.warn('WASAPI Exclusive failed, falling back to Shared mode...')
        ok = this.BASS_WASAPI_Init(
          devIndex,
          0,
          0,
          BASS_WASAPI_BUFFER | BASS_WASAPI_AUTOFORMAT,
          0.4,
          0.05,
          this.wasapiProcPtr || this.wasapiCallback,
          null
        )
        isExclusive = false
      }

      if (!ok) {
        if (chan) {
          try {
            this.BASS_StreamFree(chan)
          } catch {}
          this.activeWasapiStream = 0
          this.currentStream = 0
        }
        this.isPlaying = false
        this.wasapiInitKey = null
        const err = this.BASS_ErrorGetCode ? this.BASS_ErrorGetCode() : 0
        this.emit('error', this.formatBassErrorMessage(err, 'wasapi'))
        return false
      }
      this.wasapiInitKey = `${devIndex}|${streamFreq}|${chans}|${isExclusive ? 'ex' : 'sh'}`

      // Kiểm tra tần số thực tế của WASAPI device
      let activeFreq = streamFreq
      if (this.BASS_WASAPI_GetInfo) {
        const wi: any = {}
        if (this.BASS_WASAPI_GetInfo(wi) && wi.freq) {
          activeFreq = wi.freq
          if (isExclusive) {
            if (wi.freq !== streamFreq || (wi.chans && wi.chans !== chans)) {
              console.warn(
                `WASAPI Exclusive hardware format mismatch: device is ${wi.freq}Hz ${wi.chans || chans}ch, stream is ${streamFreq}Hz ${chans}ch. Strict Bit-Perfect prevents software tampering!`
              )
            }
          } else {
            // Chế độ Shared: cho phép resample để khớp với mixer của Windows
            if (wi.freq !== streamFreq || (wi.chans && wi.chans !== chans)) {
              console.log(
                `WASAPI Shared rate mismatch: mixer is ${wi.freq}Hz, stream is ${streamFreq}Hz. Resampling for Shared mode.`
              )
              this.createResamplerMixer(chan, wi.freq, wi.chans || chans)
            }
          }
        }
      }

      this.setVolume(this.currentVolume)
      this.BASS_WASAPI_Start()

      this.isPlaying = true
      this.isPaused = false

      this.emit('audio-out-params', {
        samplerate: activeFreq,
        format: isDsd
          ? 'DSD-to-PCM (176.4kHz)'
          : isExclusive
            ? 'WASAPI Exclusive'
            : 'WASAPI Shared',
        channels: `${chans} ch`,
        mode: 'WASAPI',
        isDsd: isDsd
      })

      this.startProgressTimer()
      return true
    } catch (e: any) {
      this.isPlaying = false
      this.emit('error', `WASAPI Playback Error: ${e.message}`)
      return false
    }
  }

  public createResamplerMixer(stream: number, freq: number, _chans?: number): number {
    if (this.BASS_ChannelSetAttribute && stream && freq) {
      try {
        this.BASS_ChannelSetAttribute(stream, BASS_ATTRIB_FREQ, freq)
      } catch (e) {
        console.warn('Failed to set resampler frequency on stream:', e)
      }
    }
    return stream
  }

  private formatBassErrorMessage(code: number, mode: 'wasapi' | 'asio'): string {
    switch (code) {
      case 23: // BASS_ERROR_DEVICE
        return 'Thiết bị âm thanh không hợp lệ hoặc đã bị ngắt kết nối. Vui lòng kiểm tra DAC/Loa/Tai nghe (BASS_ERROR_DEVICE: 23).'
      case 3: // BASS_ERROR_DRIVER
        return 'Driver âm thanh không khả dụng. Vui lòng kiểm tra cáp cắm hoặc bật nguồn thiết bị DAC (BASS_ERROR_DRIVER: 3).'
      case 5003: // BASS_ERROR_WASAPI_DENIED
        return 'Không thể chiếm quyền độc quyền thiết bị âm thanh. Thiết bị đang được ứng dụng khác sử dụng (BASS_ERROR_WASAPI_DENIED: 5003).'
      case 6: // BASS_ERROR_FORMAT
        return 'Thiết bị không hỗ trợ định dạng/tần số lấy mẫu này (BASS_ERROR_FORMAT: 6).'
      case 5000: // BASS_ERROR_WASAPI
        return 'WASAPI không khả dụng trên hệ thống (BASS_ERROR_WASAPI: 5000).'
      case 8: // BASS_ERROR_INIT
        return 'Hệ thống âm thanh chưa được khởi tạo (BASS_ERROR_INIT: 8).'
      default:
        return `${mode === 'wasapi' ? 'BASS_WASAPI_Init' : 'BASS_ASIO_Init'} failed (code ${code})`
    }
  }

  private getRawPosition(): number {
    if (!this.currentStream || !this.BASS_ChannelGetPosition || !this.BASS_ChannelBytes2Seconds)
      return 0
    try {
      const pos = this.BASS_ChannelGetPosition(this.currentStream, BASS_POS_BYTE)
      return Math.max(0, this.BASS_ChannelBytes2Seconds(this.currentStream, pos))
    } catch {
      return 0
    }
  }

  private getRawDuration(): number {
    if (!this.currentStream || !this.BASS_ChannelGetLength || !this.BASS_ChannelBytes2Seconds)
      return 0
    try {
      const len = this.BASS_ChannelGetLength(this.currentStream, BASS_POS_BYTE)
      return len > 0 ? this.BASS_ChannelBytes2Seconds(this.currentStream, len) : 0
    } catch {
      return 0
    }
  }

  public getPosition(): number {
    const raw = this.getRawPosition()
    if (this.currentStartTime > 0) {
      return Math.max(0, raw - this.currentStartTime)
    }
    return raw
  }

  public getDuration(): number {
    if (this.currentEndTime > 0 && this.currentEndTime > this.currentStartTime) {
      return this.currentEndTime - this.currentStartTime
    }
    const rawDur = this.getRawDuration()
    if (this.currentStartTime > 0) {
      return Math.max(0, rawDur - this.currentStartTime)
    }
    return rawDur
  }

  public getActiveWasapiStream(): number {
    return this.activeWasapiStream
  }

  public getActiveAsioStream(): number {
    return this.activeAsioStream
  }

  public getCurrentFilePath(): string | null {
    return this.currentFilePath
  }

  /**
   * Vòng lặp cập nhật tiến trình phát nhạc (time, duration, ended)
   */
  private startProgressTimer() {
    this.stopProgressTimer()

    const totalDuration = this.getDuration()
    if (totalDuration > 0) {
      this.emit('duration', totalDuration)
    }

    this.progressTimer = setInterval(() => {
      if (!this.isPlaying || !this.currentStream) return

      try {
        const rawPos = this.getRawPosition()
        const curSec = this.getPosition()
        this.emit('time', curSec)

        // Kiểm tra giới hạn CUE sheet ảo (currentEndTime)
        if (this.currentEndTime > 0 && rawPos >= this.currentEndTime) {
          if (this.gaplessEnabled && this.preloadedStream) {
            this.transitionToPreloadedStream()
          } else {
            this.emit('ended')
            this.stop()
          }
          return
        }

        // Kiểm tra kết thúc bài vật lý
        const isActive = this.BASS_ChannelIsActive
          ? this.BASS_ChannelIsActive(this.currentStream)
          : 1
        const rawDur = this.getRawDuration()
        const endCondition = this.currentEndTime > 0 ? this.currentEndTime : rawDur
        if (
          isActive === BASS_ACTIVE_STOPPED ||
          (endCondition > 0 && rawPos >= endCondition - 0.1)
        ) {
          if (this.gaplessEnabled && this.preloadedStream) {
            this.transitionToPreloadedStream()
          } else {
            this.emit('ended')
            this.stop()
          }
        }
      } catch {}
    }, 200)
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
    // Vô hiệu hóa mọi transition/deferred-free đang treo của bài cũ
    this.streamEpoch++
    // Xả batch đã park từ lần stop() trước (đủ cũ, audio thread không còn chạm tới)
    this.flushParkedStreams()

    if (this.preloadedStream) {
      this.parkStreamForDeferredFree(this.preloadedStream)
      this.preloadedStream = 0
      this.preloadedFilePath = null
      this.preloadedInfo = null
    }

    if (this.preloadedStream) {
      this.parkStreamForDeferredFree(this.preloadedStream)
      this.preloadedStream = 0
      this.preloadedFilePath = null
      this.preloadedInfo = null
    }

    this.currentStartTime = 0
    this.currentEndTime = 0
    this.currentEndByte = 0
    this.currentTrackInfo = null

    if (this.currentMode === 'asio') {
      try {
        if (this.BASS_ASIO_Stop) this.BASS_ASIO_Stop()
        if (this.BASS_ASIO_ChannelReset)
          this.BASS_ASIO_ChannelReset(false, -1, BASS_ASIO_RESET_ENABLE | BASS_ASIO_RESET_JOIN)
      } catch {}
    } else {
      try {
        if (this.BASS_WASAPI_Stop) this.BASS_WASAPI_Stop(true)
      } catch {}
    }

    if (this.currentStream) {
      this.parkStreamForDeferredFree(this.currentStream)
      this.currentStream = 0
    }
    this.activeWasapiStream = 0
    this.activeAsioStream = 0
  }

  public seek(posSeconds: number, _mode: 'relative' | 'absolute' = 'absolute') {
    if (!this.activeStream || !this.BASS_ChannelSeconds2Bytes || !this.BASS_ChannelSetPosition)
      return
    try {
      const baseSec = _mode === 'relative' ? this.getPosition() + posSeconds : posSeconds
      const clampedRel = Math.max(0, baseSec)
      let targetSec = this.currentStartTime + clampedRel
      if (this.currentEndTime > 0 && targetSec > this.currentEndTime) {
        targetSec = this.currentEndTime
      }
      const bytes = this.BASS_ChannelSeconds2Bytes(this.activeStream, targetSec)
      this.BASS_ChannelSetPosition(this.activeStream, bytes, BASS_POS_BYTE)
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
        this.BASS_WASAPI_SetVolume(BASS_WASAPI_CURVE_LINEAR, safeVol)
      } catch {}
    }
  }

  public setEqualizer(_bands: any[], _preamp: number = 0) {
    // Trong chế độ Bit-Perfect / ASIO / DSD Native, EQ được bypass nguyên bản
  }

  public killSync() {
    this.stop()
    this.cleanupAllBinContexts()
    this.releaseDevices()
    if (this.BASS_Free) {
      try {
        this.BASS_Free()
      } catch {}
    }
    this.isInitialized = false
  }
}
