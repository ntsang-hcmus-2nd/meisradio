const fs = require('fs')
const path = require('path')

const appTsxPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx')
let content = fs.readFileSync(appTsxPath, 'utf-8')

// Fix the syntax error from the previous bad regex
content = content.replace(/\/\* AudioContext disabled for MPV \*\/[\s\S]*?catch\s*\(e\)\s*\{\s*audioCtxRef\.current\s*=\s*new\s*AudioContextClass\(\)\s*\}/g, 
  'try { audioCtxRef.current = new AudioContextClass({ sampleRate: currentSampleRate }) } catch (e) { audioCtxRef.current = new AudioContextClass() }')

// Also ensure no trailing random closing brackets if the previous multi_replace messed up something
// But since the previous multi_replace was fuzzy and might have left ) } let's catch that explicitly.
content = content.replace(/\/\* AudioContext disabled for MPV \*\/\)\s*\}\s*catch\s*\(e\)/g, 
  'try { audioCtxRef.current = new AudioContextClass({ sampleRate: currentSampleRate }) } catch (e)')

fs.writeFileSync(appTsxPath, content, 'utf-8')
console.log('Syntax fixed.')
