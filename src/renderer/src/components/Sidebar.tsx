import React from 'react'
import { Home, Library, ListMusic, Cloud, Settings, Wifi } from 'lucide-react'
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
    <aside className="w-64 bg-zinc-900/40 border-r border-zinc-800/50 flex flex-col justify-between shrink-0 transition-all">
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold text-white tracking-wider flex items-center gap-2 opacity-90">
          <img loading="lazy" src={logoImg} alt="Logo" className="w-8 h-8 object-contain" /> 
          MEI'S RADIO
        </h1>
        <nav className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Thư viện</p>
            <ul className="space-y-2">
              {!isCore && (
                <li onClick={() => handleNavClick('home')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'home' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}><Home size={18} /> Trang chủ</li>
              )}
              <li onClick={() => handleNavClick('songs')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'songs' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}><Library size={18} /> Danh sách bài hát</li>
              <li onClick={() => handleNavClick('playlists')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'playlists' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}><ListMusic size={18} /> Playlist của tôi</li>
              
              {/* Ẩn tab Stream trực tuyến nếu ở chế độ Core */}
            </ul>
          </div>
          
          {!isCore && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">Liên kết cloud</p>
              <ul className="space-y-2">
                <li onClick={() => handleNavClick('drive')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'drive' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-white'}`}><Cloud size={18} /> Google Drive</li>
              </ul>
            </div>
          )}
        </nav>
      </div>
      <div className="p-6">
        <div onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'settings' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
          <Settings size={18} /> Cài đặt
        </div>
      </div>
    </aside>
  )
}