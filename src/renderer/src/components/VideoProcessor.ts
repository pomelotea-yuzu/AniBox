/**
 * Anime4K 实时超分 + 后处理 WebGL 管线
 * 三档预设：均衡 / 高质量 / 性能
 * 附加：去色块、FXAA 抗锯齿、色彩增强、A/B 对比
 */

export type Preset = 'balanced' | 'quality' | 'performance'
export type PostFx = 'deband' | 'fxaa' | 'color'

// ---- GLSL Shaders ----

const VERTEX_SHADER = /* glsl */ `
attribute vec2 a_pos;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`

// 边缘引导上采样 (Anime4K 精简版核心)
const UPSCALE_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
uniform float u_strength; // 0.5-1.5

vec4 getLuma(vec4 c) {
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(l, l, l, c.a);
}

void main() {
  vec2 t = v_texCoord;
  vec4 c = texture2D(u_src, t);
  vec4 tl = texture2D(u_src, t + vec2(-1.0, -1.0) * u_texelSize);
  vec4 tr = texture2D(u_src, t + vec2( 1.0, -1.0) * u_texelSize);
  vec4 bl = texture2D(u_src, t + vec2(-1.0,  1.0) * u_texelSize);
  vec4 br = texture2D(u_src, t + vec2( 1.0,  1.0) * u_texelSize);

  // 边缘强度
  float edgeH = abs(dot(tl.rgb - tr.rgb, vec3(0.333)))
              + abs(dot(bl.rgb - br.rgb, vec3(0.333)));
  float edgeV = abs(dot(tl.rgb - bl.rgb, vec3(0.333)))
              + abs(dot(tr.rgb - br.rgb, vec3(0.333)));
  float edge = clamp((edgeH + edgeV) * 2.0, 0.0, 1.0);

  // 方向性高斯模糊
  vec4 blurH = (tl + tr + c * 2.0) * 0.25;
  vec4 blurV = (tl + bl + c * 2.0) * 0.25;

  // 混合：边缘强 → 锐化，平滑区 → 轻微模糊去噪
  vec4 sharp = c + (c - blurH * 0.5 - blurV * 0.5) * u_strength;
  vec4 smooth = blurH * 0.5 + blurV * 0.5;
  gl_FragColor = mix(smooth, sharp, edge * 0.7);
}`

// 锐化 (Unsharp Mask)
const SHARPEN_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
uniform float u_amount; // 0.3-1.0

void main() {
  vec4 c = texture2D(u_src, v_texCoord);
  vec4 g = vec4(0.0);
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      g += texture2D(u_src, v_texCoord + vec2(float(x), float(y)) * u_texelSize);
  g /= 9.0;
  float lumaC = dot(c.rgb, vec3(0.333));
  float lumaG = dot(g.rgb, vec3(0.333));
  float diff = lumaC - lumaG;
  // 仅锐化明显边缘
  float edge = clamp(abs(diff) * 4.0, 0.0, 1.0);
  vec4 sharp = c + (c - g) * u_amount * edge;
  gl_FragColor = sharp;
}`

// 去色块 (Debanding with dither)
const DEBAND_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
uniform float u_amount;
uniform float u_time;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 c = texture2D(u_src, v_texCoord);
  float noise = (rand(v_texCoord + u_time) - 0.5) / 255.0;
  // 在色带渐变区加抖动噪声
  vec2 grad = vec2(
    dot(texture2D(u_src, v_texCoord + vec2(u_texelSize.x, 0.0)).rgb - c.rgb, vec3(0.333)),
    dot(texture2D(u_src, v_texCoord + vec2(0.0, u_texelSize.y)).rgb - c.rgb, vec3(0.333))
  );
  float gradLen = length(grad);
  // 只在平滑渐变区（梯度小）加噪声
  float weight = clamp(1.0 - gradLen * 20.0, 0.0, 1.0) * u_amount;
  gl_FragColor = vec4(c.rgb + noise * weight, c.a);
}`

// FXAA 3.11 精简版
const FXAA_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
uniform float u_amount;

#define FXAA_SPAN_MAX 8.0
#define FXAA_REDUCE_MUL (1.0 / 8.0)
#define FXAA_REDUCE_MIN (1.0 / 128.0)

void main() {
  vec3 rgbNW = texture2D(u_src, v_texCoord + vec2(-1.0, -1.0) * u_texelSize).rgb;
  vec3 rgbNE = texture2D(u_src, v_texCoord + vec2( 1.0, -1.0) * u_texelSize).rgb;
  vec3 rgbSW = texture2D(u_src, v_texCoord + vec2(-1.0,  1.0) * u_texelSize).rgb;
  vec3 rgbSE = texture2D(u_src, v_texCoord + vec2( 1.0,  1.0) * u_texelSize).rgb;
  vec3 rgbM  = texture2D(u_src, v_texCoord).rgb;

  float lumaNW = dot(rgbNW, vec3(0.299, 0.587, 0.114));
  float lumaNE = dot(rgbNE, vec3(0.299, 0.587, 0.114));
  float lumaSW = dot(rgbSW, vec3(0.299, 0.587, 0.114));
  float lumaSE = dot(rgbSE, vec3(0.299, 0.587, 0.114));
  float lumaM  = dot(rgbM,  vec3(0.299, 0.587, 0.114));

  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  float range = lumaMax - lumaMin;
  if (range < max(FXAA_REDUCE_MIN, lumaMax * FXAA_REDUCE_MUL)) {
    gl_FragColor = vec4(rgbM, 1.0); return;
  }

  vec2 dir = vec2(
    -((lumaNW + lumaNE) - (lumaSW + lumaSE)),
     ((lumaNW + lumaSW) - (lumaNE + lumaSE))
  );
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * u_texelSize;

  vec3 rgbA = 0.5 * (texture2D(u_src, v_texCoord + dir * (1.0/3.0 - 0.5)).rgb
                   + texture2D(u_src, v_texCoord + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(u_src, v_texCoord + dir * -0.5).rgb
                                 + texture2D(u_src, v_texCoord + dir *  0.5).rgb);
  float lumaB = dot(rgbB, vec3(0.299, 0.587, 0.114));
  vec3 result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  gl_FragColor = vec4(mix(rgbM, result, u_amount), 1.0);
}`

// 色彩增强
const COLOR_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_brightness;

void main() {
  vec4 c = texture2D(u_src, v_texCoord);

  // 饱和度
  float gray = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(gray), c.rgb, u_saturation);

  // 对比度 + 亮度
  c.rgb = (c.rgb - 0.5) * u_contrast + 0.5 + u_brightness;

  gl_FragColor = c;
}`

// 输出直通
const PASSTHROUGH_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_texCoord;
uniform sampler2D u_src;
void main() {
  gl_FragColor = texture2D(u_src, v_texCoord);
}`

// ---- WebGL 工具 ----

function createShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  // context lost 等异常下 createShader 返回 null，调用方跳过该 pass 而不是崩溃
  if (!shader) {
    console.warn('[AniBox] createShader failed (context lost?)')
    return null
  }
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[AniBox] Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc)
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vert || !frag) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[AniBox] Program link error:', gl.getProgramInfoLog(prog))
    return null
  }
  return prog
}

// 全屏四边形（TRIANGLE_FAN 4 顶点；x,y=位置，u,v=纹理坐标）
// 方向约定：源纹理经 UNPACK_FLIP_Y_WEBGL 上传后 v=1 为视频顶部，故屏幕顶部采样 (0,1)。
// 多 pass 管线中"顶部→顶部"恒定传递，避免每级 FBO 渲染翻转一次导致不同预设方向不一致。
const QUAD_VERTS = new Float32Array([
  -1, -1, 0, 0, // 左下 ← 视频底部左
  -1, 1, 0, 1, // 左上 ← 视频顶部左
  1, 1, 1, 1, // 右上 ← 视频顶部右
  1, -1, 1, 0, // 右下 ← 视频底部右
])

// ---- Pipeline Pass ----

interface PipelinePass {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation>
  /** 自定义 uniform 的数值（预设配置，与 uniforms 的 location 一一对应） */
  uniformValues: Record<string, number>
  fb: WebGLFramebuffer | null
  texture: WebGLTexture | null
  needsTime: boolean
}

// ---- Preset Config ----

interface PresetConfig {
  upscale: boolean
  upscaleMul: number
  sharpen: boolean
  sharpenAmount: number
  deband: boolean
  debandAmount: number
  fxaa: boolean
  fxaaAmount: number
  color: boolean
  saturation: number
  contrast: number
  brightness: number
}

const PRESETS: Record<Preset, PresetConfig> = {
  balanced: {
    upscale: true,
    upscaleMul: 1.5,
    sharpen: true,
    sharpenAmount: 0.4,
    deband: true,
    debandAmount: 0.6,
    fxaa: false,
    fxaaAmount: 0.5,
    color: true,
    saturation: 1.15,
    contrast: 1.05,
    brightness: 0.02,
  },
  quality: {
    upscale: true,
    upscaleMul: 2.0,
    sharpen: true,
    sharpenAmount: 0.6,
    deband: true,
    debandAmount: 0.9,
    fxaa: true,
    fxaaAmount: 0.5,
    color: true,
    saturation: 1.2,
    contrast: 1.08,
    brightness: 0.03,
  },
  performance: {
    upscale: false,
    upscaleMul: 1.0,
    sharpen: false,
    sharpenAmount: 0.2,
    deband: false,
    debandAmount: 0.0,
    fxaa: false,
    fxaaAmount: 0.0,
    color: false,
    saturation: 1.0,
    contrast: 1.02,
    brightness: 0.0,
  },
}

// ---- VideoProcessor ----

export class VideoProcessor {
  private gl: WebGLRenderingContext | null = null
  private canvas: HTMLCanvasElement
  private passes: PipelinePass[] = []
  private srcTexture: WebGLTexture | null = null
  private outputFb: WebGLFramebuffer | null = null
  private outputTexture: WebGLTexture | null = null
  private animId = 0
  private video: HTMLVideoElement | null = null
  private _enabled = false
  private _preset: Preset = 'balanced'
  private _abMode = false // false=增强, true=原生 A/B 对比
  private _startTime = performance.now()
  private _outputWidth = 0
  private _outputHeight = 0
  private _scale = 1.0
  private disposed = false
  private needsRebuild = true
  private quadBuf: WebGLBuffer | null = null
  /** 直通渲染 program：最终输出到画布 / A/B 对比原生半区，避免复用后处理 shader 造成双重叠加 */
  private passThroughProgram: WebGLProgram | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  get enabled() {
    return this._enabled
  }
  get preset() {
    return this._preset
  }
  get abMode() {
    return this._abMode
  }
  get scale() {
    return this._scale
  }

  /** 挂载视频源 */
  attach(video: HTMLVideoElement) {
    this.video = video
    this.needsRebuild = true
  }

  /** 分离视频源 */
  detach() {
    this.disposeGL()
    this.video = null
    this.needsRebuild = true
  }

  /** 切换开关 */
  setEnabled(on: boolean) {
    if (this._enabled === on) return
    this._enabled = on
    if (on) {
      this.start()
    } else {
      this.stop()
      this.toggleCanvas(false)
    }
  }

  /** 切换预设 */
  setPreset(p: Preset) {
    if (this._preset === p) return
    this._preset = p
    this.needsRebuild = true
    if (this._enabled) {
      this.disposeGL()
      this.start()
    }
  }

  /** 切换 A/B */
  toggleAB() {
    this._abMode = !this._abMode
  }

  /** 获取输出画布 */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /** 计算输出尺寸 */
  private calcOutput() {
    if (!this.video || this.video.videoWidth === 0) return
    const cfg = PRESETS[this._preset]
    this._scale = cfg.upscale ? cfg.upscaleMul : 1.0
    let w = Math.round(this.video.videoWidth * this._scale)
    let h = Math.round(this.video.videoHeight * this._scale)
    // 防爆显存：限制最大输出宽度（1080p×2=3840 会超，多个 pass 大 FBO 易崩溃），超出按比例降
    const MAX_OUTPUT_W = 2560
    if (w > MAX_OUTPUT_W) {
      const k = MAX_OUTPUT_W / w
      w = Math.round(w * k)
      h = Math.round(h * k)
    }
    this._outputWidth = w
    this._outputHeight = h
  }

  private toggleCanvas(show: boolean) {
    this.canvas.style.display = show ? 'block' : 'none'
  }

  private start() {
    if (this.disposed || !this.video) return
    this.initGL()
    if (!this.gl) return
    this.toggleCanvas(true)
    this._startTime = performance.now()
    this.loop()
  }

  private stop() {
    if (this.animId) cancelAnimationFrame(this.animId)
    this.animId = 0
  }

  private initGL() {
    this.gl = this.canvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      alpha: false,
    })
    if (!this.gl) {
      console.warn('[AniBox] WebGL not available')
      return
    }
    this.calcOutput()
    this.buildPipeline()
  }

  private disposeGL() {
    this.stop()
    // 关键：不要主动调用 WEBGL_lose_context！
    // 同一 canvas 再次 getContext('webgl') 返回的是同一个已丢失的上下文，
    // 后续 createShader 全部返回 null 导致崩溃。仅释放 GL 资源 + JS 引用，
    // 让 context 存活复用，buildPipeline 在同一 context 上重建 program/纹理/buffer。
    if (this.gl) {
      const gl = this.gl
      for (const p of this.passes) {
        if (p.program) gl.deleteProgram(p.program)
        if (p.fb) gl.deleteFramebuffer(p.fb)
        if (p.texture) gl.deleteTexture(p.texture)
      }
      if (this.srcTexture) gl.deleteTexture(this.srcTexture)
      if (this.outputFb) gl.deleteFramebuffer(this.outputFb)
      if (this.outputTexture) gl.deleteTexture(this.outputTexture)
      if (this.passThroughProgram) gl.deleteProgram(this.passThroughProgram)
      if (this.quadBuf) gl.deleteBuffer(this.quadBuf)
    }
    this.gl = null
    this.passes = []
    this.srcTexture = null
    this.outputFb = null
    this.outputTexture = null
    this.passThroughProgram = null
    this.quadBuf = null
  }

  private buildPipeline() {
    const gl = this.gl!
    this.passes = []
    this.srcTexture = null

    const cfg = PRESETS[this._preset]

    // 创建源纹理
    this.srcTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // 构建管线 passes（uniformValues 为数值，location 在创建 program 后解析）
    const passes: {
      name: string
      frag: string
      enabled: boolean
      uniformValues: Record<string, number>
      needsTime: boolean
    }[] = []

    if (cfg.upscale) {
      passes.push({
        name: 'upscale',
        frag: UPSCALE_FRAG,
        enabled: true,
        uniformValues: { u_strength: cfg.upscaleMul },
        needsTime: false,
      })
    }

    if (cfg.deband) {
      passes.push({
        name: 'deband',
        frag: DEBAND_FRAG,
        enabled: true,
        uniformValues: { u_amount: cfg.debandAmount },
        needsTime: true,
      })
    }

    if (cfg.sharpen) {
      passes.push({
        name: 'sharpen',
        frag: SHARPEN_FRAG,
        enabled: true,
        uniformValues: { u_amount: cfg.sharpenAmount },
        needsTime: false,
      })
    }

    if (cfg.fxaa) {
      passes.push({
        name: 'fxaa',
        frag: FXAA_FRAG,
        enabled: true,
        uniformValues: { u_amount: cfg.fxaaAmount },
        needsTime: false,
      })
    }

    if (cfg.color) {
      passes.push({
        name: 'color',
        frag: COLOR_FRAG,
        enabled: true,
        uniformValues: {
          u_saturation: cfg.saturation,
          u_contrast: cfg.contrast,
          u_brightness: cfg.brightness,
        },
        needsTime: false,
      })
    }

    const w = this._outputWidth || 1920
    const h = this._outputHeight || 1080

    // 如果没有任何 pass，加一个直通 pass 保证输出
    if (passes.length === 0) {
      passes.push({
        name: 'passthrough',
        frag: PASSTHROUGH_FRAG,
        enabled: true,
        uniformValues: {},
        needsTime: false,
      })
    }

    for (const pass of passes) {
      const prog = createProgram(gl, VERTEX_SHADER, pass.frag)
      if (!prog) continue

      const uniforms: Record<string, WebGLUniformLocation> = {}
      // 自定义 uniform（数值来自预设配置）
      for (const [k] of Object.entries(pass.uniformValues)) {
        const loc = gl.getUniformLocation(prog, k)
        if (loc) uniforms[k] = loc
      }
      // 标准 uniform
      const locSrc = gl.getUniformLocation(prog, 'u_src')
      const locTexel = gl.getUniformLocation(prog, 'u_texelSize')
      const locTime = gl.getUniformLocation(prog, 'u_time')
      if (locSrc) uniforms['u_src'] = locSrc
      if (locTexel) uniforms['u_texelSize'] = locTexel
      if (locTime) uniforms['u_time'] = locTime

      const fb = gl.createFramebuffer()
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

      this.passes.push({
        program: prog,
        uniforms,
        uniformValues: pass.uniformValues,
        fb,
        texture: tex,
        needsTime: pass.needsTime,
      })
    }

    // 最终输出帧缓冲
    this.outputFb = gl.createFramebuffer()
    this.outputTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFb)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0,
    )

    this.canvas.width = w
    this.canvas.height = h

    // 直通 program：最终画布输出 / A/B 原生半区（不复用后处理 shader，避免双重叠加）
    this.passThroughProgram = createProgram(gl, VERTEX_SHADER, PASSTHROUGH_FRAG)
  }

  private loop = () => {
    if (this.disposed || !this._enabled) return
    const gl = this.gl
    if (!gl || !this.video || this.video.readyState < 2) {
      this.animId = requestAnimationFrame(this.loop)
      return
    }

    // 如果 initGL 时视频尺寸未知，拿到正确尺寸后重建管线（不销毁 GL 上下文）
    if (this._outputWidth === 0 || this._outputHeight === 0) {
      this.calcOutput()
      if (this._outputWidth > 0) {
        this.buildPipeline()
      } else {
        this.animId = requestAnimationFrame(this.loop)
        return
      }
    }

    const w = this._outputWidth
    const h = this._outputHeight
    const srcW = this.video.videoWidth
    const srcH = this.video.videoHeight

    // 上传视频帧到源纹理
    // UNPACK_FLIP_Y_WEBGL：垂直翻转存储，使 v=1 为视频顶部，
    // 与 QUAD_VERTS（顶部采样 v=1）配合保证多 pass 管线方向不翻转
    if (this.srcTexture) {
      gl.bindTexture(gl.TEXTURE_2D, this.srcTexture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    }

    // 设置视口
    gl.viewport(0, 0, w, h)
    gl.disable(gl.BLEND)

    const time = (performance.now() - this._startTime) / 1000.0

    // 运行管线 passes
    let prevTex = this.srcTexture
    let prevW = srcW
    let prevH = srcH

    for (const pass of this.passes) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fb)
      gl.viewport(0, 0, w, h)
      gl.useProgram(pass.program)

      // 绑定上一个 pass 的输出纹理
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, prevTex)
      if (pass.uniforms['u_src']) gl.uniform1i(pass.uniforms['u_src'], 0)

      // 传递 texel size
      const texelW = prevW > 0 ? 1.0 / prevW : 1.0 / srcW
      const texelH = prevH > 0 ? 1.0 / prevH : 1.0 / srcH
      if (pass.uniforms['u_texelSize']) gl.uniform2f(pass.uniforms['u_texelSize'], texelW, texelH)

      if (pass.needsTime && pass.uniforms['u_time']) gl.uniform1f(pass.uniforms['u_time'], time)

      // 自定义 uniform（值来自预设配置，location 已缓存）
      for (const [k, v] of Object.entries(pass.uniformValues)) {
        const loc = pass.uniforms[k]
        if (loc) gl.uniform1f(loc, v)
      }

      this.drawQuad(gl)
      prevTex = pass.texture
      prevW = w
      prevH = h
    }

    // 最终渲染到画布（直通 program，不再叠加后处理 shader）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (!this.passThroughProgram) {
      this.animId = requestAnimationFrame(this.loop)
      return
    }

    // 如果 A/B 模式，并排显示：左=原生，右=增强
    if (this._abMode && prevTex && this.srcTexture) {
      const dw = gl.drawingBufferWidth
      const dh = gl.drawingBufferHeight
      const halfW = dw / 2
      // 每半区 contain：以半宽为基准，按内容比例计算高度并垂直居中，避免拉伸畸形
      const aspect = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9
      const halfH = Math.min(dh, halfW / aspect)
      const y = Math.max(0, (dh - halfH) / 2)

      // 左半：原生（直通，未经后处理）
      gl.viewport(0, y, halfW, halfH)
      gl.useProgram(this.passThroughProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.srcTexture)
      gl.uniform1i(gl.getUniformLocation(this.passThroughProgram, 'u_src'), 0)
      this.drawQuad(gl)

      // 右半：增强
      gl.viewport(halfW, y, halfW, halfH)
      gl.useProgram(this.passThroughProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, prevTex)
      gl.uniform1i(gl.getUniformLocation(this.passThroughProgram, 'u_src'), 0)
      this.drawQuad(gl)
    } else {
      // 正常模式：全屏增强
      gl.useProgram(this.passThroughProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, prevTex)
      gl.uniform1i(gl.getUniformLocation(this.passThroughProgram, 'u_src'), 0)
      this.drawQuad(gl)
    }

    this.animId = requestAnimationFrame(this.loop)
  }

  /** 绘制全屏四边形（实例级 buffer，跟随 context 生命周期） */
  private drawQuad(gl: WebGLRenderingContext) {
    if (!this.quadBuf) {
      this.quadBuf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
      gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf)
    const stride = 4 * 4

    const prog = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    const aTex = gl.getAttribLocation(prog, 'a_texCoord')

    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0)
    }
    if (aTex >= 0) {
      gl.enableVertexAttribArray(aTex)
      gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, stride, 8)
    }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
  }

  destroy() {
    this.disposed = true
    this.stop()
    this.disposeGL()
    this.toggleCanvas(false)
  }
}

// 全屏四边形顶点数据（静态，可跨实例共享）
// 注意：WebGLBuffer 不能跨 context 共享，所以每实例各自 createBuffer
