import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  openFile: (): Promise<{ filePath: string; savedPosition: number } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  loadVideo: (filePath: string): Promise<{ filePath: string; savedPosition: number }> =>
    ipcRenderer.invoke('video:load', filePath),

  getVideoInfo: (
    filePath: string,
  ): Promise<{ size: number; mtime: number; ctime: number } | null> =>
    ipcRenderer.invoke('video:getInfo', filePath),

  checkAudio: (filePath: string): Promise<{ codec: string; supported: boolean }> =>
    ipcRenderer.invoke('video:checkAudio', filePath),

  checkAudioBatch: (
    filePaths: string[],
  ): Promise<Record<string, { codec: string; supported: boolean }>> =>
    ipcRenderer.invoke('video:checkAudioBatch', filePaths),

  detectEmbeddedSubtitles: (
    filePath: string,
  ): Promise<Array<{ label: string; language: string; codec: string; index: number }>> =>
    ipcRenderer.invoke('video:detectEmbeddedSubtitles', filePath),

  savePosition: (filePath: string, position: number): Promise<void> =>
    ipcRenderer.invoke('playback:savePosition', filePath, position),

  getPosition: (filePath: string): Promise<number> =>
    ipcRenderer.invoke('playback:getPosition', filePath),

  getRecentProgress: (): Promise<
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
  > => ipcRenderer.invoke('progress:getRecent'),

  getMediaUrl: (filePath: string): string => {
    const url = `anibox://video?path=${encodeURIComponent(filePath)}`
    console.log('[AniBox] getMediaUrl:', filePath, '->', url)
    return url
  },

  getCoverUrl: (filePath: string): string => `anibox://video?path=${encodeURIComponent(filePath)}`,

  openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),

  scanSeries: (
    rootPath: string,
  ): Promise<
    Array<{
      title: string
      folderPath: string
      season: number
      episodes: Array<{ fileName: string; filePath: string; epNumber: number }>
    }>
  > => ipcRenderer.invoke('scanner:scan', rootPath),

  // 多根扫描
  scanRootsGet: (): Promise<string[]> => ipcRenderer.invoke('scanRoots:get'),

  scanRootsAdd: (root: string): Promise<string[]> => ipcRenderer.invoke('scanRoots:add', root),

  scanRootsRemove: (root: string): Promise<string[]> =>
    ipcRenderer.invoke('scanRoots:remove', root),

  scanRootsSetAll: (roots: string[]): Promise<string[]> =>
    ipcRenderer.invoke('scanRoots:setAll', roots),

  scanRootsScanAll: (): Promise<Array<any>> => ipcRenderer.invoke('scanRoots:scanAll'),

  // 智能发现
  discoverScan: (basePath: string): Promise<string[]> =>
    ipcRenderer.invoke('discover:scan', basePath),

  getSeriesProgress: (folderPath: string): Promise<{ total: number; watched: number }> =>
    ipcRenderer.invoke('series:getProgress', folderPath),

  setSeriesStatus: (folderPath: string, status: string): Promise<void> =>
    ipcRenderer.invoke('series:setStatus', folderPath, status),

  updateTitle: (folderPath: string, newTitle: string): Promise<void> =>
    ipcRenderer.invoke('series:updateTitle', folderPath, newTitle),

  getSeriesAll: (): Promise<Array<any>> => ipcRenderer.invoke('series:getAll'),

  // 封面爬取
  fetchCovers: (
    series: Array<{ title: string; folderPath: string }>,
  ): Promise<{ total: number; fetched: number; failed: number }> =>
    ipcRenderer.invoke('cover:fetchBatch', series),

  fetchManualCover: (folderPath: string, searchQuery: string): Promise<boolean> =>
    ipcRenderer.invoke('cover:fetchManual', folderPath, searchQuery),

  onCoverProgress: (
    cb: (data: { current: number; total: number; title: string; ok: boolean }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('cover:progress', handler)
    return () => {
      ipcRenderer.removeListener('cover:progress', handler)
    }
  },

  // OP/ED 跳过（双点区间）
  getSkipTimes: (
    folderPath: string,
  ): Promise<{ opStart: number; opEnd: number; edStart: number; edEnd: number } | null> =>
    ipcRenderer.invoke('series:getSkipTimes', folderPath),

  setSkipTimes: (
    folderPath: string,
    times: { opStart: number; opEnd: number; edStart: number; edEnd: number },
  ): Promise<void> => ipcRenderer.invoke('series:setSkipTimes', folderPath, times),

  // 元数据刮削
  fetchMetadata: (title: string, folderPath: string): Promise<any> =>
    ipcRenderer.invoke('metadata:fetch', title, folderPath),

  fetchMetadataBatch: (series: Array<{ title: string; folderPath: string }>): Promise<any> =>
    ipcRenderer.invoke('metadata:fetchBatch', series),

  getMetadata: (folderPath: string): Promise<any> => ipcRenderer.invoke('metadata:get', folderPath),

  validateTitles: (
    series: Array<{ folderPath: string; title: string }>,
  ): Promise<
    Array<{
      folderPath: string
      currentTitle: string
      suggestedTitle: string
      anilistId: number
      confidence: number
      reason: string
    }>
  > => ipcRenderer.invoke('metadata:validateTitles', series),

  onMetadataProgress: (
    cb: (data: {
      current: number
      total: number
      title: string
      ok: boolean
      status?: string
    }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('metadata:progress', handler)
    return () => {
      ipcRenderer.removeListener('metadata:progress', handler)
    }
  },

  // mpv 兜底
  mpvPlay: (filePath: string): Promise<void> => ipcRenderer.invoke('mpv:play', filePath),
  mpvQuit: (): Promise<void> => ipcRenderer.invoke('mpv:quit'),
  mpvCommand: (cmd: any[]): Promise<boolean> => ipcRenderer.invoke('mpv:command', cmd),
  mpvGetState: (): Promise<{
    timePos: number
    duration: number
    paused: boolean
    loaded: boolean
    width: number
    height: number
  } | null> => ipcRenderer.invoke('mpv:getState'),
  mpvOnEvent: (cb: (event: Record<string, unknown>) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: Record<string, unknown>) => cb(event)
    ipcRenderer.on('mpv:event', handler)
    return () => {
      ipcRenderer.removeListener('mpv:event', handler)
    }
  },
  // libmpv 逐帧 RGBA（主进程软渲染 → Canvas）
  mpvOnFrame: (
    cb: (frame: { data: Uint8Array; width: number; height: number }) => void,
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      data: Uint8Array,
      width: number,
      height: number,
    ) => cb({ data, width, height })
    ipcRenderer.on('mpv:frame', handler)
    return () => {
      ipcRenderer.removeListener('mpv:frame', handler)
    }
  },
  // 悬浮预览：seek 指定位置取一帧（独立静音实例）
  mpvPreview: (filePath: string, t: number): Promise<boolean> =>
    ipcRenderer.invoke('mpv:preview', filePath, t),
  mpvOnPreviewFrame: (
    cb: (frame: { data: Uint8Array; width: number; height: number }) => void,
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      data: Uint8Array,
      width: number,
      height: number,
    ) => cb({ data, width, height })
    ipcRenderer.on('mpv:preview-frame', handler)
    return () => {
      ipcRenderer.removeListener('mpv:preview-frame', handler)
    }
  },

  // 字幕
  subtitleReadVtt: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('subtitle:readVtt', filePath),

  subtitleGetUrl: (filePath: string): string =>
    `anibox://video?path=${encodeURIComponent(filePath)}`,

  subtitleRescan: (
    videoPath: string,
  ): Promise<Array<{ label: string; language: string; filePath: string; type: string }>> =>
    ipcRenderer.invoke('subtitle:rescan', videoPath),

  // 在线字幕搜索
  subtitleSearchOnline: (query: {
    title: string
    episode?: number
    videoPath?: string
    preferredLanguages?: string[]
  }): Promise<
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
  > => ipcRenderer.invoke('subtitle:searchOnline', query),

  subtitleDownload: (result: any, videoPath: string): Promise<string | null> =>
    ipcRenderer.invoke('subtitle:download', result, videoPath),

  subtitleGetOSStatus: (): Promise<{ configured: boolean; apiKeySet: boolean }> =>
    ipcRenderer.invoke('subtitle:getOSStatus'),

  subtitleSetOSConfig: (apiKey: string, userAgent?: string): Promise<void> =>
    ipcRenderer.invoke('subtitle:setOSConfig', apiKey, userAgent),

  // 音轨偏好
  audioGetPrefs: (
    seriesId: string,
  ): Promise<{ audioIndex: number; audioDelay: number; language?: string } | null> =>
    ipcRenderer.invoke('audio:getPrefs', seriesId),

  audioSetPrefs: (
    seriesId: string,
    prefs: { audioIndex: number; audioDelay: number; language?: string },
  ): Promise<void> => ipcRenderer.invoke('audio:setPrefs', seriesId, prefs),

  audioGetGlobalPrefs: (): Promise<{ preferredLanguage: string }> =>
    ipcRenderer.invoke('audio:getGlobalPrefs'),

  // 字幕样式
  subtitleGetStyle: (): Promise<{
    fontSize: number
    fontFamily: string
    textColor: string
    strokeColor: string
    strokeWidth: number
    bgColor: string
    position: string
    secondaryFontSize: number
    dualSubtitleGap: number
  }> => ipcRenderer.invoke('subtitle:getStyle'),

  subtitleSetStyle: (style: any): Promise<void> => ipcRenderer.invoke('subtitle:setStyle', style),

  // 全局播放偏好（设置页「播放」tab）
  getPlaybackSettings: (): Promise<{
    defaultVolume: number
    defaultSpeed: number
    autoNextEp: boolean
    saveProgressInterval: number
    skipShortcutDefault: boolean
  }> => ipcRenderer.invoke('settings:getPlayback'),

  setPlaybackSettings: (settings: {
    defaultVolume?: number
    defaultSpeed?: number
    autoNextEp?: boolean
    saveProgressInterval?: number
    skipShortcutDefault?: boolean
  }): Promise<void> => ipcRenderer.invoke('settings:setPlayback', settings),

  // 局域网串流
  streamGetSettings: (): Promise<any> => ipcRenderer.invoke('stream:getSettings'),
  streamSetSettings: (patch: {
    enabled?: boolean
    port?: number
    requireToken?: boolean
    token?: string
  }): Promise<any> => ipcRenderer.invoke('stream:setSettings', patch),
  streamGetState: (): Promise<{ running: boolean; port: number; urls: string[]; error?: string }> =>
    ipcRenderer.invoke('stream:getState'),
  streamCacheInfo: (): Promise<{ cacheMB: number }> => ipcRenderer.invoke('stream:cacheInfo'),
  streamCacheClean: (maxMB?: number): Promise<{ removed: number; freedMB: number }> =>
    ipcRenderer.invoke('stream:cacheClean', maxMB),
  streamEngineInfo: (): Promise<any> => ipcRenderer.invoke('stream:engineInfo'),
  streamFfmpegRetry: (): Promise<any> => ipcRenderer.invoke('stream:ffmpegRetry'),

  // 应用版本信息（关于页显示）
  getAppVersion: (): Promise<{ version: string; electron: string }> =>
    ipcRenderer.invoke('app:getVersion'),

  // Whisper 语音识别
  whisperStatus: (): Promise<{
    available: boolean
    binaryExists: boolean
    modelExists: boolean
    modelPath: string
    binaryPath: string
    defaultPaths: { binary: string; models: string }
  }> => ipcRenderer.invoke('whisper:status'),

  whisperConfigure: (config: { binaryPath: string; modelPath: string }): Promise<void> =>
    ipcRenderer.invoke('whisper:configure', config),

  whisperTranscribe: (
    videoPath: string,
  ): Promise<{
    segments: Array<{ start: number; end: number; text: string }>
    fullText: string
    language: string
    duration: number
  } | null> => ipcRenderer.invoke('whisper:transcribe', videoPath),

  onWhisperProgress: (
    cb: (data: { message: string; result?: any; error?: string }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('whisper:progress', handler)
    return () => {
      ipcRenderer.removeListener('whisper:progress', handler)
    }
  },

  // AI 翻译
  translateStatus: (): Promise<{ engine: string; apiKeyConfigured: boolean }> =>
    ipcRenderer.invoke('translate:status'),

  translateConfigure: (config: {
    engine?: string
    apiKey?: string
    apiUrl?: string
  }): Promise<void> => ipcRenderer.invoke('translate:configure', config),

  translateText: (text: string, fromLang?: string, toLang?: string): Promise<string> =>
    ipcRenderer.invoke('translate:text', text, fromLang, toLang),

  translateSegments: (segments: any[], fromLang?: string, toLang?: string): Promise<any[]> =>
    ipcRenderer.invoke('translate:segments', segments, fromLang, toLang),

  onTranslateProgress: (cb: (data: { current: number; total: number }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('translate:progress', handler)
    return () => {
      ipcRenderer.removeListener('translate:progress', handler)
    }
  },

  // 本地翻译模型 (opus-mt-en-zh)
  loadLocalModel: (): Promise<boolean> => ipcRenderer.invoke('translate:localLoadModel'),

  getLocalModelStatus: (): Promise<{
    ready: boolean
    loading: boolean
    error: string | null
    modelName: string
  }> => ipcRenderer.invoke('translate:localStatus'),

  onLocalModelProgress: (cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('translate:localProgress', handler)
    return () => {
      ipcRenderer.removeListener('translate:localProgress', handler)
    }
  },

  // 日语词典
  dictLookup: (
    word: string,
  ): Promise<
    Array<{
      word: string
      reading: string
      meanings: Array<{ pos: string; gloss: string }>
    }>
  > => ipcRenderer.invoke('dict:lookup', word),

  dictAnalyze: (
    text: string,
  ): Promise<
    Array<{
      word: string
      entries: Array<{
        word: string
        reading: string
        meanings: Array<{ pos: string; gloss: string }>
      }>
    }>
  > => ipcRenderer.invoke('dict:analyze', text),

  // 弹幕
  danmakuFetch: (
    animeTitle: string,
    episodeNumber: number,
  ): Promise<
    Array<{
      text: string
      time: number
      mode: string
      color: string
      fontSize: number
      timestamp: number
    }>
  > => ipcRenderer.invoke('danmaku:fetch', animeTitle, episodeNumber),

  danmakuCleanTitle: (title: string): Promise<string> =>
    ipcRenderer.invoke('danmaku:cleanTitle', title),

  danmakuImport: (filePath: string): Promise<Array<any>> =>
    ipcRenderer.invoke('danmaku:import', filePath),

  danmakuExport: (items: any[]): Promise<boolean> => ipcRenderer.invoke('danmaku:export', items),

  onDanmakuProgress: (
    cb: (data: { message: string; count?: number; error?: string }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('danmaku:progress', handler)
    return () => {
      ipcRenderer.removeListener('danmaku:progress', handler)
    }
  },

  // 文件监控
  watcherStart: (rootPath: string): Promise<void> => ipcRenderer.invoke('watcher:start', rootPath),
  watcherStop: (): Promise<void> => ipcRenderer.invoke('watcher:stop'),
  watcherStatus: (): Promise<{ active: boolean; watchingPath?: string }> =>
    ipcRenderer.invoke('watcher:status'),
  onWatcherEvent: (
    cb: (data: { event: string; type: string; path: string }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('watcher:event', handler)
    return () => {
      ipcRenderer.removeListener('watcher:event', handler)
    }
  },

  // 收藏
  favoritesGetAll: (): Promise<string[]> => ipcRenderer.invoke('favorites:getAll'),
  favoritesToggle: (seriesId: string): Promise<boolean> =>
    ipcRenderer.invoke('favorites:toggle', seriesId),
  favoritesIsFavorited: (seriesId: string): Promise<boolean> =>
    ipcRenderer.invoke('favorites:isFavorited', seriesId),

  // 播放列表
  playlistsGetAll: (): Promise<Array<{ id: string; name: string; seriesIds: string[] }>> =>
    ipcRenderer.invoke('playlists:getAll'),
  playlistsCreate: (name: string): Promise<string> => ipcRenderer.invoke('playlists:create', name),
  playlistsDelete: (id: string): Promise<void> => ipcRenderer.invoke('playlists:delete', id),
  playlistsAddSeries: (listId: string, seriesId: string): Promise<void> =>
    ipcRenderer.invoke('playlists:addSeries', listId, seriesId),
  playlistsRemoveSeries: (listId: string, seriesId: string): Promise<void> =>
    ipcRenderer.invoke('playlists:removeSeries', listId, seriesId),

  seasonFetchTimeline: (forceRefresh?: boolean): Promise<any> =>
    ipcRenderer.invoke('season:fetchTimeline', forceRefresh),
  seasonFetchDetail: (anilistId: number): Promise<any> =>
    ipcRenderer.invoke('season:fetchDetail', anilistId),

  // 番剧搜索（AniList 搜索番剧）
  animeSearch: (query: string, pageSize?: number): Promise<any> =>
    ipcRenderer.invoke('anime:search', query, pageSize),

  // AnimeGarden 资源搜索
  animegardenSearch: (params: any): Promise<any> =>
    ipcRenderer.invoke('animegarden:search', params),

  // 字幕组列表（GET /teams，主进程 1h 缓存）
  animegardenTeams: (): Promise<any> => ipcRenderer.invoke('animegarden:teams'),

  // 本地 RSS 订阅代理（AnimeGarden 镜像站 feed.xml 不可用，由 AniBox 本地生成）
  animegardenCreateFeed: (cfg: any): Promise<{ ok: boolean; url: string; id: string }> =>
    ipcRenderer.invoke('animegarden:createFeed', cfg),
  animegardenListFeeds: (): Promise<any[]> => ipcRenderer.invoke('animegarden:listFeeds'),
  animegardenDeleteFeed: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('animegarden:deleteFeed', id),

  // qBittorrent 联动
  qbGetConfig: (): Promise<any> => ipcRenderer.invoke('qb:getConfig'),
  qbSetConfig: (cfg: any): Promise<boolean> => ipcRenderer.invoke('qb:setConfig', cfg),
  qbTest: (cfg?: any): Promise<{ ok: boolean; message: string; version?: string }> =>
    ipcRenderer.invoke('qb:test', cfg),
  qbAddTorrent: (magnet: string, savepath?: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('qb:addTorrent', magnet, savepath),
  qbAddRss: (
    feedUrl: string,
    path?: string,
  ): Promise<{ ok: boolean; message: string; path?: string }> =>
    ipcRenderer.invoke('qb:addRss', feedUrl, path),
  qbAddRule: (
    ruleName: string,
    opts: {
      mustContain: string
      savepath?: string
      affectedFeeds?: string[]
      addPaused?: boolean
      useRegex?: boolean
    },
  ): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('qb:addRule', ruleName, opts),
  qbRemoveRule: (ruleName: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('qb:removeRule', ruleName),
  translateJaModelLoad: (): Promise<boolean> => ipcRenderer.invoke('translate:jaModelLoad'),
  translateJaToZh: (text: string): Promise<string> => ipcRenderer.invoke('translate:jaToZh', text),
  translateEnToZh: (text: string): Promise<string> => ipcRenderer.invoke('translate:enToZh', text),

  // AI 翻译 (DeepSeek)
  configureAI: (key: string): Promise<boolean> => ipcRenderer.invoke('ai:configure', key),
  getAIKey: (): Promise<string | null> => ipcRenderer.invoke('ai:getKey'),
  aiTranslate: (text: string, from: string, to: string): Promise<string> =>
    ipcRenderer.invoke('ai:translate', text, from, to),

  // 追番同步
  syncStatusToTracker: (
    anilistId: number,
    bangumiId: number,
    status: string,
    watchedEpisodes: number,
  ): Promise<boolean> =>
    ipcRenderer.invoke('tracking:sync', anilistId, bangumiId, status, watchedEpisodes),

  // 截图
  saveScreenshot: (dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('screenshot:save', dataUrl),

  // 窗口控制
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('window:exitFullscreen'),
  onFullscreenChanged: (cb: (isFullscreen: boolean) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, isFullscreen: boolean) => cb(isFullscreen)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => {
      ipcRenderer.removeListener('window:fullscreen-changed', handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
