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
  checkAudioBatch: (
    filePaths: string[],
  ) => Promise<Record<string, { codec: string; supported: boolean }>>
  detectEmbeddedSubtitles: (
    filePath: string,
  ) => Promise<Array<{ label: string; language: string; codec: string; index: number }>>
  savePosition: (filePath: string, position: number) => Promise<void>
  getPosition: (filePath: string) => Promise<number>
  getRecentProgress: () => Promise<
    Array<{
      episodeId: string
      filePath: string
      fileName: string
      epNumber: number
      seriesTitle: string
      seriesId: string
      folderPath: string
      position: number
      updatedAt: string
    }>
  >
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
  scanRootsGet: () => Promise<string[]>
  scanRootsAdd: (root: string) => Promise<string[]>
  scanRootsRemove: (root: string) => Promise<string[]>
  scanRootsSetAll: (roots: string[]) => Promise<string[]>
  scanRootsScanAll: () => Promise<Array<any>>
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
    cb: (data: {
      current: number
      total: number
      title: string
      ok: boolean
      status?: string
    }) => void,
  ) => () => void
  validateTitles: (series: Array<{ folderPath: string; title: string }>) => Promise<
    Array<{
      folderPath: string
      currentTitle: string
      suggestedTitle: string
      anilistId: number
      confidence: number
      reason: string
    }>
  >
  mpvPlay: (filePath: string) => Promise<void>
  mpvQuit: () => Promise<void>
  mpvCommand: (cmd: any[]) => Promise<boolean>
  mpvGetState: () => Promise<{
    timePos: number
    duration: number
    paused: boolean
    loaded: boolean
    width: number
    height: number
    volume: number
    muted: boolean
  } | null>
  mpvOnEvent: (cb: (event: Record<string, unknown>) => void) => () => void
  mpvOnFrame: (
    cb: (frame: { data: Uint8Array; width: number; height: number }) => void,
  ) => () => void
  mpvPreview: (filePath: string, t: number) => Promise<boolean>
  mpvOnPreviewFrame: (
    cb: (frame: { data: Uint8Array; width: number; height: number }) => void,
  ) => () => void
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
    position: 'bottom' | 'top'
    secondaryFontSize: number
    dualSubtitleGap: number
  }>
  subtitleSetStyle: (style: any) => Promise<void>
  getPlaybackSettings: () => Promise<{
    defaultVolume: number
    defaultSpeed: number
    autoNextEp: boolean
    saveProgressInterval: number
    skipShortcutDefault: boolean
  }>
  setPlaybackSettings: (settings: {
    defaultVolume?: number
    defaultSpeed?: number
    autoNextEp?: boolean
    saveProgressInterval?: number
    skipShortcutDefault?: boolean
  }) => Promise<void>
  // 局域网串流
  streamGetSettings: () => Promise<any>
  streamSetSettings: (patch: {
    enabled?: boolean
    port?: number
    requireToken?: boolean
    token?: string
  }) => Promise<any>
  streamGetState: () => Promise<{
    running: boolean
    port: number
    urls: string[]
    error?: string
  }>
  streamCacheInfo: () => Promise<{ cacheMB: number }>
  streamCacheClean: (maxMB?: number) => Promise<{ removed: number; freedMB: number }>
  streamEngineInfo: () => Promise<any>
  streamFfmpegRetry: () => Promise<any>
  getAppVersion: () => Promise<{ version: string; electron: string }>
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
  playlistsGetAll: () => Promise<
    Array<{ id: string; name: string; seriesIds: string[]; createdAt: string }>
  >
  playlistsCreate: (name: string) => Promise<string>
  playlistsDelete: (id: string) => Promise<void>
  playlistsAddSeries: (listId: string, seriesId: string) => Promise<void>
  playlistsRemoveSeries: (listId: string, seriesId: string) => Promise<void>
  seasonFetchTimeline: (forceRefresh?: boolean) => Promise<any>
  seasonFetchDetail: (anilistId: number) => Promise<any>
  // 番剧搜索（AniList 搜索番剧）
  animeSearch: (
    query: string,
    pageSize?: number,
  ) => Promise<{
    ok: boolean
    anime?: any[]
    error?: string
  }>
  // AnimeGarden 资源搜索
  animegardenSearch: (params: {
    search?: string
    include?: string[]
    keywords?: string[]
    exclude?: string[]
    type?: string
    provider?: string
    fansubId?: number
    page?: number
    pageSize?: number
  }) => Promise<{ ok: boolean; resources?: any[]; complete?: boolean; error?: string }>
  // 字幕组列表（GET /teams，主进程 1h 缓存）
  animegardenTeams: () => Promise<{
    ok: boolean
    teams?: Array<{ id: number; name: string; avatar?: string | null }>
    stale?: boolean
    error?: string
  }>
  // 本地 RSS 订阅代理（镜像站 feed.xml 不可用，AniBox 本地生成）
  animegardenCreateFeed: (cfg: {
    name: string
    search?: string
    include?: string[]
    fansubId?: number
    fansubName?: string
    type?: string
  }) => Promise<{ ok: boolean; url: string; id: string }>
  animegardenListFeeds: () => Promise<
    Array<{ id: string; name: string; search?: string; fansubName?: string; createdAt: number }>
  >
  animegardenDeleteFeed: (id: string) => Promise<boolean>
  // qBittorrent 联动
  qbGetConfig: () => Promise<{
    host: string
    port: number
    username: string
    password: string
    savepath?: string
  } | null>
  qbSetConfig: (cfg: {
    host: string
    port: number
    username: string
    password: string
    savepath?: string
  }) => Promise<boolean>
  qbTest: (cfg?: {
    host: string
    port: number
    username: string
    password: string
  }) => Promise<{ ok: boolean; message: string; version?: string }>
  qbAddTorrent: (magnet: string, savepath?: string) => Promise<{ ok: boolean; message: string }>
  qbAddRss: (
    feedUrl: string,
    path?: string,
  ) => Promise<{ ok: boolean; message: string; path?: string }>
  qbAddRule: (
    ruleName: string,
    opts: {
      mustContain: string
      savepath?: string
      affectedFeeds?: string[]
      addPaused?: boolean
      useRegex?: boolean
    },
  ) => Promise<{ ok: boolean; message: string }>
  qbRemoveRule: (ruleName: string) => Promise<{ ok: boolean; message: string }>
  translateJaModelLoad: () => Promise<boolean>
  translateJaToZh: (text: string) => Promise<string>
  translateEnToZh: (text: string) => Promise<string>
  // AI 翻译
  configureAI: (key: string) => Promise<boolean>
  getAIKey: () => Promise<string | null>
  aiTranslate: (text: string, from: string, to: string) => Promise<string>
  syncStatusToTracker: (
    anilistId: number,
    bangumiId: number,
    status: string,
    watchedEpisodes: number,
  ) => Promise<boolean>
  saveScreenshot: (dataUrl: string) => Promise<boolean>
  toggleFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
  onFullscreenChanged: (cb: (isFullscreen: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
