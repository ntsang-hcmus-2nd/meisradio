import React from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  label: string
  value: string
}

interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (val: string) => void
}

export const CustomSelect: React.FC<SelectProps> = ({ options, value, onChange }) => {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-zinc-900 text-zinc-200 text-xs border border-zinc-700/80 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-emerald-500 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200 py-1.5">
            {opt.label}
          </option>
        ))}
      </select>
      
      {/* Mũi tên tùy chỉnh phía bên phải */}
      <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-zinc-400">
        <ChevronDown size={14} />
      </div>
    </div>
  )
}