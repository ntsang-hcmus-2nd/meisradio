import React, { useEffect, useRef, useState } from 'react'
import { Rows3, LayoutGrid, List } from 'lucide-react'
import { useTranslation } from '../locales'

export type ViewMode = 'table' | 'grid' | 'compact'

interface ViewModeSliderProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

const OPTIONS: { mode: ViewMode; icon: React.ReactNode; i18nKey: string; fallback: string }[] = [
  {
    mode: 'table',
    icon: <Rows3 size={15} />,
    i18nKey: 'viewOptions.table',
    fallback: 'Table view'
  },
  {
    mode: 'grid',
    icon: <LayoutGrid size={15} />,
    i18nKey: 'viewOptions.grid',
    fallback: 'Grid view'
  },
  {
    mode: 'compact',
    icon: <List size={15} />,
    i18nKey: 'viewOptions.compact',
    fallback: 'Compact view'
  }
]

const BTN_W = 32 // w-8

export const ViewModeSlider: React.FC<ViewModeSliderProps> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef<number | null>(null)
  const hasDraggedRef = useRef(false)
  const activeIndex = OPTIONS.findIndex((o) => o.mode === value)
  const offsetPx = dragOffset !== null ? dragOffset : Math.max(0, activeIndex) * BTN_W

  // Drop commits to the snapped position; the effect below clears it once value lands.
  useEffect(() => {
    setDragOffset(null)
  }, [value])

  const offsetFromEvent = (clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    // p-1 => 4px left padding offset for the pill area
    const x = clientX - rect.left - 4
    return Math.max(0, Math.min((OPTIONS.length - 1) * BTN_W, x))
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    // Capture on the press target (button/icon) so the tap's click still lands
    // on the button; moves/ups bubble up to the track for drag tracking.
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    startXRef.current = e.clientX
    hasDraggedRef.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startXRef.current === null) return
    if (Math.abs(e.clientX - startXRef.current) > 3) {
      hasDraggedRef.current = true
      setDragging(true)
      const raw = offsetFromEvent(e.clientX) - BTN_W / 2
      setDragOffset(Math.max(0, Math.min((OPTIONS.length - 1) * BTN_W, raw)))
    }
  }

  const resetDrag = () => {
    startXRef.current = null
    setDragging(false)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!hasDraggedRef.current) {
      startXRef.current = null
      return
    }
    const off = offsetFromEvent(e.clientX)
    const idx = Math.round(off / BTN_W)
    const clamped = Math.max(0, Math.min(OPTIONS.length - 1, idx))
    resetDrag()
    if (OPTIONS[clamped] && OPTIONS[clamped].mode !== value) {
      // Snap the pill to the drop target; it stays until value updates (see effect).
      setDragOffset(clamped * BTN_W)
      onChange(OPTIONS[clamped].mode)
    } else {
      setDragOffset(null)
    }
  }

  const handlePointerCancel = () => {
    resetDrag()
    setDragOffset(null)
  }

  // Swallow the click that follows a drag so it can't override the drop target.
  // Taps (no drag) pass through; re-tapping the active mode is a no-op.
  const handleOptionClick = (mode: ViewMode) => {
    if (hasDraggedRef.current || mode === value) return
    onChange(mode)
  }

  return (
    <div
      ref={trackRef}
      className="relative flex items-center bg-theme-60/50 p-1 rounded-full border border-zinc-700/50 select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className="absolute top-1 bottom-1 left-1 w-8 rounded-full bg-theme-10 shadow-md"
        style={{
          transform: `translateX(${offsetPx}px)`,
          transition: dragging ? 'none' : 'transform 300ms ease-out'
        }}
      />
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          title={t(opt.i18nKey) || opt.fallback}
          onClick={() => handleOptionClick(opt.mode)}
          className={`relative z-10 w-8 h-7 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
            value === opt.mode ? 'text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}

export default ViewModeSlider
