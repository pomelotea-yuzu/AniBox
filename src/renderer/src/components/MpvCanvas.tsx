import { useCallback, useEffect, useRef, useState } from 'react'

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
  /** 下一话标题（用于连播提示） */
  nextEpisodeTitle?: string
  /** 播放下一集的回调（App 层复用 handleNextEpisode） */
  onNextEpisode?: () => void
  /** 主进程 libmpv 初始化失败时回调（App 层切回旧 mpv.exe 链路） */
  onFallbackToLegacy?: () => void
}

/** libmpv 内嵌播放（方案 A）——主进程软渲染取帧 → IPC → Canvas 显示，单窗口、叠加层可用 */
export default function MpvCanvas({
  filePath,
  onClose,
  playMode,
  nextEpisodeTitle,
  onNextEpisode,
  onFallbackToLegacy,
}: MpvCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const onNextEpisodeRef = useRef(onNextEpisode)
  onNextEpisodeRef.current = onNextEpisode
  const onFallbackToLegacyRef = useRef(onFallbackToLegacy)
  onFallbackToLegacyRef.current = onFallbackToLegacy
  const offMpvEventRef = useRef<(() => void) | null>(null)
  const offMpvFrameRef = useRef<(() => void) | null>(null)
  // 帧尺寸变化去重（避免每帧 setState）
  const frameSizeRef = useRef('')
  const containerRef = useRef<HTMLDivElement>(null)

  const [subtitleTracks, setSubtitleTracks] = useState<MpvTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<MpvTrack[]>([])
  const [showControls, setShowControls] = useState(false)
  const [paused, setPaused] = useState(false)
  const [timePos, setTimePos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number } | null>(null)
  // canvas 显示尺寸（contain 放大到容器，消除黑边/最大化画面）
  const [dispSize, setDispSize] = useState<{ w: number; h: number } | null>(null)

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

  const pausedRef = useRef(false)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // 暂停/播放：显式 set_property（libmpv 下 'cycle pause' 会崩溃，主进程适配层也做了兜底转换）
  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    handleCommand(['set_property', 'pause', next ? 'yes' : 'no'])
    setPaused(next)
  }, [handleCommand])

  // 键盘快捷键（与 HTML5 Player 保持一致：空格/方向键/音量/静音/全屏/数字跳转）
  const volumeRef = useRef(100)
  const muteRef = useRef(false)
  const durationRef = useRef(0)
  const togglePauseRef = useRef(togglePause)
  togglePauseRef.current = togglePause
  const handleCommandRef = useRef(handleCommand)
  handleCommandRef.current = handleCommand
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

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
        volumeRef.current = Math.min(100, volumeRef.current + 5)
        handleCommandRef.current(['set_property', 'volume', volumeRef.current])
        muteRef.current = false
        handleCommandRef.current(['set_property', 'mute', 'no'])
      } else if (k === 'ArrowDown') {
        e.preventDefault()
        volumeRef.current = Math.max(0, volumeRef.current - 5)
        handleCommandRef.current(['set_property', 'volume', volumeRef.current])
      } else if (k === 'f' || k === 'F') {
        e.preventDefault()
        window.electronAPI.toggleFullscreen()
      } else if (k === 'm' || k === 'M') {
        e.preventDefault()
        muteRef.current = !muteRef.current
        handleCommandRef.current(['set_property', 'mute', muteRef.current ? 'yes' : 'no'])
      } else if (k >= '0' && k <= '9') {
        e.preventDefault()
        if (durationRef.current > 0) {
          handleCommandRef.current(['seek', String((parseInt(k, 10) / 10) * durationRef.current), 'absolute'])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    console.log('[mpv] WebGL 渲染器初始化完成')
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

    // 周期同步播放状态
    const stateTimer = setInterval(() => {
    window.electronAPI
      .mpvGetState()
      .then((s: any) => {
        if (!s) return
        setPaused(!!s.paused)
        if (typeof s.timePos === 'number') setTimePos(s.timePos)
        if (typeof s.duration === 'number') setDuration(s.duration)
      })
      .catch(() => {})
  }, 1000)

  return () => {
    offMpvEventRef.current = null
    offMpvFrameRef.current = null
    window.electronAPI.mpvQuit()
    offMpvEvent()
    offMpvFrame()
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    clearInterval(stateTimer)
  }
}, [filePath, drawFrame])

  const fileName = filePath.split(/[/\\]/).pop() || filePath

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

  return (
    <div className="relative w-full h-full bg-black select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* 画面层：canvas 内部像素 = 渲染尺寸（WebGL），CSS 尺寸 = contain 放大（JS 计算，消除黑边） */}
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          style={{ width: dispSize ? `${dispSize.w}px` : 'auto', height: dispSize ? `${dispSize.h}px` : 'auto' }}
        />
      </div>

      {/* 顶部信息 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent">
        <span className="text-xs text-neutral-300 truncate max-w-[60%]">{fileName}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
          libmpv{frameInfo ? ` ${frameInfo.width}×${frameInfo.height}` : ''}
        </span>
      </div>

      {/* 底部控制条 */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 进度（可点击/拖拽 seek） */}
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
              if (draggingRef.current) seekFromPointer(e.clientX)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              draggingRef.current = false
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
              <div
                className="h-full bg-anibox-accent rounded-full"
                style={{ width: `${duration > 0 ? Math.min(100, (timePos / duration) * 100) : 0}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-neutral-400 tabular-nums">{fmt(duration)}</span>
        </div>
        {/* 控制按钮 + 模式 */}
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              togglePause()
            }}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
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
          {/* 静音 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              muteRef.current = !muteRef.current
              handleCommand(['set_property', 'mute', muteRef.current ? 'yes' : 'no'])
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="静音 (M)"
          >
            {muteRef.current ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            )}
          </button>
          {/* 全屏 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              window.electronAPI.toggleFullscreen()
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
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
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="快捷键帮助 (?)"
          >
            <span className="text-xs font-bold">?</span>
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
            {playModeLabel}
          </span>
          {onNextEpisode && nextEpisodeTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleGotoNext()
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-anibox-accent/20 text-anibox-accent hover:bg-anibox-accent/30 transition-colors"
              title="播放下一话"
            >
              下一话：{nextEpisodeTitle} ›
            </button>
          )}
          <div className="flex-1" />
          {/* 字幕/音轨快捷切换（点击弹面板） */}
          {(subtitleTracks.length > 0 || audioTracks.length > 1) && (
            <span className="text-[10px] text-neutral-400">点击画面切换字幕/音轨</span>
          )}
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

      {/* 字幕轨道选择 */}
      {subtitleTracks.length > 0 && showControls && (
        <div className="absolute bottom-24 left-4 bg-black/80 rounded-lg p-3 min-w-[200px] backdrop-blur">
          <p className="text-xs text-neutral-300 mb-2">字幕轨道</p>
          <div className="flex flex-col gap-1">
            <button
              className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                subtitleTracks.every((t) => !t.selected)
                  ? 'bg-anibox-accent/30 text-anibox-accent'
                  : 'hover:bg-white/10 text-neutral-200'
              }`}
              onClick={() => handleCommand(['set_property', 'sid', 'no'])}
            >
              关闭字幕
            </button>
            {subtitleTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/30 text-anibox-accent'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
                onClick={() => handleCommand(['set_property', 'sid', t.id])}
              >
                {t.title || t.lang || `轨道 ${t.id}`}
                <span className="text-[10px] text-neutral-500 ml-1">({t.codec || t.lang})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 音轨选择 */}
      {audioTracks.length > 1 && showControls && (
        <div className="absolute bottom-24 right-4 bg-black/80 rounded-lg p-3 min-w-[200px] backdrop-blur">
          <p className="text-xs text-neutral-300 mb-2">音轨</p>
          <div className="flex flex-col gap-1">
            {audioTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/30 text-anibox-accent'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
                onClick={() => handleCommand(['set_property', 'aid', t.id])}
              >
                {t.title || t.lang || `音轨 ${t.id}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
