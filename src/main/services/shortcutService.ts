import { globalShortcut, BrowserWindow } from 'electron'

export function sendShortcutAction(action: string, getWin: () => BrowserWindow | null): void {
  const win = getWin()
  if (win && !win.isDestroyed()) {
    win.webContents.send('global-shortcut', action)
  }
}

export function registerGlobalShortcuts(getWin: () => BrowserWindow | null): void {
  const send = (action: string) => sendShortcutAction(action, getWin)

  globalShortcut.register('CommandOrControl+Right', () => send('next'))
  globalShortcut.register('CommandOrControl+Left', () => send('prev'))
  globalShortcut.register('CommandOrControl+Up', () => send('vol-up'))
  globalShortcut.register('CommandOrControl+Down', () => send('vol-down'))
  globalShortcut.register('CommandOrControl+Space', () => send('play-pause'))
  globalShortcut.register('MediaPlayPause', () => send('play-pause'))
  globalShortcut.register('MediaNextTrack', () => send('next'))
  globalShortcut.register('MediaPreviousTrack', () => send('prev'))
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
