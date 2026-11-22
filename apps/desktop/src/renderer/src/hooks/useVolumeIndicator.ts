/**
 * useVolumeIndicator — 音量调节的中央圆形指示器显隐控制
 * 上下键调音量时短暂浮现（默认 1s），连续按键会重置计时而不是叠加多个圆
 */
import { useState, useCallback, useEffect, useRef } from 'react'

export function useVolumeIndicator(duration = 1000) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), duration)
  }, [duration])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { visible, show }
}
