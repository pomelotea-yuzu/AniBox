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
  mpvOnEvent: (cb: (event: Record<string, unknown>) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: Record<string, unknown>) => cb(event)
    ipcRenderer.on('mpv:event', handler)
    return () => {
      ipcRenderer.removeListener('mpv:event', handler)
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
  onFullscreenChanged: (cb: (isFullscreen: boolean) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, isFullscreen: boolean) => cb(isFullscreen)
    ipcRenderer.on('window:fullscreen-changed', handler)
    return () => {
      ipcRenderer.removeListener('window:fullscreen-changed', handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
