import React, { useState } from 'react'
import { Home, Library, Disc, Mic2, Tag, ListPlus, Cloud, Settings, ChevronDown, ChevronRight, FolderDown } from 'lucide-react'
import logoImg from '../../../../resources/HoT_Chibi_Icon.png'
import { useTranslation } from '../locales'

import { useUIStore } from '../stores/uiStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useSettingsStore } from '../stores/settingsStore'

interface SidebarProps {
  activeView?: string
  setActiveView?: (view: any) => void
  setSearchQuery?: (q: string) => void
  setSearchInput?: (q: string) => void
  setActiveAlbum?: (a: any) => void
  setActivePlaylist?: (p: any) => void
  setActiveArtist?: (a: any) => void
  setActiveGenre?: (g: any) => void
  setActiveUserPlaylist?: (p: any) => void
  fetchDashboard: () => void
  fetchScDashboard?: () => void
  isCore?: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeView: propActiveView, 
  setActiveView: propSetActiveView, 
  setSearchQuery: propSetSearchQuery, 
  setSearchInput: propSetSearchInput, 
  setActiveAlbum: propSetActiveAlbum, 
  setActivePlaylist: propSetActivePlaylist, 
  setActiveArtist: propSetActiveArtist, 
  setActiveGenre: propSetActiveGenre, 
  setActiveUserPlaylist: propSetActiveUserPlaylist,
  fetchDashboard, 
  fetchScDashboard, 
  isCore: propIsCore 
}) => {
  const storeActiveView = useUIStore((s) => s.activeView)
  const storeSetActiveView = useUIStore((s) => s.setActiveView)
  const storeSetSearchQuery = useLibraryStore((s) => s.setSearchQuery)
  const storeSetSearchInput = useLibraryStore((s) => s.setSearchInput)
  const storeSetActiveAlbum = useLibraryStore((s) => s.setActiveAlbum)
  const storeSetActivePlaylist = useLibraryStore((s) => s.setActivePlaylist)
  const storeSetActiveArtist = useLibraryStore((s) => s.setActiveArtist)
  const storeSetActiveGenre = useLibraryStore((s) => s.setActiveGenre)
  const storeSetActiveUserPlaylist = useLibraryStore((s) => s.setActiveUserPlaylist)
  const storeAppMode = useSettingsStore((s) => s.appMode)

  const activeView = propActiveView !== undefined ? propActiveView : storeActiveView
  const setActiveView = propSetActiveView || storeSetActiveView
  const setSearchQuery = propSetSearchQuery || storeSetSearchQuery
  const setSearchInput = propSetSearchInput || storeSetSearchInput
  const setActiveAlbum = propSetActiveAlbum || storeSetActiveAlbum
  const setActivePlaylist = propSetActivePlaylist || storeSetActivePlaylist
  const setActiveArtist = propSetActiveArtist || storeSetActiveArtist
  const setActiveGenre = propSetActiveGenre || storeSetActiveGenre
  const setActiveUserPlaylist = propSetActiveUserPlaylist || storeSetActiveUserPlaylist
  const isCore = propIsCore !== undefined ? propIsCore : storeAppMode === 'core'
  const { t } = useTranslation()
  const isHomeActive = activeView === 'home' || activeView === 'home-ytm' || activeView === 'home-soundcloud'
  const [isHomeExpanded, setIsHomeExpanded] = useState<boolean>(true)

  const handleHomeParentClick = () => {
    if (activeView !== 'home') {
      handleNavClick('home')
    } else {
      setIsHomeExpanded(prev => !prev)
    }
  }

  const handleNavClick = (view: string) => {
    setActiveView(view as any)
    setSearchQuery('')
    setSearchInput('')
    if (view === 'home') {
      setActiveAlbum(null)
    }
    if (view === 'home-ytm') { 
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
    <aside className="w-[15vw] min-w-[190px] max-w-[260px] h-full bg-theme-60/80 backdrop-blur-md border-r border-theme-30/50 flex flex-col shrink-0 transition-all z-20 select-none overflow-hidden">
      {/* CỐ ĐỊNH: Logo & Tiêu đề ứng dụng */}
      <div className="p-4 pb-3 shrink-0 border-b border-theme-30/20">
        <h1 className="text-2xl font-whisper text-theme-10 tracking-widest flex items-center gap-2 opacity-90" style={{ letterSpacing: '2px' }}>
          <img loading="lazy" src={logoImg} alt="Logo" className="w-7 h-7 object-contain shrink-0" /> 
          <span className="truncate mt-0.5">Mei's Radio</span>
        </h1>
      </div>

      {/* CUỘN MƯỢT KHÔNG HIỆN THANH KÉO (NO SCROLLBAR) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-3 space-y-4">
        <nav className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-theme-30 tracking-widest uppercase mb-2 px-1">{t('sidebar.library')}</p>
            <ul className="space-y-0.5">
              {!isCore ? (
                <li className="space-y-0.5">
                  <div 
                    onClick={handleHomeParentClick} 
                    className={`flex items-center justify-between cursor-pointer py-1.5 px-2 rounded-md transition-colors ${
                      isHomeActive ? 'bg-theme-10/15 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-sm">
                      <Home size={17} /> 
                      <span>{t('sidebar.home')}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setIsHomeExpanded(prev => !prev); }} 
                      className="p-1 hover:text-white transition cursor-pointer"
                    >
                      {isHomeExpanded ? <ChevronDown size={14} className="text-zinc-500 hover:text-zinc-300" /> : <ChevronRight size={14} className="text-zinc-500 hover:text-zinc-300" />}
                    </button>
                  </div>

                  {/* Mục con mở rộng: Dashboard, YouTube Music & SoundCloud */}
                  {isHomeExpanded && (
                    <div className="pl-5 space-y-0.5 pt-0.5 animate-fade-in">
                      <div 
                        onClick={() => handleNavClick('home')}
                        className={`flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                          activeView === 'home'
                            ? 'bg-theme-10/20 text-theme-10 border border-theme-10/30' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-theme-10 shrink-0"></span>
                        <span className="truncate">{t('sidebar.dashboard')}</span>
                      </div>

                      <div 
                        onClick={() => handleNavClick('home-ytm')}
                        className={`flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                          activeView === 'home-ytm'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                        <span className="truncate">{t('sidebar.youtubeMusic')}</span>
                      </div>

                      <div 
                        onClick={() => handleNavClick('home-soundcloud')}
                        className={`flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                          activeView === 'home-soundcloud' 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        <span className="truncate">{t('sidebar.soundCloud')}</span>
                      </div>
                    </div>
                  )}
                </li>
              ) : (
                <li onClick={() => handleNavClick('home')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'home' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                  <Home size={17} /> <span>{t('sidebar.home')}</span>
                </li>
              )}
              <li onClick={() => handleNavClick('songs')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'songs' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Library size={17} /> <span>{t('sidebar.songList')}</span></li>
              <li onClick={() => handleNavClick('playlists')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'playlists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Disc size={17} /> <span>{t('sidebar.myPlaylists')}</span></li>
              <li onClick={() => handleNavClick('artists')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'artists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Mic2 size={17} /> <span>{t('sidebar.artists')}</span></li>
              <li onClick={() => handleNavClick('genres')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'genres' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Tag size={17} /> <span>{t('sidebar.genres')}</span></li>
              <li onClick={() => handleNavClick('user-playlists')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'user-playlists' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><ListPlus size={17} /> <span>{t('sidebar.userPlaylists')}</span></li>
              <li onClick={() => handleNavClick('downloads')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'downloads' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><FolderDown size={17} /> <span>{t('sidebar.downloads')}</span></li>
            </ul>
          </div>
          
          {!isCore && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 tracking-widest uppercase mb-2 px-1">{t('sidebar.cloudConnection')}</p>
              <ul className="space-y-0.5">
                <li onClick={() => handleNavClick('drive')} className={`flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${activeView === 'drive' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Cloud size={17} /> <span>{t('sidebar.googleDrive')}</span></li>
              </ul>
            </div>
          )}
        </nav>
      </div>

      {/* CỐ ĐỊNH: Nút Cài đặt luôn ghim ở đáy */}
      <div className="p-3 shrink-0 border-t border-theme-30/30 bg-theme-60/40">
        <div onClick={() => handleNavClick('settings')} className={`flex items-center gap-2.5 cursor-pointer py-2 px-2.5 rounded-md text-sm transition-colors ${activeView === 'settings' ? 'bg-theme-10/20 text-theme-10 font-medium' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
          <Settings size={17} /> <span>{t('sidebar.settings')}</span>
        </div>
      </div>
    </aside>
  )
}