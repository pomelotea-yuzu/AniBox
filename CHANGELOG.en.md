# Changelog

> **Language:** English | [简体中文](CHANGELOG.md)

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.
Full release notes and downloads are on [Gitee Releases](https://gitee.com/yuzu-tea-duck/ani-box/releases)
and [GitHub Releases](https://github.com/pomelotea-yuzu/AniBox/releases).

> This log is backfilled from 1.2.1 only — **earlier versions are intentionally omitted** rather than
> reconstructed from memory. Dates are build dates; the release page is authoritative.

## [Unreleased]

- **Repository foundation rebuild (2026-11-22)**: the repository root moved to `D:\AniBox` and the
  application moved into `apps/desktop/`; introduced a Layress-style governance skeleton (`AGENTS.md`,
  `openspec/`, `docs/`, `i18n/`, `packages/`, `artifacts/`) and three-layer cleanliness gates
  (`.gitignore` + `check-hygiene` + allowlist) shared by pre-commit and both CI providers through
  `scripts/check-repo.mjs`. See `openspec/changes/rebuild-repo-foundation/`.
- **Data root moved next to the product (2026-11-22)**: development uses `<repo>/.anibox/`, the
  portable build keeps `<app folder>/data`, and `ANIBOX_DATA_DIR` overrides both. On first launch the
  old system `userData` is migrated once (Chromium caches and `stream-cache` skipped), and the resolved
  path is printed at startup. Installed builds are unchanged. See `openspec/specs/data-root/spec.md`.
- **Public-facing documents completed**: `README` / `CHANGELOG` / `CONTRIBUTING` / `SECURITY` /
  `CODE_OF_CONDUCT` are now maintained in Chinese and English pairs; GitHub issue forms and PR
  template, plus Chinese-only Gitee templates.
- **Packaging scripts no longer hardcode absolute paths**: `mk-stage121` / `pack-zip*` / `stage-index` /
  icon scripts derive paths from their own location; staging directories and portable zips land in
  `artifacts/`; `AniBox.bat` / `AniBox-prod.bat` no longer pin a local Node path.

## [1.2.3] — 2026-09-08

- **Bundled anime index**: a trimmed Bangumi index ships in `resources/anibox-index/` and is installed
  into the data root when missing. Without it the seasonal calendar and metadata scraping can only fall
  back to online sources, which were largely unavailable at the time.
- **Persistent cover cache**: per-season page JSON (12 h for the current season, 30 d for history) and
  images (200 MB cap, evicted by mtime) under `yuc-covers/`; rendering goes through the
  `anibox://cover?path=` local protocol, bypassing image-host referer checks.
- **Packaging fixes**: staging directories are updated in place (bulk deletion is blocked by a local
  hook), and `pack-zip` excludes the `data/` directory a portable run creates.

## [1.2.2] — 2026-09-07

- **Covers now come from yuc.wiki season pages**, matched by Chinese title or alias. The local
  frame-extraction approach was rejected (slow and unrepresentative).
- **Local index lookup wired into metadata**: `fetchFullMetadata` queries the local index first with
  three-level title matching (exact / contains / Levenshtein), falling back online only on a miss.
- **Seasonal calendar switched to the local index**: grouped by weekday, covers from the local cache;
  the AniList path remains as a fallback.

## [1.2.1] — 2026-08-28

- **LAN streaming overhaul**: watch in a phone/iPad browser; key-based access on by default (the key is
  no longer embedded in the page source); 10-bit HEVC hardware transcode (NVENC → QSV → AMF) and native
  8-bit HEVC playback; whole-episode caching with background pre-transcode of the next episode;
  two-way progress sync; external srt/ass converted to VTT.
- **Player**: stable three-engine fallback (HTML5 → embedded libmpv → mpv.exe window); custom controls
  and 30+ shortcuts; 9 speed presets plus custom; picture-in-picture; screenshots; AB loop;
  triple-press right arrow to skip 90 seconds of OP/ED.
- **Portable build**: data travels with the app (`data/`), with a one-time migration from the system
  user directory on first launch.
