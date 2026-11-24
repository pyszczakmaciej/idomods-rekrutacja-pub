# SOLLUX – landing page

Implementacja landing page'a SOLLUX z animacjami zgodnymi z briefem („Komentarze do projektu”).

## Stack

- **Vite + vanilla TypeScript + CSS.** Bez frameworka i bez bibliotek animacji.
- **WebGL (czysty, bez Three.js)** dla sekcji shader: jeden pełnoekranowy quad i fragment shader.

Strona jest statyczna i ma kilka interakcji, więc framework zwiększyłby bundle i nic by tu nie wniósł.

## Uruchomienie

Aplikacja powstała na Node.js **v24.17.0**.

```bash
npm install
npm start    # sprawdzenie typów, build produkcyjny do dist/ i podgląd buildu
```

Po `npm start` strona jest dostępna pod http://localhost:4173/. Adres może się różnić (np. inny port, jeśli 4173 jest zajęty) – właściwy adres wypisuje Vite w terminalu.

Pozostałe skrypty:

```bash
npm run dev      # serwer deweloperski Vite
npm run build    # tylko build produkcyjny do dist/
npm run preview  # tylko podgląd istniejącego buildu
```

## Struktura

```
index.html
src/
  main.ts
  header.ts        # menu mobilne (hamburger), zachowanie nagłówka przy scrollu
  slider.ts        # autoplay, crossfade, pasek postępu
  hero-lamps.ts    # włączanie lamp, biała lampa obraca się za kursorem
  spotlight.ts     # ściemnienie strony i stożek światła białej lampy (canvas 2D)
  shader.ts        # setup WebGL, pętla renderowania
  shader.frag      # fragment shader (import ?raw)
  style.css        # font bazowy
  styles/
    reset.css      # reset
    tokens.css     # easingi, czasy, kolory
    components.css # reużywalne elementy UI (.button)
    header.css  hero.css  benefits.css  tiles.css  footer.css
    spotlight.css  shader.css
public/assets/     # lampy, tła, ikony i logotypy (WebP/SVG, obrazy w kilku rozmiarach pod srcset)
docs/conversations/ # eksport rozmów z Claude Code
```

## Zasady animacji

Wszystkie timingi i easingi pochodzą z `tokens.css`:

```css
--ease: cubic-bezier(0.4, 0, 0.2, 1);   /* domyślny */
--ease-out: cubic-bezier(0, 0, 0.2, 1); /* powiększenia */
--t-fast: 250ms;
--t-slow: 600ms;
```

- Hover trwa 200–250 ms, większe ruchy 500–800 ms.
- Animowane są tylko `transform` i `opacity`. Wyjątki opisuje sekcja „Decyzje i kompromisy”.
- Przy `prefers-reduced-motion: reduce` autoplay slidera i śledzenie kursora przez białą lampę są wyłączone, a shader pokazuje statyczną klatkę.

## Sekcje

| Sekcja | Realizacja |
|---|---|
| **Menu** | `header:hover, header:focus-within`. Białe tło to `::before` z `opacity 0→1`. Tekst, logo i ikony zmieniają kolor przez `color`: logo i ikony to maski SVG (`mask`) wypełnione `currentColor`. Wszystko 250 ms `--ease`.  Header jest `position: fixed`: na desktopie po scrollu dostaje tło jak na hover, a poniżej 1024 px nawigacja i wyszukiwarka trafiają do panelu hamburgera wysuwanego z prawej (Esc, X i klik w link zamykają). Na mobile header chowa się przy scrollu w dół i wraca dopiero na samej górze strony. |
| **Hero / lampy** | Trzy lampy ustawione statycznie na tle (pozycje zmierzone z Figmy). Pomarańczowa i zielona: klik / Enter / Space zapala i gasi (glow, stożek światła z `mix-blend-mode: screen`). Biała lampa po zapaleniu obraca się za kursorem (sprężyna liczona w `requestAnimationFrame`), a strona za nią ciemnieje: `spotlight.ts` rysuje ciemność z „dziurami” na canvasie w pół rozdzielczości, a sam stożek jest elementem DOM ruszanym przez `translate`/`rotate`/`scale`. Esc albo ponowny klik gasi światło. Śledzenie kursora działa tylko na desktopie (≥ 1024 px, mysz) i bez `prefers-reduced-motion`; poza tym biała lampa działa jak pozostałe (tap). Zapalona biała lampa wstrzymuje slider. |
| **Slider** | Slajdy nałożone na siebie, crossfade 600 ms, obraz `scale(1.05→1)` w 800 ms ease-out. Pasek postępu to `scaleX` (CSS animation `3s linear`), a slajd zmienia się na `animationend` (animację można wstrzymać, transition nie). Pauza na hover, focus, przy zapalonej białej lampie i w ukrytej karcie (`visibilitychange`). Strzałki (przyciski i ←/→) oraz swipe na dotyku zmieniają slajd. |
| **Kafelki** | Sam CSS. `overflow: hidden`, obraz `scale(1→1.1)` w 500 ms ease-out, przycisk `#000→#4A4A4A` przez `::before` z opacity w 200 ms (przycisk reaguje na hover całego kafelka). Rozmycie pod obrazem to statyczny gradient od koloru tła kafelka (1% → 100% krycia), nieskalowany razem z obrazem. |
| **Shader** | Szum fbm w kolorach od czerni do żółci. Czas jest mapowany na okrąg w przestrzeni szumu (`cos/sin(2π·t/T)`, T ≈ 25 s), więc pętla jest matematycznie okresowa i nie ma cięcia. Renderowanie tylko w viewporcie (`IntersectionObserver`), DPR ograniczony do 1.5, fallback na gradient CSS bez WebGL. |

## Decyzje i kompromisy

- **Kolory w menu i przyciskach.** Brief wymaga animowania tylko `transform` i `opacity`, a jednocześnie zmiany tła i koloru. Tła rozwiązują warstwy `::before` z opacity. Kolor tekstu linków zmienia się przez `color` transition, bo repaint kilku elementów jest pomijalny, a dublowanie tekstu pogorszyłoby dostępność. Ta sama transition obejmuje logo i ikony: zamiast dwóch nałożonych wersji (biała i czarna z crossfade) każda grafika jest jedną maską SVG z tłem `currentColor`. Daje to ten sam efekt przy połowie plików i bez rozjazdu dwóch warstw w trakcie przejścia.
- **Pętla shadera** jest liczona w czasie rzeczywistym, a nie odtwarzana jako GIF czy wideo. Dzięki temu nie widać początku ani końca cyklu.

## Dostępność i wydajność

- Nawigacja klawiaturą działa w menu i sliderze (`:focus-within`, przyciski z `aria-label`).
- Pauza animacji w ukrytej karcie.
- Docelowo Lighthouse Performance i Accessibility ≥ 90.

## Praca z AI

Projekt powstał z pomocą Claude Code. Każda sekcja była osobną, nazwaną sesją. Konwencje projektu są zapisane w `CLAUDE.md`.
