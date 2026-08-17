import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Sliders, Plus, RotateCcw, Trash2, X, Download, Upload, Headphones, Sparkles } from 'lucide-react'
import { CustomNumberInput } from './CustomNumberInput'
import { CustomSelect } from './CustomSelect'
import { EQBand } from '../App'
import { BUILTIN_AUTOEQ_PROFILES, parsePeaceEqText, exportPeaceEqText, AutoEqProfile } from './autoeq/autoeqProfiles'
import { useTranslation } from '../locales'

interface EQPanelProps {
  showEQ: boolean
  setShowEQ: (v: boolean) => void
  isEqEnabled: boolean
  setIsEqEnabled: (v: boolean) => void
  eqBands: EQBand[]
  setEqBands: React.Dispatch<React.SetStateAction<EQBand[]>>
  filterNodesRef: React.MutableRefObject<BiquadFilterNode[]>
  preampGain: number
  setPreampGain: (v: number) => void
}

export const EQPanel: React.FC<EQPanelProps> = ({ 
  showEQ, setShowEQ, isEqEnabled, setIsEqEnabled, eqBands, setEqBands, filterNodesRef,
  preampGain, setPreampGain
}) => {
  const { t } = useTranslation()
  const eqCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [searchHeadphone, setSearchHeadphone] = useState<string>('')
  const [showAutoEqModal, setShowAutoEqModal] = useState<boolean>(false)

  const handleAddBand = () => {
    setEqBands(prev => [...prev, { id: `band-${Date.now()}`, frequency: 1000, gain: 0, type: 'peaking', q: 1.4 }])
  }

  const handleDeleteBand = (id: string) => {
    setEqBands(prev => prev.filter(b => b.id !== id))
  }

  const handleUpdateBand = (id: string, key: keyof EQBand, value: any) => {
    setEqBands(prev => prev.map(band => (band.id === id ? { ...band, [key]: value } : band)))
  }

  const handleResetEQ = () => {
    const timestamp = Date.now()
    setSelectedProfileId('')
    setPreampGain(0)
    setEqBands([
      { id: `reset-${timestamp}-1`, frequency: 60, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-2`, frequency: 230, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-3`, frequency: 910, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-4`, frequency: 3600, gain: 0, type: 'peaking', q: 1.4 },
      { id: `reset-${timestamp}-5`, frequency: 14000, gain: 0, type: 'peaking', q: 1.4 },
    ])
    if (filterNodesRef.current) {
      filterNodesRef.current.forEach(node => {
        try { node.gain.value = 0 } catch(e){}
      })
    }
  }

  // Áp dụng Profile AutoEQ
  const applyAutoEqProfile = (profile: AutoEqProfile) => {
    setSelectedProfileId(profile.id)
    setPreampGain(profile.preamp || 0)
    const timestamp = Date.now()

    const newBands: EQBand[] = profile.bands.map((b, idx) => ({
      id: `autoeq-${profile.id}-${timestamp}-${idx}`,
      frequency: b.frequency,
      gain: b.gain,
      q: b.q || 1.4,
      type: (b.type as any) || 'peaking'
    }))

    setEqBands(newBands)
    setIsEqEnabled(true)
    setShowAutoEqModal(false)
  }

  // Nhập file cấu hình Peace / EqualizerAPO (.txt / .peace)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        if (!text) return
        const parsed = parsePeaceEqText(text)
        if (parsed.bands.length === 0) {
          alert('Không tìm thấy dải tần số nào hợp lệ trong tệp!')
          return
        }

        setSelectedProfileId('')
        setPreampGain(parsed.preamp)
        const timestamp = Date.now()

        const newBands: EQBand[] = parsed.bands.map((b, idx) => ({
          id: `peace-import-${timestamp}-${idx}`,
          frequency: b.frequency,
          gain: b.gain,
          q: b.q || 1.4,
          type: (b.type as any) || 'peaking'
        }))

        setEqBands(newBands)
        setIsEqEnabled(true)
      } catch (err: any) {
        alert('Lỗi đọc tệp cấu hình: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Xuất file cấu hình Peace (.txt)
  const handleExportFile = () => {
    const text = exportPeaceEqText(preampGain, eqBands)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MeisRadio_Peace_EQ_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Hàm vẽ biểu đồ sóng EQ và Trục X/Y
  const drawEQCanvas = useCallback(() => {
    if (!eqCanvasRef.current) return
    const canvas = eqCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    
    // Vùng đệm (Padding) để không bị khuất chữ và đường biên
    const paddingLeft = 40
    const paddingRight = 20
    const paddingTop = 15
    const paddingBottom = 22
    const drawWidth = width - paddingLeft - paddingRight
    const drawHeight = height - paddingTop - paddingBottom

    ctx.clearRect(0, 0, width, height)
    ctx.font = '10px "Inter", sans-serif'

    // --- 1. VẼ TRỤC Y (ĐỘ LỢI: -20dB đến +20dB) ---
    const dbMarks = [20, 10, 0, -10, -20]
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    
    dbMarks.forEach(db => {
      const y = paddingTop + (drawHeight / 2) - (db / 20) * (drawHeight / 2)
      
      // Kẻ lưới ngang
      ctx.beginPath()
      ctx.strokeStyle = db === 0 ? '#52525b' : '#27272a'
      ctx.lineWidth = db === 0 ? 1.5 : 1
      ctx.moveTo(paddingLeft, y)
      ctx.lineTo(paddingLeft + drawWidth, y)
      ctx.stroke()
      
      // Viết chữ
      ctx.fillStyle = db === 0 ? '#a1a1aa' : '#71717a'
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, paddingLeft - 6, y)
    })

    // --- 2. VẼ TRỤC X (TẦN SỐ: 20Hz - 20000Hz theo thang Logarithmic) ---
    const minFreq = 20
    const maxFreq = 20000
    const hzMarks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    hzMarks.forEach(hz => {
      const x = paddingLeft + drawWidth * (Math.log(hz / minFreq) / Math.log(maxFreq / minFreq))
      
      // Kẻ lưới dọc
      ctx.beginPath()
      ctx.strokeStyle = '#27272a'
      ctx.lineWidth = 1
      ctx.moveTo(x, paddingTop)
      ctx.lineTo(x, paddingTop + drawHeight)
      ctx.stroke()
      
      // Viết chữ
      ctx.fillStyle = '#71717a'
      const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`
      ctx.fillText(label, x, paddingTop + drawHeight + 5)
    })

    // --- 3. VẼ ĐƯỜNG CONG ÂM THANH EQ ---
    const freqArray = new Float32Array(drawWidth)
    const magResponse = new Float32Array(drawWidth)
    const phaseResponse = new Float32Array(drawWidth)

    for (let i = 0; i < drawWidth; i++) {
      freqArray[i] = minFreq * Math.pow(maxFreq / minFreq, i / drawWidth)
    }
    
    const totalMag = new Float32Array(drawWidth).fill(1.0)
    
    if (isEqEnabled && filterNodesRef.current && filterNodesRef.current.length > 0) {
      filterNodesRef.current.forEach(filter => {
        try {
          filter.getFrequencyResponse(freqArray, magResponse, phaseResponse)
          for (let i = 0; i < drawWidth; i++) totalMag[i] *= magResponse[i]
        } catch (e) {}
      })
    }

    const theme10Color = getComputedStyle(document.documentElement).getPropertyValue('--theme-10').trim() || '#10b981'
    ctx.beginPath()
    ctx.lineWidth = 3
    ctx.strokeStyle = isEqEnabled ? theme10Color : '#52525b'
    
    for (let i = 0; i < drawWidth; i++) {
      const db = (20 * Math.log10(totalMag[i])) + (isEqEnabled ? preampGain : 0)
      const clampedDb = Math.max(-20, Math.min(20, db))
      const y = paddingTop + (drawHeight / 2) - (clampedDb / 20) * (drawHeight / 2)
      
      if (i === 0) ctx.moveTo(paddingLeft + i, y)
      else ctx.lineTo(paddingLeft + i, y)
    }
    ctx.stroke()

    // Fill màu Gradient phía dưới
    ctx.lineTo(paddingLeft + drawWidth, paddingTop + drawHeight)
    ctx.lineTo(paddingLeft, paddingTop + drawHeight)
    
    if (isEqEnabled) {
      ctx.globalAlpha = 0.1
      ctx.fillStyle = theme10Color
    } else {
      ctx.fillStyle = 'rgba(82, 82, 91, 0.05)'
    }
    
    ctx.fill()
    ctx.globalAlpha = 1.0
  }, [isEqEnabled, filterNodesRef, preampGain])

  useEffect(() => {
    if (!showEQ) return
    const frameId = requestAnimationFrame(drawEQCanvas)
    return () => cancelAnimationFrame(frameId)
  }, [showEQ, eqBands, isEqEnabled, preampGain, drawEQCanvas])

  if (!showEQ) return null

  const filteredAutoEqProfiles = BUILTIN_AUTOEQ_PROFILES.filter(p => 
    p.name.toLowerCase().includes(searchHeadphone.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchHeadphone.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative">
        
        {/* Hidden file input for Peace profile import */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept=".txt,.peace" 
          className="hidden" 
          onChange={handleImportFile} 
        />

        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-zinc-800 mb-4 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <Sliders className="text-theme-10" size={22} />
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{t('modals.eq.title')}</h2>
              <p className="text-[11px] text-zinc-400">Peace Equalizer / EqualizerAPO Compatible</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 transition hover:border-theme-10">
              <span className="text-zinc-300 text-xs font-semibold">{t('modals.eq.enableEq')}</span>
              <input 
                type="checkbox" 
                checked={isEqEnabled} 
                onChange={e => setIsEqEnabled(e.target.checked)} 
                className="w-4 h-4 accent-theme-10 cursor-pointer" 
              />
            </label>

            <button 
              onClick={() => setShowAutoEqModal(true)} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-10/20 hover:bg-theme-10/30 text-theme-10 border border-theme-10/30 rounded-lg text-xs font-semibold transition"
              title="AutoEQ Profiles"
            >
              <Headphones size={15} /> AutoEQ
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
              title={t('modals.eq.importFile')}
            >
              <Upload size={14} /> {t('modals.eq.importFile')}
            </button>

            <button 
              onClick={handleExportFile} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
              title={t('modals.eq.exportFile')}
            >
              <Download size={14} /> {t('modals.eq.exportFile')}
            </button>

            <button 
              onClick={handleAddBand} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-10 hover:bg-theme-10/80 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus size={15} /> + Band
            </button>

            <button 
              onClick={handleResetEQ} 
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition"
              title={t('modals.eq.reset')}
            >
              <RotateCcw size={14} /> {t('modals.eq.reset')}
            </button>

            <button onClick={() => setShowEQ(false)} className="text-zinc-400 hover:text-white p-1 text-lg">
              <X size={20}/>
            </button>
          </div>
        </div>

        {/* CANVAS GRAPH */}
        <canvas ref={eqCanvasRef} width={800} height={160} className="w-full h-36 bg-zinc-950 rounded-xl border border-zinc-800 mb-4 shrink-0 shadow-inner" />
        
        {/* PREAMP BAR */}
        <div 
          className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 mb-4 flex items-center justify-between gap-4 text-xs shrink-0"
          onWheel={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const delta = e.deltaY < 0 ? 0.5 : -0.5
            const nextPreamp = Math.max(-20, Math.min(10, Math.round((preampGain + delta) * 10) / 10))
            setPreampGain(nextPreamp)
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">{t('modals.eq.preamp')}:</span>
            <span className="font-mono text-theme-10 font-bold">{preampGain > 0 ? `+${preampGain.toFixed(1)}` : preampGain.toFixed(1)} dB</span>
            <span className="text-[10px] text-zinc-500 italic">(AutoEQ Preamp)</span>
          </div>
          <input 
            type="range" 
            min="-20" 
            max="10" 
            step="0.5" 
            value={preampGain} 
            onChange={(e) => setPreampGain(Number(e.target.value))}
            onWheel={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const delta = e.deltaY < 0 ? 0.5 : -0.5
              const nextPreamp = Math.max(-20, Math.min(10, Math.round((preampGain + delta) * 10) / 10))
              setPreampGain(nextPreamp)
            }}
            className="w-48 h-1.5 rounded-lg appearance-none cursor-pointer accent-theme-10" 
          />
        </div>

        {/* BANDS LIST */}
        <div className="overflow-y-auto flex-1 pr-2 space-y-3">
          {eqBands.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">{t('modals.eq.noBandsFound')}</p>
          ) : (
            eqBands.map((band) => (
              <div key={band.id} className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
                
                {/* Tần số */}
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-zinc-400 font-mono text-xs">{t('modals.eq.freq')} (Hz)</label>
                  <CustomNumberInput 
                    min={20} 
                    max={20000} 
                    step={10} 
                    value={band.frequency} 
                    onChange={(val) => {
                      handleUpdateBand(band.id, 'frequency', val)
                      if (filterNodesRef.current) {
                        const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                        if (filterNodesRef.current[nodeIndex]) {
                          filterNodesRef.current[nodeIndex].frequency.value = val
                        }
                      }
                      requestAnimationFrame(drawEQCanvas)
                    }} 
                  />
                </div>

                {/* Loại Filter */}
                <div className="flex flex-col gap-1 w-36">
                  <label className="text-zinc-400 text-xs">{t('modals.eq.type')}</label>
                  <CustomSelect 
                    value={band.type} 
                    onChange={(val) => {
                      const filterType = val as BiquadFilterType
                      handleUpdateBand(band.id, 'type', filterType)
                      if (filterNodesRef.current) {
                        const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                        if (filterNodesRef.current[nodeIndex]) {
                          filterNodesRef.current[nodeIndex].type = filterType
                        }
                      }
                      requestAnimationFrame(drawEQCanvas)
                    }} 
                    options={[
                      { value: 'peaking', label: `${t('modals.eq.peaking')} (PK)` },
                      { value: 'lowshelf', label: `${t('modals.eq.lowshelf')} (LSC)` },
                      { value: 'highshelf', label: `${t('modals.eq.highshelf')} (HSC)` },
                      { value: 'lowpass', label: `${t('modals.eq.lowpass')} (LP)` },
                      { value: 'highpass', label: `${t('modals.eq.highpass')} (HP)` }
                    ]} 
                  />
                </div>

                {/* Hệ số Q */}
                <div className="flex flex-col gap-1 w-24">
                  <label className="text-zinc-400 text-xs">{t('modals.eq.bandwidthQ')}</label>
                  <CustomNumberInput 
                    min={0.1} 
                    max={10.0} 
                    step={0.1} 
                    value={band.q || 1.4} 
                    onChange={(val) => {
                      handleUpdateBand(band.id, 'q', val)
                      if (filterNodesRef.current) {
                        const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                        if (filterNodesRef.current[nodeIndex]) {
                          filterNodesRef.current[nodeIndex].Q.value = val
                        }
                      }
                      requestAnimationFrame(drawEQCanvas)
                    }} 
                  />
                </div>

                {/* Gain Slider */}
                <div 
                  className="flex flex-col gap-1 flex-1 min-w-[180px]"
                  onWheel={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const delta = e.deltaY < 0 ? 0.5 : -0.5
                    const nextGain = Math.max(-20, Math.min(20, Math.round((band.gain + delta) * 10) / 10))
                    handleUpdateBand(band.id, 'gain', nextGain)
                    if (filterNodesRef && filterNodesRef.current) {
                      const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                      if (filterNodesRef.current[nodeIndex]) {
                        filterNodesRef.current[nodeIndex].gain.value = nextGain
                      }
                    }
                    requestAnimationFrame(drawEQCanvas)
                  }}
                >
                  <div className="flex justify-between text-zinc-400">
                    <span>{t('modals.eq.gain')}</span>
                    <span className="font-mono text-theme-10 font-bold">{band.gain > 0 ? `+${band.gain}` : band.gain} dB</span>
                  </div>
                  <input 
                    key={`${band.id}-${band.gain}`}
                    type="range" 
                    min="-20" 
                    max="20" 
                    step="0.5" 
                    value={band.gain} 
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      handleUpdateBand(band.id, 'gain', val)
                      if (filterNodesRef && filterNodesRef.current) {
                        const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                        if (filterNodesRef.current[nodeIndex]) {
                          filterNodesRef.current[nodeIndex].gain.value = val
                        }
                      }
                      requestAnimationFrame(drawEQCanvas)
                    }} 
                    onWheel={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const delta = e.deltaY < 0 ? 0.5 : -0.5
                      const nextGain = Math.max(-20, Math.min(20, Math.round((band.gain + delta) * 10) / 10))
                      handleUpdateBand(band.id, 'gain', nextGain)
                      if (filterNodesRef && filterNodesRef.current) {
                        const nodeIndex = eqBands.findIndex(b => b.id === band.id)
                        if (filterNodesRef.current[nodeIndex]) {
                          filterNodesRef.current[nodeIndex].gain.value = nextGain
                        }
                      }
                      requestAnimationFrame(drawEQCanvas)
                    }}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-theme-10" 
                    style={{ background: `linear-gradient(to right, var(--theme-10) ${((band.gain + 20) / 40) * 100}%, #27272a ${((band.gain + 20) / 40) * 100}%)` }} 
                  />
                </div>

                {/* Delete Button */}
                <button 
                  onClick={() => handleDeleteBand(band.id)} 
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition mt-3" 
                  title={t('common.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* MODAL CHỌN TAI NGHE AUTOEQ */}
        {showAutoEqModal && (
          <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md rounded-2xl p-6 z-50 flex flex-col animate-fade-in border border-zinc-800">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-theme-10" size={20} />
                <h3 className="font-bold text-white text-base">AutoEQ Database (Harman Target)</h3>
              </div>
              <button onClick={() => setShowAutoEqModal(false)} className="text-zinc-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <input 
                type="text"
                value={searchHeadphone}
                onChange={e => setSearchHeadphone(e.target.value)}
                placeholder={t('modals.eq.searchHeadphonePlaceholder')}
                className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl py-2.5 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-theme-10"
              />
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-1">
              {filteredAutoEqProfiles.length === 0 ? (
                <div className="col-span-2 text-center text-zinc-500 py-12">
                  No headphone profiles matched "{searchHeadphone}".
                </div>
              ) : (
                filteredAutoEqProfiles.map(p => {
                  const isCurrent = selectedProfileId === p.id
                  return (
                    <div 
                      key={p.id}
                      onClick={() => applyAutoEqProfile(p)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        isCurrent 
                          ? 'bg-theme-10/15 border-theme-10/50 shadow-lg shadow-theme-10/10' 
                          : 'bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-10">{p.brand}</span>
                        <h4 className="font-bold text-white text-sm mt-0.5">{p.name}</h4>
                        <p className="text-[11px] text-zinc-400 mt-1">{p.category} • {p.bands.length} bands • Preamp {p.preamp}dB</p>
                      </div>
                      <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isCurrent ? 'bg-theme-10 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                        {isCurrent ? 'Active' : 'Apply'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}