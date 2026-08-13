import React from 'react'
import { Home, Library, ListMusic, Cloud, Settings } from 'lucide-react'
import logoImg from '../../../../resources/HoT_Chibi_Icon.png'

interface SidebarProps {
  activeView: string
  setActiveView: (view: any) => void
  setSearchQuery: (q: string) => void
  setSearchInput: (q: string) => void
  setActiveAlbum: (a: any) => void
  setActivePlaylist: (p: any) => void
  fetchDashboard: () => void
  isCore: boolean // <-- MỚI: Nhận trạng thái Core Mode
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, setActiveView, setSearchQuery, setSearchInput, 
  setActiveAlbum, setActivePlaylist, fetchDashboard, isCore 
}) => {
  const handleNavClick = (view: string) => {
    setActiveView(view)
    setSearchQuery('')
    setSearchInput('')
    if (view === 'home') { setActiveAlbum(null); fetchDashboard(); }
    if (view === 'playlists') setActivePlaylist(null)
  }

  return (
    <aside className="w-64 bg-theme-60/60 backdrop-blur-md border-r border-theme-30/50 flex flex-col justify-between shrink-0 transition-all z-20">
      <div className="p-6 space-y-8">
        <h1 className="text-3xl font-whisper text-theme-10 tracking-widest flex items-center gap-2 opacity-90" style={{ letterSpacing: '2px' }}>
          <img loading="lazy" src={logoImg} alt="Logo" className="w-8 h-8 object-contain" /> 
          <span style={{ marginTop: '4px' }}>Mei's Radio</span>
        </h1>
        <nav className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-theme-30 tracking-widest uppercase mb-3">Thư viện</p>
            <ul className="space-y-2">
              {!isCore && (
                <li onClick={() => handleNavClick('home')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'home' ? 'bg-theme-10/20 text-theme-10' : 'text-zinc-400 hover:text-white'}`}><Home size={18} /> Trang chủ</li>
              )}
              <li onClick={() => handleNavClick('songs')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'songs' ? 'bg-theme-10/20 text-theme-10' : 'text-zinc-400 hover:text-white'}`}><Library size={18} /> Danh sách bài hát</li>
              <li onClick={() => handleNavClick('playlists')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'playlists' ? 'bg-theme-10/20 text-theme-10' : 'text-zinc-400 hover:text-white'}`}><ListMusic size={18} /> Playlist của tôi</li>
              
              {/* Ẩn tab Stream trực tuyến nếu ở chế độ Core */}
            </ul>
          </div>
          
          {!isCore && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Liên kết cloud</p>
              <ul className="space-y-2">
                <li onClick={() => handleNavClick('drive')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'drive' ? 'bg-theme-10/20 text-theme-10' : 'text-zinc-400 hover:text-white'}`}><Cloud size={18} /> Google Drive</li>
              </ul>
            </div>
          )}
        </nav>
      </div>
      <div className="p-6">
        <div onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'settings' ? 'bg-theme-10/20 text-theme-10' : 'text-zinc-400 hover:text-white'}`}>
          <Settings size={18} /> Cài đặt
        </div>
      </div>
    </aside>
  )
}