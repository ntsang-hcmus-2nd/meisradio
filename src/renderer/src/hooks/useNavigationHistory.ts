import { useRef, useEffect, useCallback } from 'react'
import { useUIStore, useLibraryStore } from '../stores'

interface UseNavigationHistoryProps {
  fetchDashboard?: () => void
  fetchScDashboard?: () => void
}

export function useNavigationHistory({
  fetchDashboard,
  fetchScDashboard
}: UseNavigationHistoryProps = {}) {
  const { activeView, setActiveView } = useUIStore()
  const {
    activeAlbum,
    setActiveAlbum,
    activeArtist,
    setActiveArtist,
    activeGenre,
    setActiveGenre,
    activePlaylist,
    setActivePlaylist,
    activeUserPlaylist,
    setActiveUserPlaylist,
    searchQuery,
    setSearchQuery,
    searchInput,
    setSearchInput
  } = useLibraryStore()

  const navHistoryRef = useRef<any[]>([])
  const navForwardRef = useRef<any[]>([])
  const isNavigatingRef = useRef(false)

  const captureNavState = useCallback(
    () => ({
      activeView,
      activeAlbum,
      activeArtist,
      activeGenre,
      activePlaylist,
      activeUserPlaylist,
      searchQuery,
      searchInput
    }),
    [
      activeView,
      activeAlbum,
      activeArtist,
      activeGenre,
      activePlaylist,
      activeUserPlaylist,
      searchQuery,
      searchInput
    ]
  )

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false
      return
    }
    const current = captureNavState()
    const last = navHistoryRef.current[navHistoryRef.current.length - 1]
    if (
      !last ||
      last.activeView !== current.activeView ||
      last.activeAlbum !== current.activeAlbum ||
      last.activeArtist !== current.activeArtist ||
      last.activeGenre !== current.activeGenre ||
      last.activePlaylist !== current.activePlaylist ||
      last.activeUserPlaylist !== current.activeUserPlaylist ||
      last.searchQuery !== current.searchQuery
    ) {
      navHistoryRef.current.push(current)
      navForwardRef.current = []
      if (navHistoryRef.current.length > 50) {
        navHistoryRef.current.shift()
      }
    }
  }, [
    activeView,
    activeAlbum,
    activeArtist,
    activeGenre,
    activePlaylist,
    activeUserPlaylist,
    searchQuery,
    captureNavState
  ])

  const handleNavBack = useCallback(() => {
    if (activeAlbum) {
      setActiveAlbum(null)
      return
    }
    if (activeArtist) {
      setActiveArtist(null)
      return
    }
    if (activeGenre) {
      setActiveGenre(null)
      return
    }
    if (activePlaylist) {
      setActivePlaylist(null)
      return
    }
    if (activeUserPlaylist) {
      setActiveUserPlaylist(null)
      return
    }
    if (
      (activeView === 'home' || activeView === 'home-ytm' || activeView === 'home-soundcloud') &&
      (searchQuery || searchInput)
    ) {
      setSearchInput('')
      setSearchQuery('')
      if (activeView === 'home' || activeView === 'home-ytm') fetchDashboard?.()
      if (activeView === 'home-soundcloud') fetchScDashboard?.()
      return
    }

    if (navHistoryRef.current.length > 1) {
      const currentState = navHistoryRef.current.pop()
      if (currentState) {
        navForwardRef.current.push(currentState)
      }
      const prevState = navHistoryRef.current[navHistoryRef.current.length - 1]
      if (prevState) {
        isNavigatingRef.current = true
        setActiveView(prevState.activeView)
        setActiveAlbum(prevState.activeAlbum)
        setActiveArtist(prevState.activeArtist)
        setActiveGenre(prevState.activeGenre)
        setActivePlaylist(prevState.activePlaylist)
        setActiveUserPlaylist(prevState.activeUserPlaylist)
        setSearchQuery(prevState.searchQuery)
        setSearchInput(prevState.searchInput)
      }
    }
  }, [
    activeAlbum,
    activeArtist,
    activeGenre,
    activePlaylist,
    activeUserPlaylist,
    activeView,
    searchQuery,
    searchInput,
    setActiveView,
    setActiveAlbum,
    setActiveArtist,
    setActiveGenre,
    setActivePlaylist,
    setActiveUserPlaylist,
    setSearchQuery,
    setSearchInput,
    fetchDashboard,
    fetchScDashboard
  ])

  const handleNavForward = useCallback(() => {
    if (navForwardRef.current.length > 0) {
      const nextState = navForwardRef.current.pop()
      if (nextState) {
        isNavigatingRef.current = true
        navHistoryRef.current.push(nextState)
        setActiveView(nextState.activeView)
        setActiveAlbum(nextState.activeAlbum)
        setActiveArtist(nextState.activeArtist)
        setActiveGenre(nextState.activeGenre)
        setActivePlaylist(nextState.activePlaylist)
        setActiveUserPlaylist(nextState.activeUserPlaylist)
        setSearchQuery(nextState.searchQuery)
        setSearchInput(nextState.searchInput)
      }
    }
  }, [
    setActiveView,
    setActiveAlbum,
    setActiveArtist,
    setActiveGenre,
    setActivePlaylist,
    setActiveUserPlaylist,
    setSearchQuery,
    setSearchInput
  ])

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        handleNavBack()
      } else if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        handleNavForward()
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('auxclick', handleMouseUp)

    // @ts-ignore
    const unlistenBack = window.api?.onNavBack?.(handleNavBack)
    // @ts-ignore
    const unlistenForward = window.api?.onNavForward?.(handleNavForward)

    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('auxclick', handleMouseUp)
      if (typeof unlistenBack === 'function') unlistenBack()
      if (typeof unlistenForward === 'function') unlistenForward()
    }
  }, [handleNavBack, handleNavForward])

  return {
    handleNavBack,
    handleNavForward
  }
}
