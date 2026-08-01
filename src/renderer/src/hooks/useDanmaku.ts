/**
 * useDanmaku — 弹幕加载、过滤、发送、导出
 */
import { useState, useCallback, useMemo } from 'react'
import type { DanmakuConfig } from '../components/DanmakuEngine'

interface UseDanmakuOptions {
  filePath: string
  folderPath?: string
  showToast: (msg: string) => void
}

export function useDanmaku(opts: UseDanmakuOptions) {
  const { filePath, folderPath, showToast } = opts

  const [danmakuItems, setDanmakuItems] = useState<any[]>([])
  const [danmakuConfig, setDanmakuConfig] = useState<DanmakuConfig>({
    enabled: false,
    density: 0.8,
    speed: 1.0,
    opacity: 0.8,
    fontScale: 1.0,
    showScroll: true,
    showTop: true,
    showBottom: true,
    offsetMs: 0,
  })
  const [isLoadingDanmaku, setIsLoadingDanmaku] = useState(false)
  const [showDanmakuSettings, setShowDanmakuSettings] = useState(false)
  const [danmakuFilterText, setDanmakuFilterText] = useState('')
  const [danmakuFilterRegex, setDanmakuFilterRegex] = useState('')

  // —— 加载弹幕 ——
  const handleDanmakuFetch = useCallback(async () => {
    if (!folderPath) {
      showToast('无法获取番剧信息')
      return
    }
    const parts = filePath?.replace(/\\/g, '/').split('/') || []
    const folderName = parts.length > 1 ? parts[parts.length - 2] : ''
    const fileName = parts[parts.length - 1]?.replace(/\.[^.]+$/, '') || ''
    const epMatch =
      fileName.match(/[−-]\s*(\d+)/) || fileName.match(/\[(\d+)\]/) || fileName.match(/第(\d+)/)
    const epNum = epMatch ? parseInt(epMatch[1], 10) : 1
    setIsLoadingDanmaku(true)
    try {
      const cleanTitle = await window.electronAPI.danmakuCleanTitle(folderName)
      const items = await window.electronAPI.danmakuFetch(cleanTitle, epNum)
      setDanmakuItems(items)
      setDanmakuConfig((prev) => ({ ...prev, enabled: items.length > 0 }))
      showToast(`弹幕加载完成: ${items.length} 条`)
    } catch {
      showToast('弹幕加载失败')
    } finally {
      setIsLoadingDanmaku(false)
    }
  }, [filePath, folderPath, showToast])

  // —— 配置更新 ——
  const handleDanmakuConfigChange = useCallback((partial: Partial<DanmakuConfig>) => {
    setDanmakuConfig((prev) => ({ ...prev, ...partial }))
  }, [])

  // —— 发送本地弹幕 ——
  const handleSendDanmaku = useCallback(
    (text: string, color: string, mode: string, currentTime: number) => {
      if (!text.trim()) return
      const item = {
        text: text.trim(),
        time: currentTime,
        mode: mode as 'scroll' | 'top' | 'bottom',
        color,
        fontSize: 25,
        timestamp: Date.now(),
      }
      setDanmakuItems((prev) => [...prev, item])
    },
    [],
  )

  // —— 导出弹幕 ——
  const handleDanmakuExport = useCallback(async () => {
    if (danmakuItems.length === 0) {
      showToast('无弹幕可导出')
      return
    }
    const ok = await window.electronAPI.danmakuExport(danmakuItems)
    showToast(ok ? '弹幕已导出' : '导出取消或失败')
  }, [danmakuItems, showToast])

  // —— 过滤弹幕 ——
  const filteredDanmakuItems = useMemo(() => {
    let items = danmakuItems
    if (danmakuFilterText) {
      const kw = danmakuFilterText.toLowerCase()
      items = items.filter((d) => !d.text.toLowerCase().includes(kw))
    }
    if (danmakuFilterRegex) {
      try {
        const re = new RegExp(danmakuFilterRegex, 'i')
        items = items.filter((d) => !re.test(d.text))
      } catch {
        /* invalid regex */
      }
    }
    return items
  }, [danmakuItems, danmakuFilterText, danmakuFilterRegex])

  return {
    danmakuItems,
    danmakuConfig,
    isLoadingDanmaku,
    showDanmakuSettings,
    danmakuFilterText,
    danmakuFilterRegex,
    filteredDanmakuItems,
    handleDanmakuFetch,
    handleDanmakuConfigChange,
    handleSendDanmaku,
    handleDanmakuExport,
    setDanmakuItems,
    setDanmakuConfig,
    setIsLoadingDanmaku,
    setShowDanmakuSettings,
    setDanmakuFilterText,
    setDanmakuFilterRegex,
  }
}
