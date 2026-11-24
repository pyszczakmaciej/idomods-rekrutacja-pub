import '@fontsource-variable/red-hat-display'
import './styles/reset.css'
import './styles/tokens.css'
import './styles/header.css'
import './styles/components.css'
import './styles/hero.css'
import './styles/benefits.css'
import './styles/tiles.css'
import './styles/footer.css'
import './styles/shader.css'
import './styles/spotlight.css'
import './style.css'
import { initHeader } from './header.ts'
import { initShader } from './shader.ts'
import { initSlider } from './slider.ts'
import { initHeroLamps } from './hero-lamps.ts'
import { initSpotlight } from './spotlight.ts'

// Każdy moduł startuje niezależnie: błąd w jednym (np. brak elementu w HTML)
// trafia do konsoli, ale nie blokuje reszty strony.
const cleanups: Array<() => void> = []

function start(name: string, init: () => () => void): void {
  try {
    cleanups.push(init())
  } catch (error) {
    console.error(`[${name}]`, error)
  }
}

start('header', initHeader)
start('shader', initShader)
start('slider', initSlider)
// Spotlight (wygaszanie strony + śledzenie kursora) tylko na desktopie; tworzony leniwie,
// dopiero gdy hero-lamps uzna tryb desktopowy za aktywny.
start('hero-lamps', () => initHeroLamps(initSpotlight))

// HMR: przed podmianą modułu odpinamy listenery i pętle, żeby się nie dublowały.
import.meta.hot?.dispose(() => cleanups.forEach((cleanup) => cleanup()))
