import { MotionConfig, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

// shortcut: only fade/scale/slide covered, add spring/layout only when a migrated island needs it
export function useMotionReduced(): boolean {
  const appMode = useSettingsStore((s) => s.appMode)
  const osReduced = useReducedMotion()
  return appMode !== 'default' || osReduced === true
}

export function MotionRoot({ children }: { children: ReactNode }): React.JSX.Element {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

// Mirrors main.css: fadeInSlideUp 0.3s ease-out, popovers 0.22s ease-out, exit 0.18s ease-out
export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.18, ease: 'easeOut' as const } },
  transition: { duration: 0.22, ease: 'easeOut' as const }
}

export const dialogScale = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: 'easeOut' as const } },
  transition: { duration: 0.22, ease: 'easeOut' as const }
}

export const toastSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6, transition: { duration: 0.18, ease: 'easeOut' as const } },
  transition: { duration: 0.22, ease: 'easeOut' as const }
}

// Mirrors main.css lyricsSlideIn 0.34s / lyricsSlideOut+drawer-out 0.26s ease-out
// shortcut: exit flips to absolute so the ghost leaves flex flow instantly —
// the flex-1 content column (motion.div layout in App.tsx) expands concurrently
// instead of waiting for the drawer to unmount.
// Enter staggers via drawerEnterDelay: the drawer mounts in-flow but holds
// still (invisible) while the content column resizes first, then slides in.
export const drawerSlide = {
  initial: { opacity: 0, x: '100%' },
  animate: { opacity: 1, x: 0 },
  exit: {
    opacity: 0,
    x: '100%',
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    transition: { duration: 0.26, ease: 'easeOut' as const }
  },
  transition: { duration: 0.34, ease: 'easeOut' as const }
}

// Enter stagger for side drawers: hold the invisible drawer in-flow while the
// content column finishes its ~0.3s layout resize, then slide+fade in.
export const drawerEnterDelay = 0.25

// Mirrors main.css fadeInSlideUp 0.3s ease-out (view routing, key-remount enter only)
export const viewFade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: 'easeOut' as const }
}

// Fullscreen lyrics: fade + slide-up, mirrors viewFade (tab switch 0.3s ease-out).
// shortcut: exit flips to absolute so the ghost leaves flex flow instantly —
// the main column + side drawer lay out correctly while it fades above them.
// (MAIN SHELL in App.tsx must stay relative as its offset parent.)
export const lyricsMax = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: {
    opacity: 0,
    y: 10,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transition: { duration: 0.18, ease: 'easeOut' as const }
  },
  transition: { duration: 0.3, ease: 'easeOut' as const }
}

// Horizontal view-mode switch (table/grid/compact). Direction comes from
// AnimatePresence custom — NOT from per-render props — so the exiting view
// leaves toward the opposite side of the entering one:
//   travel right: old exits left (-x), new enters from right (+x), and mirrored.
// Usage: <AnimatePresence mode="wait" initial={false} custom={dir}>
//          <motion.div key={mode} custom={dir} variants={viewModeSlideVariants} ... />
// initial={false} keeps mounts from view/drill switches on the outer fade-up only.
export const viewModeSlideVariants = {
  initial: (direction: 'left' | 'right') => ({
    opacity: 0,
    x: direction === 'left' ? -22 : 22
  }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: 'left' | 'right') => ({
    opacity: 0,
    x: direction === 'left' ? 22 : -22,
    transition: { duration: 0.18, ease: 'easeOut' as const }
  })
}

export const viewModeSlideTransition = { duration: 0.26, ease: 'easeOut' as const }
