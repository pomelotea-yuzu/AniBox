"use strict";
const electron = require("electron");
const electronAPI = {
  openFile: () => electron.ipcRenderer.invoke("dialog:openFile"),
  loadVideo: (filePath) => electron.ipcRenderer.invoke("video:load", filePath),
  getVideoInfo: (filePath) => electron.ipcRenderer.invoke("video:getInfo", filePath),
  savePosition: (filePath, position) => electron.ipcRenderer.invoke("playback:savePosition", filePath, position),
  getPosition: (filePath) => electron.ipcRenderer.invoke("playback:getPosition", filePath),
  getMediaUrl: (filePath) => {
    const url = `anibox://video?path=${encodeURIComponent(filePath)}`;
    console.log("[AniBox] getMediaUrl:", filePath, "->", url);
    return url;
  },
  getCoverUrl: (filePath) => `anibox://video?path=${encodeURIComponent(filePath)}`,
  openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder"),
  scanSeries: (rootPath) => electron.ipcRenderer.invoke("scanner:scan", rootPath),
  getSeriesProgress: (folderPath) => electron.ipcRenderer.invoke("series:getProgress", folderPath),
  setSeriesStatus: (folderPath, status) => electron.ipcRenderer.invoke("series:setStatus", folderPath, status),
  updateTitle: (folderPath, newTitle) => electron.ipcRenderer.invoke("series:updateTitle", folderPath, newTitle),
  getSeriesAll: () => electron.ipcRenderer.invoke("series:getAll"),
  // 封面爬取
  fetchCovers: (series) => electron.ipcRenderer.invoke("cover:fetchBatch", series),
  fetchManualCover: (folderPath, searchQuery) => electron.ipcRenderer.invoke("cover:fetchManual", folderPath, searchQuery),
  onCoverProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("cover:progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("cover:progress", handler);
    };
  },
  // OP/ED 跳过（双点区间）
  getSkipTimes: (folderPath) => electron.ipcRenderer.invoke("series:getSkipTimes", folderPath),
  setSkipTimes: (folderPath, times) => electron.ipcRenderer.invoke("series:setSkipTimes", folderPath, times),
  // 元数据刮削
  fetchMetadata: (title, folderPath) => electron.ipcRenderer.invoke("metadata:fetch", title, folderPath),
  fetchMetadataBatch: (series) => electron.ipcRenderer.invoke("metadata:fetchBatch", series),
  getMetadata: (folderPath) => electron.ipcRenderer.invoke("metadata:get", folderPath),
  onMetadataProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("metadata:progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("metadata:progress", handler);
    };
  },
  // mpv 兜底
  mpvPlay: (filePath) => electron.ipcRenderer.invoke("mpv:play", filePath),
  mpvQuit: () => electron.ipcRenderer.invoke("mpv:quit"),
  mpvOnEvent: (cb) => {
    const handler = (_e, event) => cb(event);
    electron.ipcRenderer.on("mpv:event", handler);
    return () => {
      electron.ipcRenderer.removeListener("mpv:event", handler);
    };
  },
  // 字幕
  subtitleReadVtt: (filePath) => electron.ipcRenderer.invoke("subtitle:readVtt", filePath),
  subtitleGetUrl: (filePath) => `anibox://video?path=${encodeURIComponent(filePath)}`,
  subtitleRescan: (videoPath) => electron.ipcRenderer.invoke("subtitle:rescan", videoPath),
  // 在线字幕搜索
  subtitleSearchOnline: (query) => electron.ipcRenderer.invoke("subtitle:searchOnline", query),
  subtitleDownload: (result, videoPath) => electron.ipcRenderer.invoke("subtitle:download", result, videoPath),
  subtitleGetOSStatus: () => electron.ipcRenderer.invoke("subtitle:getOSStatus"),
  subtitleSetOSConfig: (apiKey, userAgent) => electron.ipcRenderer.invoke("subtitle:setOSConfig", apiKey, userAgent),
  // 音轨偏好
  audioGetPrefs: (seriesId) => electron.ipcRenderer.invoke("audio:getPrefs", seriesId),
  audioSetPrefs: (seriesId, prefs) => electron.ipcRenderer.invoke("audio:setPrefs", seriesId, prefs),
  audioGetGlobalPrefs: () => electron.ipcRenderer.invoke("audio:getGlobalPrefs"),
  // 字幕样式
  subtitleGetStyle: () => electron.ipcRenderer.invoke("subtitle:getStyle"),
  subtitleSetStyle: (style) => electron.ipcRenderer.invoke("subtitle:setStyle", style),
  // Whisper 语音识别
  whisperStatus: () => electron.ipcRenderer.invoke("whisper:status"),
  whisperConfigure: (config) => electron.ipcRenderer.invoke("whisper:configure", config),
  whisperTranscribe: (videoPath) => electron.ipcRenderer.invoke("whisper:transcribe", videoPath),
  onWhisperProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("whisper:progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("whisper:progress", handler);
    };
  },
  // AI 翻译
  translateStatus: () => electron.ipcRenderer.invoke("translate:status"),
  translateConfigure: (config) => electron.ipcRenderer.invoke("translate:configure", config),
  translateText: (text, fromLang, toLang) => electron.ipcRenderer.invoke("translate:text", text, fromLang, toLang),
  translateSegments: (segments, fromLang, toLang) => electron.ipcRenderer.invoke("translate:segments", segments, fromLang, toLang),
  onTranslateProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("translate:progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("translate:progress", handler);
    };
  },
  // 日语词典
  dictLookup: (word) => electron.ipcRenderer.invoke("dict:lookup", word),
  dictAnalyze: (text) => electron.ipcRenderer.invoke("dict:analyze", text),
  // 弹幕
  danmakuFetch: (animeTitle, episodeNumber) => electron.ipcRenderer.invoke("danmaku:fetch", animeTitle, episodeNumber),
  danmakuCleanTitle: (title) => electron.ipcRenderer.invoke("danmaku:cleanTitle", title),
  danmakuImport: (filePath) => electron.ipcRenderer.invoke("danmaku:import", filePath),
  danmakuExport: (items) => electron.ipcRenderer.invoke("danmaku:export", items),
  onDanmakuProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("danmaku:progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("danmaku:progress", handler);
    };
  },
  // 文件监控
  watcherStart: (rootPath) => electron.ipcRenderer.invoke("watcher:start", rootPath),
  watcherStop: () => electron.ipcRenderer.invoke("watcher:stop"),
  watcherStatus: () => electron.ipcRenderer.invoke("watcher:status"),
  onWatcherEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    electron.ipcRenderer.on("watcher:event", handler);
    return () => {
      electron.ipcRenderer.removeListener("watcher:event", handler);
    };
  },
  // 收藏
  favoritesGetAll: () => electron.ipcRenderer.invoke("favorites:getAll"),
  favoritesToggle: (seriesId) => electron.ipcRenderer.invoke("favorites:toggle", seriesId),
  favoritesIsFavorited: (seriesId) => electron.ipcRenderer.invoke("favorites:isFavorited", seriesId),
  // 播放列表
  playlistsGetAll: () => electron.ipcRenderer.invoke("playlists:getAll"),
  playlistsCreate: (name) => electron.ipcRenderer.invoke("playlists:create", name),
  playlistsDelete: (id) => electron.ipcRenderer.invoke("playlists:delete", id),
  playlistsAddSeries: (listId, seriesId) => electron.ipcRenderer.invoke("playlists:addSeries", listId, seriesId),
  playlistsRemoveSeries: (listId, seriesId) => electron.ipcRenderer.invoke("playlists:removeSeries", listId, seriesId),
  // 追番同步
  syncStatusToTracker: (anilistId, bangumiId, status, watchedEpisodes) => electron.ipcRenderer.invoke("tracking:sync", anilistId, bangumiId, status, watchedEpisodes),
  // 截图
  saveScreenshot: (dataUrl) => electron.ipcRenderer.invoke("screenshot:save", dataUrl),
  // 窗口控制
  toggleFullscreen: () => electron.ipcRenderer.invoke("window:toggleFullscreen"),
  onFullscreenChanged: (cb) => {
    const handler = (_e, isFullscreen) => cb(isFullscreen);
    electron.ipcRenderer.on("window:fullscreen-changed", handler);
    return () => {
      electron.ipcRenderer.removeListener("window:fullscreen-changed", handler);
    };
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
