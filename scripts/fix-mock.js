const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// 1. Wrap the mock initialization in if (!audioRef.current)
const newMock = `
if (!audioRef.current) {
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
}
`

content = content.replace(/\/\/ Mock HTMLAudioElement for MPV[\s\S]*?\} as any;/g, newMock.trim())

// 2. Disable visualizer button if bitPerfect is enabled
// Find the button and add disabled={bitPerfectEnabled} and title adjustment
content = content.replace(/<button onClick=\{\(\) => setShowVisualizer\(!showVisualizer\)\}/g, 
  '<button disabled={bitPerfectEnabled} onClick={() => setShowVisualizer(!showVisualizer)}')
content = content.replace(/title="Bật\/tắt hiệu ứng sóng âm"/g, 
  'title={bitPerfectEnabled ? "Visualizer không khả dụng ở chế độ Bit-perfect (WASAPI)" : "Bật/tắt hiệu ứng sóng âm"}')

// 3. Ensure Visualizer stops running if bitPerfect is toggled on while playing
// Find setShowVisualizer(cfg.showVisualizer)
content = content.replace(/setShowVisualizer\(cfg\.showVisualizer\)/g, 
  'if (!cfg.bitPerfectEnabled) setShowVisualizer(cfg.showVisualizer)')

fs.writeFileSync(appTsxPath, content, 'utf-8')
console.log('App.tsx mock fixed and visualizer patched.')
