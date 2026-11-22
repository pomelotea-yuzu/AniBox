/**
 * useSkipTimes — OP/ED 跳过（快捷键模式）
 * 连按 3 次右方向键 = 跳到「连按起点 + N 秒」处，N 由设置页「播放」tab 的
 * skipSeconds 指定（0-90，默认 90；0 = 不跳转）。
 * 控制条上的「跳过」按钮为总开关：点击开启快捷键生效，再点关闭失效。
 * （2026-08-20 重构：删除原双点区间标记逻辑）
 */
import { useState, useCallback } from 'react'

export function useSkipTimes() {
  const [skipShortcutEnabled, setSkipShortcutEnabled] = useState(false)

  const toggleSkipShortcut = useCallback(() => {
    setSkipShortcutEnabled((prev) => !prev)
  }, [])

  return { skipShortcutEnabled, setSkipShortcutEnabled, toggleSkipShortcut }
}
