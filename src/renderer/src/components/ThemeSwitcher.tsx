/**
 * ThemeSwitcher — 莫兰迪主题切换器
 * 横向排列的调色板圆点，点击切换主题
 */
import { useTheme } from '../context/ThemeContext'

export default function ThemeSwitcher() {
  const { theme, themeList, setTheme } = useTheme()

  return (
    <div className="flex items-center gap-1.5">
      {themeList.map((t) => {
        const isActive = t.name === theme
        return (
          <button
            key={t.name}
            onClick={() => setTheme(t.name)}
            title={`${t.label} — ${t.description}`}
            className="relative w-7 h-7 rounded-full border-2 transition-all duration-200 flex items-center justify-center"
            style={{
              borderColor: isActive ? t.accent : 'transparent',
              boxShadow: isActive ? `0 0 0 2px ${t.accent}40` : 'none',
            }}
          >
            {/* 内部色块：双色渐变展示主色调 */}
            <span
              className="w-4 h-4 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
