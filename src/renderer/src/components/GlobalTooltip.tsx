import React, { useEffect, useRef, useState } from 'react'

interface TooltipState {
  text: string
  left: number
  top: number
  transform: string
  visible: boolean
}

const initialState: TooltipState = { text: '', left: 0, top: 0, transform: '', visible: false }

export const GlobalTooltip: React.FC = () => {
  const [tip, setTip] = useState<TooltipState>(initialState)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEl = useRef<HTMLElement | null>(null)

  // Hover needs a dwell delay so tooltips don't flash during fast mouse travel.
  const SHOW_DELAY = 400

  useEffect(() => {
    // Steal the native title synchronously on hover so the OS tooltip never
    // flashes during SHOW_DELAY; every button ends up on the single custom style.
    const stealTitle = (el: HTMLElement) => {
      const title = el.getAttribute('title')
      if (title && el.tagName !== 'IFRAME') {
        el.setAttribute('data-tooltip', title)
        el.removeAttribute('title')
      }
    }

    const showFor = (el: HTMLElement) => {
      stealTitle(el)
      const text = el.getAttribute('data-tooltip') || ''
      if (!text) return
      // Skip elements that render their own custom tooltip inside a .group container
      // (e.g. TrackInfoModal footer) — let the local tooltip handle it.
      const group = el.closest('.group') as HTMLElement | null
      if (group && group.querySelector('[data-custom-tooltip]')) return
      const rect = el.getBoundingClientRect()
      const flipBelow = rect.top < 44
      const top = flipBelow ? rect.bottom + 8 : rect.top - 8
      const transform = flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      let left = rect.left + rect.width / 2
      left = Math.max(12, Math.min(window.innerWidth - 12, left))
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setTip({ text, left, top, transform, visible: true })
    }

    const cancelScheduledShow = () => {
      if (showTimer.current) clearTimeout(showTimer.current)
      showTimer.current = null
      pendingEl.current = null
    }

    const hide = () => {
      cancelScheduledShow()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setTip(initialState), 60)
    }

    const scheduleShow = (el: HTMLElement) => {
      // Same element already showing: keep it, don't restart the timer.
      if (pendingEl.current === el) return
      cancelScheduledShow()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      pendingEl.current = el
      showTimer.current = setTimeout(() => {
        const target = pendingEl.current
        pendingEl.current = null
        showTimer.current = null
        if (target && target.isConnected) showFor(target)
      }, SHOW_DELAY)
    }

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || !(target instanceof HTMLElement)) return
      const el = (target.closest('[data-tooltip],[title]') as HTMLElement | null) || null
      if (el) {
        stealTitle(el)
        scheduleShow(el)
      } else hide()
    }
    const onMouseOut = (e: MouseEvent) => {
      const to = (e.relatedTarget as HTMLElement | null) || null
      if (to && to instanceof HTMLElement && to.closest('[data-tooltip]')) return
      hide()
    }
    const onDown = () => {
      cancelScheduledShow()
      setTip(initialState)
    }
    const onScroll = () => {
      cancelScheduledShow()
      setTip(initialState)
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', onScroll, true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (showTimer.current) clearTimeout(showTimer.current)
    }
  }, [])

  if (!tip.visible) return null
  return (
    <div
      className="fixed z-[100001] px-2.5 py-1 bg-zinc-950/95 border border-zinc-700/80 text-[11px] font-medium text-white rounded-lg whitespace-nowrap pointer-events-none shadow-xl backdrop-blur-md transition-all duration-150"
      style={{ left: tip.left, top: tip.top, transform: tip.transform }}
    >
      {tip.text}
    </div>
  )
}

export default GlobalTooltip
