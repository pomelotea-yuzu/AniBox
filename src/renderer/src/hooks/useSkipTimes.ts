/**
 * useSkipTimes — OP/ED 跳过（双点区间标记）
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { formatTimeShort } from '../utils/format'

interface UseSkipTimesOptions {
  folderPath?: string
  showToast: (msg: string) => void
}

export function useSkipTimes(opts: UseSkipTimesOptions) {
  const { folderPath, showToast } = opts

  const [opStart, setOpStart] = useState(0)
  const [opEnd, setOpEnd] = useState(0)
  const [edStart, setEdStart] = useState(0)
  const [edEnd, setEdEnd] = useState(0)
  const [skipOpEnabled, setSkipOpEnabled] = useState(false)
  const [skipEdEnabled, setSkipEdEnabled] = useState(false)

  const skipRef = useRef({ opStart: 0, opEnd: 0, edStart: 0, edEnd: 0, skipOp: false, skipEd: false, hasSkippedOp: false, hasSkippedEd: false })

  // sync state → ref
  useEffect(() => {
    skipRef.current = { ...skipRef.current, opStart, opEnd, edStart, edEnd, skipOp: skipOpEnabled, skipEd: skipEdEnabled }
  }, [opStart, opEnd, edStart, edEnd, skipOpEnabled, skipEdEnabled])

  // 换集重置跳过标记
  useEffect(() => {
    skipRef.current.hasSkippedOp = false
    skipRef.current.hasSkippedEd = false
  }, [folderPath])

  // 加载已有的跳过时间
  useEffect(() => {
    if (!folderPath) return
    setOpStart(0); setOpEnd(0); setEdStart(0); setEdEnd(0)
    setSkipOpEnabled(false); setSkipEdEnabled(false)
    window.electronAPI.getSkipTimes(folderPath).then(data => {
      if (data) {
        setOpStart(data.opStart || 0); setOpEnd(data.opEnd || 0)
        setEdStart(data.edStart || 0); setEdEnd(data.edEnd || 0)
        if ((data.opStart || data.opEnd) && data.opEnd) setSkipOpEnabled(true)
        if ((data.edStart || data.edEnd) && data.edStart) setSkipEdEnabled(true)
      }
    }).catch(() => {})
  }, [folderPath])

  // OP 标记操作：第一次→起点，第二次→终点，再点→切换开关
  const handleOpAction = useCallback(async (currentTime: number) => {
    if (!folderPath) return
    const pos = currentTime
    const data = await window.electronAPI.getSkipTimes(folderPath).catch(() => null) || { opStart: 0, opEnd: 0, edStart: 0, edEnd: 0 }

    if (opStart === 0 && opEnd === 0) {
      setOpStart(pos)
      showToast(`片头起点: ${formatTimeShort(pos)}  (再点一次标记终点)`)
      await window.electronAPI.setSkipTimes(folderPath, { ...data, opStart: pos })
    } else if (opStart > 0 && opEnd === 0) {
      const start = Math.min(opStart, pos); const end = Math.max(opStart, pos)
      setOpStart(start); setOpEnd(end)
      setSkipOpEnabled(true)
      showToast(`片头区间: ${formatTimeShort(start)} → ${formatTimeShort(end)}`)
      await window.electronAPI.setSkipTimes(folderPath, { ...data, opStart: start, opEnd: end })
    } else {
      setSkipOpEnabled(prev => {
        showToast(prev ? '片头跳过已关闭' : '片头跳过已开启')
        return !prev
      })
    }
  }, [folderPath, opStart, opEnd, showToast])

  const handleOpClear = useCallback(async () => {
    if (!folderPath) return
    const data = await window.electronAPI.getSkipTimes(folderPath).catch(() => null) || { opStart: 0, opEnd: 0, edStart: 0, edEnd: 0 }
    setOpStart(0); setOpEnd(0); setSkipOpEnabled(false)
    await window.electronAPI.setSkipTimes(folderPath, { ...data, opStart: 0, opEnd: 0 })
    showToast('已清除片头标记')
  }, [folderPath, showToast])

  const handleEdAction = useCallback(async (currentTime: number) => {
    if (!folderPath) return
    const pos = currentTime
    const data = await window.electronAPI.getSkipTimes(folderPath).catch(() => null) || { opStart: 0, opEnd: 0, edStart: 0, edEnd: 0 }

    if (edStart === 0 && edEnd === 0) {
      setEdStart(pos)
      showToast(`片尾起点: ${formatTimeShort(pos)}  (再点一次标记终点)`)
      await window.electronAPI.setSkipTimes(folderPath, { ...data, edStart: pos })
    } else if (edStart > 0 && edEnd === 0) {
      const start = Math.min(edStart, pos); const end = Math.max(edStart, pos)
      setEdStart(start); setEdEnd(end)
      setSkipEdEnabled(true)
      showToast(`片尾区间: ${formatTimeShort(start)} → ${formatTimeShort(end)}`)
      await window.electronAPI.setSkipTimes(folderPath, { ...data, edStart: start, edEnd: end })
    } else {
      setSkipEdEnabled(prev => {
        showToast(prev ? '片尾跳过已关闭' : '片尾跳过已开启')
        return !prev
      })
    }
  }, [folderPath, edStart, edEnd, showToast])

  const handleEdClear = useCallback(async () => {
    if (!folderPath) return
    const data = await window.electronAPI.getSkipTimes(folderPath).catch(() => null) || { opStart: 0, opEnd: 0, edStart: 0, edEnd: 0 }
    setEdStart(0); setEdEnd(0); setSkipEdEnabled(false)
    await window.electronAPI.setSkipTimes(folderPath, { ...data, edStart: 0, edEnd: 0 })
    showToast('已清除片尾标记')
  }, [folderPath, showToast])

  return {
    opStart, opEnd, edStart, edEnd, skipOpEnabled, skipEdEnabled, skipRef,
    handleOpAction, handleEdAction, handleOpClear, handleEdClear,
    setSkipOpEnabled, setSkipEdEnabled
  }
}
