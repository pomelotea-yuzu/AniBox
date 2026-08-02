"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const child_process = require("child_process");
const net = require("net");
const stream = require("stream");
const https = require("https");
const chokidar = require("chokidar");
const SUBTITLE_EXTS$1 = /* @__PURE__ */ new Set([".ass", ".ssa", ".srt", ".vtt", ".sub", ".idx"]);
function extractEpisodeNumber(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m1 = base.match(/[−-]\s*(\d{1,4})(?:\s|\[|v|$)/);
  if (m1) return parseInt(m1[1], 10);
  const bracketNums = [...base.matchAll(/\[(\d{1,4})\]/g)];
  if (bracketNums.length > 0) {
    const last = bracketNums[bracketNums.length - 1];
    const num = parseInt(last[1], 10);
    if (num > 0 && num <= 9999) return num;
  }
  const m3 = base.match(/(?:第|EP|E|#)\s*(\d{1,4})/i);
  if (m3) return parseInt(m3[1], 10);
  const m4 = base.match(/[^\d](\d{1,4})$/);
  if (m4) return parseInt(m4[1], 10);
  return 0;
}
function guessLang(fileBase) {
  const lower = fileBase.toLowerCase();
  const parts = lower.split(".");
  const tags = parts.slice(0, -1);
  const lastTag = tags[tags.length - 1] || "";
  if (["chs", "sc", "zh-cn", "zh-hans", "gb", "简中", "简体"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "zh-CN", label: "简体中文" };
  if (["cht", "tc", "zh-tw", "zh-hant", "big5", "繁中", "繁体"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "zh-TW", label: "繁體中文" };
  if (["zh", "chi", "chinese", "中文"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "zh", label: "中文" };
  if (["en", "eng", "english", "英文", "英语"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "en", label: "English" };
  if (["ja", "jp", "jpn", "japanese", "日语", "日文"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "ja", label: "日本語" };
  if (["ko", "kr", "kor", "korean", "韩语", "韩文"].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: "ko", label: "한국어" };
  return { lang: "", label: "字幕" };
}
function findSubtitles(videoPath) {
  const videoDir = path.dirname(videoPath);
  const videoBase = path.basename(videoPath);
  const videoName = videoBase.replace(/\.[^.]+$/, "");
  const videoEp = extractEpisodeNumber(videoBase);
  const tracks = [];
  const seen = /* @__PURE__ */ new Set();
  function addTrack(filePath) {
    const key = filePath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const entryBase = path.basename(filePath).replace(/\.[^.]+$/, "");
    const { lang, label } = guessLang(entryBase);
    tracks.push({ label, language: lang, filePath, type: "external" });
  }
  function scanDir(dir, useEpisodeMatch) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (!SUBTITLE_EXTS$1.has(ext)) continue;
        const entryBase = entry.replace(/\.[^.]+$/, "");
        const fullPath = path.join(dir, entry);
        if (entryBase === videoName || entryBase.startsWith(videoName + ".")) {
          addTrack(fullPath);
          continue;
        }
        if (useEpisodeMatch && videoEp > 0) {
          const subEp = extractEpisodeNumber(entry);
          if (subEp === videoEp) {
            addTrack(fullPath);
          }
        }
      }
    } catch {
    }
  }
  scanDir(videoDir, true);
  const parentDir = path.dirname(videoDir);
  if (parentDir !== videoDir && parentDir !== ".") {
    scanDir(parentDir, true);
  }
  for (const subDirName of ["subs", "subtitles", "字幕", "Subs", "Subtitles"]) {
    const subDir = path.join(videoDir, subDirName);
    try {
      scanDir(subDir, true);
    } catch {
    }
  }
  if (parentDir !== videoDir) {
    for (const subDirName of ["subs", "subtitles", "字幕", "Subs", "Subtitles"]) {
      const subDir = path.join(parentDir, subDirName);
      try {
        scanDir(subDir, true);
      } catch {
      }
    }
  }
  return tracks;
}
function srtToVtt(content) {
  if (content.charCodeAt(0) === 65279) content = content.slice(1);
  let vtt = "WEBVTT\n\n";
  const blocks = content.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    let tsLine = "";
    let textLines = [];
    for (const line of lines) {
      if (line.includes("-->")) {
        tsLine = line;
      } else if (tsLine && line.trim()) {
        textLines.push(line.trim());
      }
    }
    if (!tsLine) continue;
    const vttTs = tsLine.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    vtt += vttTs + "\n";
    vtt += textLines.join("\n") + "\n\n";
  }
  return vtt;
}
function assToVtt(content) {
  if (content.charCodeAt(0) === 65279) content = content.slice(1);
  const eventsMatch = content.match(/\[Events\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/i);
  if (!eventsMatch) return "WEBVTT\n\n";
  const eventsSection = eventsMatch[1];
  const formatMatch = eventsSection.match(/Format:\s*(.+)/i);
  if (!formatMatch) return "WEBVTT\n\n";
  const columns = formatMatch[1].split(",").map((c) => c.trim().toLowerCase());
  const startIdx = columns.indexOf("start");
  const endIdx = columns.indexOf("end");
  const textIdx = columns.indexOf("text");
  if (startIdx < 0 || endIdx < 0 || textIdx < 0) return "WEBVTT\n\n";
  const dialogueLines = eventsSection.match(/^Dialogue:\s*(.+)$/gim);
  if (!dialogueLines || dialogueLines.length === 0) return "WEBVTT\n\n";
  let vtt = "WEBVTT\n\n";
  for (const line of dialogueLines) {
    const content_ = line.replace(/^Dialogue:\s*/i, "");
    const parts = splitAssDialogue(content_, textIdx);
    const start = parts[startIdx]?.trim() || "";
    const end = parts[endIdx]?.trim() || "";
    let text = parts[textIdx]?.trim() || "";
    if (!start || !end || !text) continue;
    const vttStart = assTimeToVtt(start);
    const vttEnd = assTimeToVtt(end);
    if (!vttStart || !vttEnd) continue;
    text = text.replace(/\{[^}]*\}/g, "");
    text = text.replace(/\\N|\\n/g, "\n");
    text = text.replace(/<i>/g, "<i>").replace(/<\/i>/g, "</i>");
    text = text.replace(/<b>/g, "<b>").replace(/<\/b>/g, "</b>");
    text = text.replace(/<u>/g, "<u>").replace(/<\/u>/g, "</u>");
    if (!text.trim()) continue;
    vtt += `${vttStart} --> ${vttEnd}
${text}

`;
  }
  return vtt;
}
function splitAssDialogue(line, textColumnIdx) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0 && parts.length < textColumnIdx) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}
function assTimeToVtt(assTime) {
  const match = assTime.match(/^(-?\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const seconds = match[3];
  let centiseconds = match[4];
  if (hours < 0) hours = 0;
  if (centiseconds.length === 2) centiseconds += "0";
  return `${hours.toString().padStart(2, "0")}:${minutes}:${seconds}.${centiseconds}`;
}
function readSubtitleAsVtt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf-8");
  switch (ext) {
    case ".srt":
      return srtToVtt(raw);
    case ".ass":
    case ".ssa":
      return assToVtt(raw);
    case ".vtt":
      return raw;
    default:
      return raw.startsWith("WEBVTT") ? raw : srtToVtt(raw);
  }
}
const VIDEO_EXTS$3 = /* @__PURE__ */ new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".flv",
  ".ts",
  ".m2ts",
  ".rmvb",
  ".wmv",
  ".m4v",
  ".3gp",
  ".3g2",
  ".asf",
  ".divx",
  ".f4v",
  ".mpeg",
  ".mpg",
  ".mpe",
  ".ogv",
  ".ogm",
  ".qt",
  ".vob",
  ".evo",
  ".mts",
  ".mxf",
  ".rm",
  ".ogg"
]);
const IMAGE_EXTS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const COVER_NAMES = [
  "cover",
  "poster",
  "folder",
  "Cover",
  "Poster",
  "Folder",
  "COVER",
  "POSTER",
  "FOLDER"
];
function parseEpisodeNumber(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m1 = base.match(/[−-]\s*(\d{1,3})(?:\s|\[|v|$)/);
  if (m1) return parseInt(m1[1], 10);
  const bracketNums = [...base.matchAll(/\[(\d{1,3})\]/g)];
  if (bracketNums.length > 0) {
    const last = bracketNums[bracketNums.length - 1];
    const num = parseInt(last[1], 10);
    if (num > 0 && num <= 999) return num;
  }
  const m3 = base.match(/(?:第|EP|E|#)\s*(\d{1,3})/i);
  if (m3) return parseInt(m3[1], 10);
  const m4 = base.match(/[^\d](\d{1,3})$/);
  if (m4) return parseInt(m4[1], 10);
  return 0;
}
function inferSeason(folderName) {
  const chineseNums = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10
  };
  const cn = folderName.match(/第\s*([一二三四五六七八九十\d]+)\s*季/);
  if (cn) {
    const num = chineseNums[cn[1]] || parseInt(cn[1], 10);
    if (num > 0) return num;
  }
  const en = folderName.match(/Season\s*(\d+)/i) || folderName.match(/\bS(\d+)\b/i) || folderName.match(/(\d+)(?:st|nd|rd|th)\s*Season/i);
  if (en) {
    const num = parseInt(en[1], 10);
    if (num > 0) return num;
  }
  return 1;
}
function inferSeriesType(folderName, fileNames) {
  const combined = (folderName + " " + fileNames.join(" ")).toLowerCase();
  if (/剧场版|映画|movie|film|gekijouban/i.test(combined)) return "movie";
  if (/\b(ova|oad)\b/i.test(combined)) return "ova";
  if (/オリジナル.*アニメ|原创动画/i.test(combined)) return "ova";
  if (/\b(sp|special|特别篇|特典|番外)\b/i.test(combined)) return "special";
  return "tv";
}
function titleSimilarity(a, b) {
  const s1 = a.toLowerCase().replace(/[\s\-_.:：·・]+/g, " ").trim();
  const s2 = b.toLowerCase().replace(/[\s\-_.:：·・]+/g, " ").trim();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  const len = Math.max(s1.length, s2.length);
  if (len === 0) return 1;
  const dp = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 0; i < s1.length; i++) {
    let prev = dp[0];
    dp[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const temp = dp[j + 1];
      dp[j + 1] = s1[i] === s2[j] ? prev : 1 + Math.min(prev, dp[j], dp[j + 1]);
      prev = temp;
    }
  }
  return 1 - dp[s2.length] / len;
}
const MERGE_THRESHOLD = 0.85;
function mergeSimilarSeries(seriesList) {
  if (seriesList.length <= 1) return seriesList;
  const merged = [];
  const used = /* @__PURE__ */ new Set();
  for (let i = 0; i < seriesList.length; i++) {
    if (used.has(seriesList[i].folderPath)) continue;
    let base = seriesList[i];
    used.add(base.folderPath);
    for (let j = i + 1; j < seriesList.length; j++) {
      if (used.has(seriesList[j].folderPath)) continue;
      const sim = titleSimilarity(base.title, seriesList[j].title);
      if (sim >= MERGE_THRESHOLD) {
        const other = seriesList[j];
        const mergedTitle = base.title.length <= other.title.length ? base.title : other.title;
        base = {
          ...base,
          title: mergedTitle,
          episodes: [...base.episodes, ...other.episodes],
          // 优先保留有封面的
          coverPath: base.coverPath || other.coverPath,
          // 如果任一为 movie/ova，优先用非 tv 类型
          seriesType: base.seriesType !== "tv" ? base.seriesType : other.seriesType !== "tv" ? other.seriesType : "tv"
        };
        used.add(other.folderPath);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    base.episodes = base.episodes.filter((e) => {
      const k = e.filePath;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => a.epNumber - b.epNumber);
    merged.push(base);
  }
  return merged;
}
const STATUS_PREFIXES = /^(?:完结|已?完结|已?追|未?追|在追|在播|未播|想追|想补|弃番|搁置|看过|已看|未看|没看|待看|补番)\s*/;
const TYPE_SUFFIXES = /[\s]*[（(](?:剧场版|OVA|OAD|SP|特别篇|特典|番外)[)）]?$/;
function cleanTitle(raw) {
  let title = raw;
  let prev = "";
  while (prev !== title) {
    prev = title;
    title = title.replace(STATUS_PREFIXES, "");
  }
  title = title.replace(TYPE_SUFFIXES, "").trim();
  return title || raw.trim();
}
function findCoverImage(dir, entries) {
  for (const name of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = entries.find((e) => {
        const base = e.replace(/\.[^.]+$/, "").toLowerCase();
        return base === name.toLowerCase() && path.extname(e).toLowerCase() === ext;
      });
      if (candidate) return path.join(dir, candidate);
    }
  }
  for (const entry of entries) {
    if (IMAGE_EXTS.has(path.extname(entry).toLowerCase())) {
      return path.join(dir, entry);
    }
  }
  return void 0;
}
function scanSeries(rootPath) {
  const seriesMap = /* @__PURE__ */ new Map();
  function walk(dir, depth = 0) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    const videoFiles = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let st;
      try {
        st = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry.startsWith(".") || entry === "$RECYCLE.BIN" || entry === "System Volume Information") continue;
        walk(fullPath, depth + 1);
      } else if (st.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (VIDEO_EXTS$3.has(ext)) {
          videoFiles.push(fullPath);
        }
      }
    }
    if (videoFiles.length > 0) {
      const rawTitle = path.basename(dir);
      const title = cleanTitle(rawTitle);
      const folderPath = dir;
      if (!seriesMap.has(folderPath)) {
        const coverPath = findCoverImage(dir, entries);
        seriesMap.set(folderPath, {
          title,
          folderPath,
          season: inferSeason(rawTitle),
          seriesType: inferSeriesType(rawTitle, videoFiles.map((f) => path.basename(f))),
          episodes: [],
          coverPath
        });
      }
      const series = seriesMap.get(folderPath);
      for (const filePath of videoFiles) {
        const fileName = path.basename(filePath);
        const epNumber = parseEpisodeNumber(fileName);
        const subtitleTracks = findSubtitles(filePath);
        if (!series.episodes.some((e) => e.filePath === filePath)) {
          series.episodes.push({
            fileName,
            filePath,
            epNumber,
            subtitleTracks: subtitleTracks.length > 0 ? subtitleTracks : void 0
          });
        }
      }
    }
  }
  walk(rootPath);
  const result = Array.from(seriesMap.values());
  for (const series of result) {
    series.episodes.sort((a, b) => a.epNumber - b.epNumber);
  }
  result.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  const merged = mergeSimilarSeries(result);
  merged.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  return merged;
}
function hashPath$2(p) {
  return crypto.createHash("md5").update(p).digest("hex");
}
const STORE_PATH = path.join(electron.app.getPath("userData"), "anibox-store.json");
let data = {
  series: {},
  episodes: {},
  progress: {},
  skipTimes: {},
  metadata: {},
  audioPrefs: {},
  subtitleStyle: {
    fontSize: 24,
    fontFamily: "sans-serif",
    textColor: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 2,
    bgColor: "rgba(0,0,0,0.5)",
    position: "bottom",
    secondaryFontSize: 20,
    dualSubtitleGap: 4
  },
  favorites: [],
  playlists: []
};
let loaded = false;
let storeReady = false;
function ensureReady() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      data.series = raw.series || {};
      data.episodes = raw.episodes || {};
      data.progress = raw.progress || {};
      data.skipTimes = raw.skipTimes || {};
      data.metadata = raw.metadata || {};
      data.audioPrefs = raw.audioPrefs || {};
      if (raw.subtitleStyle) {
        data.subtitleStyle = { ...data.subtitleStyle, ...raw.subtitleStyle };
      }
      data.favorites = raw.favorites || [];
      data.playlists = raw.playlists || [];
    }
  } catch {
    data = {
      series: {},
      episodes: {},
      progress: {},
      skipTimes: {},
      metadata: {},
      audioPrefs: {},
      subtitleStyle: {
        fontSize: 24,
        fontFamily: "sans-serif",
        textColor: "#FFFFFF",
        strokeColor: "#000000",
        strokeWidth: 2,
        bgColor: "rgba(0,0,0,0.5)",
        position: "bottom",
        secondaryFontSize: 20,
        dualSubtitleGap: 4
      }
    };
  }
  storeReady = true;
}
function save() {
  if (!storeReady) return;
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[AniBox] Store save failed:", e);
  }
}
function upsertSeries(id, title, folderPath, season, seriesType, coverPath) {
  ensureReady();
  const existing = data.series[id];
  data.series[id] = {
    id,
    title,
    folderPath,
    season,
    totalEps: existing?.totalEps ?? 0,
    status: existing?.status ?? "watching",
    addedAt: existing?.addedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    seriesType: seriesType || existing?.seriesType || "tv",
    coverPath: coverPath ?? existing?.coverPath
  };
  save();
}
function getAllSeries() {
  ensureReady();
  return Object.values(data.series);
}
function getSeriesById(id) {
  ensureReady();
  return data.series[id] || null;
}
function updateSeriesStatus(id, status) {
  ensureReady();
  if (data.series[id]) {
    data.series[id].status = status;
    save();
  }
}
function updateSeriesTotalEps(id, total) {
  ensureReady();
  if (data.series[id]) {
    data.series[id].totalEps = total;
    save();
  }
}
function clearEpisodesForSeries(seriesId) {
  ensureReady();
  for (const key of Object.keys(data.episodes)) {
    if (data.episodes[key].seriesId === seriesId) {
      delete data.episodes[key];
    }
  }
  save();
}
function upsertEpisode(id, seriesId, epNumber, filePath, fileName) {
  ensureReady();
  data.episodes[id] = { id, seriesId, epNumber, fileName, filePath };
}
function saveProgress(filePath, position) {
  ensureReady();
  const id = hashPath$2(filePath);
  data.progress[id] = {
    position,
    completed: position > 0 && data.progress[id]?.completed ? 1 : 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  save();
}
function loadProgress(filePath) {
  ensureReady();
  const id = hashPath$2(filePath);
  const p = data.progress[id];
  return p ? { position: p.position, completed: p.completed } : null;
}
function getSeriesProgress(seriesId) {
  ensureReady();
  const eps = Object.values(data.episodes).filter((e) => e.seriesId === seriesId);
  const watched = eps.filter((e) => data.progress[e.id]?.completed === 1).length;
  return { total: eps.length, watched };
}
function getSkipTimes(seriesId) {
  ensureReady();
  const st = data.skipTimes[seriesId];
  if (!st) return null;
  return {
    opStart: st.opStart ?? 0,
    opEnd: st.opEnd ?? 0,
    edStart: st.edStart ?? 0,
    edEnd: st.edEnd ?? 0
  };
}
function setSkipTimes(seriesId, times) {
  ensureReady();
  data.skipTimes[seriesId] = times;
  save();
}
function setSeriesMetadata(seriesId, meta) {
  ensureReady();
  data.metadata[seriesId] = meta;
  save();
}
function getSeriesMetadata(seriesId) {
  ensureReady();
  return data.metadata[seriesId] || null;
}
function getAllMetadata() {
  ensureReady();
  return data.metadata;
}
function getAudioPrefs(seriesId) {
  ensureReady();
  return data.audioPrefs[seriesId] || null;
}
function setAudioPrefs(seriesId, prefs) {
  ensureReady();
  data.audioPrefs[seriesId] = prefs;
  save();
}
function getGlobalAudioPrefs() {
  ensureReady();
  const langCount = {};
  for (const pref of Object.values(data.audioPrefs)) {
    if (pref.language) {
      langCount[pref.language] = (langCount[pref.language] || 0) + 1;
    }
  }
  let maxLang = "ja";
  let maxCount = 0;
  for (const [lang, count] of Object.entries(langCount)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang;
    }
  }
  return { preferredLanguage: maxLang };
}
function getSubtitleStyle() {
  ensureReady();
  return { ...data.subtitleStyle };
}
function setSubtitleStyle(style) {
  ensureReady();
  data.subtitleStyle = { ...data.subtitleStyle, ...style };
  save();
}
function getFavorites() {
  ensureReady();
  return data.favorites;
}
function isFavorited(seriesId) {
  ensureReady();
  return data.favorites.includes(seriesId);
}
function toggleFavorite(seriesId) {
  ensureReady();
  const idx = data.favorites.indexOf(seriesId);
  if (idx >= 0) {
    data.favorites.splice(idx, 1);
    save();
    return false;
  } else {
    data.favorites.push(seriesId);
    save();
    return true;
  }
}
function getPlaylists() {
  ensureReady();
  return data.playlists;
}
function createPlaylist(name) {
  ensureReady();
  const id = crypto.createHash("md5").update(name + Date.now().toString()).digest("hex").substring(0, 8);
  data.playlists.push({ id, name, seriesIds: [], createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  save();
  return id;
}
function deletePlaylist(id) {
  ensureReady();
  data.playlists = data.playlists.filter((p) => p.id !== id);
  save();
}
function addToPlaylist(listId, seriesId) {
  ensureReady();
  const list = data.playlists.find((p) => p.id === listId);
  if (list && !list.seriesIds.includes(seriesId)) {
    list.seriesIds.push(seriesId);
    save();
  }
}
function removeFromPlaylist(listId, seriesId) {
  ensureReady();
  const list = data.playlists.find((p) => p.id === listId);
  if (list) {
    list.seriesIds = list.seriesIds.filter((id) => id !== seriesId);
    save();
  }
}
const UA$2 = "AniBox/0.1 (https://github.com/anibox; local anime manager)";
const TIMEOUT$1 = 15e3;
const VIDEO_EXTS$2 = /* @__PURE__ */ new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".ts", ".m2ts", ".rmvb", ".wmv"]);
function extractTitleFromFilename$1(fileName) {
  let name = fileName;
  name = name.replace(/\.[^.]+$/, "");
  name = name.replace(/\[[^\]]*\]/g, "");
  name = name.replace(/\([^)]*\)/g, "");
  name = name.replace(/[−-]\s*\d{1,3}(?:\s|\[|v\d|$)/g, "");
  name = name.replace(/(?:第|EP|E|#)\s*\d{1,3}/gi, "");
  name = name.replace(/\b(?:v\d|OVA|SP|NC)\b/gi, "");
  name = name.replace(/\bSeason\s*\d+\b/gi, "");
  name = name.replace(/\bS\d+\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}
function extractRomajiFromFolder$1(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath);
    const titles = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      try {
        if (VIDEO_EXTS$2.has(path.extname(entry).toLowerCase())) {
          const extracted = extractTitleFromFilename$1(entry);
          if (extracted.length >= 2 && /[a-zA-Z]/.test(extracted)) {
            titles.set(extracted, (titles.get(extracted) || 0) + 1);
          }
        }
      } catch {
      }
    }
    return Array.from(titles.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title]) => title);
  } catch {
    return [];
  }
}
function fetchGet$1(url) {
  return new Promise((resolve) => {
    const isHttp = url.startsWith("http://");
    const mod = isHttp ? require("http") : require("https");
    const req = mod.get(url, { headers: { "User-Agent": UA$2 }, timeout: TIMEOUT$1 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        console.log("[AniBox] GET", res.statusCode, url.slice(0, 60));
        resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString("utf-8") });
      });
    });
    req.on("error", (e) => {
      console.error("[AniBox] GET failed:", url.slice(0, 80), e.message);
      resolve(null);
    });
    req.on("timeout", () => {
      req.destroy();
      console.error("[AniBox] GET timeout:", url.slice(0, 80));
      resolve(null);
    });
  });
}
function httpsPost$1(url, body) {
  return new Promise((resolve) => {
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": UA$2 },
      timeout: TIMEOUT$1
    };
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        console.log("[AniBox] POST", res.statusCode, url.slice(0, 60));
        resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString("utf-8") });
      });
    });
    req.on("error", (e) => {
      console.error("[AniBox] POST failed:", url.slice(0, 80), e.message);
      resolve(null);
    });
    req.on("timeout", () => {
      req.destroy();
      console.error("[AniBox] POST timeout:", url.slice(0, 80));
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}
async function fetchGetJson$1(url) {
  const res = await fetchGet$1(url);
  if (!res || res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.data);
  } catch {
    return null;
  }
}
async function httpsPostJson$1(url, body) {
  const res = await httpsPost$1(url, body);
  if (!res || res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.data);
  } catch {
    return null;
  }
}
function downloadImage$1(url, savePath) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": UA$2 }, timeout: TIMEOUT$1 }, (res) => {
      if (res.statusCode !== 200) {
        resolve(false);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          fs.writeFileSync(savePath, Buffer.concat(chunks));
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
function searchQueries$1(title) {
  const qs = [
    title,
    title.replace(/\s*第[一二三四五六七八九十\d]+\s*季?\s*$/, "").trim(),
    title.replace(/\s*Season\s*\d+\s*$/i, "").trim(),
    title.replace(/\s*S\d+\s*$/i, "").trim()
  ];
  const asciiOnly = title.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, "").trim();
  if (asciiOnly.length >= 3) {
    qs.push(asciiOnly);
  }
  return [...new Set(qs.filter((q) => q.length >= 2))];
}
function levenshtein$1(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
function bestMatch(query, candidates) {
  const q = query.toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    for (const name of c.names) {
      const n = name.toLowerCase();
      if (n.includes(q) || q.includes(n)) return c;
      const dist = levenshtein$1(q, n);
      const score = dist / Math.max(q.length, n.length);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return bestScore < 0.5 ? best : candidates[0] || null;
}
async function searchAniList(query) {
  try {
    const gql = JSON.stringify({
      query: `query($s:String){Page(perPage:5){media(search:$s,type:ANIME,format_not:MUSIC){id title{romaji english native}coverImage{large}}}}`,
      variables: { s: query }
    });
    const json = await httpsPostJson$1("https://graphql.anilist.co", gql);
    const media = json?.data?.Page?.media;
    console.log("[AniList] results:", media?.length || 0);
    if (!media?.length) return [];
    return media.filter((m) => m.coverImage?.large).map((m) => ({
      names: [m.title.romaji, m.title.english, m.title.native].filter(Boolean),
      coverUrl: m.coverImage.large
    }));
  } catch (e) {
    console.error("[AniBox] AniList error:", e.message);
    return [];
  }
}
async function fetchAniList(query) {
  const items = await searchAniList(query);
  if (!items.length) return null;
  const match = bestMatch(query, items);
  console.log("[AniList] bestMatch:", match ? items[0].names[0] : "null", "| cover:", match?.coverUrl ? "OK" : "NO");
  return match?.coverUrl || null;
}
async function searchJikan(query) {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`;
    const json = await fetchGetJson$1(url);
    if (!json?.data?.length) return [];
    return json.data.filter((e) => e.images?.jpg?.large_image_url).map((e) => ({
      names: [e.title, e.title_english, e.title_japanese].filter(Boolean),
      coverUrl: e.images.jpg.large_image_url
    }));
  } catch (e) {
    console.error("[AniBox] Jikan error:", e.message);
    return [];
  }
}
async function fetchJikan(query) {
  const items = await searchJikan(query);
  if (!items.length) return null;
  const match = bestMatch(query, items);
  if (match) console.log("[Jikan] matched ->", items[0].names[0]);
  return match?.coverUrl || null;
}
async function searchBangumi(query) {
  try {
    const url = `http://api.bgm.tv/search/subject/${encodeURIComponent(query)}?type=2&responseGroup=small&max_results=5`;
    const json = await fetchGetJson$1(url);
    if (!json?.list?.length) return [];
    return json.list.map((s) => ({
      id: s.id,
      names: [s.name_cn, s.name].filter(Boolean),
      coverUrl: ""
    }));
  } catch (e) {
    console.error("[AniBox] Bangumi error:", e.message);
    return [];
  }
}
async function getBangumiDetail$1(id) {
  const url = `http://api.bgm.tv/subject/${id}?responseGroup=large`;
  const json = await fetchGetJson$1(url);
  return json?.images?.large || json?.images?.common || null;
}
async function fetchBangumi(query) {
  const items = await searchBangumi(query);
  if (!items.length) return null;
  const match = bestMatch(query, items.map((s) => ({ names: s.names, coverUrl: s.coverUrl })));
  if (!match) return null;
  const coverUrl = await getBangumiDetail$1(items[0].id);
  if (coverUrl) console.log("[Bangumi] matched -> cover found");
  return coverUrl || null;
}
const PROVIDERS = [
  { name: "AniList", fetch: fetchAniList },
  { name: "Jikan", fetch: fetchJikan },
  { name: "Bangumi", fetch: fetchBangumi }
];
async function fetchCoverForSeries(title, folderPath, onStatus) {
  const coverPath = path.join(folderPath, "cover.jpg");
  if (fs.existsSync(coverPath)) {
    onStatus?.("已有封面，跳过");
    return coverPath;
  }
  const queries = searchQueries$1(title);
  const romajiTitles = extractRomajiFromFolder$1(folderPath);
  if (romajiTitles.length > 0) {
    console.log("[AniBox] Romaji from files:", romajiTitles.join(", "));
    queries.unshift(...romajiTitles);
  }
  for (let qi = 0; qi < Math.min(queries.length, 5); qi++) {
    const query = queries[qi];
    for (const provider of PROVIDERS) {
      console.log("[AniBox] Trying", provider.name);
      onStatus?.(`搜索 ${provider.name}...`);
      const coverUrl = await provider.fetch(query);
      if (!coverUrl) continue;
      onStatus?.("下载封面中...");
      const ok = await downloadImage$1(coverUrl, coverPath);
      if (ok) {
        console.log("[AniBox] Cover saved OK");
        return coverPath;
      }
      console.error("[AniBox] Cover download failed");
    }
  }
  console.log("[AniBox] Cover not found (all providers exhausted)");
  return null;
}
async function fetchCoverManual(folderPath, searchQuery) {
  const coverPath = path.join(folderPath, "cover.jpg");
  if (fs.existsSync(coverPath)) return coverPath;
  console.log("[AniBox] Manual search:", searchQuery);
  const coverUrl = await fetchAniList(searchQuery);
  if (!coverUrl) return null;
  const ok = await downloadImage$1(coverUrl, coverPath);
  return ok ? coverPath : null;
}
async function fetchCoversBatch(series, onProgress) {
  let fetched = 0;
  let failed = 0;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    onProgress?.(i + 1, series.length, s.title, false, "准备中...");
    const result = await fetchCoverForSeries(s.title, s.folderPath, (status) => {
      onProgress?.(i + 1, series.length, s.title, false, status);
    });
    if (result) {
      fetched++;
      onProgress?.(i + 1, series.length, s.title, true, "已获取");
    } else {
      failed++;
      onProgress?.(i + 1, series.length, s.title, false, "未找到");
    }
    if (i < series.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { total: series.length, fetched, failed };
}
let openSubtitlesApiKey = "";
let openSubtitlesUserAgent = "AniBox/1.0";
function setOpenSubtitlesConfig(apiKey, userAgent) {
  openSubtitlesApiKey = apiKey;
  if (userAgent) openSubtitlesUserAgent = userAgent;
}
async function searchOpenSubtitles(query, episode, lang) {
  if (!openSubtitlesApiKey) return [];
  const searchQuery = episode ? `${query} episode ${episode}` : query;
  const params = new URLSearchParams({
    query: searchQuery,
    languages: lang,
    order_by: "download_count",
    type: episode ? "episode" : "movie"
  });
  try {
    const resp = await fetch(
      `https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`,
      {
        headers: {
          "Api-Key": openSubtitlesApiKey,
          "User-Agent": openSubtitlesUserAgent,
          "Content-Type": "application/json"
        }
      }
    );
    if (!resp.ok) return [];
    const data2 = await resp.json();
    const results = [];
    for (const item of data2.data || []) {
      const attrs = item.attributes;
      const file = attrs.files?.[0];
      if (!file) continue;
      results.push({
        id: `os_${attrs.subtitle_id}`,
        title: attrs.release || attrs.feature_details?.title || file.file_name,
        language: attrs.language,
        languageLabel: getLanguageLabel(attrs.language),
        source: "opensubtitles",
        downloadUrl: "",
        // 需要二次请求获取下载链接
        fileName: file.file_name,
        rating: attrs.ratings || 0,
        downloads: attrs.download_count || 0
      });
    }
    return results;
  } catch {
    return [];
  }
}
async function getOpenSubtitlesDownloadUrl(fileId) {
  if (!openSubtitlesApiKey) return "";
  try {
    const resp = await fetch("https://api.opensubtitles.com/api/v1/download", {
      method: "POST",
      headers: {
        "Api-Key": openSubtitlesApiKey,
        "User-Agent": openSubtitlesUserAgent,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file_id: fileId })
    });
    if (!resp.ok) return "";
    const data2 = await resp.json();
    return data2.link || "";
  } catch {
    return "";
  }
}
async function searchOnlineSubtitles(query) {
  const results = [];
  const lang = query.preferredLanguages?.join(",") || "zh,ja,en";
  const [osResults, animeResults] = await Promise.all([
    searchOpenSubtitles(query.title, query.episode, lang),
    searchAnimeSubs(query.title, query.episode)
  ]);
  results.push(...osResults);
  results.push(...animeResults);
  const seen = /* @__PURE__ */ new Set();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).sort((a, b) => b.downloads - a.downloads || b.rating - a.rating);
}
async function downloadSubtitle(result, videoPath) {
  const videoDir = path.dirname(videoPath);
  const videoName = videoPath.replace(/\.[^.]+$/, "").replace(/.*[/\\]/, "");
  try {
    let downloadUrl = result.downloadUrl;
    if (result.source === "opensubtitles" && !downloadUrl) {
      const fileId = parseInt(result.id.replace("os_", ""), 10);
      if (!isNaN(fileId)) {
        downloadUrl = await getOpenSubtitlesDownloadUrl(fileId);
      }
    }
    if (!downloadUrl) return null;
    const resp = await fetch(downloadUrl);
    if (!resp.ok) return null;
    let ext = ".srt";
    const disposition = resp.headers.get("content-disposition");
    if (disposition) {
      const m = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (m) {
        const fn = m[1].replace(/['"]/g, "");
        const dotIdx = fn.lastIndexOf(".");
        if (dotIdx >= 0) ext = fn.substring(dotIdx);
      }
    }
    const langTag = result.language || "zh";
    const saveName = `${videoName}.${langTag}${ext}`;
    const savePath = path.join(videoDir, saveName);
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(savePath, buffer);
    return savePath;
  } catch (err) {
    console.error("[AniBox] Subtitle download failed:", err);
    return null;
  }
}
function getOpenSubtitlesStatus() {
  return {
    configured: openSubtitlesApiKey.length > 0,
    apiKeySet: openSubtitlesApiKey.length > 0
  };
}
async function searchAnimeSubs(_title, _ep) {
  return [];
}
function getLanguageLabel(code) {
  const map = {
    "zh": "中文",
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
    "zh-Hans": "简体中文",
    "zh-Hant": "繁體中文",
    "ja": "日本語",
    "en": "English",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "pt": "Português",
    "it": "Italiano",
    "ru": "Русский",
    "ar": "العربية",
    "th": "ไทย",
    "vi": "Tiếng Việt"
  };
  return map[code] || code;
}
function readBox(buf, off) {
  if (off + 8 > buf.length) return null;
  let sz = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  let headerBytes = 8;
  if (sz === 1) {
    const hi = buf.readUInt32BE(off + 8);
    const lo = buf.readUInt32BE(off + 12);
    sz = Number(BigInt(hi) << 32n | BigInt(lo));
    headerBytes = 16;
  } else if (sz === 0) {
    sz = buf.length - off;
  }
  const dataOff = off + headerBytes;
  const dataSize = sz - headerBytes;
  return { type, offset: dataOff, size: dataSize, next: off + sz };
}
function findBox(buf, parent, targetType) {
  let off = parent.offset;
  const end = parent.offset + parent.size;
  while (off + 8 <= end) {
    const box = readBox(buf, off);
    if (!box) break;
    if (box.type === targetType) return box;
    off = box.next;
  }
  return null;
}
function collectBoxes(buf, parent, targetType) {
  const result = [];
  let off = parent.offset;
  const end = parent.offset + parent.size;
  while (off + 8 <= end) {
    const box = readBox(buf, off);
    if (!box) break;
    if (box.type === targetType) result.push(box);
    off = box.next;
  }
  return result;
}
function readFixed16_16(buf, off) {
  return buf.readUInt32BE(off) / 65536;
}
function parseMP4Meta(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buf.length < 24) return null;
  const ftyp = readBox(buf, 0);
  if (!ftyp || ftyp.type !== "ftyp") return null;
  let moov = null;
  let off = 0;
  while (off + 8 <= buf.length) {
    const box = readBox(buf, off);
    if (!box) break;
    if (box.type === "moov") {
      moov = box;
      break;
    }
    off = box.next;
  }
  if (!moov) return null;
  const traks = collectBoxes(buf, moov, "trak");
  for (const trak of traks) {
    const mdia = findBox(buf, trak, "mdia");
    if (!mdia) continue;
    const hdlr = findBox(buf, mdia, "hdlr");
    if (!hdlr) continue;
    if (hdlr.size < 12) continue;
    const subtype = buf.toString("ascii", hdlr.offset + 8, hdlr.offset + 12);
    if (subtype !== "vide") continue;
    const tkhd = findBox(buf, trak, "tkhd");
    if (!tkhd) continue;
    if (tkhd.size < 8) continue;
    const wOff = tkhd.offset + tkhd.size - 8;
    const width = readFixed16_16(buf, wOff);
    const height = readFixed16_16(buf, wOff + 4);
    const mdhd = findBox(buf, mdia, "mdhd");
    if (!mdhd) continue;
    const mdhdVer = buf.readUInt8(mdhd.offset);
    let timescale;
    let duration;
    if (mdhdVer === 0) {
      timescale = buf.readUInt32BE(mdhd.offset + 12);
      duration = buf.readUInt32BE(mdhd.offset + 16);
    } else {
      timescale = buf.readUInt32BE(mdhd.offset + 20);
      const hi = buf.readUInt32BE(mdhd.offset + 24);
      const lo = buf.readUInt32BE(mdhd.offset + 28);
      duration = Number(BigInt(hi) << 32n | BigInt(lo));
    }
    const durationSec = timescale > 0 ? duration / timescale : 0;
    const minf = findBox(buf, mdia, "minf");
    const stbl = minf ? findBox(buf, minf, "stbl") : null;
    let codec = "H.264";
    if (stbl) {
      const stsd = findBox(buf, stbl, "stsd");
      if (stsd && stsd.size >= 24) {
        const format = buf.toString("ascii", stsd.offset + 12, stsd.offset + 16);
        if (format === "avc1" || format === "avc3") codec = "H.264";
        else if (format === "hvc1" || format === "hev1") codec = "H.265/HEVC";
        else if (format === "vp09") codec = "VP9";
        else if (format === "av01") codec = "AV1";
      }
    }
    let totalStreamBytes = 0;
    let sampleCount = 0;
    if (stbl) {
      const stsz = findBox(buf, stbl, "stsz");
      if (stsz && stsz.size >= 12) {
        const sampleSize = buf.readUInt32BE(stsz.offset + 4);
        sampleCount = buf.readUInt32BE(stsz.offset + 8);
        if (sampleSize > 0) {
          totalStreamBytes = sampleSize * sampleCount;
        } else {
          const listOff = stsz.offset + 12;
          for (let i = 0; i < sampleCount && listOff + (i + 1) * 4 <= stsz.offset + stsz.size; i++) {
            totalStreamBytes += buf.readUInt32BE(listOff + i * 4);
          }
        }
      }
    }
    const exactBitrate = durationSec > 0 && totalStreamBytes > 0 ? Math.round(totalStreamBytes * 8 / durationSec) : 0;
    const fps = durationSec > 0 && sampleCount > 0 ? Math.round(sampleCount / durationSec * 100) / 100 : 0;
    if (width > 0 && height > 0) {
      return { width, height, codec, fps, exactBitrate };
    }
  }
  return null;
}
const UA$1 = "AniBox/0.1 (https://github.com/anibox; local anime manager)";
const TIMEOUT = 15e3;
const VIDEO_EXTS$1 = /* @__PURE__ */ new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".ts", ".m2ts", ".rmvb", ".wmv"]);
function extractTitleFromFilename(fileName) {
  let name = fileName;
  name = name.replace(/\.[^.]+$/, "");
  name = name.replace(/\[[^\]]*\]/g, "");
  name = name.replace(/\([^)]*\)/g, "");
  name = name.replace(/[−-]\s*\d{1,3}(?:\s|\[|v\d|$)/g, "");
  name = name.replace(/(?:第|EP|E|#)\s*\d{1,3}/gi, "");
  name = name.replace(/\b(?:v\d|OVA|SP|NC)\b/gi, "");
  name = name.replace(/\bSeason\s*\d+\b/gi, "");
  name = name.replace(/\bS\d+\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}
function extractRomajiFromFolder(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath);
    const titles = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      try {
        if (VIDEO_EXTS$1.has(path.extname(entry).toLowerCase())) {
          const extracted = extractTitleFromFilename(entry);
          if (extracted.length >= 2 && /[a-zA-Z]/.test(extracted)) {
            titles.set(extracted, (titles.get(extracted) || 0) + 1);
          }
        }
      } catch {
      }
    }
    return Array.from(titles.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title]) => title);
  } catch {
    return [];
  }
}
function fetchGet(url) {
  return new Promise((resolve) => {
    const isHttp = url.startsWith("http://");
    const mod = isHttp ? require("http") : require("https");
    const req = mod.get(url, { headers: { "User-Agent": UA$1 }, timeout: TIMEOUT }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}
function httpsPost(url, body) {
  return new Promise((resolve) => {
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": UA$1 },
      timeout: TIMEOUT
    };
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}
async function fetchGetJson(url) {
  const res = await fetchGet(url);
  if (!res || res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.data);
  } catch {
    return null;
  }
}
async function httpsPostJson(url, body) {
  const res = await httpsPost(url, body);
  if (!res || res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.data);
  } catch {
    return null;
  }
}
function downloadImage(url, savePath) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": UA$1 }, timeout: TIMEOUT }, (res) => {
      if (res.statusCode !== 200) {
        resolve(false);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          fs.writeFileSync(savePath, Buffer.concat(chunks));
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
function searchQueries(title) {
  const qs = [
    title,
    title.replace(/\s*第[一二三四五六七八九十\d]+\s*季?\s*$/, "").trim(),
    title.replace(/\s*Season\s*\d+\s*$/i, "").trim(),
    title.replace(/\s*S\d+\s*$/i, "").trim()
  ];
  const asciiOnly = title.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, "").trim();
  if (asciiOnly.length >= 3) qs.push(asciiOnly);
  return [...new Set(qs.filter((q) => q.length >= 2))];
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
const ANILIST_GQL = `query($s:String){Page(perPage:8){media(search:$s,type:ANIME,format_not:MUSIC){id idMal title{romaji english native} coverImage{large extraLarge} description bannerImage startDate{year month day} season seasonYear episodes averageScore genres studios(isMain:true){nodes{name}} staff(sort:RELEVANCE,perPage:6){nodes{name{full} primaryOccupations}}}}}`;
async function searchAniListMeta(query) {
  try {
    const gql = JSON.stringify({ query: ANILIST_GQL, variables: { s: query } });
    const json = await httpsPostJson("https://graphql.anilist.co", gql);
    const media = json?.data?.Page?.media || [];
    return media.filter((m) => m.coverImage?.large);
  } catch {
    return null;
  }
}
function matchAniList(query, candidates) {
  const q = query.toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const m of candidates) {
    const names = [m.title.romaji, m.title.english, m.title.native].filter(Boolean);
    for (const name of names) {
      const n = name.toLowerCase();
      if (n.includes(q) || q.includes(n)) return m;
      const dist = levenshtein(q, n);
      const score = dist / Math.max(q.length, n.length);
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
  }
  return bestScore < 0.5 ? best : candidates[0] || null;
}
function cleanAniListDesc(raw) {
  return raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
function seasonLabel(season, seasonYear) {
  const map = { WINTER: "冬季", SPRING: "春季", SUMMER: "夏季", FALL: "秋季" };
  const yr = seasonYear || 0;
  const s = map[season?.toUpperCase()] || season || "";
  return yr ? `${yr}年${s}` : s;
}
async function fetchAniListMeta(query) {
  const candidates = await searchAniListMeta(query);
  if (!candidates?.length) return null;
  const m = matchAniList(query, candidates);
  if (!m) return null;
  const staffList = m.staff?.nodes?.map((s) => ({
    role: s.primaryOccupations?.[0] || "",
    name: s.name?.full || ""
  })).filter((s) => s.name) || [];
  const studioName = m.studios?.nodes?.[0]?.name || "";
  const year = m.seasonYear || m.startDate?.year || 0;
  return {
    title: m.title.romaji || m.title.english || "",
    titleCn: m.title.native || m.title.romaji || "",
    titleEn: m.title.english || "",
    synopsis: m.description ? cleanAniListDesc(m.description) : "",
    rating: m.averageScore ? m.averageScore / 10 : 0,
    genres: m.genres || [],
    year,
    season: seasonLabel(m.season, m.seasonYear),
    episodes: m.episodes || 0,
    studio: studioName,
    staff: staffList,
    coverUrl: m.coverImage.extraLarge || m.coverImage.large,
    anilistId: m.id,
    bangumiId: 0
  };
}
async function searchBangumiMeta(query) {
  try {
    const url = `http://api.bgm.tv/search/subject/${encodeURIComponent(query)}?type=2&responseGroup=small&max_results=5`;
    const json = await fetchGetJson(url);
    if (!json?.list?.length) return [];
    return json.list.map((s) => ({
      id: s.id,
      name: s.name || "",
      name_cn: s.name_cn || "",
      summary: "",
      images: { large: "", common: "" },
      rating: { score: s.rating?.score || 0, total: s.rating?.total || 0 },
      eps: s.eps || 0,
      air_date: s.air_date || "",
      air_weekday: s.air_weekday || 0,
      type: s.type || 2,
      staff: [],
      meta_tags: []
    }));
  } catch {
    return [];
  }
}
async function getBangumiDetail(bgId) {
  const url = `http://api.bgm.tv/subject/${bgId}?responseGroup=large`;
  const json = await fetchGetJson(url);
  if (!json) return null;
  return {
    id: json.id || bgId,
    name: json.name || "",
    name_cn: json.name_cn || "",
    summary: json.summary || "",
    images: json.images || { large: "", common: "" },
    rating: json.rating || { score: 0, total: 0 },
    eps: json.eps_count || json.eps || 0,
    air_date: json.air_date || "",
    air_weekday: json.air_weekday || 0,
    type: json.type || 2,
    staff: (json.crt || []).map((s) => ({
      name: s.name || "",
      jobs: s.jobs || []
    })),
    meta_tags: json.meta_tags || []
  };
}
async function fetchBangumiMeta(query) {
  const items = await searchBangumiMeta(query);
  if (!items.length) return null;
  const q = query.toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const s2 of items) {
    const names = [s2.name_cn, s2.name].filter(Boolean);
    for (const name of names) {
      const n = name.toLowerCase();
      if (n.includes(q) || q.includes(n)) {
        best = s2;
        break;
      }
      const dist = levenshtein(q, n);
      const score = dist / Math.max(q.length, n.length);
      if (score < bestScore) {
        bestScore = score;
        best = s2;
      }
    }
    if (best && bestScore === 0) break;
  }
  if (!best) best = items[0];
  const detail = await getBangumiDetail(best.id);
  const s = detail || best;
  const staffList = (s.staff || []).map((st) => ({
    role: st.jobs?.[0] || "",
    name: st.name || ""
  })).filter((st) => st.name);
  let year = 0;
  const yearMatch = s.air_date?.match(/(\d{4})/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);
  const genres = (s.meta_tags || []).filter(
    (t) => !["TV", "OVA", "剧场版", "WEB", "小说改", "漫画改", "游戏改", "原创"].includes(t)
  );
  return {
    title: s.name_cn || s.name || "",
    titleCn: s.name_cn || "",
    titleEn: s.name || "",
    synopsis: s.summary || "",
    rating: s.rating?.score || 0,
    genres: genres.length > 0 ? genres : ["动画"],
    year,
    season: year ? `${year}年` : "",
    episodes: s.eps || 0,
    studio: "",
    staff: staffList,
    coverUrl: s.images?.large || s.images?.common || "",
    anilistId: 0,
    bangumiId: s.id
  };
}
async function fetchFullMetadata(title, folderPath) {
  const queries = searchQueries(title);
  const romajiTitles = extractRomajiFromFolder(folderPath);
  if (romajiTitles.length > 0) queries.unshift(...romajiTitles);
  for (let qi = 0; qi < Math.min(queries.length, 5); qi++) {
    const query = queries[qi];
    const [alMeta, bgMeta] = await Promise.all([
      fetchAniListMeta(query),
      fetchBangumiMeta(query)
    ]);
    if (!alMeta && !bgMeta) continue;
    const primary = alMeta || bgMeta;
    const secondary = bgMeta || alMeta;
    return {
      title: primary.title || secondary?.title || "",
      titleCn: bgMeta?.titleCn || alMeta?.titleCn || "",
      titleEn: alMeta?.titleEn || bgMeta?.titleEn || "",
      synopsis: alMeta?.synopsis || bgMeta?.synopsis || "",
      rating: Math.max(alMeta?.rating || 0, bgMeta?.rating || 0),
      genres: [.../* @__PURE__ */ new Set([...alMeta?.genres || [], ...bgMeta?.genres || []])],
      year: alMeta?.year || bgMeta?.year || 0,
      season: alMeta?.season || bgMeta?.season || "",
      episodes: alMeta?.episodes || bgMeta?.episodes || 0,
      studio: alMeta?.studio || "",
      staff: alMeta?.staff?.length ? alMeta.staff : bgMeta?.staff || [],
      coverUrl: alMeta?.coverUrl || bgMeta?.coverUrl || "",
      anilistId: alMeta?.anilistId || 0,
      bangumiId: bgMeta?.bangumiId || 0
    };
  }
  return null;
}
async function fetchMetadataForSeries(title, folderPath, onStatus) {
  onStatus?.("搜索元数据...");
  const metadata = await fetchFullMetadata(title, folderPath);
  let coverPath = null;
  if (metadata?.coverUrl) {
    const coverFile = path.join(folderPath, "cover.jpg");
    if (!fs.existsSync(coverFile)) {
      onStatus?.("下载封面...");
      const ok = await downloadImage(metadata.coverUrl, coverFile);
      if (ok) coverPath = coverFile;
    } else {
      coverPath = coverFile;
    }
  }
  if (metadata) {
    console.log(`[AniBox] Metadata OK: ${title} → rating=${metadata.rating}, genres=${metadata.genres.join(",")}, year=${metadata.year}`);
  }
  return { metadata, coverPath };
}
async function fetchMetadataBatch(series, onProgress) {
  let fetched = 0;
  let failed = 0;
  const results = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    onProgress?.(i + 1, series.length, s.title, false, "搜索中...");
    const result = await fetchMetadataForSeries(s.title, s.folderPath, (status) => {
      onProgress?.(i + 1, series.length, s.title, false, status);
    });
    results.push({
      folderPath: s.folderPath,
      metadata: result.metadata,
      coverPath: result.coverPath
    });
    if (result.metadata) {
      fetched++;
      onProgress?.(i + 1, series.length, s.title, true, "已获取");
    } else {
      failed++;
      onProgress?.(i + 1, series.length, s.title, false, "未找到");
    }
    if (i < series.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { total: series.length, fetched, failed, results };
}
let whisperModelPath = "";
let whisperBinaryPath = "";
function setWhisperConfig(config) {
  whisperBinaryPath = config.binaryPath;
  whisperModelPath = config.modelPath;
}
function isWhisperAvailable() {
  return fs.existsSync(whisperBinaryPath) && fs.existsSync(whisperModelPath);
}
function getWhisperStatus() {
  return {
    available: isWhisperAvailable(),
    binaryExists: fs.existsSync(whisperBinaryPath),
    modelExists: fs.existsSync(whisperModelPath),
    modelPath: whisperModelPath,
    binaryPath: whisperBinaryPath
  };
}
function getDefaultWhisperPaths() {
  if (electron.app.isPackaged) {
    return {
      binary: path.join(process.resourcesPath, "whisper", "whisper-cli.exe"),
      models: path.join(process.resourcesPath, "whisper", "models")
    };
  }
  return {
    binary: path.join(__dirname, "../../whisper/whisper-cli.exe"),
    models: path.join(__dirname, "../../whisper/models")
  };
}
async function transcribeWithWhisper(videoPath, onProgress) {
  if (!isWhisperAvailable()) {
    throw new Error("Whisper 未配置。请下载 whisper.cpp 和模型文件。");
  }
  const audioDir = path.join(path.dirname(videoPath), ".anibox_temp");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, "extracted_audio.wav");
  const outputPath = videoPath.replace(/\.[^.]+$/, "") + ".whisper.srt";
  path.join(audioDir, "output.csv");
  try {
    onProgress?.("正在提取音频...");
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      audioPath
    ]);
    if (!fs.existsSync(audioPath)) {
      throw new Error("音频提取失败");
    }
    onProgress?.("正在语音识别...");
    await runCommand(whisperBinaryPath, [
      "-m",
      whisperModelPath,
      "-f",
      audioPath,
      "-l",
      "ja",
      // 默认日语（动漫最常见）
      "-osrt",
      // 输出 SRT 字幕
      "-of",
      outputPath.replace(".srt", ""),
      "-ocsv",
      // 输出 CSV（含时间戳）
      "-of",
      path.join(audioDir, "output")
    ]);
    const srtFile = outputPath;
    if (!fs.existsSync(srtFile)) {
      throw new Error("Whisper 未生成字幕文件");
    }
    const srtContent = fs.readFileSync(srtFile, "utf-8");
    const segments = parseSrtToSegments(srtContent);
    const finalSrtPath = videoPath.replace(/\.[^.]+$/, "") + ".whisper.ja.srt";
    fs.writeFileSync(finalSrtPath, srtContent);
    onProgress?.("识别完成！");
    return {
      segments,
      fullText: segments.map((s) => s.text).join(" "),
      language: "ja",
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0
    };
  } catch (err) {
    console.error("[AniBox] Whisper error:", err);
    throw err;
  } finally {
    try {
      if (fs.existsSync(audioPath)) {
      }
    } catch {
    }
  }
}
function parseSrtToSegments(srt) {
  const segments = [];
  const blocks = srt.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const tsMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!tsMatch) continue;
    const start = parseInt(tsMatch[1]) * 3600 + parseInt(tsMatch[2]) * 60 + parseInt(tsMatch[3]) + parseInt(tsMatch[4]) / 1e3;
    const end = parseInt(tsMatch[5]) * 3600 + parseInt(tsMatch[6]) * 60 + parseInt(tsMatch[7]) + parseInt(tsMatch[8]) / 1e3;
    const text = lines.slice(2).join("\n").trim();
    segments.push({ start, end, text });
  }
  return segments;
}
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
    proc.on("error", (err) => reject(err));
  });
}
let translationConfig = { engine: "google" };
function setTranslationConfig(config) {
  translationConfig = { ...translationConfig, ...config };
}
async function translateText(text, fromLang = "ja", toLang = "zh-CN") {
  if (!text.trim()) return "";
  try {
    switch (translationConfig.engine) {
      case "deepl":
        return await translateDeepL(text, fromLang, toLang);
      case "libre":
        return await translateLibre(text, fromLang, toLang);
      case "google":
      default:
        return await translateGoogle(text, fromLang, toLang);
    }
  } catch {
    return await translateGoogle(text, fromLang, toLang).catch(() => text);
  }
}
async function translateGoogle(text, from, to) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: from === "ja" ? "ja" : "en",
    tl: to === "zh-CN" ? "zh-CN" : "zh",
    dt: "t",
    q: text.substring(0, 1500)
    // Google Translate URL 长度限制
  });
  const resp = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
    { signal: AbortSignal.timeout(5e3) }
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data2 = await resp.json();
  const result = (data2[0] || []).map((item) => item[0] || "").join("");
  return result || text;
}
async function translateDeepL(text, from, to) {
  if (!translationConfig.apiKey) throw new Error("DeepL API Key 未配置");
  const targetLang = to === "zh-CN" ? "ZH" : "EN-US";
  const resp = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${translationConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
      source_lang: from === "ja" ? "JA" : "EN"
    }),
    signal: AbortSignal.timeout(5e3)
  });
  if (!resp.ok) throw new Error(`DeepL HTTP ${resp.status}`);
  const data2 = await resp.json();
  return data2.translations?.[0]?.text || text;
}
async function translateLibre(text, from, to) {
  const apiUrl = translationConfig.apiUrl || "https://translate.argosopentech.com";
  const resp = await fetch(`${apiUrl}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: from,
      target: to === "zh-CN" ? "zh" : to,
      format: "text"
    }),
    signal: AbortSignal.timeout(5e3)
  });
  if (!resp.ok) throw new Error(`Libre HTTP ${resp.status}`);
  const data2 = await resp.json();
  return data2.translatedText || text;
}
async function translateSubtitleSegments(segments, fromLang = "ja", toLang = "zh-CN", onProgress) {
  const results = [];
  const total = segments.length;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const translated = await translateText(seg.text, fromLang, toLang);
    results.push({ ...seg, text: translated });
    onProgress?.(i + 1, total);
  }
  return results;
}
const BUILTIN_DICT = [
  { word: "ありがとう", reading: "arigatou", meanings: [{ pos: "感", gloss: "谢谢" }] },
  { word: "すみません", reading: "sumimasen", meanings: [{ pos: "感", gloss: "对不起；不好意思；谢谢（用于麻烦他人时）" }] },
  { word: "おはよう", reading: "ohayou", meanings: [{ pos: "感", gloss: "早上好" }] },
  { word: "こんにちは", reading: "konnichiwa", meanings: [{ pos: "感", gloss: "你好（白天问候）" }] },
  { word: "こんばんは", reading: "konbanwa", meanings: [{ pos: "感", gloss: "晚上好" }] },
  { word: "さようなら", reading: "sayounara", meanings: [{ pos: "感", gloss: "再见" }] },
  { word: "お願いします", reading: "onegaishimasu", meanings: [{ pos: "慣", gloss: "拜托了；请（礼貌请求）" }] },
  { word: "いただきます", reading: "itadakimasu", meanings: [{ pos: "慣", gloss: "我开动了（饭前用语）" }] },
  { word: "ごちそうさま", reading: "gochisousama", meanings: [{ pos: "慣", gloss: "我吃好了（饭后用语）" }] },
  { word: "大丈夫", reading: "daijoubu", meanings: [{ pos: "形動", gloss: "没关系；没问题" }] },
  { word: "すごい", reading: "sugoi", meanings: [{ pos: "形", gloss: "厉害；了不起" }] },
  { word: "かわいい", reading: "kawaii", meanings: [{ pos: "形", gloss: "可爱" }] },
  { word: "やばい", reading: "yabai", meanings: [{ pos: "形", gloss: "糟了；不妙；厉害（口语）" }] },
  { word: "ちょっと", reading: "chotto", meanings: [{ pos: "副", gloss: "稍微；有点" }] },
  { word: "もう", reading: "mou", meanings: [{ pos: "副", gloss: "已经；再也" }] },
  { word: "まだ", reading: "mada", meanings: [{ pos: "副", gloss: "还；尚未" }] },
  { word: "ずっと", reading: "zutto", meanings: [{ pos: "副", gloss: "一直；始终" }] },
  { word: "本当", reading: "hontou", meanings: [{ pos: "名/形動", gloss: "真的；真实" }] },
  { word: "友達", reading: "tomodachi", meanings: [{ pos: "名", gloss: "朋友" }] },
  { word: "先生", reading: "sensei", meanings: [{ pos: "名", gloss: "老师；医生；律师（尊称）" }] },
  { word: "先輩", reading: "senpai", meanings: [{ pos: "名", gloss: "前辈；学长/学姐" }] },
  { word: "後輩", reading: "kouhai", meanings: [{ pos: "名", gloss: "后辈；学弟/学妹" }] },
  { word: "敵", reading: "teki", meanings: [{ pos: "名", gloss: "敌人" }] },
  { word: "味方", reading: "mikata", meanings: [{ pos: "名", gloss: "伙伴；我方" }] },
  { word: "力", reading: "chikara", meanings: [{ pos: "名", gloss: "力量；力气" }] },
  { word: "魔法", reading: "mahou", meanings: [{ pos: "名", gloss: "魔法" }] },
  { word: "世界", reading: "sekai", meanings: [{ pos: "名", gloss: "世界" }] },
  { word: "戦う", reading: "tatakau", meanings: [{ pos: "動", gloss: "战斗" }] },
  { word: "守る", reading: "mamoru", meanings: [{ pos: "動", gloss: "保护；守护" }] },
  { word: "信じる", reading: "shinjiru", meanings: [{ pos: "動", gloss: "相信" }] },
  { word: "殺す", reading: "korosu", meanings: [{ pos: "動", gloss: "杀" }] },
  { word: "死ぬ", reading: "shinu", meanings: [{ pos: "動", gloss: "死" }] },
  { word: "生きる", reading: "ikiru", meanings: [{ pos: "動", gloss: "活；生存" }] },
  { word: "助ける", reading: "tasukeru", meanings: [{ pos: "動", gloss: "帮助；救助" }] },
  { word: "約束", reading: "yakusoku", meanings: [{ pos: "名", gloss: "约定；承诺" }] },
  { word: "夢", reading: "yume", meanings: [{ pos: "名", gloss: "梦；梦想" }] },
  { word: "愛", reading: "ai", meanings: [{ pos: "名", gloss: "爱" }] },
  { word: "恋", reading: "koi", meanings: [{ pos: "名", gloss: "恋爱" }] },
  { word: "涙", reading: "namida", meanings: [{ pos: "名", gloss: "眼泪" }] },
  { word: "笑顔", reading: "egao", meanings: [{ pos: "名", gloss: "笑容" }] },
  { word: "気持ち", reading: "kimochi", meanings: [{ pos: "名", gloss: "心情；感受" }] },
  { word: "記憶", reading: "kioku", meanings: [{ pos: "名", gloss: "记忆" }] },
  { word: "未来", reading: "mirai", meanings: [{ pos: "名", gloss: "未来" }] },
  { word: "過去", reading: "kako", meanings: [{ pos: "名", gloss: "过去" }] },
  { word: "運命", reading: "unmei", meanings: [{ pos: "名", gloss: "命运" }] },
  { word: "勇気", reading: "yuuki", meanings: [{ pos: "名", gloss: "勇气" }] },
  { word: "希望", reading: "kibou", meanings: [{ pos: "名", gloss: "希望" }] },
  { word: "絶望", reading: "zetsubou", meanings: [{ pos: "名", gloss: "绝望" }] },
  { word: "平和", reading: "heiwa", meanings: [{ pos: "名", gloss: "和平" }] },
  { word: "地獄", reading: "jigoku", meanings: [{ pos: "名", gloss: "地狱" }] },
  { word: "天国", reading: "tengoku", meanings: [{ pos: "名", gloss: "天堂" }] },
  { word: "人間", reading: "ningen", meanings: [{ pos: "名", gloss: "人类" }] },
  { word: "悪魔", reading: "akuma", meanings: [{ pos: "名", gloss: "恶魔" }] },
  { word: "天使", reading: "tenshi", meanings: [{ pos: "名", gloss: "天使" }] },
  { word: "神", reading: "kami", meanings: [{ pos: "名", gloss: "神" }] },
  { word: "魂", reading: "tamashii", meanings: [{ pos: "名", gloss: "灵魂" }] },
  { word: "心", reading: "kokoro", meanings: [{ pos: "名", gloss: "心；内心" }] },
  { word: "剣", reading: "ken", meanings: [{ pos: "名", gloss: "剑" }] },
  { word: "刀", reading: "katana", meanings: [{ pos: "名", gloss: "刀" }] },
  { word: "忍者", reading: "ninja", meanings: [{ pos: "名", gloss: "忍者" }] },
  { word: "侍", reading: "samurai", meanings: [{ pos: "名", gloss: "武士" }] },
  { word: "王", reading: "ou", meanings: [{ pos: "名", gloss: "王" }] },
  { word: "姫", reading: "hime", meanings: [{ pos: "名", gloss: "公主" }] },
  { word: "勇者", reading: "yuusha", meanings: [{ pos: "名", gloss: "勇者" }] },
  { word: "魔王", reading: "maou", meanings: [{ pos: "名", gloss: "魔王" }] },
  { word: "呪い", reading: "noroi", meanings: [{ pos: "名", gloss: "诅咒" }] },
  { word: "願い", reading: "negai", meanings: [{ pos: "名", gloss: "愿望；心愿" }] },
  { word: "許す", reading: "yurusu", meanings: [{ pos: "動", gloss: "原谅；允许" }] },
  { word: "忘れる", reading: "wasureru", meanings: [{ pos: "動", gloss: "忘记" }] },
  { word: "覚える", reading: "oboeru", meanings: [{ pos: "動", gloss: "记住；学会" }] },
  { word: "戻る", reading: "modoru", meanings: [{ pos: "動", gloss: "返回；回去" }] },
  { word: "始まる", reading: "hajimaru", meanings: [{ pos: "動", gloss: "开始" }] },
  { word: "終わる", reading: "owaru", meanings: [{ pos: "動", gloss: "结束" }] },
  { word: "変わる", reading: "kawaru", meanings: [{ pos: "動", gloss: "改变；变化" }] },
  { word: "強い", reading: "tsuyoi", meanings: [{ pos: "形", gloss: "强；强大" }] },
  { word: "弱い", reading: "yowai", meanings: [{ pos: "形", gloss: "弱" }] },
  { word: "早い", reading: "hayai", meanings: [{ pos: "形", gloss: "快；早" }] },
  { word: "遅い", reading: "osoi", meanings: [{ pos: "形", gloss: "慢；晚" }] },
  { word: "大きい", reading: "ookii", meanings: [{ pos: "形", gloss: "大" }] },
  { word: "小さい", reading: "chiisai", meanings: [{ pos: "形", gloss: "小" }] },
  { word: "新しい", reading: "atarashii", meanings: [{ pos: "形", gloss: "新" }] },
  { word: "古い", reading: "furui", meanings: [{ pos: "形", gloss: "旧；古老" }] },
  { word: "美味しい", reading: "oishii", meanings: [{ pos: "形", gloss: "好吃" }] },
  { word: "楽しい", reading: "tanoshii", meanings: [{ pos: "形", gloss: "快乐；愉快" }] },
  { word: "悲しい", reading: "kanashii", meanings: [{ pos: "形", gloss: "悲伤" }] },
  { word: "嬉しい", reading: "ureshii", meanings: [{ pos: "形", gloss: "高兴" }] },
  { word: "怖い", reading: "kowai", meanings: [{ pos: "形", gloss: "可怕" }] },
  { word: "危ない", reading: "abunai", meanings: [{ pos: "形", gloss: "危险" }] },
  { word: "優しい", reading: "yasashii", meanings: [{ pos: "形", gloss: "温柔；善良" }] },
  { word: "厳しい", reading: "kibishii", meanings: [{ pos: "形", gloss: "严厉" }] }
];
let dictLoaded = false;
function ensureDictLoaded() {
  if (dictLoaded) return;
  dictLoaded = true;
  try {
    const dictPath = path.join(electron.app.getPath("userData"), "jmdict.json");
    if (fs.existsSync(dictPath)) {
      const data2 = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
      if (Array.isArray(data2)) {
        BUILTIN_DICT.push(...data2);
      }
    }
  } catch {
  }
}
function lookupWord(word) {
  ensureDictLoaded();
  const lower = word.toLowerCase();
  return BUILTIN_DICT.filter(
    (e) => e.word === word || e.word === lower || e.reading === word || e.reading === lower || word.length >= 2 && e.word.includes(word)
  ).slice(0, 5);
}
function analyzeJapaneseText(text) {
  ensureDictLoaded();
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of BUILTIN_DICT) {
    if (seen.has(entry.word)) continue;
    if (text.includes(entry.word)) {
      seen.add(entry.word);
      results.push({
        word: entry.word,
        entries: [entry]
      });
    }
  }
  return results;
}
function getTranslationStatus() {
  return {
    engine: translationConfig.engine,
    apiKeyConfigured: !!translationConfig.apiKey
  };
}
const BILIBILI_API = {
  searchAnime: "https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi",
  seasonInfo: "https://api.bilibili.com/pgc/view/web/season",
  danmaku: "https://api.bilibili.com/x/v1/dm/list.so"
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function getCacheDir() {
  const dir = path.join(electron.app.getPath("userData"), "danmaku-cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
async function searchBilibiliAnime(keyword) {
  const params = new URLSearchParams({ keyword, search_type: "media_bangumi" });
  try {
    const resp = await fetch(`${BILIBILI_API.searchAnime}?${params.toString()}`, {
      headers: { "User-Agent": UA, "Referer": "https://www.bilibili.com" },
      signal: AbortSignal.timeout(8e3)
    });
    if (!resp.ok) return [];
    const data2 = await resp.json();
    if (data2.code !== 0) return [];
    const results = [];
    for (const item of data2.data?.result || []) {
      const m = data2.data?.media_list?.find((ml) => ml.media_id === item.media_id);
      results.push({
        season_id: item.season_id || m?.season_id || 0,
        media_id: item.media_id || 0,
        title: item.title || ""
      });
    }
    return results.filter((r) => r.season_id > 0);
  } catch {
    return [];
  }
}
async function getBilibiliEpisodes(seasonId) {
  try {
    const resp = await fetch(`${BILIBILI_API.seasonInfo}?season_id=${seasonId}`, {
      headers: { "User-Agent": UA, "Referer": "https://www.bilibili.com" },
      signal: AbortSignal.timeout(8e3)
    });
    if (!resp.ok) return [];
    const data2 = await resp.json();
    if (data2.code !== 0) return [];
    const episodes = [];
    for (const ep of data2.result?.episodes || []) {
      episodes.push({
        title: ep.long_title || ep.share_copy || `第${ep.title}话`,
        ep_id: ep.ep_id || ep.id,
        aid: ep.aid,
        cid: ep.cid,
        index: ep.title ? parseInt(ep.title) || episodes.length + 1 : episodes.length + 1
      });
    }
    return episodes;
  } catch {
    return [];
  }
}
async function fetchBilibiliDanmakuXML(cid) {
  try {
    const resp = await fetch(`${BILIBILI_API.danmaku}?oid=${cid}`, {
      headers: { "User-Agent": UA, "Referer": "https://www.bilibili.com" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!resp.ok) return "";
    return await resp.text();
  } catch {
    return "";
  }
}
function parseBilibiliDanmakuXML(xml) {
  const items = [];
  const dTagRegex = /<d p="([^"]*)">(.*?)<\/d>/g;
  let match;
  while ((match = dTagRegex.exec(xml)) !== null) {
    const p = match[1].split(",");
    const rawText = match[2];
    if (p.length < 8) continue;
    const time = parseFloat(p[0]);
    const mode = parseInt(p[1], 10);
    const fontSize = parseInt(p[2], 10) || 25;
    const colorDec = parseInt(p[3], 10) || 16777215;
    const timestamp = parseInt(p[4], 10) || 0;
    let dmMode = "scroll";
    if (mode === 5) dmMode = "top";
    if (mode === 4) dmMode = "bottom";
    const color = "#" + colorDec.toString(16).padStart(6, "0");
    if (time < 0 || !rawText.trim()) continue;
    if (rawText.trim().length > 100) continue;
    items.push({
      text: rawText.trim(),
      time,
      mode: dmMode,
      color,
      fontSize: Math.min(fontSize, 36),
      timestamp
    });
  }
  return items;
}
async function fetchDanmakuForEpisode(animeTitle, episodeNumber, onProgress) {
  onProgress?.(`搜索: ${animeTitle}`);
  const seasons = await searchBilibiliAnime(animeTitle);
  if (seasons.length === 0) {
    console.warn("[AniBox Danmaku] No results for:", animeTitle);
    return [];
  }
  const best = fuzzyMatch(animeTitle, seasons);
  onProgress?.(`找到: ${best.title}`);
  const episodes = await getBilibiliEpisodes(best.season_id);
  if (episodes.length === 0) {
    console.warn("[AniBox Danmaku] No episodes for season:", best.season_id);
    return [];
  }
  let targetEp = episodes.find((e) => e.index === episodeNumber);
  if (!targetEp) {
    targetEp = episodes[episodeNumber - 1];
  }
  if (!targetEp) {
    console.warn("[AniBox Danmaku] Episode not found:", episodeNumber);
    return [];
  }
  onProgress?.(`下载弹幕: 第${targetEp.index}话 (cid=${targetEp.cid})`);
  const cacheFile = path.join(getCacheDir(), `dm_${targetEp.cid}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      if (Array.isArray(cached) && cached.length > 0) {
        onProgress?.("已加载缓存弹幕");
        return cached;
      }
    } catch {
    }
  }
  const xml = await fetchBilibiliDanmakuXML(targetEp.cid);
  if (!xml) {
    console.warn("[AniBox Danmaku] Empty XML for cid:", targetEp.cid);
    return [];
  }
  const items = parseBilibiliDanmakuXML(xml);
  onProgress?.(`解析完成: ${items.length} 条弹幕`);
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(items));
  } catch {
  }
  return items;
}
function cleanTitleForSearch(title) {
  return title.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").replace(/【.*?】/g, "").replace(/第[一二三四五六七八九十\d]+季/g, "").replace(/Season\s*\d+/gi, "").replace(/S\d+/gi, "").replace(/\d{4}/g, "").replace(/1080[pP]|720[pP]|4K|BD/g, "").replace(/GB|BIG5|CHS|CHT|JP|EN/g, "").trim();
}
function fuzzyMatch(target, candidates) {
  const cleanTarget = cleanTitleForSearch(target).toLowerCase();
  let best = candidates[0];
  let bestScore = 0;
  for (const c of candidates) {
    const cleanTitle2 = cleanTitleForSearch(c.title).toLowerCase();
    const score = stringSimilarity(cleanTarget, cleanTitle2);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
function stringSimilarity(a, b) {
  if (a.includes(b) || b.includes(a)) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (shorter.length === 0) return 0;
  const len = editDistance(shorter, longer);
  return 1 - len / longer.length;
}
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
function parseDanmakuFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseBilibiliDanmakuXML(content);
  } catch {
    return [];
  }
}
function exportDanmakuToXML(items) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<i>\n';
  for (const item of items) {
    const mode = item.mode === "scroll" ? 1 : item.mode === "bottom" ? 4 : 5;
    const colorDec = parseInt(item.color.replace("#", ""), 16);
    const p = [
      item.time.toFixed(2),
      mode,
      item.fontSize,
      colorDec,
      item.timestamp || 0,
      0,
      "0",
      "0"
    ].join(",");
    xml += `  <d p="${p}">${escapeXml(item.text)}</d>
`;
  }
  xml += "</i>";
  return xml;
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const VIDEO_EXTS = /* @__PURE__ */ new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".flv",
  ".ts",
  ".m2ts",
  ".rmvb",
  ".wmv",
  ".m4v",
  ".3gp",
  ".3g2",
  ".asf",
  ".divx",
  ".f4v",
  ".mpeg",
  ".mpg",
  ".mpe",
  ".ogv",
  ".ogm",
  ".qt",
  ".vob",
  ".evo",
  ".mts",
  ".mxf",
  ".rm",
  ".ogg"
]);
const SUBTITLE_EXTS = /* @__PURE__ */ new Set([".ass", ".ssa", ".srt", ".vtt", ".sub", ".idx"]);
function hashPath$1(p) {
  return crypto.createHash("md5").update(p).digest("hex");
}
let watcher = null;
let debounceTimer = null;
const pendingDirs = /* @__PURE__ */ new Set();
function startWatching(rootPath, onEvent) {
  stopWatching();
  watcher = chokidar.watch(rootPath, {
    ignored: /(^|[\\/])\./,
    // 忽略隐藏文件/目录
    persistent: true,
    depth: 10,
    ignoreInitial: true,
    // 不触发初始扫描
    awaitWriteFinish: {
      stabilityThreshold: 3e3,
      pollInterval: 500
    }
  });
  const scheduleRescan = (folderPath) => {
    pendingDirs.add(folderPath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const dirs = [...pendingDirs];
      pendingDirs.clear();
      console.log("[AniBox] File watcher: rescanning after changes in", dirs.length, "dir(s)");
      try {
        const result = scanSeries(rootPath);
        for (const s of result) {
          const seriesId = hashPath$1(s.folderPath);
          upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath);
          clearEpisodesForSeries(seriesId);
          for (const ep of s.episodes) {
            const episodeId = hashPath$1(ep.filePath);
            upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName);
          }
          updateSeriesTotalEps(seriesId, s.episodes.length);
        }
        onEvent?.("changed", { type: "video", path: rootPath, folderPath: rootPath });
      } catch (err) {
        console.error("[AniBox] Watcher rescan error:", err);
      }
    }, 2e3);
  };
  watcher.on("add", (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (VIDEO_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, "");
      onEvent?.("added", { type: "video", path: filePath, folderPath });
      scheduleRescan(folderPath);
    } else if (SUBTITLE_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, "");
      onEvent?.("added", { type: "subtitle", path: filePath, folderPath });
      scheduleRescan(folderPath);
    }
  });
  watcher.on("unlink", (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (VIDEO_EXTS.has(ext) || SUBTITLE_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, "");
      onEvent?.("removed", { type: VIDEO_EXTS.has(ext) ? "video" : "subtitle", path: filePath, folderPath });
      scheduleRescan(folderPath);
    }
  });
  console.log("[AniBox] File watcher started:", rootPath);
}
function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingDirs.clear();
  console.log("[AniBox] File watcher stopped");
}
function getWatcherStatus() {
  return {
    active: watcher !== null,
    watchingPath: watcher?._settings?.cwd
  };
}
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_RUN_AS_NODE;
electron.app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
electron.app.commandLine.appendSwitch("enable-accelerated-video-decode");
electron.app.commandLine.appendSwitch("enable-zero-copy");
electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "AniBox",
    backgroundColor: "#0f0f0f",
    icon: path.join(__dirname, "../../resources/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("enter-full-screen", () => mainWindow?.webContents.send("window:fullscreen-changed", true));
  mainWindow.on("leave-full-screen", () => mainWindow?.webContents.send("window:fullscreen-changed", false));
  mainWindow.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && (input.key === "F12" || input.key === "I" && input.control && input.shift)) {
      mainWindow?.webContents.toggleDevTools();
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function hashPath(p) {
  return crypto.createHash("md5").update(p).digest("hex");
}
const MIME = {
  // 视频格式
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".flv": "video/x-flv",
  ".f4v": "video/mp4",
  ".ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".ogm": "video/ogg",
  ".wmv": "video/x-ms-wmv",
  ".asf": "video/x-ms-asf",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mpe": "video/mpeg",
  ".vob": "video/mpeg",
  ".evo": "video/mpeg",
  ".divx": "video/x-msvideo",
  ".rmvb": "application/vnd.rn-realmedia",
  ".rm": "application/vnd.rn-realmedia",
  ".qt": "video/quicktime",
  ".mxf": "application/mxf",
  // 图片格式
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp"
};
const ALL_VIDEO_EXTS = [
  "mp4",
  "mkv",
  "webm",
  "avi",
  "mov",
  "flv",
  "ts",
  "m2ts",
  "rmvb",
  "wmv",
  "m4v",
  "3gp",
  "3g2",
  "asf",
  "divx",
  "f4v",
  "mpeg",
  "mpg",
  "mpe",
  "ogv",
  "ogm",
  "qt",
  "vob",
  "evo",
  "mts",
  "mxf",
  "rm",
  "ogg"
];
function fileStream(path2) {
  const ns = fs.createReadStream(path2);
  return stream.Readable.toWeb(ns);
}
function rangeStream(path2, start, end) {
  const ns = fs.createReadStream(path2, { start, end });
  return stream.Readable.toWeb(ns);
}
function registerProtocol() {
  electron.protocol.handle("anibox", (req) => {
    try {
      const url = new URL(req.url);
      const fp = url.searchParams.get("path") || "";
      console.log("[AniBox] Protocol request:", {
        url: req.url,
        method: req.method,
        path: fp,
        exists: fp ? fs.existsSync(fp) : false,
        hasRange: req.headers.get("range") ? true : false
      });
      if (!fp || !fs.existsSync(fp)) {
        console.warn("[AniBox] Protocol 404:", fp);
        return new Response("Not Found", { status: 404 });
      }
      const st = fs.statSync(fp);
      const mime = MIME["." + (fp.split(".").pop()?.toLowerCase() || "")] || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      if (isImage) {
        console.log("[AniBox] Protocol serving image:", fp, st.size, "bytes");
        return new Response(fileStream(fp), {
          status: 200,
          headers: {
            "Content-Length": String(st.size),
            "Content-Type": mime,
            "Cache-Control": "max-age=86400"
          }
        });
      }
      const range = req.headers.get("range");
      if (range) {
        const [s, e] = range.replace(/bytes=/, "").split("-").map(Number);
        const end = e || st.size - 1;
        console.log("[AniBox] Protocol range response:", fp, `bytes ${s}-${end}/${st.size}`);
        const body = rangeStream(fp, s, end);
        return new Response(body, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${s}-${end}/${st.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(end - s + 1),
            "Content-Type": mime
          }
        });
      }
      console.log("[AniBox] Protocol full response:", fp, st.size, "bytes, type:", mime);
      return new Response(fileStream(fp), {
        status: 200,
        headers: {
          "Content-Length": String(st.size),
          "Content-Type": mime,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache"
        }
      });
    } catch (err) {
      console.error("[AniBox] Protocol handler error:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  });
}
let mpvProcess = null;
let mpvSock = null;
let mpvBuf = "";
const PIPE = "\\\\.\\pipe\\anibox-mpv";
function mpvKill() {
  const proc = mpvProcess;
  mpvProcess = null;
  if (mpvSock) {
    try {
      mpvSock.write(JSON.stringify({ command: ["quit"] }) + "\n");
    } catch {
    }
    try {
      mpvSock.destroy();
    } catch {
    }
    mpvSock = null;
  }
  mpvBuf = "";
  if (proc && !proc.killed) {
    try {
      proc.kill();
    } catch {
    }
  }
}
function getMpvPath() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "mpv.exe");
  }
  return path.join(__dirname, "../../mpv.exe");
}
function mpvLaunch(fp) {
  mpvKill();
  return new Promise((resolve, reject) => {
    const exe = getMpvPath();
    const proc = child_process.spawn(exe, [
      `--input-ipc-server=${PIPE}`,
      "--keep-open=yes",
      "--osc=yes",
      "--cursor-autohide=2000",
      fp
    ], { stdio: ["ignore", "pipe", "pipe"] });
    mpvProcess = proc;
    proc.on("error", (err) => reject(err));
    proc.on("exit", () => {
      if (mpvProcess === proc) mpvProcess = null;
      mainWindow?.webContents.send("mpv:event", { event: "end" });
      mainWindow?.focus();
    });
    let tries = 0;
    const tryConnect = () => {
      tries++;
      const sock = net.createConnection(PIPE);
      sock.once("connect", () => {
        mpvSock = sock;
        sock.on("data", (d) => {
          mpvBuf += d.toString();
          const lines = mpvBuf.split("\n");
          mpvBuf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.event) mainWindow?.webContents.send("mpv:event", msg);
            } catch {
            }
          }
        });
        sock.on("close", () => {
          mpvSock = null;
        });
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (tries < 20) {
          setTimeout(tryConnect, 200);
        } else {
          reject(new Error("mpv IPC pipe timeout"));
        }
      });
    };
    setTimeout(tryConnect, 800);
  }).then(() => {
    mainWindow?.webContents.send("mpv:event", { event: "ready" });
  });
}
function registerIpcHandlers() {
  electron.ipcMain.handle("dialog:openFile", async () => {
    if (!mainWindow) return null;
    const r = await electron.dialog.showOpenDialog(mainWindow, {
      title: "选择视频",
      filters: [
        { name: "视频", extensions: ALL_VIDEO_EXTS },
        { name: "所有", extensions: ["*"] }
      ],
      properties: ["openFile"]
    });
    if (r.canceled || !r.filePaths.length) return null;
    const filePath = r.filePaths[0];
    const saved = loadProgress(filePath);
    return { filePath, savedPosition: saved?.position ?? 0 };
  });
  electron.ipcMain.handle("video:load", (_e, p) => {
    const saved = loadProgress(p);
    return { filePath: p, savedPosition: saved?.position ?? 0 };
  });
  electron.ipcMain.handle("video:getInfo", (_e, p) => {
    try {
      const st = fs.statSync(p);
      let videoMeta = null;
      if (p.toLowerCase().endsWith(".mp4")) {
        videoMeta = parseMP4Meta(p);
      }
      return {
        size: st.size,
        mtime: st.mtimeMs,
        ctime: st.ctimeMs,
        videoMeta
      };
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle("playback:savePosition", (_e, filePath, position) => {
    saveProgress(filePath, position);
  });
  electron.ipcMain.handle("playback:getPosition", (_e, filePath) => {
    const saved = loadProgress(filePath);
    return saved?.position ?? 0;
  });
  electron.ipcMain.handle("dialog:openFolder", async () => {
    if (!mainWindow) return null;
    const r = await electron.dialog.showOpenDialog(mainWindow, {
      title: "选择番剧目录",
      properties: ["openDirectory"]
    });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });
  electron.ipcMain.handle("scanner:scan", (_e, root) => {
    try {
      const result = scanSeries(root);
      for (const s of result) {
        const seriesId = hashPath(s.folderPath);
        upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath);
        clearEpisodesForSeries(seriesId);
        for (const ep of s.episodes) {
          const episodeId = hashPath(ep.filePath);
          upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName);
        }
        updateSeriesTotalEps(seriesId, s.episodes.length);
      }
      return result;
    } catch (err) {
      console.error("[AniBox] Scanner error:", err);
      return [];
    }
  });
  electron.ipcMain.handle("series:updateTitle", (_e, folderPath, newTitle) => {
    const seriesId = hashPath(folderPath);
    const s = getSeriesById(seriesId);
    if (s) {
      upsertSeries(seriesId, newTitle, folderPath, s.season, s.seriesType || "tv", s.coverPath);
    }
  });
  electron.ipcMain.handle("series:getProgress", (_e, folderPath) => {
    return getSeriesProgress(hashPath(folderPath));
  });
  electron.ipcMain.handle("series:setStatus", (_e, folderPath, status) => {
    updateSeriesStatus(hashPath(folderPath), status);
  });
  electron.ipcMain.handle("cover:fetchBatch", async (_e, series) => {
    const result = await fetchCoversBatch(series, (cur, total, title, ok, status) => {
      mainWindow?.webContents.send("cover:progress", { current: cur, total, title, ok, status });
    });
    return result;
  });
  electron.ipcMain.handle("cover:fetchManual", async (_e, folderPath, searchQuery) => {
    const result = await fetchCoverManual(folderPath, searchQuery);
    return result ? true : false;
  });
  electron.ipcMain.handle("mpv:play", (_e, p) => mpvLaunch(p));
  electron.ipcMain.handle("mpv:quit", () => {
    mpvKill();
    mainWindow?.focus();
  });
  electron.ipcMain.handle("window:toggleFullscreen", () => {
    mainWindow?.setFullScreen(!mainWindow?.isFullScreen());
  });
  electron.ipcMain.handle("window:isFullscreen", () => mainWindow?.isFullScreen() ?? false);
  electron.ipcMain.handle("subtitle:readVtt", (_e, filePath) => {
    try {
      return readSubtitleAsVtt(filePath);
    } catch (err) {
      console.error("[AniBox] subtitle read error:", err);
      return "";
    }
  });
  electron.ipcMain.handle("subtitle:rescan", (_e, videoPath) => {
    try {
      return findSubtitles(videoPath);
    } catch (err) {
      console.error("[AniBox] subtitle rescan error:", err);
      return [];
    }
  });
  electron.ipcMain.handle("subtitle:searchOnline", async (_e, query) => {
    try {
      return await searchOnlineSubtitles(query);
    } catch (err) {
      console.error("[AniBox] online subtitle search error:", err);
      return [];
    }
  });
  electron.ipcMain.handle("subtitle:download", async (_e, result, videoPath) => {
    try {
      return await downloadSubtitle(result, videoPath);
    } catch (err) {
      console.error("[AniBox] subtitle download error:", err);
      return null;
    }
  });
  electron.ipcMain.handle("subtitle:getOSStatus", () => {
    return getOpenSubtitlesStatus();
  });
  electron.ipcMain.handle("subtitle:setOSConfig", (_e, apiKey, userAgent) => {
    setOpenSubtitlesConfig(apiKey, userAgent);
  });
  electron.ipcMain.handle("audio:getPrefs", (_e, seriesId) => {
    return getAudioPrefs(seriesId);
  });
  electron.ipcMain.handle("audio:setPrefs", (_e, seriesId, prefs) => {
    setAudioPrefs(seriesId, prefs);
  });
  electron.ipcMain.handle("audio:getGlobalPrefs", () => {
    return getGlobalAudioPrefs();
  });
  electron.ipcMain.handle("subtitle:getStyle", () => {
    return getSubtitleStyle();
  });
  electron.ipcMain.handle("subtitle:setStyle", (_e, style) => {
    setSubtitleStyle(style);
  });
  electron.ipcMain.handle("whisper:status", () => {
    return { ...getWhisperStatus(), defaultPaths: getDefaultWhisperPaths() };
  });
  electron.ipcMain.handle("whisper:configure", (_e, config) => {
    setWhisperConfig({ binaryPath: config.binaryPath, modelPath: config.modelPath });
  });
  electron.ipcMain.handle("whisper:transcribe", async (_e, videoPath) => {
    try {
      const result = await transcribeWithWhisper(videoPath, (msg) => {
        mainWindow?.webContents.send("whisper:progress", { message: msg });
      });
      if (result) {
        mainWindow?.webContents.send("whisper:progress", { message: "完成", result });
      }
      return result;
    } catch (err) {
      mainWindow?.webContents.send("whisper:progress", { message: "失败", error: err.message });
      throw err;
    }
  });
  electron.ipcMain.handle("translate:status", () => getTranslationStatus());
  electron.ipcMain.handle("translate:configure", (_e, config) => {
    setTranslationConfig(config);
  });
  electron.ipcMain.handle("translate:text", async (_e, text, fromLang, toLang) => {
    return await translateText(text, fromLang || "ja", toLang || "zh-CN");
  });
  electron.ipcMain.handle("translate:segments", async (_e, segments, fromLang, toLang) => {
    return await translateSubtitleSegments(
      segments,
      fromLang || "ja",
      toLang || "zh-CN",
      (cur, total) => {
        mainWindow?.webContents.send("translate:progress", { current: cur, total });
      }
    );
  });
  electron.ipcMain.handle("dict:lookup", (_e, word) => {
    return lookupWord(word);
  });
  electron.ipcMain.handle("dict:analyze", (_e, text) => {
    return analyzeJapaneseText(text);
  });
  electron.ipcMain.handle("danmaku:fetch", async (_e, animeTitle, episodeNumber) => {
    try {
      const items = await fetchDanmakuForEpisode(animeTitle, episodeNumber, (msg) => {
        mainWindow?.webContents.send("danmaku:progress", { message: msg });
      });
      mainWindow?.webContents.send("danmaku:progress", { message: "完成", count: items.length });
      return items;
    } catch (err) {
      mainWindow?.webContents.send("danmaku:progress", { message: "失败", error: err.message });
      return [];
    }
  });
  electron.ipcMain.handle("danmaku:cleanTitle", (_e, title) => {
    return cleanTitleForSearch(title);
  });
  electron.ipcMain.handle("danmaku:import", (_e, filePath) => {
    return parseDanmakuFromFile(filePath);
  });
  electron.ipcMain.handle("danmaku:export", async (_e, items) => {
    if (!mainWindow) return false;
    const now = /* @__PURE__ */ new Date();
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
    const r = await electron.dialog.showSaveDialog(mainWindow, {
      title: "导出弹幕",
      defaultPath: `danmaku_${ts}.xml`,
      filters: [{ name: "弹幕XML", extensions: ["xml"] }]
    });
    if (r.canceled || !r.filePath) return false;
    try {
      const xml = exportDanmakuToXML(items);
      fs.writeFileSync(r.filePath, xml, "utf-8");
      return true;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("watcher:start", (_e, rootPath) => {
    startWatching(rootPath, (event, payload) => {
      mainWindow?.webContents.send("watcher:event", { event, ...payload });
    });
  });
  electron.ipcMain.handle("watcher:stop", () => {
    stopWatching();
  });
  electron.ipcMain.handle("watcher:status", () => {
    return getWatcherStatus();
  });
  electron.ipcMain.handle("favorites:getAll", () => getFavorites());
  electron.ipcMain.handle("favorites:toggle", (_e, seriesId) => toggleFavorite(seriesId));
  electron.ipcMain.handle("favorites:isFavorited", (_e, seriesId) => isFavorited(seriesId));
  electron.ipcMain.handle("playlists:getAll", () => getPlaylists());
  electron.ipcMain.handle("playlists:create", (_e, name) => createPlaylist(name));
  electron.ipcMain.handle("playlists:delete", (_e, id) => deletePlaylist(id));
  electron.ipcMain.handle("playlists:addSeries", (_e, listId, seriesId) => {
    addToPlaylist(listId, seriesId);
  });
  electron.ipcMain.handle("playlists:removeSeries", (_e, listId, seriesId) => {
    removeFromPlaylist(listId, seriesId);
  });
  electron.ipcMain.handle("tracking:sync", async (_e, anilistId, bangumiId, status, watchedEpisodes) => {
    try {
      if (anilistId > 0) {
        console.log("[AniBox] Would sync to AniList:", anilistId, status, watchedEpisodes);
      }
      if (bangumiId > 0) {
        console.log("[AniBox] Would sync to Bangumi:", bangumiId, status, watchedEpisodes);
      }
      return true;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("screenshot:save", async (_e, dataUrl) => {
    if (!mainWindow) return false;
    const now = /* @__PURE__ */ new Date();
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
    const r = await electron.dialog.showSaveDialog(mainWindow, {
      title: "保存截图",
      defaultPath: `AniBox_${ts}.png`,
      filters: [{ name: "PNG 图片", extensions: ["png"] }]
    });
    if (r.canceled || !r.filePath) return false;
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(r.filePath, Buffer.from(base64, "base64"));
      return true;
    } catch (err) {
      console.error("[AniBox] screenshot save error:", err);
      return false;
    }
  });
  electron.ipcMain.handle("series:getSkipTimes", (_e, folderPath) => {
    return getSkipTimes(hashPath(folderPath));
  });
  electron.ipcMain.handle("series:setSkipTimes", (_e, folderPath, times) => {
    setSkipTimes(hashPath(folderPath), times);
  });
  electron.ipcMain.handle("metadata:fetch", async (_e, title, folderPath) => {
    try {
      const meta = await fetchMetadataForSeries(title, folderPath);
      if (meta) {
        setSeriesMetadata(hashPath(folderPath), meta);
      }
      return meta;
    } catch (err) {
      console.error("[AniBox] metadata fetch error:", err);
      return null;
    }
  });
  electron.ipcMain.handle("metadata:fetchBatch", async (_e, series) => {
    try {
      const results = await fetchMetadataBatch(series, (cur, total, title, ok) => {
        mainWindow?.webContents.send("metadata:progress", { current: cur, total, title, ok });
      });
      for (const r of results) {
        if (r.meta) setSeriesMetadata(hashPath(r.folderPath), r.meta);
      }
      return results;
    } catch (err) {
      console.error("[AniBox] metadata batch error:", err);
      return [];
    }
  });
  electron.ipcMain.handle("metadata:get", (_e, folderPath) => {
    return getSeriesMetadata(hashPath(folderPath));
  });
  electron.ipcMain.handle("metadata:getAll", () => {
    return getAllMetadata();
  });
  electron.ipcMain.handle("series:getAll", () => {
    const series = getAllSeries();
    const metadata = getAllMetadata();
    return series.map((s) => ({
      ...s,
      metadata: metadata[s.id] || null
    }));
  });
}
electron.app.whenReady().then(async () => {
  electron.Menu.setApplicationMenu(null);
  try {
    const gpuInfo = await electron.app.getGPUInfo("basic");
    console.log("[AniBox] GPU Info:", JSON.stringify(gpuInfo, null, 2));
    const gpuFeatures = electron.app.getGPUFeatureStatus();
    console.log("[AniBox] GPU Features:", JSON.stringify(gpuFeatures, null, 2));
  } catch (err) {
    console.warn("[AniBox] GPU info unavailable:", err);
  }
  registerProtocol();
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (!electron.BrowserWindow.getAllWindows().length) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  mpvKill();
  if (process.platform !== "darwin") electron.app.quit();
});
