const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// 1. Remove the `<audio>` tag entirely
content = content.replace(/<audio\s+key=\{currentSampleRate\}[^>]+>\s*<\/audio>|<audio[\s\S]*?<\/audio>/g, '{/* Audio tag removed for MPV integration */}')

// 2. Replace play/pause
content = content.replace(/audioRef\.current\.play\(\)/g, 'window.api.mpvResume()')
content = content.replace(/audioRef\.current\.pause\(\)/g, 'window.api.mpvPause()')

// 3. Replace volume sets
content = content.replace(/audioRef\.current\.volume\s*=\s*(.+?)(;|\n)/g, 'window.api.mpvSetVolume($1)$2')

// 4. Replace currentTime sets
content = content.replace(/audioRef\.current\.currentTime\s*=\s*(.+?)(;|\n)/g, 'window.api.mpvSeek($1)$2')

// 5. Replace currentTrack play logic (usually inside useEffect when track changes)
// For simplicity, we just inject MPV event listeners inside a global useEffect.
const mpvListeners = `
  useEffect(() => {
    window.api.onMpvTime((val) => setProgress(val))
    window.api.onMpvDuration((val) => setDuration(val))
    window.api.onMpvPaused((val) => setIsPlaying(!val))
    window.api.onMpvEnded(() => handleNext())
  }, [])
`
if (!content.includes('window.api.onMpvTime')) {
  // Inject right after audioRef definition
  content = content.replace(/const audioRef = useRef<HTMLAudioElement>\(null\)/, `const audioRef = useRef<HTMLAudioElement>(null)\n${mpvListeners}`)
}

// 6. AudioContext replacements
content = content.replace(/try \{ audioCtxRef\.current = new AudioContextClass[^}]+\}/g, '/* AudioContext disabled for MPV */')

// 7. Equalizer changes
content = content.replace(/eqBands\.forEach\(\(band, index\) => \{[^}]+}\)/g, 'window.api.mpvSetEqualizer(eqBands)')

fs.writeFileSync(appTsxPath, content, 'utf-8')
console.log('App.tsx updated for MPV.')
