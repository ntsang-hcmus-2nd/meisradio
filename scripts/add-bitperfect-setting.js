const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// Add state
if (!content.includes('bitPerfectEnabled')) {
  content = content.replace(/const \[crossfadeEnabled, setCrossfadeEnabled\] = useState\(false\)/, 
    'const [crossfadeEnabled, setCrossfadeEnabled] = useState(false)\n  const [bitPerfectEnabled, setBitPerfectEnabled] = useState(true)')

  // Load config
  content = content.replace(/if \(cfg\.crossfadeEnabled !== undefined\) setCrossfadeEnabled\(cfg\.crossfadeEnabled\)/, 
    'if (cfg.crossfadeEnabled !== undefined) setCrossfadeEnabled(cfg.crossfadeEnabled)\n      if (cfg.bitPerfectEnabled !== undefined) setBitPerfectEnabled(cfg.bitPerfectEnabled)')

  // Save config (find the object passed to saveConfig)
  content = content.replace(/crossfadeEnabled,\s*crossfadeDuration,/g, 'crossfadeEnabled, crossfadeDuration, bitPerfectEnabled,')

  // UI Settings block
  const settingsBlock = `
                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <h3 className="text-emerald-400 font-semibold mb-2">Bit-perfect (WASAPI/ASIO Exclusive)</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 text-sm">Chế độ Bit-perfect (Bỏ qua Windows Mixer)</span>
                        <input 
                          type="checkbox" 
                          checked={bitPerfectEnabled} 
                          onChange={e => {
                            const val = e.target.checked
                            setBitPerfectEnabled(val)
                            window.api.setBitPerfect(val)
                          }} 
                          className="w-4 h-4 text-emerald-600 bg-zinc-800 border-zinc-700 rounded focus:ring-emerald-500 focus:ring-2 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">Lưu ý: Bật chế độ này sẽ chiếm quyền Audio, các ứng dụng khác sẽ không có tiếng. Thay đổi sẽ khởi động lại luồng âm thanh.</p>
                    </div>
`
  content = content.replace(/<div className="border-t border-zinc-800 pt-6 mt-6">\s*<h3 className="text-emerald-400 font-semibold mb-2">Crossfade/, 
    settingsBlock + '\n                    <div className="border-t border-zinc-800 pt-6 mt-6">\n                      <h3 className="text-emerald-400 font-semibold mb-2">Crossfade')

  fs.writeFileSync(appTsxPath, content, 'utf-8')
  console.log('App.tsx updated with bitPerfect setting')
} else {
  console.log('Already updated.')
}
