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
  const mountTimeRef = useRef<number>(Date.now())
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })

  // Căn chỉnh vị trí menu để không bao giờ tràn mép màn hình
  useEffect(() => {
    mountTimeRef.current = Date.now()
    setPosition({ x, y })

    const frame = requestAnimationFrame(() => {
      if (!menuRef.current) return
      const rect = menuRef.current.getBoundingClientRect()
      const screenW = window.innerWidth
      const screenH = window.innerHeight

      let newX = x
      let newY = y

      if (x + rect.width > screenW - 12) {
        newX = Math.max(12, screenW - rect.width - 12)
      }
      if (y + rect.height > screenH - 12) {
        newY = Math.max(12, screenH - rect.height - 12)
      }

      setPosition({ x: newX, y: newY })
    })
    return () => cancelAnimationFrame(frame)
  }, [x, y])

  // Lắng nghe phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBackdropEvent = (e: React.SyntheticEvent) => {
    // Chống đóng nhầm nếu sự kiện chuột ban đầu vừa kích hoạt xong (< 120ms)
    if (Date.now() - mountTimeRef.current < 120) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  return (
    <>
      {/* Lớp nền bắt click ngoài toàn màn hình */}
      <div 
        className="fixed inset-0 z-[99998] bg-transparent cursor-default select-none"
        onMouseDown={handleBackdropEvent}
        onClick={handleBackdropEvent}
        onContextMenu={handleBackdropEvent}
      />

      {/* Menu nổi bật chính */}
      <div
        ref={menuRef}
        className="fixed z-[99999] min-w-[220px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/70 rounded-xl shadow-2xl p-1.5 text-xs select-none animate-fade-in"
        style={{ left: position.x, top: position.y }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {items.map((item, index) => {
          if (item.divider) {
            return <div key={`divider-${index}`} className="my-1 border-t border-zinc-800" />
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
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
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
                  className="absolute left-full top-0 ml-1 min-w-[190px] max-h-64 overflow-y-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/70 rounded-xl shadow-2xl p-1.5 text-xs z-[100000]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {item.subItems!.map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
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
    </>
  )
}
