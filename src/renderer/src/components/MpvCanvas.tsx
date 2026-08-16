import { useCallback, useEffect, useRef, useState } from 'react'

/** 倍速档位（与 HTML5 播放器保持一致） */
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

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
}

/** libmpv 内嵌播放（方案 A）——主进程软渲染取帧 → IPC → Canvas 显示，单窗口、叠加层可用 */
export default function MpvCanvas({
  filePath,
  onClose,
  playMode,
  prevEpisodeTitle,
  nextEpisodeTitle,
  onPrevEpisode,
  onNextEpisode,
  onFallbackToLegacy,
  episodes,
  currentEpIndex = -1,
  onSelectEpisode,
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
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number } | null>(null)
  // canvas 显示尺寸（contain 放大到容器，消除黑边/最大化画面）
  const [dispSize, setDispSize] = useState<{ w: number; h: number } | null>(null)
  // 控制条面板开关（字幕/音轨）
  const [showSubPanel, setShowSubPanel] = useState(false)
  const [showAudioPanel, setShowAudioPanel] = useState(false)
  // 倍速 + 选集
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [customSpeed, setCustomSpeed] = useState('')
  const [showEpisodePanel, setShowEpisodePanel] = useState(false)
  // 悬浮预览：hover 位置时间 + 预览帧
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [previewFrame, setPreviewFrame] = useState<{ data: Uint8Array; width: number; height: number } | null>(null)

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
      setDispSize({ w: Math.floor(frameInfo.width * scale), h: Math.floor(frameInfo.height * scale) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(c)
    return () => ro.disconnect()
  }, [frameInfo])

  const handleCommand = useCallback((cmd: any[]) => {
    window.electronAPI.mpvCommand(cmd).catch(() => {})
  }, [])

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

  // 键盘快捷键（与 HTML5 Player 保持一致：空格/方向键/音量/静音/全屏/数字跳转）
  const durationRef = useRef(0)
  const togglePauseRef = useRef(togglePause)
  togglePauseRef.current = togglePause
  const handleCommandRef = useRef(handleCommand)
  handleCommandRef.current = handleCommand
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
      if (clamped > 0 && mutedRef.current) {
        mutedRef.current = false
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
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault()
        togglePauseRef.current()
      } else if (k === 'ArrowLeft') {
        e.preventDefault()
        const step = e.ctrlKey ? 10 : 5
        handleCommandRef.current(['seek', `-${step}`, 'relative'])
      } else if (k === 'ArrowRight') {
        e.preventDefault()
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
          handleCommandRef.current(['seek', String((parseInt(k, 10) / 10) * durationRef.current), 'absolute'])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setVolumeAll, toggleMute])

  // ===== WebGL 渲染器：canvas 2D putImageData/drawImage 在本机 Electron 配置下像素不写入位图
  // （实测 canvas位图恒黑），改用 WebGL 纹理上传 + 全屏 quad —— Anime4K 已在同 app 用 WebGL 且正常 =====
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const glTexRef = useRef<WebGLTexture | null>(null)

  const initGL = useCallback((canvas: HTMLCanvasElement): WebGLRenderingContext | null => {
    if (glRef.current) return glRef.current
    const gl = (canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false }) ||
      canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false })) as
      | WebGLRenderingContext
      | null
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
      gl = (canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false }) ||
        canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false })) as
        | WebGLRenderingContext
        | null
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

    const offMpvEvent = window.electronAPI.mpvOnEvent((event: any) => {
      if (event.event === 'end-file') {
        // 仅正常播放到末尾（eof）触发连播；stop/error/quit 忽略
        if (event.reason === 'eof') {
          if (playModeRef.current === 'loop-one') {
            window.electronAPI.mpvCommand(['loadfile', filePath, 'replace']).catch(() => {})
          } else if (onNextEpisodeRef.current) {
            offMpvEventRef.current?.()
            onNextEpisodeRef.current()
          } else {
            onCloseRef.current()
          }
        }
      } else if (event.event === 'eof-reached') {
        // keep-open=yes 时 mpv 播完不发 end-file，改由 eof-reached 属性观察触发连播
        if (playModeRef.current === 'loop-one') {
          window.electronAPI.mpvCommand(['loadfile', filePath, 'replace']).catch(() => {})
        } else if (onNextEpisodeRef.current) {
          offMpvEventRef.current?.()
          onNextEpisodeRef.current()
        } else {
          onCloseRef.current()
        }
      } else if (event.event === 'end') {
        onCloseRef.current()
      } else if (event.event === 'tracks' && Array.isArray(event.data)) {
        const tracks = event.data as MpvTrack[]
        setSubtitleTracks(tracks.filter((t) => t.type === 'sub'))
        setAudioTracks(tracks.filter((t) => t.type === 'audio'))
      } else if (event.event === 'file-loaded') {
        setPaused(false)
        setTimePos(0)
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

    // 悬浮预览帧
    const offPreview = window.electronAPI.mpvOnPreviewFrame((frame) => {
      if (!frame || !frame.data) return
      setPreviewFrame(frame)
      drawPreviewFrame(frame.data, frame.width || 480, frame.height || 270)
    })
    offMpvPreviewFrameRef.current = offPreview

    // 周期同步播放状态（含音量）
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
    }, 1000)

    return () => {
      offMpvEventRef.current = null
      offMpvFrameRef.current = null
      offMpvPreviewFrameRef.current = null
      // 卸载必须停止 libmpv：fire-and-forget 但必须发出（App 层 view 兜底也会再调一次，幂等）
      window.electronAPI.mpvQuit().catch(() => {})
      window.clearTimeout(previewTimerRef.current)
      offMpvEvent()
      offMpvFrame()
      offPreview()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      clearInterval(stateTimer)
    }
  }, [filePath, drawFrame, drawPreviewFrame])

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

  // 进度条 seek（点击/拖拽）
  const progressRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const seekFromPointer = useCallback((clientX: number) => {
    const el = progressRef.current
    if (!el || !durationRef.current) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const t = ratio * durationRef.current
    handleCommandRef.current(['seek', String(t), 'absolute'])
    setTimePos(t)
  }, [])

  // 进度条 hover：显示预览 + 时间
  const hoverRatioRef = useRef(0)
  const onProgressHover = useCallback(
    (clientX: number) => {
      const el = progressRef.current
      if (!el || !durationRef.current) return
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      hoverRatioRef.current = ratio
      const t = ratio * durationRef.current
      setHoverTime(t)
      requestPreview(t)
    },
    [requestPreview],
  )

  const [showHelp, setShowHelp] = useState(false)

  const playModeLabel =
    playMode === 'loop-one'
      ? '单集循环'
      : playMode === 'loop-all'
        ? '列表循环'
        : playMode === 'shuffle'
          ? '随机播放'
          : '顺序播放'

  const fmt = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '00:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // 悬浮预览小窗定位：跟随 hover 位置（进度条上方，自动贴边）
  const previewTipStyle = (() => {
    if (hoverTime === null) return {}
    const ratio = hoverRatioRef.current
    // 左右贴边处理（小窗宽约 256px，相对容器比例换算）
    const leftPct = Math.min(94, Math.max(6, ratio * 100))
    return { left: `${leftPct}%`, transform: 'translateX(-50%)' }
  })()

  return (
    <div className="relative w-full h-full bg-black select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* 画面层：canvas 内部像素 = 渲染尺寸（WebGL），CSS 尺寸 = contain 放大（JS 计算，消除黑边） */}
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          style={{ width: dispSize ? `${dispSize.w}px` : 'auto', height: dispSize ? `${dispSize.h}px` : 'auto' }}
        />
      </div>

      {/* 顶部信息（与底部控制条一起随 showControls 显隐，全屏鼠标静止时一并隐藏） */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="text-xs text-neutral-300 truncate max-w-[60%]">{fileName}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
          libmpv{frameInfo ? ` ${frameInfo.width}×${frameInfo.height}` : ''}
        </span>
      </div>

      {/* 悬浮预览小窗（canvas 常驻避免 WebGL context 失效，用显隐控制） */}
      <div
        className={`absolute bottom-16 z-20 pointer-events-none flex flex-col items-center transition-opacity duration-150 ${
          hoverTime !== null && showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={previewTipStyle}
      >
        <div className="rounded-lg overflow-hidden border border-white/20 shadow-2xl bg-black/80">
          <canvas ref={previewCanvasRef} style={{ width: 256, height: 144 }} />
        </div>
        <span className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-neutral-200 tabular-nums">
          {hoverTime !== null ? `${fmt(hoverTime)} / ${fmt(duration)}` : ''}
        </span>
      </div>

      {/* 底部控制条 */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 进度（可点击/拖拽 seek + hover 悬浮预览） */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-neutral-400 tabular-nums">{fmt(timePos)}</span>
          <div
            ref={progressRef}
            className="flex-1 h-3 flex items-center cursor-pointer group"
            onPointerDown={(e) => {
              e.stopPropagation()
              draggingRef.current = true
              seekFromPointer(e.clientX)
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) {
                seekFromPointer(e.clientX)
              } else {
                onProgressHover(e.clientX)
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              draggingRef.current = false
            }}
            onPointerLeave={() => {
              setHoverTime(null)
              setPreviewFrame(null)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
              <div
                className="h-full bg-anibox-accent rounded-full"
                style={{ width: `${duration > 0 ? Math.min(100, (timePos / duration) * 100) : 0}%` }}
              />
              {/* hover 指示点 */}
              {hoverTime !== null && duration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow"
                  style={{ left: `calc(${Math.min(100, (hoverTime / duration) * 100)}% - 5px)` }}
                />
              )}
            </div>
          </div>
          <span className="text-[10px] text-neutral-400 tabular-nums">{fmt(duration)}</span>
        </div>
        {/* 控制按钮 + 模式 + 字幕/音轨/音量 */}
        <div className="flex items-center gap-2.5">
          {/* 上一话 */}
          {onPrevEpisode && prevEpisodeTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleGotoPrev()
              }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
              title={`上一话：${prevEpisodeTitle}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="18,5 8,12 18,19" />
                <rect x="5" y="4" width="2.5" height="16" rx="1" />
              </svg>
            </button>
          )}
          {/* 暂停/播放 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              togglePause()
            }}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors shrink-0"
            title={paused ? '播放 (Space)' : '暂停 (Space)'}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="3" width="5" height="18" rx="1" />
                <rect x="14" y="3" width="5" height="18" rx="1" />
              </svg>
            )}
          </button>
          {/* 下一话 */}
          {onNextEpisode && nextEpisodeTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleGotoNext()
              }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
              title={`下一话：${nextEpisodeTitle}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,5 16,12 6,19" />
                <rect x="16.5" y="4" width="2.5" height="16" rx="1" />
              </svg>
            </button>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300 shrink-0">
            {playModeLabel}
          </span>

          {/* 选集（番剧模式下显示，点击展开选集面板） */}
          {episodes && episodes.length > 0 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowEpisodePanel((v) => !v)
                  setShowSubPanel(false)
                  setShowAudioPanel(false)
                }}
                className={`w-8 h-8 rounded-full text-white flex items-center justify-center transition-colors shrink-0 ${
                  showEpisodePanel ? 'bg-anibox-accent/40' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="选集"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              {showEpisodePanel && (
                <div className="absolute bottom-16 left-4 w-72 max-h-80 bg-black/85 rounded-lg shadow-xl z-20 flex flex-col backdrop-blur border border-white/10">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
                    <span className="text-xs font-medium text-neutral-200">选集</span>
                    <button
                      onClick={() => setShowEpisodePanel(false)}
                      className="text-neutral-400 hover:text-white text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {episodes.map((ep, i) => {
                        const isCurrent = i === currentEpIndex
                        return (
                          <button
                            key={ep.filePath}
                            onClick={() => {
                              onSelectEpisode?.(i)
                              setShowEpisodePanel(false)
                            }}
                            className={`aspect-square rounded text-xs font-medium transition-colors flex items-center justify-center ${
                              isCurrent
                                ? 'bg-anibox-accent text-white'
                                : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                            }`}
                            title={ep.fileName}
                          >
                            {ep.epNumber ?? i + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex-1" />

          {/* 字幕轨道（按钮 + 内联面板） */}
          {subtitleTracks.length > 0 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSubPanel((v) => !v)
                  setShowAudioPanel(false)
                }}
                className={`w-8 h-8 rounded-full text-white flex items-center justify-center transition-colors shrink-0 ${
                  showSubPanel ? 'bg-anibox-accent/40' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="字幕轨道"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="7" y1="12" x2="17" y2="12" />
                  <line x1="9" y1="16" x2="15" y2="16" />
                </svg>
              </button>
              {showSubPanel && (
                <div className="absolute bottom-16 right-16 bg-black/85 rounded-lg p-2 min-w-[180px] backdrop-blur border border-white/10 z-20">
                  <p className="text-[11px] text-neutral-400 mb-1.5 px-1">字幕轨道</p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      className={`text-xs px-2.5 py-1.5 rounded text-left transition-colors ${
                        subtitleTracks.every((t) => !t.selected)
                          ? 'bg-anibox-accent/30 text-anibox-accent'
                          : 'hover:bg-white/10 text-neutral-200'
                      }`}
                      onClick={() => {
                        handleCommand(['set_property', 'sid', 'no'])
                        setShowSubPanel(false)
                      }}
                    >
                      关闭字幕
                    </button>
                    {subtitleTracks.map((t) => (
                      <button
                        key={t.id}
                        className={`text-xs px-2.5 py-1.5 rounded text-left transition-colors ${
                          t.selected
                            ? 'bg-anibox-accent/30 text-anibox-accent'
                            : 'hover:bg-white/10 text-neutral-200'
                        }`}
                        onClick={() => {
                          handleCommand(['set_property', 'sid', t.id])
                          setShowSubPanel(false)
                        }}
                      >
                        {t.title || t.lang || `轨道 ${t.id}`}
                        <span className="text-[10px] text-neutral-500 ml-1">({t.codec || t.lang})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 音轨（按钮 + 内联面板） */}
          {audioTracks.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowAudioPanel((v) => !v)
                  setShowSubPanel(false)
                }}
                className={`w-8 h-8 rounded-full text-white flex items-center justify-center transition-colors shrink-0 ${
                  showAudioPanel ? 'bg-anibox-accent/40' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="音轨"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </button>
              {showAudioPanel && (
                <div className="absolute bottom-16 right-16 bg-black/85 rounded-lg p-2 min-w-[180px] backdrop-blur border border-white/10 z-20">
                  <p className="text-[11px] text-neutral-400 mb-1.5 px-1">音轨</p>
                  <div className="flex flex-col gap-0.5">
                    {audioTracks.map((t) => (
                      <button
                        key={t.id}
                        className={`text-xs px-2.5 py-1.5 rounded text-left transition-colors ${
                          t.selected
                            ? 'bg-anibox-accent/30 text-anibox-accent'
                            : 'hover:bg-white/10 text-neutral-200'
                        }`}
                        onClick={() => {
                          handleCommand(['set_property', 'aid', t.id])
                          setShowAudioPanel(false)
                        }}
                      >
                        {t.title || t.lang || `音轨 ${t.id}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 音量（喇叭 + 滑动条） */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleMute()
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            title="静音 (M)"
          >
            {muted || volume === 0 ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : volume < 50 ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            )}
          </button>
          {/* 音量滑条：点击/拖拽调节，带反馈 */}
          <div
            className="flex items-center w-24 h-6 group cursor-pointer"
            title="音量"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
              setVolumeAll(ratio * 100)
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                setVolumeAll(ratio * 100)
              }
            }}
          >
            <div className="relative flex-1 h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
              <div
                className="h-full bg-white/80 rounded-full"
                style={{ width: `${muted ? 0 : volume}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow transition-opacity opacity-0 group-hover:opacity-100"
                style={{ left: `calc(${muted ? 0 : volume}% - 5px)` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-neutral-400 tabular-nums w-8 shrink-0">{muted ? 0 : volume}</span>

          {/* 倍速 */}
          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSpeedMenu((v) => !v)
              }}
              className="min-w-[30px] h-8 px-1.5 rounded text-xs text-neutral-200 hover:bg-white/10 transition-colors shrink-0"
              title="播放速度"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/85 border border-white/10 rounded-md shadow-xl py-1 z-30 min-w-[100px] backdrop-blur">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSpeed(speed)
                      setShowSpeedMenu(false)
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                      playbackRate === speed ? 'text-anibox-accent font-medium' : 'text-neutral-200'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
                {/* 自定义倍速输入 */}
                <div className="border-t border-white/10 mt-1 pt-1 px-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const val = parseFloat(customSpeed)
                      if (val >= 0.1 && val <= 16) {
                        setSpeed(val)
                        setShowSpeedMenu(false)
                        setCustomSpeed('')
                      }
                    }}
                  >
                    <input
                      type="number"
                      min="0.1"
                      max="16"
                      step="0.05"
                      value={customSpeed}
                      onChange={(e) => setCustomSpeed(e.target.value)}
                      placeholder="自定义..."
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-anibox-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* 全屏 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              window.electronAPI.toggleFullscreen()
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            title="全屏 (F)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
          {/* 帮助 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowHelp((v) => !v)
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            title="快捷键帮助 (?)"
          >
            <span className="text-xs font-bold">?</span>
          </button>
        </div>
      </div>

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
              <button onClick={() => setShowHelp(false)} className="text-white/40 hover:text-white transition-colors text-sm px-2">
                ✕ Esc
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {[
                ['Space', '播放 / 暂停'],
                ['← / →', '快退 / 快进 5 秒'],
                ['Ctrl + ←/→', '快退 / 快进 10 秒'],
                ['↑ / ↓', '音量增减 5%'],
                ['F', '全屏切换'],
                ['M', '静音切换'],
                ['0–9', '跳转到 0%–90%'],
                ['?', '显示 / 隐藏此帮助'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] text-neutral-200 font-mono">{key}</kbd>
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
