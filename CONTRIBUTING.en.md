# Contributing to AniBox

> **Language:** English | [简体中文](CONTRIBUTING.md)

Thanks for contributing to AniBox! These are short collaboration guidelines. For usage questions start
with the [README](README.en.md) and the [quick start](docs/guide/README.md).

## Ways to contribute

Documentation corrections, minimal reproductions, test improvements and code fixes are all welcome.
Small documentation fixes can go straight to a PR; for feature suggestions, describe the real scenario,
current workaround and expected result first, then discuss scope — **directions already ruled out**
(macOS release, a standalone TV app, playing directly from a TV-attached drive, 24→60 interpolation,
upscaling and interpolation together) are listed in the [roadmap](docs/product/roadmap.md); repeating
them will not bring them back into scope.

Feedback goes to [GitHub Issues](https://github.com/pomelotea-yuzu/AniBox/issues) or
[Gitee Issues](https://gitee.com/yuzu-tea-duck/ani-box/issues). If a record already exists, add to it;
both platforms follow the same rules and duplicate PRs are not required.

## Development environment

- Windows 10/11 x64 (**the only packaging and acceptance target today**)
- Node.js **≥ 20**, pnpm ≥ 11
- The runtime needs `libmpv-2.dll`, `mpv.exe` and `ffmpeg.exe` in place (they are not committed; see `.gitignore`)

```bash
cd apps/desktop
pnpm install
pnpm dev            # development mode
npm run typecheck   # currently passing
npm run lint        # pre-existing errors; not a gate yet
npm test            # vitest

node scripts/check-repo.mjs --all   # repository gates (run at the repo root)
```

Workflow, the OpenSpec process and packaging are documented in
[docs/development/workflow.md](docs/development/workflow.md); known traps and outstanding debt in
[docs/knowledge/](docs/knowledge/README.md).

## Submitting changes

1. Branch from `main`; keep one PR focused on one thing. Check related issues and the
   [active change](openspec/changes/README.md) first to avoid duplicating work in progress.
2. Changes that affect capability semantics start with an OpenSpec proposal
   (`openspec/changes/<verb-led-name>/`) describing compatibility and acceptance conditions. Typos and
   link fixes do not need a change.
3. In the PR, state the problem, the change, related issue/change, verification results and remaining
   limitations. A draft PR is not a mergeable PR.
4. Run `node scripts/check-repo.mjs --all` before requesting a merge. Changes touching the player,
   rendering, packaging or the data root **must** include on-device Windows verification (at least one
   of playback / subtitles / audio tracks / seek) and restate the affected invariants
   (I1–I11 in [`docs/knowledge/invariants.md`](docs/knowledge/invariants.md)).
5. If an environment limit prevented a check, state the command, the blocker and the uncovered scope —
   **do not tick it as passed**. A green light on an older commit does not verify a newer one.
6. User-visible behaviour changes must be reflected in the README and `docs/guide/`. Commit titles
   describe the concrete change (e.g. `docs: align data-root wording`); background and verification
   details belong in the body.

## Code conventions

- TypeScript strict. UI lives in `apps/desktop/src/renderer/`, filesystem/media/native work in
  `src/main/`, and the cross-process surface only goes through `src/preload/`.
- **Single source of truth**: IPC is split per domain under `src/main/ipc/`; player controls and the
  default layout are defined only in `renderer/src/components/controls/controlsData.ts`.
- Comments and documentation are Chinese by default; logs and error messages must stay user-readable
  (print the data root, the chosen engine and the fallback reason on critical paths).

## Data and privacy

- **Do not upload your whole `data/` or `.anibox/` directory** in an issue or PR: it contains library
  paths, watch progress, the streaming access key and possibly API keys.
- Attach only relevant log fragments, with user names and disk layout removed.
- For vulnerabilities, access keys or path escapes, use the private channel in [SECURITY.md](SECURITY.en.md).

## Licensing

Submitting a contribution means you have the right to provide it and agree that original parts are
distributed under the project's [MIT License](LICENSE), without copyright assignment. Third-party
content keeps its own licence; when bringing in code, icons, fonts or documentation snippets, list the
source, version, licence and modifications.

## Code of conduct

Participation implies agreement with [CODE_OF_CONDUCT.en.md](CODE_OF_CONDUCT.en.md)
([简体中文](CODE_OF_CONDUCT.md)).
