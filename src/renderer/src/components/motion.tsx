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

// Tiered easings: one soft enter curve for everything that appears,
// one snappy exit curve for everything that leaves. Replaces the old
// single 'easeOut' shared by all surfaces (which felt flat/stiff).
export const EASE_ENTER: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1]

// Spring for physical surfaces (drawer / toast / batch bar): mass + damping
// instead of a fixed tween so motion has weight and settles naturally.
export const SPRING_SOFT = { type: 'spring', stiffness: 350, damping: 32, mass: 0.9 } as const

// Mirrors main.css: popovers 0.22s enter (EASE_ENTER), exit 0.15s EASE_EXIT
export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.15, ease: EASE_EXIT } },
  transition: { duration: 0.22, ease: EASE_ENTER }
}

export const dialogScale = {
  initial: { opacity: 0, scale: 0.95, y: 8, filter: 'blur(6px)' },
  animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.15, ease: EASE_EXIT } },
  transition: { duration: 0.32, ease: EASE_ENTER }
}

export const toastSlide = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15, ease: EASE_EXIT } },
  transition: { ...SPRING_SOFT }
}

// Mirrors main.css drawer-out 0.15s EASE_EXIT (enter is spring, no fixed duration)
// shortcut: exit flips to absolute so the ghost leaves flex flow instantly —
// the flex-1 content column (motion.div layout in App.tsx) expands concurrently
// instead of waiting for the drawer to unmount.
// Enter staggers via drawerEnterDelay: the drawer mounts in-flow but holds
// still (invisible) while the content column resizes first, then springs in.
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
    transition: { duration: 0.15, ease: EASE_EXIT }
  },
  transition: { ...SPRING_SOFT }
}

// Enter stagger for side drawers: hold the invisible drawer in-flow while the
// content column finishes its layout resize, then spring in. Shortened so the
// overlap feels continuous instead of sequential.
export const drawerEnterDelay = 0.13

// Mirrors main.css fadeInSlideUp 0.38s EASE_ENTER (view routing, key-remount enter only)
// Depth: fade + rise + settle scale + blur release instead of flat y-only slide.
export const viewFade = {
  initial: { opacity: 0, y: 12, scale: 0.985, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  transition: { duration: 0.38, ease: EASE_ENTER }
}

// Fullscreen lyrics: same soft enter as viewFade (tab switch 0.38s EASE_ENTER).
// shortcut: exit flips to absolute so the ghost leaves flex flow instantly —
// the main column + side drawer lay out correctly while it fades above them.
// (MAIN SHELL in App.tsx must stay relative as its offset parent.)
export const lyricsMax = {
  initial: { opacity: 0, y: 12, scale: 0.985, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  exit: {
    opacity: 0,
    y: 10,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transition: { duration: 0.15, ease: EASE_EXIT }
  },
  transition: { duration: 0.38, ease: EASE_ENTER }
}

// Horizontal view-mode switch (table/grid/compact). Direction comes from
// AnimatePresence custom — NOT from per-render props — so the exiting view
// leaves toward the opposite side of the entering one:
//   travel right: old exits left (-x), new enters from right (+x), and mirrored.
// Usage: <AnimatePresence mode="popLayout" initial={false} custom={dir}>
//          <motion.div key={mode} custom={dir} variants={viewModeSlideVariants} ... />
// initial={false} keeps mounts from view/drill switches on the outer fade-up only.
// popLayout (not "wait") overlaps exit + enter so there is no blank frame gap;
// the shared transition carries a small enter delay for the same reason.
export const viewModeSlideVariants = {
  initial: (direction: 'left' | 'right') => ({
    opacity: 0,
    x: direction === 'left' ? -22 : 22
  }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: 'left' | 'right') => ({
    opacity: 0,
    x: direction === 'left' ? 22 : -22,
    transition: { duration: 0.15, ease: EASE_EXIT }
  })
}

export const viewModeSlideTransition = { duration: 0.3, ease: EASE_ENTER, delay: 0.05 }

// Opt-in list stagger for short lists (headers, menus). NOT for virtualized
// rows / dnd-kit items / high-frequency paths — keep those to one-shot CSS.
export const listStagger = {
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } }
}

export const listStaggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_ENTER } }
}
