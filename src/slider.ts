/* Slider hero: autoplay 3 s, crossfade i zoom robi CSS (hero.css).
   Tutaj tylko stan: aktywny slajd, klasy segmentów paska, pauza.
   Zmiana slajdu następuje na `animationend` paska postępu, więc pauza
   (animation-play-state) wstrzymuje też autoplay. Slider stoi także, gdy świeci
   biała lampa (hero-lamps.ts zgłasza zmianę zdarzeniem `lamp-change`). */

const SWIPE_MIN = 50 // px; poziomy gest krótszy niż to jest ignorowany
const PROGRESS_ANIMATION = 'hero-progress' // nazwa @keyframes w hero.css

const CLASS = {
  active: 'is-active',
  done: 'is-done',
  paused: 'is-paused',
  lampOn: 'is-on',
} as const

/** Inicjalizuje slider. Zwraca funkcję sprzątającą (usuwa wszystkie listenery). */
export function initSlider(): () => void {
  const hero = document.querySelector<HTMLElement>('.hero')
  if (!hero) throw new Error('initSlider: brak elementu ".hero"')

  const slides = Array.from(hero.querySelectorAll<HTMLElement>('.hero__slide'))
  const segments = Array.from(hero.querySelectorAll<HTMLElement>('.hero__progress li'))
  const progress = hero.querySelector('.hero__progress')
  const prev = hero.querySelector<HTMLButtonElement>('.hero__arrow--prev')
  const next = hero.querySelector<HTMLButtonElement>('.hero__arrow--next')

  // Jeden slajd nie ma czego przełączać – to poprawny stan, nie błąd.
  if (slides.length < 2) return () => {}

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const controller = new AbortController()
  const { signal } = controller

  let current = 0
  let hovered = false
  let focused = false

  const show = (index: number): void => {
    current = (index + slides.length) % slides.length

    slides.forEach((slide, i) => {
      const active = i === current
      slide.classList.toggle(CLASS.active, active)
      slide.toggleAttribute('inert', !active)
      slide.setAttribute('aria-hidden', String(!active))
    })

    // Zdjęcie klasy + reflow restartuje animację paska od zera.
    segments.forEach((segment, i) => {
      segment.classList.remove(CLASS.active, CLASS.done)
      if (i < current) segment.classList.add(CLASS.done)
    })
    void hero.offsetWidth
    segments[current]?.classList.add(CLASS.active)
  }

  const goPrev = (): void => show(current - 1)
  const goNext = (): void => show(current + 1)

  const updatePause = (): void => {
    const lampLit = hero.querySelector(`.hero__lamp--white.${CLASS.lampOn}`) !== null
    hero.classList.toggle(CLASS.paused, hovered || focused || lampLit || document.hidden)
  }

  // Swipe (dotyk / rysik): poziomy gest > SWIPE_MIN zmienia slajd, pionowy zostaje scrollem strony.
  const setupSwipe = (): void => {
    let startX = 0
    let startY = 0
    let pointerId: number | null = null

    hero.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
    }, { signal })

    hero.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1))
    }, { signal })

    hero.addEventListener('pointercancel', () => { pointerId = null }, { signal })
  }

  // Koniec wypełniania aktywnego segmentu = następny slajd.
  progress?.addEventListener('animationend', (e) => {
    if ((e as AnimationEvent).animationName === PROGRESS_ANIMATION && !reducedMotion.matches) goNext()
  }, { signal })

  prev?.addEventListener('click', goPrev, { signal })
  next?.addEventListener('click', goNext, { signal })
  hero.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goPrev()
    else if (e.key === 'ArrowRight') goNext()
  }, { signal })
  setupSwipe()

  hero.addEventListener('mouseenter', () => { hovered = true; updatePause() }, { signal })
  hero.addEventListener('mouseleave', () => { hovered = false; updatePause() }, { signal })
  hero.addEventListener('focusin', () => { focused = true; updatePause() }, { signal })
  hero.addEventListener('focusout', () => { focused = false; updatePause() }, { signal })
  hero.addEventListener('lamp-change', updatePause, { signal })
  document.addEventListener('visibilitychange', updatePause, { signal })

  // Segmenty paska nie są sterowane przez użytkownika – ukryte przed czytnikami.
  segments.forEach((s) => s.setAttribute('aria-hidden', 'true'))

  show(0)
  updatePause()

  return () => controller.abort()
}
