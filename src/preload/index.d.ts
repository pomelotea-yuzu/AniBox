export interface ElectronAPI {
  openFile: () => Promise<{ filePath: string; savedPosition: number } | null>
  loadVideo: (filePath: string) => Promise<{ filePath: string; savedPosition: number }>
  getVideoInfo: (filePath: string) => Promise<{
    size: number
    mtime: number
    ctime: number
    videoMeta?: {
      width: number
      height: number
      codec: string
      fps: number
      exactBitrate: number
    } | null
  } | null>
  checkAudio: (filePath: string) => Promise<{ codec: string; supported: boolean }>
  savePosition: (filePath: string, position: number) => Promise<void>
  getPosition: (filePath: string) => Promise<number>
  getMediaUrl: (filePath: string) => string
  getCoverUrl: (filePath: string) => string
  openFolder: () => Promise<string | null>
  scanSeries: (rootPath: string) => Promise<
    Array<{
      title: string
      folderPath: string
      season: number
      seriesType: string
      episodes: Array<{
        fileName: string
        filePath: string
        epNumber: number
        subtitleTracks?: any[]
      }>
      coverPath?: string
    }>
  >
  getSeriesProgress: (folderPath: string) => Promise<{ total: number; watched: number }>
  setSeriesStatus: (folderPath: string, status: string) => Promise<void>
  updateTitle: (folderPath: string, newTitle: string) => Promise<void>
  getSeriesAll: () => Promise<Array<any>>
  fetchCovers: (
    series: Array<{ title: string; folderPath: string }>,
  ) => Promise<{ total: number; fetched: number; failed: number }>
  fetchManualCover: (folderPath: string, searchQuery: string) => Promise<boolean>
  onCoverProgress: (
    cb: (data: {
      current: number
      total: number
      title: string
      ok: boolean
      status: string
    }) => void,
  ) => () => void
  getSkipTimes: (
    folderPath: string,
  ) => Promise<{ opStart: number; opEnd: number; edStart: number; edEnd: number } | null>
  setSkipTimes: (
    folderPath: string,
    times: { opStart: number; opEnd: number; edStart: number; edEnd: number },
  ) => Promise<void>
  fetchMetadata: (title: string, folderPath: string) => Promise<any>
  fetchMetadataBatch: (series: Array<{ title: string; folderPath: string }>) => Promise<any>
  getMetadata: (folderPath: string) => Promise<any>
  onMetadataProgress: (
    cb: (data: { current: number; total: number; title: string; ok: boolean }) => void,
  ) => () => void
  mpvPlay: (filePath: string) => Promise<void>
  mpvQuit: () => Promise<void>
  mpvOnEvent: (cb: (event: Record<string, unknown>) => void) => () => void
  subtitleReadVtt: (filePath: string) => Promise<string>
  subtitleGetUrl: (filePath: string) => string
  subtitleRescan: (
    videoPath: string,
  ) => Promise<Array<{ label: string; language: string; filePath: string; type: string }>>
  subtitleSearchOnline: (query: {
    title: string
    episode?: number
    videoPath?: string
    preferredLanguages?: string[]
  }) => Promise<
    Array<{
      id: string
      title: string
      language: string
      languageLabel: string
      source: string
      downloadUrl: string
      fileName: string
      rating: number
      downloads: number
    }>
  >
  subtitleDownload: (result: any, videoPath: string) => Promise<string | null>
  subtitleGetOSStatus: () => Promise<{ configured: boolean; apiKeySet: boolean }>
  subtitleSetOSConfig: (apiKey: string, userAgent?: string) => Promise<void>
  subtitleGetStyle: () => Promise<{
    fontSize: number
    fontFamily: string
    textColor: string
    strokeColor: string
    strokeWidth: number
    bgColor: string
    position: string
    secondaryFontSize: number
    dualSubtitleGap: number
  }>
  subtitleSetStyle: (style: any) => Promise<void>
  audioGetPrefs: (
    seriesId: string,
  ) => Promise<{ audioIndex: number; audioDelay: number; language?: string } | null>
  audioSetPrefs: (
    seriesId: string,
    prefs: { audioIndex: number; audioDelay: number; language?: string },
  ) => Promise<void>
  audioGetGlobalPrefs: () => Promise<{ preferredLanguage: string }>
  whisperStatus: () => Promise<{
    available: boolean
    binaryExists: boolean
    modelExists: boolean
    modelPath: string
    binaryPath: string
    defaultPaths: { binary: string; models: string }
  }>
  whisperConfigure: (config: { binaryPath: string; modelPath: string }) => Promise<void>
  whisperTranscribe: (videoPath: string) => Promise<{
    segments: Array<{ start: number; end: number; text: string }>
    fullText: string
    language: string
    duration: number
  } | null>
  onWhisperProgress: (
    cb: (data: { message: string; result?: any; error?: string }) => void,
  ) => () => void
  translateStatus: () => Promise<{ engine: string; apiKeyConfigured: boolean }>
  translateConfigure: (config: {
    engine?: string
    apiKey?: string
    apiUrl?: string
  }) => Promise<void>
  translateText: (text: string, fromLang?: string, toLang?: string) => Promise<string>
  translateSegments: (segments: any[], fromLang?: string, toLang?: string) => Promise<any[]>
  onTranslateProgress: (cb: (data: { current: number; total: number }) => void) => () => void
  loadLocalModel: () => Promise<boolean>
  getLocalModelStatus: () => Promise<{
    ready: boolean
    loading: boolean
    error: string | null
    modelName: string
  }>
  onLocalModelProgress: (cb: (msg: string) => void) => () => void
  dictLookup: (word: string) => Promise<
    Array<{
      word: string
      reading: string
      meanings: Array<{ pos: string; gloss: string }>
    }>
  >
  dictAnalyze: (text: string) => Promise<
    Array<{
      word: string
      entries: Array<{
        word: string
        reading: string
        meanings: Array<{ pos: string; gloss: string }>
      }>
    }>
  >
  danmakuFetch: (
    animeTitle: string,
    episodeNumber: number,
  ) => Promise<
    Array<{
      text: string
      time: number
      mode: string
      color: string
      fontSize: number
      timestamp: number
    }>
  >
  danmakuCleanTitle: (title: string) => Promise<string>
  danmakuImport: (filePath: string) => Promise<any[]>
  danmakuExport: (items: any[]) => Promise<boolean>
  onDanmakuProgress: (
    cb: (data: { message: string; count?: number; error?: string }) => void,
  ) => () => void
  watcherStart: (rootPath: string) => Promise<void>
  watcherStop: () => Promise<void>
  watcherStatus: () => Promise<{ active: boolean; watchingPath?: string }>
  onWatcherEvent: (cb: (data: { event: string; type: string; path: string }) => void) => () => void
  favoritesGetAll: () => Promise<string[]>
  favoritesToggle: (seriesId: string) => Promise<boolean>
  favoritesIsFavorited: (seriesId: string) => Promise<boolean>
  playlistsGetAll: () => Promise<Array<{ id: string; name: string; seriesIds: string[] }>>
  playlistsCreate: (name: string) => Promise<string>
  playlistsDelete: (id: string) => Promise<void>
  playlistsAddSeries: (listId: string, seriesId: string) => Promise<void>
  playlistsRemoveSeries: (listId: string, seriesId: string) => Promise<void>
  syncStatusToTracker: (
    anilistId: number,
    bangumiId: number,
    status: string,
    watchedEpisodes: number,
  ) => Promise<boolean>
  saveScreenshot: (dataUrl: string) => Promise<boolean>
  toggleFullscreen: () => Promise<void>
  onFullscreenChanged: (cb: (isFullscreen: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
