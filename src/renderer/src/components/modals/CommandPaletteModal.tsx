import React, { useState, useEffect, useRef, useMemo } from 'react'
import { 
  Search, Play, Pause, Sliders, Radio, 
  Activity, BarChart3, Download, Settings, Music, Home, Disc, 
  Clock, ShieldCheck, Volume2
} from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { removeAccents } from '../../utils/textUtils'

interface CommandPaletteModalProps {
  onPlayTrack: (track: any) => void
  onStartRadio: () => void
}

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  category: 'action' | 'navigation' | 'playback' | 'track'
  action: () => void
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({ onPlayTrack, onStartRadio }) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const show = useUIStore((s) => s.showCommandPalette)
  const setShow = useUIStore((s) => s.setShowCommandPalette)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const setShowEQ = useUIStore((s) => s.setShowEQ)
  const setShowSpectrogram = useUIStore((s) => s.setShowSpectrogramModal)
  const setIsMiniPlayer = useUIStore((s) => s.setIsMiniPlayer)
  const setShowInsights = useUIStore((s) => s.setShowInsightsModal)
  const setShowBackup = useUIStore((s) => s.setShowBackupModal)

  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const bitPerfectEnabled = usePlayerStore((s) => s.bitPerfectEnabled)
  const setBitPerfectEnabled = usePlayerStore((s) => s.setBitPerfectEnabled)
  const setSleepTimerMode = usePlayerStore((s) => s.setSleepTimerMode)

  const libraryTracks = useLibraryStore((s) => s.libraryTracks)
  const loudnessNormalization = useSettingsStore((s) => s.loudnessNormalization)
  const setLoudnessNormalization = useSettingsStore((s) => s.setLoudnessNormalization)

  useEffect(() => {
    if (show) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [show])

  // Built-in commands
  const defaultCommands: CommandItem[] = useMemo(() => [
    {
      id: 'radio',
      title: 'Bắt đầu phát Radio từ bài hát này (Smart Radio)',
      subtitle: currentTrack ? `Dựa trên "${currentTrack.title}"` : 'Tạo playlist thông minh theo phong cách',
      icon: <Radio size={16} className="text-emerald-400" />,
      category: 'action',
      action: () => {
        onStartRadio()
        setShow(false)
      }
    },
    {
      id: 'insights',
      title: 'Thống kê thói quen nghe nhạc (Mei\'s Music Insights)',
      subtitle: 'Xem thời gian nghe, top nghệ sĩ, định dạng lossless',
      icon: <BarChart3 size={16} className="text-violet-400" />,
      category: 'action',
      action: () => {
        setShow(false)
        setShowInsights(true)
      }
    },
    {
      id: 'backup',
      title: 'Sao lưu & Xuất playlist (.m3u8 / Backup Config)',
      subtitle: 'Xuất file m3u8 hoặc sao lưu cấu hình toàn bộ playlist',
      icon: <Download size={16} className="text-cyan-400" />,
      category: 'action',
      action: () => {
        setShow(false)
        setShowBackup(true)
      }
    },
    {
      id: 'play-pause',
      title: isPlaying ? 'Tạm dừng nhạc (Pause)' : 'Tiếp tục phát nhạc (Play)',
      icon: isPlaying ? <Pause size={16} className="text-amber-400" /> : <Play size={16} className="text-emerald-400" />,
      category: 'playback',
      action: () => {
        setIsPlaying(!isPlaying)
        setShow(false)
      }
    },
    {
      id: 'wasapi-toggle',
      title: bitPerfectEnabled ? 'Tắt chế độ Bit-Perfect (WASAPI Shared)' : 'Bật chế độ Bit-Perfect (WASAPI Exclusive)',
      subtitle: 'Bypass bộ trộn âm thanh Windows để đạt chất lượng nguyên bản',
      icon: <ShieldCheck size={16} className="text-purple-400" />,
      category: 'action',
      action: async () => {
        const nextVal = !bitPerfectEnabled
        try {
          if ((window as any).api?.setBitPerfect) {
            await (window as any).api.setBitPerfect(nextVal)
          }
        } catch (_) {}
        setBitPerfectEnabled(nextVal)
        setShow(false)
      }
    },
    {
      id: 'loudness-toggle',
      title: loudnessNormalization ? 'Tắt chuẩn hóa âm lượng (Loudness Normalization: TẮT)' : 'Bật chuẩn hóa âm lượng (Loudness Normalization: BẬT)',
      subtitle: 'Cân bằng âm lượng đồng đều giữa mọi bài hát',
      icon: <Volume2 size={16} className="text-sky-400" />,
      category: 'action',
      action: () => {
        setLoudnessNormalization(!loudnessNormalization)
        setShow(false)
      }
    },
    {
      id: 'eq',
      title: 'Mở Bộ cân bằng âm thanh (Parametric Equalizer)',
      subtitle: 'Tinh chỉnh băng tần âm thanh và nạp profile AutoEQ',
      icon: <Sliders size={16} className="text-blue-400" />,
      category: 'action',
      action: () => {
        setShow(false)
        setShowEQ(true)
      }
    },
    {
      id: 'spectrogram',
      title: 'Mở WebGL Spectrogram thời gian thực',
      subtitle: 'Xem biểu đồ nhiệt phân tích tần số âm thanh',
      icon: <Activity size={16} className="text-teal-400" />,
      category: 'action',
      action: () => {
        setShow(false)
        setShowSpectrogram(true)
      }
    },
    {
      id: 'mini-player',
      title: 'Chuyển sang Mini Player (Picture-in-Picture)',
      subtitle: 'Thu nhỏ cửa sổ điều khiển gọn gàng',
      icon: <Disc size={16} className="text-rose-400" />,
      category: 'action',
      action: () => {
        setShow(false)
        setIsMiniPlayer(true)
      }
    },
    {
      id: 'timer-30',
      title: 'Hẹn giờ tắt nhạc: 30 phút',
      icon: <Clock size={16} className="text-orange-400" />,
      category: 'action',
      action: () => {
        setSleepTimerMode('30')
        setShow(false)
      }
    },
    {
      id: 'nav-home',
      title: 'Đi tới: Trang chủ (Home)',
      icon: <Home size={16} className="text-zinc-400" />,
      category: 'navigation',
      action: () => {
        setActiveView('home')
        setShow(false)
      }
    },
    {
      id: 'nav-songs',
      title: 'Đi tới: Tất cả bài hát (Songs)',
      icon: <Music size={16} className="text-zinc-400" />,
      category: 'navigation',
      action: () => {
        setActiveView('songs')
        setShow(false)
      }
    },
    {
      id: 'nav-settings',
      title: 'Đi tới: Cài đặt (Settings)',
      icon: <Settings size={16} className="text-zinc-400" />,
      category: 'navigation',
      action: () => {
        setActiveView('settings')
        setShow(false)
      }
    }
  ], [isPlaying, bitPerfectEnabled, loudnessNormalization, currentTrack, onStartRadio])

  // Filter commands and matching tracks
  const filteredItems = useMemo(() => {
    const q = removeAccents(query.trim().toLowerCase())
    if (!q) return defaultCommands

    const matchingCommands = defaultCommands.filter(c => 
      removeAccents(c.title.toLowerCase()).includes(q) || 
      (c.subtitle && removeAccents(c.subtitle.toLowerCase()).includes(q))
    )

    const matchingTracks = libraryTracks
      .filter(t => 
        removeAccents((t.title || '').toLowerCase()).includes(q) ||
        removeAccents((t.artist || '').toLowerCase()).includes(q) ||
        removeAccents((t.album || '').toLowerCase()).includes(q)
      )
      .slice(0, 10)
      .map((t): CommandItem => ({
        id: `track-${t.id || t.filePath}`,
        title: t.title || 'Unknown Title',
        subtitle: `${t.artist || 'Unknown Artist'} • ${t.album || ''}`,
        icon: <Play size={14} className="text-theme-10" />,
        category: 'track',
        action: () => {
          onPlayTrack(t)
          setShow(false)
        }
      }))

    return [...matchingCommands, ...matchingTracks]
  }, [query, defaultCommands, libraryTracks, onPlayTrack])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredItems.length])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShow(false)
      return
    }
    if (filteredItems.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length)
      scrollSelectedIntoView((selectedIndex + 1) % filteredItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
      scrollSelectedIntoView((selectedIndex - 1 + filteredItems.length) % filteredItems.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filteredItems[selectedIndex]
      if (item) item.action()
    }
  }

  const scrollSelectedIntoView = (index: number) => {
    if (!listRef.current) return
    const el = listRef.current.children[index] as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }

  if (!show) return null

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center pt-24 p-4 animate-fade-in"
      onClick={() => setShow(false)}
    >
      <div 
        className="w-[620px] max-w-full bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800">
          <Search size={18} className="text-zinc-400 shrink-0" />
          <input 
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tìm bài hát, nghệ sĩ hoặc gõ lệnh điều khiển... (Ctrl + K)"
            className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
          />
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1 select-none">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              Không tìm thấy lệnh hoặc bài hát phù hợp
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition text-xs ${
                    isSelected 
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-white' 
                      : 'hover:bg-zinc-800/60 text-zinc-300'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isSelected ? 'text-emerald-400 font-semibold' : 'text-zinc-200'}`}>
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-emerald-400 font-mono font-semibold shrink-0">
                      Enter ↵
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">↓</kbd> Di chuyển</span>
            <span><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">↵</kbd> Chọn</span>
          </div>
          <span>Mei's Spotlight</span>
        </div>
      </div>
    </div>
  )
}
