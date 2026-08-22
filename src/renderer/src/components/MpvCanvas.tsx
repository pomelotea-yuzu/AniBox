import { useCallback, useEffect, useRef, useState } from 'react'
import Controls from './Controls'

interface MpvTrack {
  id: number
  type: string
  lang: string
  title: string
  codec: string
  selected: boolean
}

interface MpvCanvasProps {
  filePath: string
  onClose: () => void
  /** 播放模式：sequential / loop-one / loop-all / shuffle */
  playMode?: string
  /** 上一话标题（用于上一话按钮提示） */
  prevEpisodeTitle?: string
  /** 下一话标题（用于连播提示） */
  nextEpisodeTitle?: string
  /** 播放上一集的回调 */
  onPrevEpisode?: () => void
  /** 播放下一集的回调（App 层复用 handleNextEpisode） */
  onNextEpisode?: () => void
  /** 主进程 libmpv 初始化失败时回调（App 层切回旧 mpv.exe 链路） */
  onFallbackToLegacy?: () => void
  /** 选集列表（番剧模式下传入，用于播放器内选集） */
  episodes?: Array<{ fileName: string; filePath: string; epNumber?: number }>
  /** 当前集索引 */
  currentEpIndex?: number
  /** 选集切换回调（切到 index 集） */
  onSelectEpisode?: (index: number) => void
  /** 播放模式循环（sequential / loop-one / loop-all / shuffle） */
  onCyclePlayMode?: () => void
}

/** libmpv 内嵌播放（方案 A）——主进程软渲染取帧 → IPC → Canvas 显示，单窗口、叠加层可用 */
export default function MpvCanvas({
  filePath,
  onClose,
  playMode,
  onPrevEpisode,
  onNextEpisode,
  onFallbackToLegacy,
  episodes,
  currentEpIndex = -1,
  onSelectEpisode,
  onCyclePlayMode,
}: MpvCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const onPrevEpisodeRef = useRef(onPrevEpisode)
  onPrevEpisodeRef.current = onPrevEpisode
  const onNextEpisodeRef = useRef(onNextEpisode)
  onNextEpisodeRef.current = onNextEpisode
  const onFallbackToLegacyRef = useRef(onFallbackToLegacy)
  onFallbackToLegacyRef.current = onFallbackToLegacy
  const onCyclePlayModeRef = useRef(onCyclePlayMode)
  onCyclePlayModeRef.current = onCyclePlayMode
  const offMpvEventRef = useRef<(() => void) | null>(null)
  const offMpvFrameRef = useRef<(() => void) | null>(null)
  const offMpvPreviewFrameRef = useRef<(() => void) | null>(null)
  // 帧尺寸变化去重（避免每帧 setState）
  const frameSizeRef = useRef('')
  const containerRef = useRef<HTMLDivElement>(null)

  const [subtitleTracks, setSubtitleTracks] = useState<MpvTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<MpvTrack[]>([])
  const [showControls, setShowControls] = useState(false)
  const [paused, setPaused] = useState(false)
  const [timePos, setTimePos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(100)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number } | null>(null)
  // canvas 显示尺寸（contain 放大到容器，消除黑边/最大化画面）
  const [dispSize, setDispSize] = useState<{ w: number; h: number } | null>(null)
  // 倍速
  const [playbackRate, setPlaybackRate] = useState(1)
  // 悬浮预览：hover 位置时间 + 预览帧（转 dataURL 喂给 ProgressBar）
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  // 音频延迟（ms，映射 mpv audio-delay）
  const [audioDelay, setAudioDelay] = useState(0)
  // OP/ED 快捷键跳过开关（libmpv 独立维护，与 HTML5 的 useSkipTimes 语义一致）
  const [skipShortcutEnabled, setSkipShortcutEnabled] = useState(false)

  // 容器尺寸变化 / 帧尺寸变化时重算 canvas 显示尺寸（contain 等比放大）
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const compute = () => {
      if (!frameInfo) return
      const cw = c.clientWidth
      const ch = c.clientHeight
      if (!cw || !ch) return
      const scale = Math.min(cw / frameInfo.width, ch / frameInfo.height)
      setDispSize({
        w: Math.floor(frameInfo.width * scale),
        h: Math.floor(frameInfo.height * scale),
      })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(c)
    return () => ro.disconnect()
  }, [frameInfo])

  // 轻量 toast（截图/AB 循环等快捷键反馈）—— 定义在 handleScreenshot 之前（依赖顺序）
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToastMsg = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 1800)
  }, [])

  const handleCommand = useCallback((cmd: any[]) => {
    window.electronAPI.mpvCommand(cmd).catch(() => {})
  }, [])

  // 截图：WebGL canvas 直接导出 PNG（preserveDrawingBuffer 已开启），复用 HTML5 链路的保存 IPC
  const handleScreenshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width === 0) return
    try {
      const dataUrl = canvas.toDataURL('image/png')
      window.electronAPI
        .saveScreenshot(dataUrl)
        .then((saved) => {
          if (saved) showToastMsg('截图已保存')
        })
        .catch(() => {})
    } catch {
      /* ok */
    }
  }, [showToastMsg])
  const handleScreenshotRef = useRef(handleScreenshot)
  handleScreenshotRef.current = handleScreenshot

  // 倍速：通过 mpv speed 属性设置（主进程 set_property 适配层已支持）
  const setSpeed = useCallback(
    (s: number) => {
      const v = Math.min(16, Math.max(0.1, s))
      setPlaybackRate(v)
      handleCommand(['set_property', 'speed', String(v)])
    },
    [handleCommand],
  )

  const pausedRef = useRef(false)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // 帮助面板开关（keydown handler 空依赖，经 ref 读取）
  const showHelpRef = useRef(false)
  useEffect(() => {
    showHelpRef.current = showHelp
  })

  // 轨道列表最新值（键盘 V/A 切换用）
  const subtitleTracksRef = useRef<MpvTrack[]>([])
  const audioTracksRef = useRef<MpvTrack[]>([])
  useEffect(() => {
    subtitleTracksRef.current = subtitleTracks
  }, [subtitleTracks])
  useEffect(() => {
    audioTracksRef.current = audioTracks
  }, [audioTracks])

  // AB 循环（mpv 原生 ab-loop-a / ab-loop-b 属性）
  const loopARef = useRef<number | null>(null)
  const loopBRef = useRef<number | null>(null)

  // 进度记忆：libmpv 也要保存播放进度（供首页「继续观看」使用），与 HTML5 播放器保持一致。
  // 之前 libmpv 链路完全不写进度，导致重进软件后「继续观看」没有上次播放记录。
  const timePosRef = useRef(0)
  useEffect(() => {
    timePosRef.current = timePos
  }, [timePos])

  useEffect(() => {
    const saveProgress = () => {
      const p = timePosRef.current
      if (p > 0) window.electronAPI.savePosition(filePath, p).catch(() => {})
    }
    const timer = setInterval(saveProgress, 5000)
    return () => {
      clearInterval(timer)
      saveProgress() // 卸载前保存最终进度（返回/切集/连播到下一集都会触发）
    }
  }, [filePath])

  // 暂停/播放：显式 set_property（libmpv 下 'cycle pause' 会崩溃，主进程适配层也做了兜底转换）
  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    handleCommand(['set_property', 'pause', next ? 'yes' : 'no'])
    setPaused(next)
  }, [handleCommand])

  // 播放结束统一处理：eof-reached / end-file(eof) 可能各触发一次，用 ref 去重，
  // 避免连播回调被重复调用导致跳集。
  const endTriggeredRef = useRef(false)
  const handlePlaybackEnd = useCallback(() => {
    if (endTriggeredRef.current) return
    endTriggeredRef.current = true
    if (playModeRef.current === 'loop-one') {
      // 单集循环：重新加载当前文件（不重启进程）
      window.electronAPI.mpvCommand(['loadfile', filePath, 'replace']).catch(() => {})
      endTriggeredRef.current = false
    } else if (onNextEpisodeRef.current) {
      offMpvEventRef.current?.()
      onNextEpisodeRef.current()
    } else {
      onCloseRef.current()
    }
  }, [filePath])

  // 键盘快捷键（与 HTML5 Player 保持一致：空格/方向键/音量/静音/全屏/数字跳转）
  const durationRef = useRef(0)
  const togglePauseRef = useRef(togglePause)
  togglePauseRef.current = togglePause
  const handleCommandRef = useRef(handleCommand)
  handleCommandRef.current = handleCommand
  // 三连按右键时间戳（600ms 窗口，跳过 80 秒用）
  const rightPressesRef = useRef<number[]>([])
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  // 音量：ref 与 state 同步，键盘/滑条共用
  const volumeRef = useRef(100)
  const setVolumeAll = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(v)))
      volumeRef.current = clamped
      setVolume(clamped)
      handleCommand(['set_property', 'volume', clamped])
      if (clamped > 0 && muteRef.current) {
        muteRef.current = false
        setMuted(false)
        handleCommand(['set_property', 'mute', 'no'])
      }
    },
    [handleCommand],
  )
  const muteRef = useRef(false)
  const toggleMute = useCallback(() => {
    const next = !muteRef.current
    muteRef.current = next
    setMuted(next)
    handleCommand(['set_property', 'mute', next ? 'yes' : 'no'])
  }, [handleCommand])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const k = e.key
      // Esc：帮助面板 → 退出全屏（主进程自带 isFullScreen 检查，非全屏时为 no-op）
      if (k === 'Escape') {
        e.preventDefault()
        if (showHelpRef.current) {
          setShowHelp(false)
          return
        }
        window.electronAPI.exitFullscreen()
        return
      }
      // 快捷键帮助
      if (k === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault()
        togglePauseRef.current()
      } else if (k === 'ArrowLeft') {
        e.preventDefault()
        const step = e.ctrlKey ? 10 : 5
        handleCommandRef.current(['seek', `-${step}`, 'relative'])
      } else if (k === 'ArrowRight') {
        e.preventDefault()
        // 三连按右键（600ms 窗口）= 跳过 80 秒（受 ⏭ 开关控制，前两次已各快进 5 秒），未连按时普通快进
        const now = Date.now()
        rightPressesRef.current = rightPressesRef.current.filter((t) => now - t < 600)
        rightPressesRef.current.push(now)
        if (rightPressesRef.current.length >= 3) {
          rightPressesRef.current = []
          if (skipShortcutEnabledRef.current) {
            handleCommandRef.current(['seek', '80', 'relative'])
            showToastMsg('⏭ 已跳过 80 秒')
            return
          }
        }
        const step = e.ctrlKey ? 10 : 5
        handleCommandRef.current(['seek', String(step), 'relative'])
      } else if (k === 'ArrowUp') {
        e.preventDefault()
        setVolumeAll(volumeRef.current + 5)
      } else if (k === 'ArrowDown') {
        e.preventDefault()
        setVolumeAll(volumeRef.current - 5)
      } else if (k === 'f' || k === 'F') {
        e.preventDefault()
        window.electronAPI.toggleFullscreen()
      } else if (k === 'm' || k === 'M') {
        e.preventDefault()
        toggleMute()
      } else if (k >= '0' && k <= '9') {
        e.preventDefault()
        if (durationRef.current > 0) {
          handleCommandRef.current([
            'seek',
            String((parseInt(k, 10) / 10) * durationRef.current),
            'absolute',
          ])
        }
      } else if ((k === 'v' || k === 'V') && !e.ctrlKey && !e.metaKey) {
        // 字幕开关：有选中轨道则关闭，无则开启第一个（本地同步选中态供 UI 反馈）
        e.preventDefault()
        const tracks = subtitleTracksRef.current
        if (tracks.length === 0) return
        const cur = tracks.find((t) => t.selected)
        if (cur) {
          handleCommandRef.current(['set_property', 'sid', 'no'])
          setSubtitleTracks(tracks.map((t) => ({ ...t, selected: false })))
        } else {
          handleCommandRef.current(['set_property', 'sid', tracks[0].id])
          setSubtitleTracks(tracks.map((t, i) => ({ ...t, selected: i === 0 })))
        }
      } else if ((k === 'a' || k === 'A') && !e.ctrlKey && !e.metaKey) {
        // 音轨循环切换
        e.preventDefault()
        const tracks = audioTracksRef.current
        if (tracks.length === 0) return
        const curIdx = tracks.findIndex((t) => t.selected)
        const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % tracks.length
        handleCommandRef.current(['set_property', 'aid', tracks[nextIdx].id])
        setAudioTracks(tracks.map((t, i) => ({ ...t, selected: i === nextIdx })))
      } else if ((k === 's' || k === 'S') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleScreenshotRef.current()
      } else if ((k === 'l' || k === 'L') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onCyclePlayModeRef.current?.()
      } else if (k === '[') {
        e.preventDefault()
        const t = timePosRef.current
        if (loopARef.current !== null) {
          loopARef.current = null
          loopBRef.current = null
          handleCommandRef.current(['set_property', 'ab-loop-a', 'no'])
          showToastMsg('AB 循环已取消')
        } else {
          loopARef.current = t
          loopBRef.current = null
          handleCommandRef.current(['set_property', 'ab-loop-a', String(t)])
          showToastMsg(`A 点: ${fmt(t)}`)
        }
      } else if (k === ']') {
        e.preventDefault()
        const t = timePosRef.current
        if (loopARef.current !== null && t > loopARef.current) {
          loopBRef.current = t
          handleCommandRef.current(['set_property', 'ab-loop-b', String(t)])
          showToastMsg(`B 点: ${fmt(t)} — AB 循环中`)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setVolumeAll, toggleMute, showToastMsg])

  // ===== WebGL 渲染器：canvas 2D putImageData/drawImage 在本机 Electron 配置下像素不写入位图
  // （实测 canvas位图恒黑），改用 WebGL 纹理上传 + 全屏 quad —— Anime4K 已在同 app 用 WebGL 且正常 =====
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const glTexRef = useRef<WebGLTexture | null>(null)

  const initGL = useCallback((canvas: HTMLCanvasElement): WebGLRenderingContext | null => {
    if (glRef.current) return glRef.current
    // preserveDrawingBuffer: 截图（S 键 toDataURL）需要保留绘制缓冲，每帧重绘的开销可忽略
    const gl = (canvas.getContext('webgl', {
      premultipliedAlpha: false,
      alpha: false,
      preserveDrawingBuffer: true,
    }) ||
      canvas.getContext('experimental-webgl', {
        premultipliedAlpha: false,
        alpha: false,
        preserveDrawingBuffer: true,
      })) as WebGLRenderingContext | null
    if (!gl) {
      console.error('[mpv] WebGL 不可用')
      return null
    }
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(
      vs,
      'attribute vec2 aPos;varying vec2 vUV;void main(){vUV=vec2(aPos.x*0.5+0.5,0.5-aPos.y*0.5);gl_Position=vec4(aPos,0.0,1.0);}',
    )
    gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    // 注意：mpv rgb0 格式 alpha 恒 0，必须强制输出 alpha=1，否则画面透明（黑屏）
    gl.shaderSource(
      fs,
      'precision mediump float;varying vec2 vUV;uniform sampler2D uTex;void main(){gl_FragColor=vec4(texture2D(uTex,vUV).rgb,1.0);}',
    )
    gl.compileShader(fs)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)
    // 全屏 quad（TRIANGLE_STRIP）
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    // 纹理
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    glRef.current = gl
    glTexRef.current = tex
    return gl
  }, [])

  // 逐帧绘制：WebGL 纹理上传 + 全屏 quad 渲染（rAF 驱动）
  const drawFrame = useCallback(
    (data: Uint8Array, w: number, h: number) => {
      const canvas = canvasRef.current
      if (!canvas || !w || !h) return
      const gl = initGL(canvas)
      if (!gl || !glTexRef.current) return
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.bindTexture(gl.TEXTURE_2D, glTexRef.current)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      // data 是 IPC 传来的 Uint8Array（可能带 byteOffset）
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(data.buffer, data.byteOffset, w * h * 4),
      )
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    [initGL],
  )

  // 悬浮预览小窗：独立 WebGL 渲染预览帧
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewGlRef = useRef<WebGLRenderingContext | null>(null)
  const previewGlTexRef = useRef<WebGLTexture | null>(null)
  const drawPreviewFrame = useCallback((data: Uint8Array, w: number, h: number) => {
    const canvas = previewCanvasRef.current
    if (!canvas || !w || !h) return
    let gl = previewGlRef.current
    if (!gl) {
      // preserveDrawingBuffer: 预览帧转 dataURL 需要保留绘制缓冲（与主 canvas 截图同方案）
      gl = (canvas.getContext('webgl', {
        premultipliedAlpha: false,
        alpha: false,
        preserveDrawingBuffer: true,
      }) ||
        canvas.getContext('experimental-webgl', {
          premultipliedAlpha: false,
          alpha: false,
          preserveDrawingBuffer: true,
        })) as WebGLRenderingContext | null
      if (!gl) return
      const vs = gl.createShader(gl.VERTEX_SHADER)!
      gl.shaderSource(
        vs,
        'attribute vec2 aPos;varying vec2 vUV;void main(){vUV=vec2(aPos.x*0.5+0.5,0.5-aPos.y*0.5);gl_Position=vec4(aPos,0.0,1.0);}',
      )
      gl.compileShader(vs)
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!
      gl.shaderSource(
        fs,
        'precision mediump float;varying vec2 vUV;uniform sampler2D uTex;void main(){gl_FragColor=vec4(texture2D(uTex,vUV).rgb,1.0);}',
      )
      gl.compileShader(fs)
      const prog = gl.createProgram()!
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      gl.useProgram(prog)
      const buf = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      previewGlRef.current = gl
      previewGlTexRef.current = tex
    }
    if (!gl || !previewGlTexRef.current) return
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.bindTexture(gl.TEXTURE_2D, previewGlTexRef.current)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(data.buffer, data.byteOffset, w * h * 4),
    )
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }, [])

  // rAF 驱动：消费最新帧并绘制（保证合成器刷新）
  const pendingFrameRef = useRef<{ data: Uint8Array; w: number; h: number } | null>(null)
  const rafRef = useRef(0)
  useEffect(() => {
    const loop = () => {
      const f = pendingFrameRef.current
      if (f) {
        pendingFrameRef.current = null
        drawFrame(f.data, f.w, f.h)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [drawFrame])

  // 鼠标移动显示控制条，静止 2.5s 自动隐藏；暂停时常驻显示
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (pausedRef.current) return // 暂停时不自动隐藏
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2500)
  }, [])

  // 暂停/恢复联动控制条显隐（暂停常驻显示，恢复播放后短暂显示再自动隐藏）
  useEffect(() => {
    if (paused) {
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      showControlsTemporarily()
    }
  }, [paused, showControlsTemporarily])

  // 鼠标移动/点击显示控制条（移动后静止自动隐藏）
  useEffect(() => {
    const onMouseMove = () => showControlsTemporarily()
    const onMouseDown = () => showControlsTemporarily()
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [showControlsTemporarily])

  // 悬浮预览：hover 进度条时请求预览帧（debounce 80ms：快速滑动合并到最后一个位置）
  const previewTimerRef = useRef(0)
  const requestPreview = useCallback(
    (t: number) => {
      if (t < 0 || !durationRef.current) return
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = window.setTimeout(() => {
        window.electronAPI.mpvPreview(filePath, t).catch(() => {})
      }, 80)
    },
    [filePath],
  )

  useEffect(() => {
    window.electronAPI.mpvPlay(filePath)

    // 全屏状态监听（Controls 全屏图标状态回显）
    const offFs = window.electronAPI.onFullscreenChanged((fs: boolean) => {
      setIsFullscreen(fs)
    })

    const offMpvEvent = window.electronAPI.mpvOnEvent((event: any) => {
      if (event.event === 'end-file') {
        // 仅正常播放到末尾（eof）触发连播；stop/error/quit 忽略
        if (event.reason === 'eof') handlePlaybackEnd()
      } else if (event.event === 'eof-reached') {
        // keep-open=yes 时 mpv 播完不发 end-file，改由 eof-reached 属性观察触发连播
        handlePlaybackEnd()
      } else if (event.event === 'end') {
        onCloseRef.current()
      } else if (event.event === 'tracks' && Array.isArray(event.data)) {
        const tracks = event.data as MpvTrack[]
        setSubtitleTracks(tracks.filter((t) => t.type === 'sub'))
        setAudioTracks(tracks.filter((t) => t.type === 'audio'))
      } else if (event.event === 'file-loaded') {
        setPaused(false)
        setTimePos(0)
        endTriggeredRef.current = false
      } else if (event.event === 'libmpv-fallback') {
        // 主进程 libmpv 不可用，切回旧 mpv.exe 链路（渲染旧 MpvOverlay）
        offMpvEventRef.current?.()
        onFallbackToLegacyRef.current?.()
      }
    })
    offMpvEventRef.current = offMpvEvent

    const offMpvFrame = window.electronAPI.mpvOnFrame((frame) => {
      if (!frame || !frame.data) return
      // setFrameInfo 只在尺寸变化时触发（避免每帧 setState 导致整个组件重渲染）
      if (frame.width && frame.height) {
        const k = `${frame.width}x${frame.height}`
        if (frameSizeRef.current !== k) {
          frameSizeRef.current = k
          setFrameInfo({ width: frame.width, height: frame.height })
        }
      }
      // 只保留最新帧，rAF 循环消费（丢帧防堆积）
      pendingFrameRef.current = { data: frame.data, w: frame.width || 960, h: frame.height || 540 }
    })
    offMpvFrameRef.current = offMpvFrame

    // 悬浮预览帧：绘制到隐藏 canvas 后转 dataURL 喂给 ProgressBar（WebGL preserveDrawingBuffer 已开启）
    const offPreview = window.electronAPI.mpvOnPreviewFrame((frame) => {
      if (!frame || !frame.data) return
      const w = frame.width || 480
      const h = frame.height || 270
      drawPreviewFrame(frame.data, w, h)
      try {
        const pc = previewCanvasRef.current
        if (pc && pc.width > 0) setPreviewImage(pc.toDataURL('image/jpeg', 0.8))
      } catch {
        /* ok */
      }
    })
    offMpvPreviewFrameRef.current = offPreview

    // 周期同步播放状态（含音量）：250ms 保证进度条拖拽/回显跟手（HTML5 的 timeupdate 约 250ms 粒度）
    const stateTimer = setInterval(() => {
      window.electronAPI
        .mpvGetState()
        .then((s: any) => {
          if (!s) return
          setPaused(!!s.paused)
          if (typeof s.timePos === 'number') setTimePos(s.timePos)
          if (typeof s.duration === 'number') setDuration(s.duration)
          if (typeof s.volume === 'number' && !muteRef.current) {
            volumeRef.current = s.volume
            setVolume(s.volume)
          }
          if (typeof s.muted === 'boolean') {
            muteRef.current = s.muted
            setMuted(s.muted)
          }
        })
        .catch(() => {})
    }, 250)

    return () => {
      offMpvEventRef.current = null
      offMpvFrameRef.current = null
      offMpvPreviewFrameRef.current = null
      // 卸载必须停止 libmpv：fire-and-forget 但必须发出（App 层 view 兜底也会再调一次，幂等）
      window.electronAPI.mpvQuit().catch(() => {})
      window.clearTimeout(previewTimerRef.current)
      offFs()
      offMpvEvent()
      offMpvFrame()
      offPreview()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      clearInterval(stateTimer)
    }
  }, [filePath, drawFrame, drawPreviewFrame, handlePlaybackEnd])

  const fileName = filePath.split(/[/\\]/).pop() || filePath

  const handleGotoPrev = useCallback(() => {
    if (!onPrevEpisodeRef.current) return
    offMpvEventRef.current?.()
    onPrevEpisodeRef.current()
  }, [])

  const handleGotoNext = useCallback(() => {
    if (!onNextEpisodeRef.current) return
    offMpvEventRef.current?.()
    onNextEpisodeRef.current()
  }, [])

  const [showHelp, setShowHelp] = useState(false)

  // ============ Controls 适配层（HTML5 控制条 → mpv 命令） ============

  // seek：发 mpv 命令 + 本地立即回显（250ms 轮询兜底）
  const handleSeek = useCallback(
    (t: number) => {
      if (!durationRef.current) return
      const clamped = Math.max(0, Math.min(durationRef.current, t))
      handleCommand(['seek', String(clamped), 'absolute'])
      setTimePos(clamped)
    },
    [handleCommand],
  )

  // 进度条 hover：请求预览帧（ProgressBar 的 onPreviewHover 回调）
  const handlePreviewHover = useCallback(
    (t: number | null) => {
      setHoverTime(t)
      if (t != null && t >= 0 && durationRef.current) requestPreview(t)
      if (t == null) setPreviewImage(null)
    },
    [requestPreview],
  )

  // 轨道映射：MpvTrack → Controls 期望的 {label, language, index/type}
  const controlsSubtitleTracks = subtitleTracks.map((t, i) => ({
    label: t.title || t.lang || `轨道 ${t.id}`,
    language: t.lang || '',
    type: 'sub',
    index: i,
  }))
  const controlsAudioTracks = audioTracks.map((t, i) => ({
    label: t.title || t.lang || `音轨 ${t.id}`,
    language: t.lang || '',
    index: i,
  }))
  const selectedSubtitleIdx = subtitleTracks.findIndex((t) => t.selected)
  const selectedAudioIdx = audioTracks.findIndex((t) => t.selected)

  // 字幕切换：Controls 传的是数组索引 → mpv sid 轨道 id
  const handleSubtitleChange = useCallback(
    (idx: number) => {
      const track = subtitleTracksRef.current[idx]
      if (!track) return
      handleCommand(['set_property', 'sid', track.id])
      setSubtitleTracks((prev) => prev.map((t) => ({ ...t, selected: t.id === track.id })))
    },
    [handleCommand],
  )
  // 音轨切换
  const handleAudioChange = useCallback(
    (idx: number) => {
      const track = audioTracksRef.current[idx]
      if (!track) return
      handleCommand(['set_property', 'aid', track.id])
      setAudioTracks((prev) => prev.map((t) => ({ ...t, selected: t.id === track.id })))
    },
    [handleCommand],
  )

  // 音频延迟（mpv audio-delay 单位秒）
  const handleAudioDelayChange = useCallback(
    (ms: number) => {
      setAudioDelay(ms)
      handleCommand(['set_property', 'audio-delay', String(ms / 1000)])
    },
    [handleCommand],
  )

  // OP/ED 快捷键跳过开关
  const toggleSkipShortcut = useCallback(() => {
    setSkipShortcutEnabled((prev) => {
      showToastMsg(prev ? 'OP/ED 跳过已关闭' : 'OP/ED 跳过已开启（连按 3 次 → 跳过 80 秒）')
      return !prev
    })
  }, [showToastMsg])

  // 三连按右键 = 跳过 80 秒（受开关控制；与 HTML5 Player 一致）
  const skipShortcutEnabledRef = useRef(false)
  useEffect(() => {
    skipShortcutEnabledRef.current = skipShortcutEnabled
  }, [skipShortcutEnabled])

  // libmpv 无法使用的功能：按钮保留显示，点击弹 toast 提示
  const stubUnavailable = useCallback(
    (name: string) => () => showToastMsg(`${name}在 libmpv 模式下不可用`),
    [showToastMsg],
  )
  const unavailableProps = {
    onAspectCycle: stubUnavailable('画面比例'),
    onSecondarySubtitleChange: stubUnavailable('双语字幕'),
    onToggleSubtitleSettings: stubUnavailable('字幕样式'),
    onOnlineSearch: stubUnavailable('在线字幕搜索'),
    onWordLookup: stubUnavailable('生词点查'),
    onWhisperTranscribe: stubUnavailable('Whisper 语音识别'),
    onEnhanceToggle: stubUnavailable('Anime4K 画质增强'),
    onPiP: stubUnavailable('画中画'),
    onVolumeNormalizationToggle: stubUnavailable('音量均衡'),
    onDanmakuFetch: stubUnavailable('弹幕'),
  }

  const fmt = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '00:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div
      className={`relative w-full h-full bg-black select-none ${!showControls && !paused ? 'cursor-none' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={togglePause}
    >
      {/* 画面层：canvas 内部像素 = 渲染尺寸（WebGL），CSS 尺寸 = contain 放大（JS 计算，消除黑边） */}
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          style={{
            width: dispSize ? `${dispSize.w}px` : 'auto',
            height: dispSize ? `${dispSize.h}px` : 'auto',
          }}
        />
      </div>

      {/* 快捷键反馈 toast */}
      {toastMsg && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black/80 border border-white/10 text-xs text-white z-30 pointer-events-none whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* 顶部信息（与底部控制条一起随 showControls 显隐，全屏鼠标静止时一并隐藏） */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="text-xs text-neutral-300 truncate max-w-[60%]">{fileName}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="w-6 h-6 rounded-full bg-black/40 text-neutral-300 hover:text-white text-xs font-bold transition-colors"
            title="快捷键帮助 (?)"
          >
            ?
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
            libmpv{frameInfo ? ` ${frameInfo.width}×${frameInfo.height}` : ''}
          </span>
        </div>
      </div>

      {/* 预览帧隐藏 canvas（常驻避免 WebGL context 失效；帧渲染后 toDataURL 喂 ProgressBar） */}
      <canvas
        ref={previewCanvasRef}
        className="absolute opacity-0 pointer-events-none"
        style={{ width: 256, height: 144 }}
      />

      {/* 统一控制条（与 HTML5 播放器同一套 UI；libmpv 不可用项点击弹 toast 提示） */}
      <Controls
        isPlaying={!paused}
        currentTime={timePos}
        duration={duration}
        volume={volume / 100}
        isMuted={muted}
        playbackRate={playbackRate}
        isFullscreen={isFullscreen}
        visible={showControls}
        subtitleTracks={controlsSubtitleTracks}
        selectedSubtitleIdx={selectedSubtitleIdx}
        selectedSecondarySubIdx={-1}
        audioTracks={controlsAudioTracks}
        selectedAudioIdx={selectedAudioIdx}
        onTogglePlay={togglePause}
        onSeek={handleSeek}
        onToggleMute={toggleMute}
        onVolumeChange={(v) => setVolumeAll(v * 100)}
        onSpeedChange={setSpeed}
        onToggleFullscreen={() => window.electronAPI.toggleFullscreen()}
        onSubtitleChange={handleSubtitleChange}
        onAudioChange={handleAudioChange}
        onCyclePlayMode={() => onCyclePlayModeRef.current?.()}
        playMode={playMode}
        loopA={loopARef.current}
        loopB={loopBRef.current}
        previewTime={hoverTime}
        previewImage={previewImage}
        onPreviewHover={handlePreviewHover}
        onPrevEpisode={handleGotoPrev}
        onNextEpisode={handleGotoNext}
        hasPrevEpisode={!!onPrevEpisode}
        hasNextEpisode={!!onNextEpisode}
        hasEpisodeList={!!(episodes && episodes.length > 0)}
        episodes={episodes}
        currentEpIndex={currentEpIndex}
        onSelectEpisode={onSelectEpisode}
        audioDelay={audioDelay}
        onAudioDelayChange={handleAudioDelayChange}
        skipShortcutEnabled={skipShortcutEnabled}
        onSkipShortcutToggle={toggleSkipShortcut}
        onScreenshot={handleScreenshot}
        {...unavailableProps}
      />

      {/* 快捷键帮助（? 键 / 按钮触发） */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-[#1a1a1a] border border-neutral-600 rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">键盘快捷键</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-white/40 hover:text-white transition-colors text-sm px-2"
              >
                ✕ Esc
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {[
                ['Space', '播放 / 暂停'],
                ['← / →', '快退 / 快进 5 秒'],
                ['→ ×3', '连按 3 次 → 跳过 80 秒（OP/ED）'],
                ['Ctrl + ←/→', '快退 / 快进 10 秒'],
                ['↑ / ↓', '音量增减 5%'],
                ['F', '全屏切换'],
                ['Esc', '退出全屏 / 关闭面板'],
                ['M', '静音切换'],
                ['V', '字幕开关'],
                ['A', '音轨切换'],
                ['[ / ]', 'AB 循环起止 / 取消'],
                ['S', '截图保存'],
                ['L', '播放模式循环'],
                ['0–9', '跳转到 0%–90%'],
                ['?', '显示 / 隐藏此帮助'],
              ].map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between text-xs py-1 border-b border-white/5"
                >
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] text-neutral-200 font-mono">
                    {key}
                  </kbd>
                  <span className="text-neutral-400 ml-2 truncate">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
