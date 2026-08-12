const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// Fix bit-perfect default state
content = content.replace(/const \[bitPerfectEnabled, setBitPerfectEnabled\] = useState\(true\)/g, 
  'const [bitPerfectEnabled, setBitPerfectEnabled] = useState(false)')

// Fix stale closure for handleNext and crossfade logic
content = content.replace(/window\.api\.onMpvEnded\(\(\) => handleNext\(\)\);\s*\}, \[\]\);/g, 
  'window.api.onMpvEnded(() => { if (!crossfadeEnabled) handleNext() }); }, [handleNext, crossfadeEnabled]);')

fs.writeFileSync(appTsxPath, content, 'utf-8')

const mainIndexPath = path.join(__dirname, '..', 'src', 'main', 'index.ts')
let mainContent = fs.readFileSync(mainIndexPath, 'utf-8')
mainContent = mainContent.replace(/currentConfig\.bitPerfectEnabled \?\? true/g, 'currentConfig.bitPerfectEnabled ?? false')
fs.writeFileSync(mainIndexPath, mainContent, 'utf-8')

const mpvManagerPath = path.join(__dirname, '..', 'src', 'main', 'MpvManager.ts')
let mpvContent = fs.readFileSync(mpvManagerPath, 'utf-8')
mpvContent = mpvContent.replace(/bitPerfect: boolean = true/g, 'bitPerfect: boolean = false')
mpvContent = mpvContent.replace(/private currentBitPerfect: boolean = true/g, 'private currentBitPerfect: boolean = false')
fs.writeFileSync(mpvManagerPath, mpvContent, 'utf-8')

console.log('Minor bugs fixed.')
