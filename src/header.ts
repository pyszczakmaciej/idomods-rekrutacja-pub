// Menu mobilne (hamburger): panel z prawej, Esc / X / klik w link zamyka, desktop resetuje stan.

// Musi zgadzać się z breakpointem w styles/header.css (max-width: 1023.98px = mobile).
const DESKTOP_QUERY = '(min-width: 1024px)'
const HIDE_AFTER = 8 // px; margines na drobny drift/bounce na dotyku

const CLASS = {
  open: 'is-open',
  hidden: 'is-hidden',
  scrolled: 'is-scrolled',
} as const

// Brakujący element to błąd w markupie – lepiej głośno niż cichy `return`.
function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`initHeader: brak elementu "${selector}"`)
  return el
}

/** Inicjalizuje header. Zwraca funkcję sprzątającą (usuwa wszystkie listenery). */
export function initHeader(): () => void {
  const header = required<HTMLElement>('.header')
  const menu = required<HTMLElement>('.header__menu')
  const burger = required<HTMLButtonElement>('.header__burger')
  const close = required<HTMLButtonElement>('.header__close')

  const desktop = window.matchMedia(DESKTOP_QUERY)
  // Reszta strony za otwartym panelem: nieaktywna dla klawiatury i czytników (jak modalny dialog).
  const behind = document.querySelectorAll<HTMLElement>('main, footer')

  const controller = new AbortController()
  const { signal } = controller
  let isOpen = false

  // Panel jest dialogiem tylko, gdy jest otwarty (na desktopie to zwykły pasek nawigacji).
  const applyDialogSemantics = (open: boolean): void => {
    if (open) {
      menu.setAttribute('role', 'dialog')
      menu.setAttribute('aria-modal', 'true')
      menu.setAttribute('aria-label', 'Menu')
    } else {
      menu.removeAttribute('role')
      menu.removeAttribute('aria-modal')
      menu.removeAttribute('aria-label')
    }
  }

  // Zamknięte menu mobilne nie może łapać fokusu; na desktopie jest zwykłym paskiem.
  const applyInert = (open: boolean): void => {
    menu.inert = !open && !desktop.matches
    behind.forEach((el) => { el.inert = open })
  }

  const setOpen = (open: boolean, restoreFocus = true): void => {
    isOpen = open
    menu.classList.toggle(CLASS.open, open)
    burger.setAttribute('aria-expanded', String(open))
    applyInert(open)
    applyDialogSemantics(open)
    document.documentElement.style.overflow = open ? 'hidden' : ''
    if (open) close.focus()
    else if (restoreFocus) burger.focus()
  }

  // Desktop: po scrollu tło jak na hover (sticky). Mobile: header ucieka w górę
  // i wraca dopiero na samej górze strony (nie chowamy go przy otwartym menu).
  const updateScrollState = (): void => {
    const y = window.scrollY
    if (desktop.matches) {
      header.classList.toggle(CLASS.scrolled, y > 0)
      header.classList.remove(CLASS.hidden)
      return
    }
    header.classList.remove(CLASS.scrolled)
    if (isOpen) return
    if (y > HIDE_AFTER) header.classList.add(CLASS.hidden)
    else if (y <= 0) header.classList.remove(CLASS.hidden)
  }

  const onBreakpointChange = (): void => {
    setOpen(false, false)
    updateScrollState()
  }

  burger.addEventListener('click', () => setOpen(true), { signal })
  close.addEventListener('click', () => setOpen(false), { signal })
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.header__nav a')) setOpen(false, false)
  }, { signal })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false)
  }, { signal })
  window.addEventListener('scroll', updateScrollState, { passive: true, signal })
  desktop.addEventListener('change', onBreakpointChange, { signal })

  applyInert(false)
  // Pierwszy odczyt scrollY po pierwszym renderze – synchronicznie wymuszałby layout (forced reflow).
  requestAnimationFrame(updateScrollState)

  return () => controller.abort()
}
