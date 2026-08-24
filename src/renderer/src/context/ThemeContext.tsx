/**
 * ThemeContext — 莫兰迪主题切换
 * 通过 CSS 变量动态注入到 :root，实现零重绘主题切换
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import THEMES, { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeColors } from '../themes'

interface ThemeContextValue {
  theme: string
  themeData: ThemeColors
  themeNames: string[]
  themeList: ThemeColors[]
  setTheme: (name: string) => void
}

const ThemeContext = createContext<ThemeContextValue>(null!)

function applyTheme(colors: ThemeColors) {
  const root = document.documentElement
  root.style.setProperty('--ab-bg', colors.bg)
  root.style.setProperty('--ab-surface', colors.surface)
  root.style.setProperty('--ab-accent', colors.accent)
  root.style.setProperty('--ab-accent-hover', colors.accentHover)
  root.style.setProperty('--ab-secondary', colors.secondary)
  root.style.setProperty('--ab-secondary-hover', colors.secondaryHover)
  root.style.setProperty('--ab-text', colors.text)
  root.style.setProperty('--ab-text-muted', colors.textMuted)
  root.style.setProperty('--ab-border', colors.border)
  root.style.setProperty('--ab-overlay', colors.overlay)
  root.style.setProperty('--ab-scroll-thumb', colors.scrollThumb)
  root.style.setProperty('--ab-scroll-hover', colors.scrollHover)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME)

  // 从 localStorage 恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY)
      if (saved && THEMES[saved]) {
        setThemeState(saved)
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [])

  // 应用 CSS 变量
  useEffect(() => {
    const colors = THEMES[theme] ?? THEMES[DEFAULT_THEME]
    applyTheme(colors)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ok */
    }
  }, [theme])

  const setTheme = useCallback((name: string) => {
    if (THEMES[name]) {
      setThemeState(name)
      // 同步给主进程，串流网页注入时跟随主应用配色（静默失败不影响主应用）
      try {
        window.electronAPI?.streamSyncTheme?.(name).catch(() => {})
      } catch {
        /* preload 不可用时忽略 */
      }
    }
  }, [])

  const themeNames = Object.keys(THEMES)
  const themeList = Object.values(THEMES)
  const themeData = THEMES[theme] ?? THEMES[DEFAULT_THEME]

  return (
    <ThemeContext.Provider value={{ theme, themeData, themeNames, themeList, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
