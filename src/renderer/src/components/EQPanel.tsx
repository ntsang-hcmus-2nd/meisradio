import React, { useEffect, useRef } from 'react'
import { Sliders, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { CustomNumberInput } from './CustomNumberInput'
import { CustomSelect } from './CustomSelect'
import { EQBand } from '../App'

interface EQPanelProps {
  showEQ: boolean
  setShowEQ: (v: boolean) => void
  isEqEnabled: boolean
  setIsEqEnabled: (v: boolean) => void
  eqBands: EQBand[]
  setEqBands: React.Dispatch<React.SetStateAction<EQBand[]>>
  filterNodesRef: React.MutableRefObject<BiquadFilterNode[]>
}

export const EQPanel: React.FC<EQPanelProps> = ({ showEQ, setShowEQ, isEqEnabled, setIsEqEnabled, eqBands, setEqBands, filterNodesRef }) => {
  const eqCanvasRef = useRef<HTMLCanvasElement>(null)

  const handleAddBand = () => setEqBands(prev => [...prev, { id: Date.now().toString(), frequency: 1000, gain: 0, type: 'peaking', q: 1.4 }])
  const handleDeleteBand = (id: string) => setEqBands(prev => prev.filter(b => b.id !== id))
  const handleUpdateBand = (id: string, key: keyof EQBand, value: any) => setEqBands(prev => prev.map(band => (band.id === id ? { ...band, [key]: value } : band)))
  const handleResetEQ = () => setEqBands([
    { id: '1', frequency: 60, gain: 0, type: 'peaking', q: 1.4 }, { id: '2', frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
    { id: '3', frequency: 910, gain: 0, type: 'peaking', q: 1.4 }, { id: '4', frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
    { id: '5', frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
  ])

  // Vẽ biểu đồ sóng EQ
  useEffect(() => {
    if (!showEQ || !eqCanvasRef.current || filterNodesRef.current.length === 0) return
    const canvas = eqCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width; const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#27272a'; ctx.lineWidth = 1; ctx.beginPath()
    for (let i = 1; i < 10; i++) {
      ctx.moveTo(0, (height / 10) * i); ctx.lineTo(width, (height / 10) * i)
      ctx.moveTo((width / 10) * i, 0); ctx.lineTo((width / 10) * i, height)
    }
    ctx.stroke()

    const freqCount = width
    const freqArray = new Float32Array(freqCount)
    const magResponse = new Float32Array(freqCount)
    const phaseResponse = new Float32Array(freqCount)

    const minFreq = 20; const maxFreq = 20000
    for (let i = 0; i < freqCount; i++) freqArray[i] = minFreq * Math.pow(maxFreq / minFreq, i / freqCount)
    
    const totalMag = new Float32Array(freqCount).fill(1.0)
    filterNodesRef.current.forEach(filter => {
      filter.getFrequencyResponse(freqArray, magResponse, phaseResponse)
      for (let i = 0; i < freqCount; i++) totalMag[i] *= magResponse[i]
    })

    ctx.beginPath(); ctx.lineWidth = 3; ctx.strokeStyle = '#10b981' 
    for (let i = 0; i < freqCount; i++) {
      const db = 20 * Math.log10(totalMag[i])
      const y = height / 2 - (db / 20) * (height / 2) 
      if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y)
    }
    ctx.stroke()
    ctx.lineTo(width, height); ctx.lineTo(0, height)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)'; ctx.fill()
  }, [showEQ, eqBands, isEqEnabled])

  if (!showEQ) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4 shrink-0">
          <div className="flex items-center gap-2"><Sliders className="text-emerald-500" size={22} /><h2 className="text-lg font-bold text-white">Equalizer (EQ)</h2></div>
          <label className="flex items-center gap-2 cursor-pointer ml-4 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 transition hover:border-emerald-500">
            <span className="text-zinc-300 text-sm font-medium">Bật EQ</span>
            <input type="checkbox" checked={isEqEnabled} onChange={e => setIsEqEnabled(e.target.checked)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={handleAddBand} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"><Plus size={16} /> Thêm dải tần</button>
            <button onClick={handleResetEQ} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition"><RotateCcw size={14} /> Reset</button>
            <button onClick={() => setShowEQ(false)} className="text-zinc-400 hover:text-white px-2 text-lg"><X size={18}/></button>
          </div>
        </div>
        <canvas ref={eqCanvasRef} width={800} height={150} className="w-full h-32 bg-zinc-950 rounded-lg border border-zinc-800 mb-4 shrink-0" />
        <div className="overflow-y-auto flex-1 pr-2 space-y-3">
          {eqBands.length === 0 ? <p className="text-center text-zinc-500 py-8">Chưa có dải tần nào.</p> : (
            eqBands.sort((a, b) => a.frequency - b.frequency).map((band) => (
              <div key={band.id} className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex flex-wrap items-center gap-4 text-xs">
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-zinc-400 font-mono text-xs">Tần số (Hz)</label>
                  <CustomNumberInput min={20} max={20000} step={10} value={band.frequency} onChange={(val) => handleUpdateBand(band.id, 'frequency', val)} />
                </div>
                <div className="flex flex-col gap-1 w-36">
                  <label className="text-zinc-400 text-xs">Loại bộ lọc</label>
                  <CustomSelect value={band.type} onChange={(val) => handleUpdateBand(band.id, 'type', val)} options={[{ value: 'peaking', label: 'Peaking' }, { value: 'lowshelf', label: 'Low Shelf' }, { value: 'highshelf', label: 'High Shelf' }, { value: 'lowpass', label: 'Low Pass' }, { value: 'highpass', label: 'High Pass' }]} />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                  <div className="flex justify-between text-zinc-400"><span>Gain</span><span className="font-mono text-emerald-400">{band.gain > 0 ? `+${band.gain}` : band.gain} dB</span></div>
                  <input type="range" min="-20" max="20" step="0.5" value={band.gain} onChange={(e) => handleUpdateBand(band.id, 'gain', Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500" style={{ background: `linear-gradient(to right, #10b981 ${((band.gain + 20) / 40) * 100}%, #27272a ${((band.gain + 20) / 40) * 100}%)` }} />
                </div>
                <button onClick={() => handleDeleteBand(band.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition mt-3"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}