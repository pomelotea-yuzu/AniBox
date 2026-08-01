import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

root.render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
)

// 启动 splash 淡出 — React 挂载完成后平滑过渡
const splash = document.getElementById('splash')
if (splash) {
  // 等 React 完成首次渲染后再淡出
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      splash.classList.add('fade-out')
      setTimeout(() => splash.remove(), 400)
    })
  })
}
