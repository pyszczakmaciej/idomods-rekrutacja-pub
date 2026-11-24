import fragSource from './shader.frag?raw'

/* Sekcja CTA: tło renderowane shaderem WebGL w czasie rzeczywistym.
   - pętla bez szwu: shader dostaje fazę 2π·t/T (T z --t-shader-loop),
   - render tylko gdy sekcja jest w viewporcie i karta jest widoczna,
   - DPR ograniczony do 1.5,
   - prefers-reduced-motion: jedna statyczna klatka,
   - brak WebGL: klasa .cta--no-webgl i gradient CSS. */

type RGB = [number, number, number]

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const MAX_DPR = 1.5
const DEFAULT_LOOP_MS = 25_000 // gdy brak/niepoprawne --t-shader-loop
// Kolory awaryjne (gdy brak zmiennych CSS) – zgodne z tokens.css.
const FALLBACK_DARK: RGB = [0.067, 0.067, 0.067]
const FALLBACK_LIGHT: RGB = [0.949, 0.757, 0.18]

const CLASS = {
  noWebgl: 'cta--no-webgl',
  ready: 'is-ready',
} as const

// Kontekst jest osobno w `initShader`; tu tylko uchwyty uniformów zależnych od programu.
interface Renderer {
  uRes: WebGLUniformLocation | null
  uPhase: WebGLUniformLocation | null
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function parseDuration(value: string, fallback: number): number {
  const n = parseFloat(value)
  if (Number.isNaN(n) || n <= 0) return fallback
  return value.endsWith('ms') ? n : n * 1000
}

function parseHex(value: string, fallback: RGB): RGB {
  let hex = value.replace('#', '')
  if (hex.length === 3) hex = [...hex].map((ch) => ch + ch).join('')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[shader]', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource)
  const program = vs && fs ? gl.createProgram() : null

  if (program && vs && fs) {
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[shader]', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return null
    }
    // Po zlinkowaniu shadery są niepotrzebne (program trzyma ich skompilowaną kopię).
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return program
  }

  if (vs) gl.deleteShader(vs)
  if (fs) gl.deleteShader(fs)
  return null
}

function setup(gl: WebGLRenderingContext): Renderer | null {
  const program = link(gl)
  if (!program) return null
  gl.useProgram(program)

  // Jeden trójkąt pokrywający cały ekran.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  gl.uniform3fv(gl.getUniformLocation(program, 'u_dark'), parseHex(cssVar('--color-shader-dark'), FALLBACK_DARK))
  gl.uniform3fv(gl.getUniformLocation(program, 'u_light'), parseHex(cssVar('--color-shader-light'), FALLBACK_LIGHT))

  return {
    uRes: gl.getUniformLocation(program, 'u_res'),
    uPhase: gl.getUniformLocation(program, 'u_phase'),
  }
}

/** Inicjalizuje shader w sekcji CTA. Zwraca funkcję sprzątającą (pętla, observery, listenery). */
export function initShader(): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('.cta__canvas')
  const section = canvas?.closest<HTMLElement>('.cta')
  if (!canvas || !section) throw new Error('initShader: brak elementu ".cta__canvas" w ".cta"')

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  })
  let renderer = gl ? setup(gl) : null
  if (!gl || !renderer) {
    section.classList.add(CLASS.noWebgl)
    return () => {}
  }

  const controller = new AbortController()
  const { signal } = controller
  const period = parseDuration(cssVar('--t-shader-loop'), DEFAULT_LOOP_MS)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

  let elapsed = 0 // czas akumulowany tylko podczas działania pętli -> wznowienie bez skoku
  let last = 0
  let rafId = 0
  let inView = false

  const draw = (): void => {
    if (!renderer) return // kontekst utracony
    gl.uniform2f(renderer.uRes, canvas.width, canvas.height)
    gl.uniform1f(renderer.uPhase, ((elapsed % period) / period) * Math.PI * 2)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    canvas.classList.add(CLASS.ready)
  }

  const frame = (now: number): void => {
    elapsed += now - last
    last = now
    draw()
    rafId = requestAnimationFrame(frame)
  }

  const update = (): void => {
    const shouldRun = inView && !document.hidden && !reducedMotion.matches && renderer !== null
    if (shouldRun && !rafId) {
      last = performance.now()
      rafId = requestAnimationFrame(frame)
    } else if (!shouldRun && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
    if (!rafId) draw() // pętla stoi (reduced motion / poza viewportem) – odśwież klatkę
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    update()
  })
  intersectionObserver.observe(section)

  document.addEventListener('visibilitychange', update, { signal })
  reducedMotion.addEventListener('change', () => {
    update()
    draw()
  }, { signal })

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    renderer = null
    update()
  }, { signal })
  canvas.addEventListener('webglcontextrestored', () => {
    renderer = setup(gl)
    if (!renderer) {
      section.classList.add(CLASS.noWebgl)
      return
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    draw()
    update()
  }, { signal })

  resize()
  draw()

  return () => {
    controller.abort()
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}
