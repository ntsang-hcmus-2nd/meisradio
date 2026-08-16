export type Language = 'en' | 'vi'

export interface TranslationDictionary {
  common: {
    appName: string
    cancel: string
    save: string
    confirm: string
    delete: string
    close: string
    loading: string
    search: string
    refresh: string
    refreshing: string
    options: string
    error: string
    success: string
    unknown: string
    songs: string
    files: string
    tracks: string
    hours: string
    minutes: string
    seconds: string
  }
  sidebar: {
    library: string
    home: string
    youtubeMusic: string
    soundCloud: string
    songList: string
    myPlaylists: string
    artists: string
    genres: string
    userPlaylists: string
    cloudConnection: string
    googleDrive: string
    settings: string
  }
  viewOptions: {
    table: string
    grid: string
    compact: string
  }
  header: {
    searchYtm: string
    searchSc: string
    searchLocal: string
    refreshLibrary: string
    refresh: string
    refreshing: string
  }
  trackTable: {
    index: string
    title: string
    album: string
    format: string
    duration: string
    actions: string
    sortIndex: string
    sortTitle: string
    sortAlbum: string
    sortFormat: string
    sortDuration: string
  }
  home: {
    ytmTitle: string
    ytmSubtitle: string
    refreshYtm: string
    ytmSynced: string
    ytmLogout: string
    ytmLogin: string
    noRecommendationsTitle: string
    noRecommendationsDesc: string
    playNow: string
    downloadToLib: string
    extractingYtm: string
    ytmPlaylist: string
    scTitle: string
    scSubtitle: string
    scMember: string
    scLogout: string
    scLogin: string
    refreshSc: string
    loadingSc: string
    noScTracksTitle: string
    noScTracksDesc: string
    genres: {
      all: string
      electronic: string
      hiphoprap: string
      pop: string
      chill: string
      rock: string
      ambient: string
      danceedm: string
    }
  }
  songsView: {
    searchResults: string
    songList: string
    addMusic: string
    noSongsMatched: string
    libraryNotConfigured: string
    libraryNotConfiguredDesc: string
  }
  artistsView: {
    title: string
    searchResults: string
    allArtists: string
    albums: string
    singlesAndTracks: string
    noArtists: string
    playAll: string
    shuffle: string
    artistCount: string
    trackCount: string
    albumCount: string
    backToArtists: string
  }
  genresView: {
    title: string
    searchResults: string
    allGenres: string
    noGenres: string
    genreCount: string
    playAll: string
    shuffle: string
    songsInGenre: string
    topArtists: string
    backToGenres: string
  }
  userPlaylistsView: {
    title: string
    searchResults: string
    createPlaylist: string
    playlistCount: string
    noPlaylists: string
    empty: string
    emptyPlaylist: string
    addSongs: string
    chooseCover: string
    deletePlaylist: string
    confirmDelete: string
    rename: string
    playAll: string
    shuffle: string
    removeFromPlaylist: string
    confirmRemove: string
  }
  driveView: {
    title: string
    enterFolderLink: string
    folderLinkDesc: string
    folderLinkPlaceholder: string
    scanning: string
    scanData: string
    emptyTitle: string
    emptyDesc: string
    foundResults: string
    foundAudioFiles: string
    streamAll: string
    downloadLossless: string
    processing: string
    originalFormat: string
  }
  playlistsView: {
    title: string
    searchResults: string
    createPlaylist: string
    autoCategorize: string
    noPlaylists: string
    playlistsAndAlbums: string
    chooseCover: string
    extractCover: string
    addExistingSongs: string
    importFromComputer: string
    noSongsMatched: string
    noResultsFound: string
  }
  settings: {
    title: string
    language: {
      title: string
      desc: string
      english: string
      vietnamese: string
    }
    customBg: {
      title: string
      useTrackCover: string
      placeholder: string
      applyLink: string
      chooseImage: string
      removeBg: string
      opacity: string
      blur: string
    }
    library: {
      title: string
      desc: string
      notSet: string
      change: string
      addFolder: string
      removeFolder: string
      updateFolder: string
      openFolder: string
      folderCount: string
      rescan: string
    }
    bitPerfect: {
      title: string
      label: string
      note: string
    }
    googleDrive: {
      title: string
      desc: string
      placeholder: string
      note: string
    }
    windowBehavior: {
      title: string
      onMinimize: string
      onMinimizeDesc: string
      minimizeTaskbar: string
      minimizeTray: string
      onClose: string
      onCloseDesc: string
      closeQuit: string
      closeTray: string
    }
    appMode: {
      title: string
      desc: string
      standard: string
      lite: string
      core: string
    }
  }
  player: {
    noTrack: string
    unknownArtist: string
    spectrogram: string
    lyrics: string
    miniPlayer: string
    queue: string
    equalizer: string
    volume: string
    shuffle: string
    repeatOff: string
    repeatAll: string
    repeatOne: string
    play: string
    pause: string
    next: string
    prev: string
  }
  lyrics: {
    title: string
    noLyrics: string
    syncing: string
    maximize: string
    minimize: string
  }
  queue: {
    title: string
    empty: string
  }
  contextMenu: {
    play: string
    addQueue: string
    addToPlaylist: string
    editTags: string
    showInFolder: string
    removeFromPlaylist: string
    deleteFile: string
    confirmDeleteFile: string
    confirmRemoveFromPlaylist: string
    playAll: string
    addSongs: string
    renamePlaylist: string
    changeCover: string
    extractCover: string
    openPlaylistFolder: string
    deletePlaylist: string
    confirmDeletePlaylist: string
    downloadToLib: string
  }
  modals: {
    addSongs: {
      title: string
      addCount: string
    }
    cloudAction: {
      desc: string
      streamDirect: string
      downloadDirect: string
      downloading: string
    }
    createPlaylist: {
      title: string
      placeholder: string
      create: string
    }
    renamePlaylist: {
      title: string
      placeholder: string
      save: string
    }
    tagEditor: {
      title: string
      flacTag: string
      mp3Tag: string
      audioTag: string
      chooseCover: string
      trackTitle: string
      placeholderTitle: string
      artist: string
      placeholderArtist: string
      album: string
      placeholderAlbum: string
      lyrics: string
      lyricsFormatInfo: string
      lyricsPlaceholder: string
      saveDirect: string
    }
    spectrogram: {
      title: string
      noTrack: string
      closeWindow: string
      generating: string
      errorPrefix: string
      ensureLocalFile: string
      seekInstruction: string
      intensityLegend: string
    }
    eq: {
      title: string
      enableEq: string
      autoEq: string
      searchHeadphonePlaceholder: string
      importFile: string
      exportFile: string
      reset: string
      preamp: string
      gain: string
      freq: string
      bandwidthQ: string
      type: string
      peaking: string
      lowshelf: string
      highshelf: string
      lowpass: string
      highpass: string
      noBandsFound: string
    }
  }
  toasts: {
    ytmLoginSuccess: string
    ytmLogout: string
    scLoginSuccess: string
    scLogout: string
    downloadFinished: string
    albumDownloadFinished: string
    playlistCreated: string
    tracksAddedToPlaylist: string
    connectingStream: string
    setLibraryFirst: string
    driveDownloadFinished: string
    systemError: string
    downloadError: string
    tagSavedSuccess: string
    addedToQueue: string
    addedToPlaylist: string
    removedFromPlaylist: string
    movedToTrash: string
    playlistDeleted: string
    deleteTrackError: string
    deletePlaylistError: string
    downloadProgress: string
    librarySavedSuccess: string
    autoCategorizeConfirm: string
    autoCategorizeSuccess: string
    coverUpdatedSuccess: string
    coverChangeSuccess: string
  }
}
