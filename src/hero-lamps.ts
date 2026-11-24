// Lampy w hero.
// - Pomarańczowa i zielona: klik / Enter / Space zapala i gasi (klasa .is-on, hero.css).
// - Biała: świeci cały czas, obraca się za kursorem (obrót całego <li> wokół żarówki,
//   więc stożek/glow dziedziczy kąt), a spotlight.ts odkrywa stronę w jej wiązce.
//   Śledzenie kursora i wygaszanie strony działają tylko na desktopie (TRACKING_QUERY:
//   szerokość ≥ 1024px + mysz) i bez prefers-reduced-motion; poza tym biała lampa działa
//   jak pozostałe. Przekroczenie progu szerokości w locie przełącza tryb.

import type { BeamState, Spotlight } from './spotlight.ts'

const LABELS: Record<string, [on: string, off: string]> = {
  white: ['Włącz beżową lampę', 'Wyłącz beżową lampę'],
  orange: ['Włącz ceglastą lampę', 'Wyłącz ceglastą lampę'],
  green: ['Włącz oliwkowy kinkiet', 'Wyłącz oliwkowy kinkiet'],
}

const TRACKING_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

const CLASS = {
  on: 'is-on',
  tracking: 'is-tracking',
} as const

const MAX_TURN = 70 // maks. obrót lampy względem pozycji bazowej (stopnie)
const OMEGA_CURSOR = 30 // sztywność sprężyny kursora (1/s): ~ czas dojścia 70 ms
const OMEGA_TURN = 45 // obrót lampy goni cel szybciej, żeby stożek nie „odstawał"
const SIDE_HOLD = 150 // powyżej tego kąta (kursor „za" lampą) trzymamy stronę obrotu
const MAX_DT = 0.05 // s; po powrocie na kartę sprężyna nie dostaje „skoku" czasu
const LAMP_RADIUS_RATIO = 0.9 // promień rozświetlenia lampy jako ułamek jej szerokości
const DEFAULT_LAMP_COLOR = '255, 236, 190' // gdy brak --lamp-color w CSS
const EPS_TURN = 0.02 // stopnie; poniżej tego obrót uznajemy za dojechany
const EPS_CURSOR = 0.3 // px; j.w. dla kursora
const EPS_VELOCITY_FACTOR = 4 // prędkość „dojechania" = eps · ten czynnik

// Slider (slider.ts) nasłuchuje na .hero i wstrzymuje autoplay, gdy świeci biała lampa.
const notifyChange = (lamp: HTMLElement): void => {
  lamp.dispatchEvent(new CustomEvent('lamp-change', { bubbles: true }))
}

const normalize = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180

// Klucz koloru lampy z klasy `hero__lamp--<klucz>` (white / orange / green).
const lampKey = (lamp: HTMLElement): string => lamp.className.match(/hero__lamp--(\w+)/)?.[1] ?? ''

/** Jedyne miejsce ustawiające wygląd/ARIA lampy: klasa, aria-pressed i etykieta. */
function setLampState(lamp: HTMLElement, on: boolean): void {
  lamp.classList.toggle(CLASS.on, on)
  lamp.setAttribute('aria-pressed', String(on))
  const label = LABELS[lampKey(lamp)]
  if (label) lamp.setAttribute('aria-label', label[on ? 1 : 0])
}

/** Aktywacja klikiem / Enter / Space (`handler` wołany tylko, gdy `enabled()`). */
function onActivate(el: HTMLElement, handler: () => void, enabled: () => boolean, signal: AbortSignal): void {
  el.addEventListener('click', () => {
    if (enabled()) handler()
  }, { signal })
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && enabled()) {
      e.preventDefault()
      handler()
    }
  }, { signal })
}

// Krytycznie tłumiona sprężyna (SmoothDamp): start bez skoku prędkości,
// łagodne wyhamowanie, zależna od realnego dt, a nie od liczby klatek.
interface Spring {
  value: number
  velocity: number
}

function springTo(s: Spring, target: number, omega: number, dt: number): void {
  const x = omega * dt
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = s.value - target
  const temp = (s.velocity + omega * change) * dt
  s.velocity = (s.velocity - omega * temp) * decay
  s.value = target + (change + temp) * decay
}

const isMoving = (s: Spring, target: number, eps: number): boolean =>
  Math.abs(s.value - target) > eps || Math.abs(s.velocity) > eps * EPS_VELOCITY_FACTOR

/**
 * `getSpotlight` jest wołane leniwie – dopiero gdy tryb desktopowy faktycznie się włącza.
 * Zwraca funkcję sprzątającą (listenery, pętla rAF, spotlight).
 */
export function initHeroLamps(getSpotlight: () => Spotlight | null): () => void {
  const lamps = document.querySelectorAll<HTMLElement>('.hero__lamp')
  if (lamps.length === 0) return () => {}

  const controller = new AbortController()
  const { signal } = controller
  const tracking = window.matchMedia(TRACKING_QUERY)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  let spotlight: Spotlight | null | undefined // undefined = jeszcze nie tworzony
  const trackable = (): boolean => {
    if (!tracking.matches || reducedMotion.matches) return false
    if (spotlight === undefined) spotlight = getSpotlight()
    return spotlight !== null
  }

  const white = document.querySelector<HTMLElement>('.hero__lamp--white')

  lamps.forEach((lamp) => {
    // Biała lampa na desktopie obsługuje trackCursor; poza nim to zwykła lampa.
    const handledByTracker = (): boolean => lamp === white && trackable()
    onActivate(
      lamp,
      () => {
        setLampState(lamp, !lamp.classList.contains(CLASS.on))
        notifyChange(lamp)
      },
      () => !handledByTracker(),
      signal,
    )
  })

  const stopTracking = white
    ? trackCursor(white, () => spotlight ?? null, trackable, tracking, signal)
    : () => {}

  return () => {
    controller.abort()
    stopTracking()
    spotlight?.destroy()
  }
}

/** Zwraca funkcję zatrzymującą pętlę rAF (listenery sprząta wspólny `signal`). */
function trackCursor(
  lamp: HTMLElement,
  getSpotlight: () => Spotlight | null,
  trackable: () => boolean,
  tracking: MediaQueryList,
  signal: AbortSignal,
): () => void {
  const light = lamp.querySelector<HTMLElement>('.hero__lamp-light')
  if (!light) return () => {}

  // Spotlight bywa jeszcze nie utworzony (np. Esc na mobile) – wtedy wywołania są no-op.
  const setSpotlightActive = (active: boolean): void => getSpotlight()?.setActive(active)
  const drawSpotlight = (state: BeamState): void => getSpotlight()?.draw(state)

  const style = getComputedStyle(lamp)
  const base = parseFloat(style.getPropertyValue('--rot')) || 0
  const color = style.getPropertyValue('--lamp-color').trim() || DEFAULT_LAMP_COLOR

  // Źródło światła: mierzymy raz we współrzędnych dokumentu (obrót wokół żarówki
  // go nie zmienia), a w klatce odejmujemy scroll – bez odczytów layoutu podczas
  // przewijania.
  let docX = 0
  let docY = 0
  let lampRadius = 0
  let geometryDirty = true

  let targetX = 0
  let targetY = 0
  const cx: Spring = { value: 0, velocity: 0 } // wygładzony kursor
  const cy: Spring = { value: 0, velocity: 0 }
  const turn: Spring = { value: 0, velocity: 0 } // obrót względem bazy (stopnie)
  let side = 1 // strona obrotu, gdy kursor jest „za" lampą (bez skoku +70° -> -70°)
  let seen = false // czy kursor już się pojawił
  // Biała lampa startuje zgaszona (strona w pełni widoczna). Klik / Enter / Space ją
  // zapala: obraca się za kursorem, strona ciemnieje, slider staje. Esc albo ponowny
  // klik gasi światło i lampa wraca do pozycji bazowej.
  let enabled = false
  let frame = 0
  let last = 0

  const measure = (): void => {
    const p = light.getBoundingClientRect()
    docX = p.left + window.scrollX
    docY = p.top + window.scrollY
    lampRadius = lamp.getBoundingClientRect().width * LAMP_RADIUS_RATIO
    geometryDirty = false
  }

  const step = (now: number): void => {
    frame = 0
    const dt = Math.min((now - last) / 1000, MAX_DT)
    last = now
    if (geometryDirty) measure()

    const originX = docX - window.scrollX
    const originY = docY - window.scrollY

    // Jedno wygładzanie: kursor. Kąt liczymy z wygładzonego kursora, więc stożek
    // zawsze celuje dokładnie tam, gdzie kończy się plama.
    springTo(cx, targetX, OMEGA_CURSOR, dt)
    springTo(cy, targetY, OMEGA_CURSOR, dt)

    let turnTarget = 0
    if (enabled) {
      // θ: kąt, przy którym stożek (wektor (-sin θ, cos θ)) wskazuje kursor.
      const aim = (Math.atan2(-(cx.value - originX), cy.value - originY) * 180) / Math.PI
      const raw = normalize(aim - base)
      if (Math.abs(raw) <= SIDE_HOLD) side = Math.sign(raw) || side
      turnTarget = Math.abs(raw) > SIDE_HOLD ? side * MAX_TURN : Math.max(-MAX_TURN, Math.min(MAX_TURN, raw))
    }
    springTo(turn, turnTarget, OMEGA_TURN, dt)

    lamp.style.rotate = `${turn.value.toFixed(3)}deg`
    // Po wyłączeniu nie rysujemy: canvas wygasza ostatnią klatkę.
    if (enabled) {
      drawSpotlight({
        originX,
        originY,
        angle: base + turn.value,
        cursorX: cx.value,
        cursorY: cy.value,
        lampRadius,
        color,
      })
    }

    const cursorMoving = enabled && (isMoving(cx, targetX, EPS_CURSOR) || isMoving(cy, targetY, EPS_CURSOR))
    if (isMoving(turn, turnTarget, EPS_TURN) || cursorMoving) request()
  }

  const request = (): void => {
    if (frame || document.hidden) return
    frame = requestAnimationFrame(step)
  }

  const setEnabled = (on: boolean): void => {
    if (on === enabled) return
    enabled = on
    setLampState(lamp, on)
    if (on && seen) {
      // Kursor mógł się przesunąć, gdy światło było zgaszone: bez dojeżdżania ze starej pozycji.
      cx.value = targetX
      cy.value = targetY
      cx.velocity = cy.velocity = 0
    }
    setSpotlightActive(on && seen)
    notifyChange(lamp)
    request()
  }

  lamp.classList.toggle(CLASS.tracking, trackable())
  onActivate(lamp, () => setEnabled(!enabled), trackable, signal)

  // Przejście desktop <-> mobile: gasimy światło i przełączamy tryb lampy.
  tracking.addEventListener('change', () => {
    setEnabled(false)
    // setEnabled(false) nic nie robi, gdy lampa była zapalona jako zwykła (nie śledząca).
    setLampState(lamp, false)
    lamp.style.rotate = ''
    lamp.classList.toggle(CLASS.tracking, trackable())
    notifyChange(lamp)
  }, { signal })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setEnabled(false)
    // Klawiatura: treść jest w DOM, ale użytkownik klawiatury musi ją widzieć.
    else if (e.key === 'Tab') setSpotlightActive(false)
  }, { signal })

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !trackable()) return
    targetX = e.clientX
    targetY = e.clientY
    if (!seen) {
      seen = true
      cx.value = targetX
      cy.value = targetY
      last = performance.now()
    }
    if (!enabled) return
    setSpotlightActive(true)
    request()
  }, { passive: true, signal })

  // Scroll nie zmienia geometrii, tylko pozycję żarówki w viewport – wystarczy klatka.
  window.addEventListener('scroll', () => { if (seen) request() }, { passive: true, signal })
  const invalidate = (): void => {
    geometryDirty = true
    if (seen) request()
  }
  window.addEventListener('resize', invalidate, { signal })
  window.addEventListener('load', invalidate, { signal }) // obrazy/czcionki mogą przesunąć layout

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
    } else if (seen) {
      last = performance.now()
      request()
    }
  }, { signal })

  return () => {
    cancelAnimationFrame(frame)
    frame = 0
  }
}
