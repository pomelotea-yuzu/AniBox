/**
 * useSkipTimes — OP/ED 跳过（快捷键模式）
 * 连按 3 次右方向键 = 跳过 80 秒（默认 OP/ED 时长，固定规则；前两次按键各快进 5 秒）。
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
