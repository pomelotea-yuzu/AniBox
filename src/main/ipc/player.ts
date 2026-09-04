// === 播放控制 IPC：mpv 后端 + 窗口控制 ===
import { ipcMain, type BrowserWindow } from 'electron'
import {
  playWithMpv,
  sendMpvCommand,
  getMpvState,
  libmpvPreviewAt,
  libmpvQuit,
  mpvKill,
} from '../mpv-backend'

export function registerPlayerIpc(getWin: () => BrowserWindow | null): void {
  // 方案 A：优先 libmpv 内嵌（单窗口）；失败自动回退 mpv.exe 独立窗口
  ipcMain.handle('mpv:play', (_e, p: string) => {
    return playWithMpv(p)
  })

  ipcMain.handle('mpv:quit', () => {
    console.log('[AniBox] mpv:quit 收到')
    libmpvQuit()
    mpvKill()
    getWin()?.focus()
  })

  // 向运行中的 mpv 发送命令（libmpv 或 mpv.exe JSON IPC；字幕/音轨切换、seek 等）
  ipcMain.handle('mpv:command', (_e, cmd: any[]) => {
    return sendMpvCommand(cmd)
  })

  // 播放状态轮询（渲染进程进度条用）
  ipcMain.handle('mpv:getState', () => {
    return getMpvState()
  })

  // 悬浮预览：seek 指定位置取一帧（独立静音实例，不打断播放）
  ipcMain.handle('mpv:preview', (_e, filePath: string, t: number) => {
    return libmpvPreviewAt(filePath, t)
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    const win = getWin()
    win?.setFullScreen(!win.isFullScreen())
  })

  ipcMain.handle('window:exitFullscreen', () => {
    const win = getWin()
    if (win?.isFullScreen()) win.setFullScreen(false)
  })

  ipcMain.handle('window:isFullscreen', () => getWin()?.isFullScreen() ?? false)
}
