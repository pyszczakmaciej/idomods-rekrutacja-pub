// Światło białej lampy nad całą stroną – podejście mieszane:
// - ciemność z „dziurami" (lampa, stożek, plama pod kursorem) rysuje <canvas> w pół
//   rozdzielczości (sumy dziur nie da się zrobić tanio w DOM/CSS),
// - sam stożek to element DOM (.spotlight-cone, position: fixed, mix-blend-mode: screen),
//   ruszany wyłącznie przez translate / rotate / scale, więc animuje go kompozytor.
// Stan wiązki dostarcza hero-lamps.ts (pętla rAF), tutaj jest tylko rysowanie.

export interface BeamState {
  /** Środek żarówki białej lampy w px viewportu. */
  originX: number
  originY: number
  /** Kierunek wiązki: kąt CSS rotate w stopniach (wektor = (-sin, cos)). */
  angle: number
  /** Wygładzona pozycja kursora w px viewportu. */
  cursorX: number
  cursorY: number
  /** Promień rozświetlenia samej lampy (żeby nie była czarna). */
  lampRadius: number
  /** Kolor światła lampy z CSS (--lamp-color), np. "255, 240, 205". */
  color: string
}

export interface Spotlight {
  draw(state: BeamState): void
  setActive(active: boolean): void
  /** Usuwa elementy z DOM i listenery. */
  destroy(): void
}

const DARKNESS = 0.96 // 1 = pełna czerń; trochę prześwitu, żeby strona „istniała"
const MAX_DPR = 1.5
const RES_SCALE = 0.5 // canvas w pół rozdzielczości – ciemność jest miękka, więc różnicy nie widać
const SPOT_RADIUS = 0.18 // promień plamy pod kursorem jako ułamek krótszego boku viewportu
const CONE_FADE_END = 0.9 // gradient stożka gaśnie na tej części jego długości (jak w spotlight.css)
const CLASS_ACTIVE = 'is-active'

// Wymiary bazowego stożka (jak .hero__lamp-cone: wysokość = 1.4 · szerokość). Elementowi
// nadajemy je w JS, a kształt (clip-path: 42%-58% -> 0-100%) i kolor są w spotlight.css.
// Duży rozmiar bazowy: stożek tylko się zmniejsza, więc jest ostry.
const CONE_W = 800
const CONE_H = CONE_W * 1.4
// Z kształtu clip-path: połowa szerokości przy żarówce = 0.08·W, boki rozchodzą się
// ze spadkiem 0.3. Skalowanie równomierne `s` daje przy żarówce 0.08·W·s.
const CONE_TIP = 0.08 * CONE_W
const CONE_SPREAD = 0.3

function createOverlay<T extends keyof HTMLElementTagNameMap>(tag: T, className: string): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag)
  el.className = className
  el.setAttribute('aria-hidden', 'true')
  return el
}

export function initSpotlight(): Spotlight | null {
  const canvas = createOverlay('canvas', 'spotlight')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const coneEl = createOverlay('div', 'spotlight-cone')
  coneEl.style.width = `${CONE_W}px`
  coneEl.style.height = `${CONE_H}px`
  coneEl.style.left = `${-CONE_W / 2}px`
  document.body.append(canvas, coneEl)

  const controller = new AbortController()
  let scale = 1
  let lastState: BeamState | null = null
  let color = ''

  // Stożek DOM: wierzchołek w żarówce, obrót wokół niego, długość = odległość do kursora.
  const updateCone = (s: BeamState, dist: number): void => {
    if (s.color !== color) {
      color = s.color
      coneEl.style.setProperty('--lamp-color', color)
    }
    coneEl.style.translate = `${s.originX}px ${s.originY}px`
    coneEl.style.rotate = `${s.angle}deg`
    coneEl.style.scale = String(Math.max(dist, 1) / CONE_H)
  }

  const draw = (s: BeamState): void => {
    lastState = s
    const w = window.innerWidth
    const h = window.innerHeight
    const rad = (s.angle * Math.PI) / 180
    const dirX = -Math.sin(rad)
    const dirY = Math.cos(rad)
    const dist = Math.hypot(s.cursorX - s.originX, s.cursorY - s.originY)

    updateCone(s, dist)

    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = `rgba(0, 0, 0, ${DARKNESS})`
    ctx.fillRect(0, 0, w, h)

    // Wycinamy ciemność: lampa, stożek (ten sam kształt co element DOM), plama pod kursorem.
    ctx.globalCompositeOperation = 'destination-out'
    hole(ctx, s.originX, s.originY, s.lampRadius)
    coneHole(ctx, s, dirX, dirY, dist)
    hole(ctx, s.cursorX, s.cursorY, Math.min(w, h) * SPOT_RADIUS)
  }

  const resize = (): void => {
    scale = Math.min(window.devicePixelRatio || 1, MAX_DPR) * RES_SCALE
    canvas.width = Math.ceil(window.innerWidth * scale) // zmiana rozmiaru czyści canvas
    canvas.height = Math.ceil(window.innerHeight * scale)
    if (lastState) draw(lastState) // bez mignięcia w pełni widoczną stroną
  }

  resize()
  window.addEventListener('resize', resize, { signal: controller.signal })

  return {
    draw,
    setActive: (active) => {
      canvas.classList.toggle(CLASS_ACTIVE, active)
      coneEl.classList.toggle(CLASS_ACTIVE, active)
    },
    destroy: () => {
      controller.abort()
      canvas.remove()
      coneEl.remove()
    },
  }
}

function hole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, 'rgba(0, 0, 0, 1)')
  g.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

// Dziura w ciemności po stożku: ten sam trapez i gradient (1 -> 0 na CONE_FADE_END długości)
// co element DOM po przeskalowaniu do długości `length`.
function coneHole(
  ctx: CanvasRenderingContext2D,
  s: BeamState,
  dirX: number,
  dirY: number,
  length: number,
): void {
  if (length < 1) return
  const w0 = (CONE_TIP * length) / CONE_H
  const w1 = w0 + CONE_SPREAD * length
  // prostopadły do kierunku
  const px = -dirY
  const py = dirX
  const endX = s.originX + dirX * length
  const endY = s.originY + dirY * length

  const g = ctx.createLinearGradient(s.originX, s.originY, endX, endY)
  g.addColorStop(0, 'rgba(0, 0, 0, 1)')
  g.addColorStop(CONE_FADE_END, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(s.originX + px * w0, s.originY + py * w0)
  ctx.lineTo(endX + px * w1, endY + py * w1)
  ctx.lineTo(endX - px * w1, endY - py * w1)
  ctx.lineTo(s.originX - px * w0, s.originY - py * w0)
  ctx.closePath()
  ctx.fill()
}
