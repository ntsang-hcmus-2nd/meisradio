const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// Replace the buggy mock with a proper EventEmitter mock
const newMock = `
    // Mock HTMLAudioElement for MPV
    audioRef.current = {
      play: async () => { window.api.mpvResume() },
      pause: () => { window.api.mpvPause() },
      get currentTime() { return this._currentTime || 0 },
      set currentTime(val) { window.api.mpvSeek(val); this._currentTime = val },
      get volume() { return this._volume || 1 },
      set volume(val) { window.api.mpvSetVolume(val); this._volume = val },
      get duration() { return this._duration || 0 },
      _listeners: {},
      addEventListener: function(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
      },
      removeEventListener: function(event, cb) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(l => l !== cb);
      },
      dispatchEvent: function(event) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(cb => cb());
      },
      _currentTime: 0,
      _duration: 0,
      _volume: 1,
      src: ''
    } as any;
`
content = content.replace(/\/\/ Mock HTMLAudioElement for MPV[\s\S]*?\} as any;/g, newMock.trim())

// Replace the buggy listeners that call undefined setProgress
const newListeners = `
  // MPV Listeners
  useEffect(() => {
    window.api.onMpvTime((val) => {
      if (audioRef.current) {
        (audioRef.current as any)._currentTime = val;
        if (typeof (audioRef.current as any).dispatchEvent === 'function') {
          (audioRef.current as any).dispatchEvent('timeupdate');
        }
      }
    });
    window.api.onMpvDuration((val) => {
      if (audioRef.current) {
        (audioRef.current as any)._duration = val;
        if (typeof (audioRef.current as any).dispatchEvent === 'function') {
          (audioRef.current as any).dispatchEvent('durationchange');
          (audioRef.current as any).dispatchEvent('loadedmetadata');
        }
      }
    });
    window.api.onMpvPaused((val) => {
      setIsPlaying(!val)
      if (audioRef.current && typeof (audioRef.current as any).dispatchEvent === 'function') {
        (audioRef.current as any).dispatchEvent(val ? 'pause' : 'play');
      }
    });
    window.api.onMpvEnded(() => handleNext());
  }, []);
`
content = content.replace(/\/\/ MPV Listeners[\s\S]*?\}, \[\]\);/g, newListeners.trim())

fs.writeFileSync(appTsxPath, content, 'utf-8')
console.log('App.tsx progress bar and events fixed.')
