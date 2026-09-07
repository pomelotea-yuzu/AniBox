// === AniList / Bangumi 元数据 IPC：详情、搜索、新番时间表、标题校验 ===
import { ipcMain, app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import {
  fetchMetadataForSeries,
  fetchMetadataBatch,
  validateBatchTitles,
  searchBangumiMeta,
} from '../metadata-fetcher'
import {
  getIndexStatus,
  checkIndexUpdate,
  updateIndexFromRemote,
  buildLocalSeasonTimeline,
} from '../bangumi-index'
import {
  seasonPageCandidates,
  fetchYucSeason,
  matchYucEntry,
  type YucEntry,
} from '../cover-yuc'
import { translateWithAI, getAIKey } from '../ai-translate'
import { translateLocal } from '../anime-dict'
import * as store from '../store'
import { hashPath } from '../utils'

export function registerAnilistIpc(getWin: () => BrowserWindow | null): void {
  // 元数据
  ipcMain.handle('metadata:fetch', async (_e, title: string, folderPath: string) => {
    try {
      const result = await fetchMetadataForSeries(title, folderPath)
      if (result?.metadata) {
        store.setSeriesMetadata(hashPath(folderPath), result.metadata)
      }
      return result
    } catch (err) {
      console.error('[AniBox] metadata fetch error:', err)
      return null
    }
  })

  ipcMain.handle(
    'metadata:fetchBatch',
    async (_e, series: Array<{ title: string; folderPath: string; season?: number }>) => {
      try {
        const result = await fetchMetadataBatch(series, (cur, total, title, ok, status) => {
          getWin()?.webContents.send('metadata:progress', {
            current: cur,
            total,
            title,
            ok,
            status,
          })
        })
        for (const r of result.results) {
          if (r.metadata) store.setSeriesMetadata(hashPath(r.folderPath), r.metadata)
        }
        return result
      } catch (err) {
        console.error('[AniBox] metadata batch error:', err)
        return []
      }
    },
  )

  ipcMain.handle('metadata:get', (_e, folderPath: string) => {
    const stored = store.getSeriesMetadata(hashPath(folderPath))
    if (stored) return stored
    // 回退到磁盘文件
    return store.loadDiskMetadata(folderPath)
  })

  ipcMain.handle('metadata:getAll', () => {
    return store.getAllMetadata()
  })

  // 本地索引（Bangumi dump）：状态 / 检查更新 / 更新
  ipcMain.handle('index:status', () => getIndexStatus())
  ipcMain.handle('index:checkUpdate', () => checkIndexUpdate())
  ipcMain.handle('index:update', () => updateIndexFromRemote())

  // AniList 标题校验
  ipcMain.handle(
    'metadata:validateTitles',
    async (_e, series: Array<{ folderPath: string; title: string }>) => {
      try {
        return await validateBatchTitles(series)
      } catch (err) {
        console.error('[AniBox] Title validation error:', err)
        return []
      }
    },
  )

  // AniList 番剧详情
  ipcMain.handle('season:fetchDetail', async (_e, anilistId: number) => {
    try {
      const query = `
        query ($id: Int!) {
          Media(id: $id) {
            id
            title { native romaji english }
            coverImage { large extraLarge }
            bannerImage
            description
            episodes duration averageScore popularity
            genres
            studios { nodes { name } }
            startDate { year month day }
            endDate { year month day }
            season seasonYear format status
            nextAiringEpisode { airingAt episode timeUntilAiring }
          }
        }`
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { id: anilistId } }),
      })
      const data = await resp.json()
      return { ok: true, detail: data?.data?.Media || null }
    } catch (err: any) {
      return { ok: false, error: err.message, detail: null }
    }
  })

  // AniList 番剧搜索（搜索番剧功能：搜番 → 详情 → 获取资源下载）
  ipcMain.handle('anime:search', async (_e, query: string, pageSize?: number) => {
    const q = (query || '').trim()
    if (!q) return { ok: false, error: '请输入搜索关键词', anime: [] }
    try {
      const searchQuery = `
        query ($search: String, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(search: $search, type: ANIME, format_not: MUSIC, sort: SEARCH_MATCH) {
              id
              title { native romaji english }
              coverImage { large extraLarge }
              bannerImage
              description
              episodes duration averageScore popularity
              genres
              studios { nodes { name } }
              startDate { year month day }
              endDate { year month day }
              season seasonYear format status
            }
          }
        }`
      const searchAniList = async (kw: string) => {
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            variables: { search: kw, page: 1, perPage: pageSize || 24 },
          }),
        })
        const data = await resp.json()
        return data?.data?.Page?.media || []
      }

      let media = await searchAniList(q)

      // 中文关键词兜底：AniList 对中文支持差，经 Bangumi 查到日文原名再搜
      if (!media.length) {
        try {
          const bg = await searchBangumiMeta(q)
          const jpName = bg?.[0]?.name
          if (jpName && jpName !== q) {
            console.log(`[AniBox] AniList 中文搜索为空，经 Bangumi 转原名 "${jpName}" 重试`)
            media = await searchAniList(jpName)
          }
        } catch {
          /* Bangumi 兜底失败则保持空结果 */
        }
      }
      if (!media.length) return { ok: true, anime: [] }

      const anime = media.map((m: any) => ({
        id: m.id,
        title: m.title?.native || m.title?.romaji || '',
        titleRomaji: m.title?.romaji || '',
        titleEnglish: m.title?.english || '',
        titleZh: '',
        cover: m.coverImage?.large || '',
        coverExtra: m.coverImage?.extraLarge || '',
        bannerImage: m.bannerImage || '',
        description: (m.description || '').replace(/<[^>]+>/g, '').substring(0, 1000),
        descriptionZh: '',
        episodes: m.episodes ?? null,
        duration: m.duration ?? null,
        score: m.averageScore ?? null,
        popularity: m.popularity ?? null,
        genres: (m.genres || []).map((g: string) => translateLocal(g) || g),
        studios: (m.studios?.nodes || []).map((s: any) => s.name),
        startDate: m.startDate || null,
        endDate: m.endDate || null,
        season: m.season || '',
        seasonYear: m.seasonYear || 0,
        format: m.format,
        status: m.status,
        nextAiring: null,
      }))

      // AI 标题翻译（有 Key 时并发批量，让中文用户一眼认出番名）
      if (getAIKey()) {
        console.log('[AniBox] Starting AI title translation for search results:', anime.length)
        const BATCH = 8
        await Promise.all(
          Array.from({ length: Math.ceil(anime.length / BATCH) }, (_, i) =>
            Promise.all(
              anime.slice(i * BATCH, (i + 1) * BATCH).map(async (a: any) => {
                try {
                  const zh = await translateWithAI(a.title, 'ja', 'zh')
                  if (zh && zh !== a.title) a.titleZh = zh
                } catch {
                  a.titleZh = a.titleRomaji || a.titleEnglish || a.title
                }
              }),
            ),
          ),
        )
        console.log('[AniBox] AI title translation done')
      }

      return { ok: true, anime }
    } catch (err: any) {
      console.error('[AniBox] anime:search error:', err)
      return { ok: false, error: err.message || '搜索失败', anime: [] }
    }
  })

  // AniList 新番时间表
  // 策略：有缓存且缓存季度 = 当前季度 → 直接复用；换季或强制刷新 → 重新抓取翻译
  ipcMain.handle('season:fetchTimeline', async (_e, forceRefresh?: boolean) => {
    const cachePath = join(app.getPath('userData'), 'season-cache.json')
    const now = new Date()
    const m = now.getMonth() + 1
    let se = 'WINTER'
    if (m >= 4 && m <= 6) se = 'SPRING'
    else if (m >= 7 && m <= 9) se = 'SUMMER'
    else if (m >= 10 && m <= 12) se = 'FALL'
    const currentSeason = `${se} ${now.getFullYear()}`

    if (!forceRefresh) {
      try {
        const cacheRaw = readFileSync(cachePath, 'utf-8')
        const cache = JSON.parse(cacheRaw)
        if (cache.data?.season && cache.data?.anime?.length) {
          if (cache.data.season === currentSeason) {
            console.log('[AniBox] 缓存命中，季度匹配，直接复用')
            return { ok: true, fromCache: true, season: cache.data.season, anime: cache.data.anime }
          }
          console.log(
            `[AniBox] 缓存季度(${cache.data.season})与当前(${currentSeason})不匹配，重新抓取`,
          )
        }
      } catch (e: any) {
        console.log('[AniBox] 缓存读取失败:', e.message)
      }
    }

    // ==== 本地索引时间表（首选：零在线、全中文免翻译，yuc.wiki 补封面）====
    try {
      const local = await buildLocalSeasonTimeline()
      if (local && local.anime.length) {
        try {
          const today = new Date()
          const qDate = `${today.getFullYear()}-${String(Math.floor(today.getMonth() / 3) * 3 + 1).padStart(2, '0')}-01`
          const yucEntries: YucEntry[] = []
          for (const p of seasonPageCandidates(qDate)) {
            const es = await fetchYucSeason(p)
            if (es) yucEntries.push(...es)
          }
          for (const a of local.anime) {
            const hit = matchYucEntry(yucEntries, [a.titleZh, a.title])
            if (hit) {
              a.cover = hit.coverUrl
              a.coverExtra = hit.coverUrl
            }
          }
        } catch (err: any) {
          console.warn('[AniBox] 本地时间表 yuc 封面补充失败:', err?.message || err)
        }
        const payload = { season: local.season, anime: local.anime }
        try {
          writeFileSync(
            cachePath,
            JSON.stringify({ timestamp: Date.now(), data: payload }, null, 2),
            'utf-8',
          )
        } catch {
          /* ok */
        }
        console.log(`[AniBox] 本地时间表: ${local.season} ${local.anime.length} 部`)
        return { ok: true, fromCache: false, ...payload }
      }
    } catch (err: any) {
      console.warn('[AniBox] 本地时间表构建失败，回退在线链路:', err?.message || err)
    }

    try {
      const query = `
        query ($season: MediaSeason!, $year: Int!) {
          Page(page: 1, perPage: 70) {
            media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC) {
              id
              title { native romaji english }
              coverImage { large extraLarge }
              bannerImage
              description
              episodes duration averageScore popularity
              genres
              studios { nodes { name } }
              startDate { year month day }
              endDate { year month day }
              season seasonYear format status
              nextAiringEpisode { airingAt episode timeUntilAiring }
            }
          }
        }`
      const variables = { season: se, year: now.getFullYear() }
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
      const data = await resp.json()
      if (!data?.data?.Page?.media) {
        return { ok: false, error: 'API 返回异常', anime: [] }
      }
      const anime = data.data.Page.media.map((m: any) => ({
        id: m.id,
        title: m.title?.native || m.title?.romaji || '',
        titleRomaji: m.title?.romaji || '',
        titleEnglish: m.title?.english || '',
        titleZh: '',
        cover: m.coverImage?.large || '',
        coverExtra: m.coverImage?.extraLarge || '',
        bannerImage: m.bannerImage || '',
        description: (m.description || '').replace(/<[^>]+>/g, '').substring(0, 1000),
        descriptionZh: '',
        episodes: m.episodes ?? null,
        duration: m.duration ?? null,
        score: m.averageScore ?? null,
        popularity: m.popularity ?? null,
        genres: (m.genres || []).map((g: string) => translateLocal(g) || g),
        studios: (m.studios?.nodes || []).map((s: any) => s.name),
        startDate: m.startDate || null,
        endDate: m.endDate || null,
        season: m.season || '',
        seasonYear: m.seasonYear || 0,
        format: m.format,
        status: m.status,
        nextAiring: m.nextAiringEpisode
          ? {
              episode: m.nextAiringEpisode.episode,
              airingAt: m.nextAiringEpisode.airingAt,
              timeUntilAiring: m.nextAiringEpisode.timeUntilAiring,
            }
          : null,
      }))

      // AI 标题翻译（并发批量，有 Key 时用 DeepSeek）
      if (getAIKey()) {
        console.log('[AniBox] Starting AI title translation for', anime.length, 'titles')
        const BATCH = 10 // 并发数
        let done = 0
        for (let i = 0; i < anime.length; i += BATCH) {
          const batch = anime.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (a: any) => {
              try {
                const zh = await translateWithAI(a.title, 'ja', 'zh')
                if (zh && zh !== a.title) {
                  a.titleZh = zh
                }
              } catch {
                a.titleZh = a.titleRomaji || a.titleEnglish || a.title
              }
            }),
          )
          done += batch.length
          console.log(`[AniBox] AI translate progress: ${done}/${anime.length}`)
        }
        console.log('[AniBox] AI title translation done')

        // AI 简介翻译
        const withDesc = anime.filter((a: any) => a.description && a.description.length > 10)
        if (withDesc.length > 0) {
          console.log('[AniBox] Starting AI description translation for', withDesc.length, 'anime')
          let descDone = 0
          for (let i = 0; i < withDesc.length; i += BATCH) {
            const batch = withDesc.slice(i, i + BATCH)
            await Promise.all(
              batch.map(async (a: any) => {
                try {
                  const zh = await translateWithAI(a.description, 'auto', 'zh')
                  if (zh && zh !== a.description) {
                    a.descriptionZh = zh
                  }
                } catch {
                  a.descriptionZh = a.description
                }
              }),
            )
            descDone += batch.length
            console.log(`[AniBox] AI desc translate progress: ${descDone}/${withDesc.length}`)
          }
          console.log('[AniBox] AI description translation done')
        }
      }

      const payload = { season: currentSeason, anime }
      try {
        writeFileSync(
          cachePath,
          JSON.stringify({ timestamp: Date.now(), data: payload }, null, 2),
          'utf-8',
        )
      } catch {
        /* ok */
      }
      return { ok: true, fromCache: false, ...payload }
    } catch (err: any) {
      console.error('[AniBox] season:fetchTimeline error:', err)
      try {
        const fb = JSON.parse(
          readFileSync(join(app.getPath('userData'), 'season-cache.json'), 'utf-8'),
        )
        return { ok: true, fromCache: true, stale: true, ...fb.data }
      } catch {
        /* ok */
      }
      return { ok: false, error: err.message || '网络请求失败', anime: [] }
    }
  })
}
