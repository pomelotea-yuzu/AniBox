// 修复 Electron-in-Electron 嵌��问题 (WorkBuddy/VSCode 终端继承 ELECTRON_RUN_AS_NODE=1)
// 必须在 Electron 启动前清除，否则 require('electron') 返回 exe 路径而非 API 模块
delete process.env.ELECTRON_RUN_AS_NODE

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      emptyOutDir: false
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      outDir: 'out/preload',
      emptyOutDir: false
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    build: {
      outDir: 'out/renderer',
      emptyOutDir: false
    },
    plugins: [react()]
  }
})