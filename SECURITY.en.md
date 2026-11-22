# Security Policy

> **Language:** English | [简体中文](SECURITY.md)

## Scope

This policy describes what security reports are accepted; it does not promise a support window or a
fixed fix timeline. Version numbers follow actual release records — a version in `package.json` alone
does not prove which build you are running.

| Version | Status |
|---|---|
| Latest release (currently 1.2.x) | Reports accepted and fixed |
| Older releases | Reports accepted to check whether the latest release is still affected; backports not promised |
| Self-built / `main` | Reports accepted with an exact commit or artifact hash |
| The portable `data/` contents | Out of scope (local user data; see the boundaries below) |

## How to report

**Please do not report security vulnerabilities in a public issue.**

- Ordinary usage problems: use the [issue form](.github/ISSUE_TEMPLATE/bug_report.yml) with redacted,
  relevant logs only.
- Leaked access keys, path escapes (reading files outside scan roots), unauthorised writes or
  supply-chain issues: use **Security → Report a vulnerability** on the GitHub repository. If that
  entry point is unavailable, check whether direct messages are enabled on the
  [Gitee maintainer profile](https://gitee.com/yuzu-tea-duck).
- If neither channel works, open an issue that **only asks for a private contact method**, with no
  vulnerability details or exploitation steps.

Include: affected version or commit, Windows version, component, impact, minimal reproduction steps and
any workaround you tried. Reproduce with placeholder keys and temporary files where possible; never send
a valid API key or a real library dump.

## Handling and disclosure

The first human response is targeted at **3 business days** — that is not a fix deadline. There is
currently a **single maintainer**, no independent second reviewer and no bug bounty; no CVE assignment is
promised. After fixing, the impact, fixed version and upgrade notes are recorded and the disclosure
timing agreed with the reporter.

## Security boundaries (stated honestly)

- **Streaming access key**: enabled by default and no longer embedded in the page source. It is a
  **lightweight LAN control, not an authentication system** — anyone on the same subnet who knows the
  address still sees the login prompt. Never expose the streaming port to the public internet.
- **Only files under scan roots are exposed**: both streaming and the `anibox://` protocol are
  whitelisted to scan roots. There is **no OS-level sandbox**; a path-traversal bug would expose
  anything the process can read.
- **Data is plaintext**: library index, watch progress, the streaming key, and qBittorrent / AI service
  credentials are stored as JSON in the data root **without encryption** (portable: `<app folder>/data/`;
  development: `<repo>/.anibox/`; installed: system `userData`). Sharing or backing up that folder means
  sharing those credentials.
- **When data leaves the machine**: metadata and search call AniList / Bangumi (titles are sent);
  online subtitle search calls OpenSubtitles (title and episode number); AI translation sends titles and
  synopses to DeepSeek (only when you configure a key and enable it). Cover fetching contacts yuc.wiki
  and the Bilibili CDN. Playback itself does not go online.
- **Offline should still work**: with the bundled index and local cover cache in place, library scan,
  playback and the seasonal calendar work without network; being offline must not silently degrade
  behaviour without telling the user.
- **Portable data is not encrypted as a whole**: deleting `data/` leaves nothing behind, but the files on
  disk are plaintext.

If these boundaries change with the implementation, this page and `CHANGELOG` are updated together.
**Do not read this page as proof that hardening has been done.**
