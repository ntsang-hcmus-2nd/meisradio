import React from 'react'
import { Minus, Plus } from 'lucide-react'

interface NumberInputProps {
  value: number
  onChange: (val: number) => void
  min?: number
  max?: number
  step?: number
}

export const CustomNumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}) => {
  return (
    <div className="inline-flex items-center bg-zinc-900 border border-zinc-700/80 rounded-lg overflow-hidden focus-within:border-emerald-500 transition-all">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition"
      >
        <Minus size={14} />
      </button>

      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-10 bg-transparent text-center text-xs font-semibold text-zinc-200 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}