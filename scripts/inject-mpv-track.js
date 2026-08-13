const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// Add a hook to watch currentTrack and call mpvPlay
const trackHook = `
  useEffect(() => {
    if (currentTrack && currentTrack.filePath) {
      window.api.mpvPlay(currentTrack.filePath, crossfadeEnabled ? crossfadeDuration : 0)
    }
  }, [currentTrack])
`

if (!content.includes('window.api.mpvPlay(')) {
  // Inject right before the previously injected mpvListeners
  content = content.replace(/useEffect\(\(\) => \{\s*window\.api\.onMpvTime/g, trackHook.trim() + '\n\n  useEffect(() => {\n    window.api.onMpvTime')
  fs.writeFileSync(appTsxPath, content, 'utf-8')
  console.log('App.tsx patched with currentTrack hook.')
} else {
  console.log('App.tsx already has mpvPlay hook.')
}
