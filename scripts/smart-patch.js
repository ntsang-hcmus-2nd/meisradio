const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// 1. Remove ref={audioRef} from <audio> so React doesn't overwrite our mock
content = content.replace(/ref=\{audioRef\}/g, '/* ref removed for MPV */')

// 2. Mock audioRef and set up MPV listeners
const mpvMock = `
  useEffect(() => {
    // Mock HTMLAudioElement for MPV
    audioRef.current = {
      play: async () => { window.api.mpvResume() },
      pause: () => { window.api.mpvPause() },
      get currentTime() { return this._currentTime || 0 },
      set currentTime(val) { window.api.mpvSeek(val); this._currentTime = val },
      get volume() { return this._volume || 1 },
      set volume(val) { window.api.mpvSetVolume(val); this._volume = val },
      get duration() { return this._duration || 0 },
      _currentTime: 0,
      _duration: 0,
      _volume: 1,
      src: ''
    } as any;

    window.api.onMpvTime((val) => {
      if (audioRef.current) (audioRef.current as any)._currentTime = val;
      setProgress(val);
    });
    window.api.onMpvDuration((val) => {
      if (audioRef.current) (audioRef.current as any)._duration = val;
      setDuration(val);
    });
    window.api.onMpvPaused((val) => setIsPlaying(!val));
    window.api.onMpvEnded(() => handleNext());
  }, []);

  // Watch currentTrack
  useEffect(() => {
    if (currentTrack && currentTrack.filePath) {
      window.api.mpvPlay(currentTrack.filePath, crossfadeEnabled ? crossfadeDuration : 0)
    }
  }, [currentTrack]);

  // Watch EQ
  useEffect(() => {
    if (isEqEnabled) {
      window.api.mpvSetEqualizer(eqBands.map(b => b.gain))
    } else {
      window.api.mpvSetEqualizer([0,0,0,0,0,0,0,0,0,0])
    }
  }, [eqBands, isEqEnabled]);
`

if (!content.includes('Mock HTMLAudioElement for MPV')) {
  content = content.replace(/const audioRef = useRef<HTMLAudioElement>\(null\)/, `const audioRef = useRef<HTMLAudioElement>(null)\n${mpvMock}`)
}

fs.writeFileSync(appTsxPath, content, 'utf-8')
console.log('App.tsx smart patched.')
