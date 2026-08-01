/**
 * useSubtitles — 外挂字幕加载、双语字幕、在线搜索下载、样式管理
 */
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type { SubtitleTrack } from '../../../main/subtitle'
import type { SubtitleTrackInfo } from '../components/VideoDisplay'
import type { SubtitleStyleConfig } from '../components/SubtitleOverlay'

interface UseSubtitlesOptions {
  subtitleTracks?: SubtitleTrack[]
  filePath: string
  showToast: (msg: string) => void
}

export function useSubtitles(opts: UseSubtitlesOptions) {
  const { subtitleTracks, filePath, showToast } = opts

  const [subtitleDisplayTracks, setSubtitleDisplayTracks] = useState<SubtitleTrackInfo[]>([])
  const [selectedSubtitleIdx, setSelectedSubtitleIdx] = useState(-1)
  const [embeddedTextTracks, setEmbeddedTextTracks] = useState<
    { label: string; language: string; index: number }[]
  >([])
  const blobUrlsRef = useRef<string[]>([])

  // 双语字幕
  const [selectedSecondarySubIdx, setSelectedSecondarySubIdx] = useState(-1)
  const [primaryVttContent, setPrimaryVttContent] = useState('')
  const [secondaryVttContent, setSecondaryVttContent] = useState('')
  const [useCustomOverlay, setUseCustomOverlay] = useState(false)

  // 字幕样式
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>({
    fontSize: 24,
    fontFamily: 'sans-serif',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bgColor: 'rgba(0,0,0,0.5)',
    position: 'bottom',
    secondaryFontSize: 20,
    dualSubtitleGap: 4,
  })
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false)

  // 在线字幕搜索
  const [onlineSearchResults, setOnlineSearchResults] = useState<any[]>([])
  const [isSearchingOnline, setIsSearchingOnline] = useState(false)
  const [showOnlineSearch, setShowOnlineSearch] = useState(false)

  // ref 同步（供键盘快捷键使用）
  const subtitleDisplayTracksRef = useRef<any[]>([])
  useEffect(() => {
    subtitleDisplayTracksRef.current = subtitleDisplayTracks
  }, [subtitleDisplayTracks])
  const selectedSubtitleIdxRef = useRef(-1)
  useEffect(() => {
    selectedSubtitleIdxRef.current = selectedSubtitleIdx
  }, [selectedSubtitleIdx])
  const selectedSecondarySubIdxRef = useRef(-1)
  useEffect(() => {
    selectedSecondarySubIdxRef.current = selectedSecondarySubIdx
  }, [selectedSecondarySubIdx])
  const primaryVttContentRef = useRef('')
  useEffect(() => {
    primaryVttContentRef.current = primaryVttContent
  }, [primaryVttContent])
  const secondaryVttContentRef = useRef('')
  useEffect(() => {
    secondaryVttContentRef.current = secondaryVttContent
  }, [secondaryVttContent])
  const showOnlineSearchRef = useRef(false)
  useEffect(() => {
    showOnlineSearchRef.current = showOnlineSearch
  }, [showOnlineSearch])

  // —— 外挂字幕加载 ——
  useEffect(() => {
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    blobUrlsRef.current = []
    setSubtitleDisplayTracks([])
    setSelectedSubtitleIdx(-1)
    setSelectedSecondarySubIdx(-1)
    setPrimaryVttContent('')
    setSecondaryVttContent('')

    if (!subtitleTracks || subtitleTracks.length === 0) return

    let cancelled = false
    const loadSubtitles = async () => {
      const tracks: SubtitleTrackInfo[] = []
      const vttContents: string[] = []
      for (const st of subtitleTracks) {
        try {
          const vttContent = await window.electronAPI.subtitleReadVtt(st.filePath)
          if (cancelled) return
          if (!vttContent.trim()) continue
          const blob = new Blob([vttContent], { type: 'text/vtt' })
          const blobUrl = URL.createObjectURL(blob)
          blobUrlsRef.current.push(blobUrl)
          tracks.push({
            label: st.label || '字幕',
            language: st.language || '',
            src: blobUrl,
            _vttContent: vttContent,
          })
          vttContents.push(vttContent)
        } catch (err) {
          console.warn('[AniBox] Failed to load subtitle:', st.filePath, err)
        }
      }
      if (cancelled) return
      setSubtitleDisplayTracks(tracks)
      if (tracks.length > 0) {
        setSelectedSubtitleIdx(0)
        setPrimaryVttContent(vttContents[0] || '')
        setUseCustomOverlay(true)
      }
    }

    loadSubtitles()
    return () => {
      cancelled = true
    }
  }, [subtitleTracks, filePath])

  // —— 字幕样式加载 ——
  useEffect(() => {
    window.electronAPI
      .subtitleGetStyle()
      .then((style) => {
        if (style) setSubtitleStyle(style)
      })
      .catch(() => {})
  }, [])

  // —— 合并字幕列表（外挂 + 内嵌） ——
  const allSubtitleTracks = useMemo(() => {
    const embeddedTracks = subtitleDisplayTracks.length === 0 ? embeddedTextTracks : []
    return [
      ...subtitleDisplayTracks.map((t) => ({
        label: t.label,
        language: t.language,
        type: 'external' as const,
      })),
      ...embeddedTracks.map((t) => ({
        label: t.label,
        language: t.language,
        type: 'embedded' as const,
      })),
    ]
  }, [subtitleDisplayTracks, embeddedTextTracks])

  // —— 字幕切换 ——
  const handleSubtitleChange = useCallback(
    (idx: number) => {
      setSelectedSubtitleIdx(idx)
      if (idx >= 0 && idx < subtitleDisplayTracks.length) {
        const track = subtitleDisplayTracks[idx] as any
        if (track._vttContent) {
          setPrimaryVttContent(track._vttContent)
          setUseCustomOverlay(true)
        } else {
          fetch(track.src)
            .then((r) => r.text())
            .then((vtt) => {
              setPrimaryVttContent(vtt)
              setUseCustomOverlay(true)
            })
            .catch(() => {})
        }
      } else {
        setPrimaryVttContent('')
        setUseCustomOverlay(false)
      }
    },
    [subtitleDisplayTracks],
  )

  const toggleSubtitle = useCallback(() => {
    if (allSubtitleTracks.length === 0) return
    setSelectedSubtitleIdx((prev) => (prev < 0 ? 0 : -1))
  }, [allSubtitleTracks.length])

  // —— 双语副字幕 ——
  const handleSecondarySubtitleChange = useCallback(
    (idx: number) => {
      setSelectedSecondarySubIdx(idx)
      if (idx >= 0 && idx < subtitleDisplayTracks.length) {
        const track = subtitleDisplayTracks[idx] as any
        if (track._vttContent) setSecondaryVttContent(track._vttContent)
        else
          fetch(track.src)
            .then((r) => r.text())
            .then((vtt) => setSecondaryVttContent(vtt))
            .catch(() => {})
      } else setSecondaryVttContent('')
    },
    [subtitleDisplayTracks],
  )

  // —— 字幕样式更新 ——
  const handleSubtitleStyleChange = useCallback((newStyle: Partial<SubtitleStyleConfig>) => {
    setSubtitleStyle((prev) => {
      const merged = { ...prev, ...newStyle }
      window.electronAPI.subtitleSetStyle(merged).catch(() => {})
      return merged
    })
  }, [])

  // —— 在线字幕搜索 ——
  const handleOnlineSearch = useCallback(
    async (query?: string) => {
      if (!filePath) return
      setIsSearchingOnline(true)
      setShowOnlineSearch(true)
      try {
        const parts = filePath.replace(/\\/g, '/').split('/')
        const folderName = parts.length > 1 ? parts[parts.length - 2] : ''
        const fileName = parts[parts.length - 1].replace(/\.[^.]+$/, '')
        const epMatch = fileName.match(/[−-]\s*(\d+)/) || fileName.match(/\[(\d+)\]/)
        const episode = epMatch ? parseInt(epMatch[1], 10) : undefined
        const results = await window.electronAPI.subtitleSearchOnline({
          title: query || folderName,
          episode,
          videoPath: filePath,
          preferredLanguages: ['zh', 'ja'],
        })
        setOnlineSearchResults(results)
      } catch {
        setOnlineSearchResults([])
      } finally {
        setIsSearchingOnline(false)
      }
    },
    [filePath],
  )

  // —— 下载在线字幕 ——
  const handleOnlineSubDownload = useCallback(
    async (result: any) => {
      try {
        const savedPath = await window.electronAPI.subtitleDownload(result, filePath)
        if (savedPath) {
          showToast('字幕已下载')
          const newTracks = await window.electronAPI.subtitleRescan(filePath)
          const tracks: SubtitleTrackInfo[] = []
          for (const st of newTracks) {
            try {
              const vttContent = await window.electronAPI.subtitleReadVtt(st.filePath)
              if (!vttContent.trim()) continue
              const blob = new Blob([vttContent], { type: 'text/vtt' })
              const blobUrl = URL.createObjectURL(blob)
              blobUrlsRef.current.push(blobUrl)
              tracks.push({
                label: st.label || '字幕',
                language: st.language || '',
                src: blobUrl,
                _vttContent: vttContent,
              })
            } catch {
              /* skip */
            }
          }
          setSubtitleDisplayTracks(tracks)
          setShowOnlineSearch(false)
        } else {
          showToast('下载失败')
        }
      } catch {
        showToast('下载出错')
      }
    },
    [filePath, showToast],
  )

  return {
    subtitleDisplayTracks,
    selectedSubtitleIdx,
    selectedSecondarySubIdx,
    primaryVttContent,
    secondaryVttContent,
    useCustomOverlay,
    subtitleStyle,
    showSubtitleSettings,
    onlineSearchResults,
    isSearchingOnline,
    showOnlineSearch,
    allSubtitleTracks,
    handleSubtitleChange,
    toggleSubtitle,
    handleSecondarySubtitleChange,
    handleSubtitleStyleChange,
    handleOnlineSearch,
    handleOnlineSubDownload,
    setSelectedSubtitleIdx,
    setSelectedSecondarySubIdx,
    setPrimaryVttContent,
    setSecondaryVttContent,
    setShowSubtitleSettings,
    setShowOnlineSearch,
    setOnlineSearchResults,
    setIsSearchingOnline,
    setSubtitleDisplayTracks,
    setEmbeddedTextTracksFromSubtitle: setEmbeddedTextTracks,
    subRefs: {
      subtitleDisplayTracksRef,
      selectedSubtitleIdxRef,
      selectedSecondarySubIdxRef,
      primaryVttContentRef,
      secondaryVttContentRef,
      showOnlineSearchRef,
    },
    blobUrlsRef,
  }
}
