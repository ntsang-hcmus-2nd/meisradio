import React, { useState } from 'react'
import { Home, Library, Disc, Mic2, Tag, ListPlus, Cloud, Settings, ChevronDown, ChevronRight } from 'lucide-react'
import logoImg from '../../../../resources/HoT_Chibi_Icon.png'
import { useTranslation } from '../locales'

interface SidebarProps {
  activeView: string
  setActiveView: (view: any) => void
  setSearchQuery: (q: string) => void
  setSearchInput: (q: string) => void
  setActiveAlbum: (a: any) => void
  setActivePlaylist: (p: any) => void
  setActiveArtist?: (a: any) => void
  setActiveGenre?: (g: any) => void
  setActiveUserPlaylist?: (p: any) => void
  fetchDashboard: () => void
  fetchScDashboard?: () => void
  isCore: boolean // <-- MỚI: Nhận trạng thái Core Mode
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, setActiveView, setSearchQuery, setSearchInput, 
  setActiveAlbum, setActivePlaylist, setActiveArtist, setActiveGenre, setActiveUserPlaylist,
  fetchDashboard, fetchScDashboard, isCore 
}) => {
  const { t } = useTranslation()
  const isHomeActive = activeView === 'home' || activeView === 'home-ytm' || activeView === 'home-soundcloud'
  const [isHomeExpanded, setIsHomeExpanded] = useState<boolean>(true)

  const handleHomeParentClick = () => {
    setIsHomeExpanded(prev => !prev)
    if (!isHomeActive) {
      handleNavClick('home-ytm')
    }
  }

  const handleNavClick = (view: string) => {
    setActiveView(view)
    setSearchQuery('')
    setSearchInput('')
    if (view === 'home' || view === 'home-ytm') { 
      setActiveAlbum(null)
      fetchDashboard() 
    }
    if (view === 'home-soundcloud') {
      setActiveAlbum(null)
      if (fetchScDashboard) fetchScDashboard()
    }
    if (view === 'playlists') setActivePlaylist(null)
    if (setActiveArtist && view === 'artists') setActiveArtist(null)
    if (setActiveGenre && view === 'genres') setActiveGenre(null)
    if (setActiveUserPlaylist && view === 'user-playlists') setActiveUserPlaylist(null)
  }

  return (
    <aside className="w-[15vw] min-w-[200px] max-w-[300px] bg-theme-60/60 backdrop-blur-md border-r border-theme-30/50 flex flex-col justify-between shrink-0 transition-all z-20 select-none">
      <div className="p-6 space-y-8">
        <h1 className="text-3xl font-whisper text-theme-10 tracking-widest flex items-center gap-2 opacity-90" style={{ letterSpacing: '2px' }}>
          <img loading="lazy" src={logoImg} alt="Logo" className="w-8 h-8 object-contain" /> 
          <span style={{ marginTop: '4px' }}>Mei's Radio</span>
        </h1>
        <nav className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-theme-30 tracking-widest uppercase mb-3">{t('sidebar.library')}</p>
            <ul className="space-y-1">
              {!isCore && (
                <li className="space-y-1">
                  <div 
                    onClick={handleHomeParentClick} 
                    className={`flex items-center justify-between cursor-pointer p-2 rounded-md transition-colors ${
                      isHomeActive ? 'bg-theme-10/15 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Home size={18} /> 
                      <span>{t('sidebar.home')}</span>
                    </div>
                    {isHomeExpanded ? <ChevronDown size={15} className="text-zinc-500" /> : <ChevronRight size={15} className="text-zinc-500" />}
                  </div>

                  {/* Mục con mở rộng: YouTube Music & SoundCloud */}
                  {isHomeExpanded && (
                    <div className="pl-6 space-y-1 pt-1 animate-fade-in">
                      <div 
                        onClick={() => handleNavClick('home-ytm')}
                        className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2.5 rounded-md text-xs font-medium transition-all ${
                          (activeView === 'home' || activeView === 'home-ytm')
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                        <span className="truncate">{t('sidebar.youtubeMusic')}</span>
                      </div>

                      <div 
                        onClick={() => handleNavClick('home-soundcloud')}
                        className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2.5 rounded-md text-xs font-medium transition-all ${
                          activeView === 'home-soundcloud' 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                        <span className="truncate">{t('sidebar.soundCloud')}</span>
                      </div>
                    </div>
                  )}
                </li>
              )}
              <li onClick={() => handleNavClick('songs')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'songs' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Library size={18} /> {t('sidebar.songList')}</li>
              <li onClick={() => handleNavClick('playlists')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'playlists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Disc size={18} /> {t('sidebar.myPlaylists')}</li>
              <li onClick={() => handleNavClick('artists')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'artists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Mic2 size={18} /> {t('sidebar.artists')}</li>
              <li onClick={() => handleNavClick('genres')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'genres' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Tag size={18} /> {t('sidebar.genres')}</li>
              <li onClick={() => handleNavClick('user-playlists')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'user-playlists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><ListPlus size={18} /> {t('sidebar.userPlaylists')}</li>
              
              {/* Ẩn tab Stream trực tuyến nếu ở chế độ Core */}
            </ul>
          </div>
          
          {!isCore && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 tracking-widest uppercase mb-3">{t('sidebar.cloudConnection')}</p>
              <ul className="space-y-2">
                <li onClick={() => handleNavClick('drive')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'drive' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Cloud size={18} /> {t('sidebar.googleDrive')}</li>
              </ul>
            </div>
          )}
        </nav>
      </div>
      <div className="p-6">
        <div onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 cursor-pointer p-2 rounded-md transition-colors ${activeView === 'settings' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
          <Settings size={18} /> {t('sidebar.settings')}
        </div>
      </div>
    </aside>
  )
}