import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
  subItems?: {
    id: string
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }[]
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })

  // Căn chỉnh vị trí menu để không bị tràn màn hình
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const screenW = window.innerWidth
    const screenH = window.innerHeight

    let newX = x
    let newY = y

    if (x + rect.width > screenW - 10) {
      newX = Math.max(10, screenW - rect.width - 10)
    }
    if (y + rect.height > screenH - 10) {
      newY = Math.max(10, screenH - rect.height - 10)
    }

    setPosition({ x: newX, y: newY })
  }, [x, y])

  // Lắng nghe click bên ngoài và phím Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => {
      onClose()
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 text-xs select-none animate-fade-in"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={`divider-${index}`} className="my-1 border-t border-white/5" />
        }

        const hasSub = item.subItems && item.subItems.length > 0

        return (
          <div 
            key={item.id} 
            className="relative"
            onMouseEnter={() => hasSub && setActiveSubMenu(item.id)}
            onMouseLeave={() => hasSub && setActiveSubMenu(null)}
          >
            <button
              disabled={item.disabled}
              onClick={() => {
                if (!hasSub && item.onClick) {
                  item.onClick()
                  onClose()
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left ${
                item.disabled 
                  ? 'opacity-40 cursor-not-allowed text-zinc-500' 
                  : item.danger
                    ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300'
                    : 'text-zinc-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                <span className="font-medium">{item.label}</span>
              </div>
              {hasSub && <ChevronRight size={14} className="opacity-50 ml-2" />}
            </button>

            {/* Submenu */}
            {hasSub && activeSubMenu === item.id && (
              <div 
                className="absolute left-full top-0 ml-1 min-w-[180px] max-h-64 overflow-y-auto bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 text-xs"
              >
                {item.subItems!.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      sub.onClick()
                      onClose()
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left text-zinc-200 hover:bg-white/10 hover:text-white truncate"
                  >
                    {sub.icon && <span className="shrink-0 opacity-80">{sub.icon}</span>}
                    <span className="truncate font-medium">{sub.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
