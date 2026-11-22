# AniBox

A local anime library manager and player. Scan your folders into a poster wall, follow the seasonal
calendar, browse built-in metadata and start playing with one click. **LAN streaming** lets your
phone or iPad watch the library in a browser, with no app installed.

## Links

- **Gitee (primary)**: https://gitee.com/yuzu-tea-duck/ani-box
- **GitHub mirror**: https://github.com/pomelotea-yuzu/AniBox
- **Releases**: https://gitee.com/yuzu-tea-duck/ani-box/releases · https://github.com/pomelotea-yuzu/AniBox/releases

## Quick start

**End users (portable build)**

1. Download `AniBox-x.y.z-portable-x64.zip` from Releases and unzip it, then double-click `AniBox.exe`.
   - **Portable data stays with the app**: cache, config and progress live in `data/` next to the
     executable, so moving the folder moves everything and the system drive stays clean.
2. On first run, add your anime folders via **Add manually** (or search online from the Search page).
3. Optional: configure your download client's WebUI under **Settings → Download** to unlock
   one-click download and RSS follow.
4. **Watch on phone/iPad**: **Settings → Streaming** → enable LAN streaming → connect the phone to the
   same Wi-Fi → open the address shown (like `http://192.168.x.x:17830`) → enter the access key.

**Developers**

```bash
cd apps/desktop
pnpm install      # native deps (electron/esbuild/koffi) are pre-approved by the local pnpm-workspace.yaml
pnpm dev          # dev mode

# Root-level delegating scripts work too: pnpm dev / pnpm typecheck / pnpm build / pnpm package
```

Repository gates (plain Node, no dependencies needed):

```bash
node scripts/check-repo.mjs --all      # hygiene / links / bilingual registry / self-tests
git config core.hooksPath .githooks    # once per clone; pre-commit then runs the same chain
```

**Where data lives**: in development it is `<repo>/.anibox/` (startup logs print
`[AniBox] 数据目录（开发模式）= …`, and existing data is migrated from the system userData on first
run); the portable build uses `<app folder>/data`; set `ANIBOX_DATA_DIR=<path>` to point elsewhere.

> Requirements: Windows 10/11, Node.js ≥ 20 (pnpm 11) and pnpm ≥ 11.
> At runtime `libmpv-2.dll` and `mpv.exe` must ship next to the app (embedded player and fallback engine).
> Streaming transcode for mkv/HEVC needs `ffmpeg.exe`: it is auto-detected (app dir / PATH / userData),
> downloaded when missing, or you can place it manually.

---

## Features

### Library
- **Multiple roots** — manage several anime folders at once
- **Poster wall** — covers, search, type filters, multiple sort orders
- **Metadata scraping** — AniList GraphQL + Bangumi v0 REST, with Chinese titles, synopsis, score,
  staff and tags; **staff roles auto-localized** (90+ Japanese animation role terms)
- **Local translation** — bundled Helsinki-NLP/opus-mt-en-zh model (~114 MB) for offline EN→ZH,
  plus a 200+ phrase dictionary and 130+ sentence templates
- **Title check** — validate folder titles against AniList and get suggestions
- **Watch status** — watching / completed / dropped
- **Favorites and playlists** — mark favorites, build custom playlists
- **Recently watched** — history on the home page with one-click resume

### Seasonal calendar
- **Per-season fetch** — current season's Japanese TV anime, cached and reused
- **AI title translation** — DeepSeek batch JA→ZH for titles and synopsis (falls back to the local model)
- **Weekday grouping** — grouped by air day, today highlighted, countdown, undated section
- **Detail popup** — cover, score, studio, genres, air time and synopsis in one place

### Search
- **Online search** — AniList lookup by Chinese/Japanese/English name, with Bangumi-assisted conversion
- **Card grid** — cover, score, episodes, type and status, plus popular suggestions
- **Detail popup** — the same field set as the calendar
- **Get resources** — third-party index integration: copy links, push to your download client, subscribe

### Resource search and auto-follow
- **Get resources** — one-click search on a public anime index (AnimeGarden)
- **Fansub filter** — 800+ groups (GET /teams, 1 h cache), filter by name and pin the choice
- **Resource list** — title, size, group, type and time; copy link or push to the download client
- **RSS** — generated locally (`127.0.0.1:5860`), filtered by show + fansub group
- **One-click follow** — creates the client's auto-download rule, with translation-variant filters
  (simplified / traditional / both / simplified-Japanese / traditional-Japanese), per-show save folder,
  and automatic cover + synopsis written into the save folder (`.anibox/cover.jpg` + `metadata.json`)
- **Version adaptation** — qBittorrent WebUI 4.x and 5.x differences handled

### LAN streaming
- **Phone/iPad playback** — enable in Settings, then browse and play from the browser
- **Access key** — on by default, no longer leaked in the page source
- **Player parity** — buffer bar, speed menu (9 presets + custom), multi-track subtitles, episode panel,
  screenshot, picture-in-picture, aspect ratio, play modes, 3-second auto-hiding controls
- **10-bit HEVC special case** — 8-bit HEVC plays natively (hvc1); 10-bit is hardware-transcoded to
  8-bit HEVC (NVENC → QSV → AMF) after probing device support and bit depth
- **Whole-episode caching** — no fragmentation, no stalls, next episode pre-transcoded in the background
- **Zero-config transcode** — ffmpeg auto-detected or downloaded, or supplied manually
- **Cache management** — results cached under the data root's `stream-cache`, size shown and clearable
- **Two-way progress** — start on the phone, continue on the desktop
- **External subtitles** — srt / ass converted to VTT
- **Access safety** — key required by default, only files under scan roots are exposed, port fallback

### Player
- **HTML5 video first** — 30+ container formats (mp4/mkv/ts/rmvb), hardware decoding for 4K
- **Embedded libmpv** — automatic switch when codecs/subtitles are unsupported; koffi software
  rendering keeps picture, subtitles and controls in one window
- **mpv.exe fallback** — separate window over Named Pipe IPC when libmpv is unavailable
- **`anibox://` protocol** — local file access with Range support
- **Controls** — play/pause, seek, volume, speed, fullscreen, mute (also in libmpv mode)
- **Progress memory** — episode and timestamp per show
- **Auto-next** — including when seeking to the end; sequential / single loop / list loop / random
- **Anime4K real-time upscaling** — WebGL pipeline (edge upscale + unsharp + debanding + FXAA),
  three presets, A/B compare
- **AB loop** — mark in/out and loop
- **Picture-in-picture** and **screenshot to PNG**

### Subtitles
- **Auto-matching** — parent folder and `subs/` subfolder, cross-file episode number matching
- **Dual subtitles** — canvas-rendered two tracks with independent font/colour/outline/position
- **Online search** — OpenSubtitles.com
- **Styling** — font, outline, colour, background opacity
- **VTT conversion** — ASS/SSA/SRT → VTT

### AI helpers (raw releases)
- **Whisper speech recognition** — whisper.cpp offline, FFmpeg audio extraction → SRT
- **Japanese dictionary** — 90+ common anime words, exact and fuzzy lookup on hover

### Danmaku
- Bilibili danmaku fetching by show + episode, local sending, XML import/export, keyword and regex filters

### Other
- **OP/ED skip** — triple-press the right arrow to jump 90 seconds; toggle on the control bar
- **Audio tracks** — auto-detect, remember preference per series, delay and volume balance
- **Morandi themes** — five low-saturation palettes driven by CSS variables
- **Global settings** — nine tabs (theme / subtitles / playback / shortcuts / API / download /
  streaming / storage / about); the storage tab shows the data root, cache sizes and one-click cleanup
- **30+ keyboard shortcuts** with a `?` help panel

---

## qBittorrent integration

### 1. Enable the WebUI (once)

qBittorrent → **Tools → Options → Web UI**:

- Enable **Web User Interface (Remote control)**
- Note the port (default `8080`) and user (default `admin`)
- Either enable **Bypass authentication for clients on localhost** (leave the password empty in AniBox),
  or set a user/password (5.x generates a temporary password on first enable)

### 2. Configure AniBox (once)

**Settings → Download**: fill in the WebUI address (`127.0.0.1`), port, user and password.
Optionally set a **default save path**. Click **Test connection** → `✓ Connected (v5.x)` → **Save**.

### 3. Download a single episode

Seasonal calendar or Search → open a show → **Get resources** → pick a row → **Download**; the task
goes straight to qBittorrent.

### 4. Follow a whole show

Open a show → **Get resources** → **Follow** on a fansub row:

1. **Save folder** — type it or pick with the folder dialog (empty = default path)
2. **Translation variant** — simplified / traditional / both / simplified-Japanese / traditional-Japanese / any
3. **Start following** — creates the RSS feed and an `AniBox-<show>-<group>-<variant>` download rule

> 💡 Cover and synopsis are written into the save folder's `.anibox/` (`cover.jpg` + `metadata.json`).
> Add that folder as a scan root and refresh; the poster wall picks them up.

### 5. Manage feeds and rules

- Feeds: **Tools → RSS reader**, look for `AniBox-xxx` nodes
- Rules: **Tools → Options → RSS → Edit auto-download rules**
- Trigger now: **Update all** in the RSS reader
- Remove: right-click the feed → delete

> ⚠️ AnimeGarden's server-side feed filtering does not work, so AniBox serves the filtered feed from a
> local RSS endpoint (`127.0.0.1:5860`) — **AniBox must stay running** while qBittorrent fetches.

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Electron 33 + electron-vite |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Playback | HTML5 video (primary) + embedded libmpv software rendering (koffi FFI → WebGL) + mpv.exe fallback |
| LAN streaming | Node http (Range + key auth) + mpv IPC codec probing + ffprobe bit depth + ffmpeg remux/hardware transcode (fragmented mp4, whole-episode cache, background pre-transcode) |
| Storage | JSON file (`anibox-store.json`, debounced atomic writes) |
| Scanning | Node fs recursion + cross-folder merge |
| Search | AniList GraphQL + Bangumi v0 |
| Metadata | AniList GraphQL + Bangumi v0 REST |
| Translation | Helsinki-NLP/opus-mt-en-zh (ONNX Runtime, @xenova/transformers) |
| Themes | React Context + CSS variable bridge, five Morandi palettes |
| Packaging | electron-builder |

---

## Folder conventions

```
F:/Seasonal/
  Demon Slayer S1/
    [VCB-Studio] Kimetsu [01].mkv
    [VCB-Studio] Kimetsu [02].mkv
  Suzume/
    [DBD-Raws][Suzume][1080P][BDRip]/
      [DBD-Raws] Suzume [01].mkv

F:/Collection/
  Attack on Titan/
    Attack on Titan S1/
      [SubGroup] Shingeki [01].mkv
```

The scanner handles BD rip nesting (falling back to the parent folder's title), filters non-episode
subfolders (PV / menu / extras) and merges across folders (Levenshtein ≥ 85%).

---

## Project layout

```
repo root/
├─ AGENTS.md       single entry point: status card, reading order, hygiene rules
├─ apps/desktop/   the application
│  ├─ src/main/      Electron main: scanning, metadata/subtitles/danmaku, libmpv bridge, qBittorrent, LAN streaming
│  ├─ src/preload/   IPC bridge exposed through contextBridge
│  ├─ src/renderer/  React UI: poster wall, player (Player/MpvCanvas), calendar, search, settings
│  ├─ resources/     icons and bundled index resources
│  └─ scripts/       model download, index staging, portable packaging (archive/ = historical scripts)
├─ docs/           documentation map: guide / architecture / development / knowledge / plans and research
├─ openspec/       specs and changes (config.yaml + specs/ + changes/)
├─ scripts/        repository gates: check-repo / check-hygiene / check-i18n
├─ packages/       reusable modules (currently empty; no empty packages are pre-split)
├─ .anibox/        development data root (library/progress/index cache/models; not committed)
└─ apps/desktop/pnpm-workspace.yaml   pnpm 11 build allowlist, kept with the package
```

One-off artifacts belong in `artifacts/` (not committed). Inside `apps/desktop`, `node_modules`,
`out`, `dist`, `models`, `yuc-covers`, `*.exe` and `*.dll` are never committed.

---

## Development

Start with [`AGENTS.md`](AGENTS.md): status card, reading order and hygiene rules live there.
The application is in [`apps/desktop/`](apps/desktop/README.md); the repository root only holds
governance and gates, never application dependencies.

Windows is the primary platform. UI lives in `apps/desktop/src/renderer/`, filesystem, media and native
dependencies in `apps/desktop/src/main/`, and the cross-process surface in `apps/desktop/src/preload/`.

Small changes are implemented and checked directly. Anything touching the player, streaming, packaging
or cross-platform behaviour starts with a written plan, acceptance criteria and a rollback path.
Automated checks and on-device Windows verification are recorded separately; unexecuted steps are never
counted as passing.

```bash
# Node.js >= 20 (pnpm 11) and pnpm >= 11
# Native deps (electron/esbuild/koffi/onnxruntime-node/sharp) are approved by
# apps/desktop/pnpm-workspace.yaml allowBuilds; the first install downloads or compiles them

cd apps/desktop
pnpm install

# Optional: pre-download the translation model
node scripts/download-model.mjs

pnpm dev

# typecheck → lint → tests, stops at the first failure
npm run check

# individual: npm run typecheck / npm run lint / npm test

# Windows NSIS installer (a separate path from the portable zip)
pnpm package
```

> Aggregate checks are not the same as release acceptance. If existing lint errors block the aggregate
> command, run `npm test` separately and record both results; never skip lint and call it passing.
>
> `apps/desktop/AniBox.bat` (dev) and `AniBox-prod.bat` (production) can be started by double-click.
> qBittorrent integration needs the WebUI configured under Settings → Download; AniBox must stay running
> while RSS following.

---

## Acknowledgements

| Service / project | Used for | Link |
|---|---|---|
| [AniList](https://anilist.co) | Seasonal calendar, metadata, title checks (GraphQL) | https://anilist.co |
| [Bangumi](https://bgm.tv) | Metadata (REST) | https://bgm.tv |
| [AnimeGarden](https://animes.garden) | Resource index and RSS (open API) | https://animes.garden |
| [DeepSeek](https://platform.deepseek.com) | AI JA→ZH title/synopsis translation | https://platform.deepseek.com |
| [OpenSubtitles](https://opensubtitles.com) | Online subtitle search | https://opensubtitles.com |
| [Hugging Face](https://huggingface.co) | opus-mt offline translation model (hf-mirror.com in mainland China) | https://huggingface.co |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Offline speech recognition | https://github.com/ggerganov/whisper.cpp |
| [mpv](https://mpv.io) | Playback engine (embedded libmpv + mpv.exe fallback) | https://mpv.io |
| [FFmpeg](https://ffmpeg.org) | Streaming remux/transcode (static builds: BtbN / gyan.dev) | https://ffmpeg.org |

All online API keys are stored locally only (JSON under the data root) and are never uploaded.

---

*Last updated: 2026-11-22 (repo restructure: Layress governance skeleton + `apps/desktop`)*
