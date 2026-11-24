# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SOLLUX landing page (recruitment task for idomods): static page with animations specified in a brief ("Komentarze do projektu"). Stack is Vite + vanilla TypeScript + plain CSS — no framework and no animation libraries. The shader section uses raw WebGL (no Three.js). `README.md` (in Polish) is the source of truth for design decisions; read it before implementing a section.

**Current state:** implemented so far: header (`src/styles/header.css`, `src/header.ts`; RWD is desktop-first with a single `max-width: 1023.98px` breakpoint where the nav/search move into a full-screen right-sliding hamburger panel; the header is `position: fixed` — on desktop `.is-scrolled` gives it the hover background after scroll, on mobile `.is-hidden` slides it up on scroll and it returns only at `scrollY <= 0`, both toggled in `header.ts`), hero background with statically positioned lamps (`hero.css`, positions measured from Figma node 1:506 inside a cover-sized `.hero__lamps` layer), benefits bar (`benefits.css`), the hero slider (`slider.ts`, 2 slides, crossfade + progress bar via CSS animation, `animationend` advances), the four tiles (`tiles.css`, CSS only) and the footer (`footer.css`, Figma 1:708, split into Top / Bottom / Caption = `.footer__top` / `.footer__middle` / `.footer__bottom`). Reusable UI (e.g. `.button`, `.button--dark`, `.button--yellow`) lives in `src/styles/components.css`; add new shared elements there. Also implemented: `hero-lamps.ts` + `spotlight.ts`/`spotlight.css` (lamps; the white lamp follows the cursor and dims the page on desktop), `shader.ts` + `shader.frag` (CTA shader). Exported Claude sessions live in `docs/conversations/`.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc (typecheck only, noEmit) && vite build -> dist/
npm run preview   # serve the production build
```

There is no test runner or linter configured. Type checking happens via `tsc` in the build script (TypeScript 7, `noUnusedLocals`/`noUnusedParameters` on, `erasableSyntaxOnly` — so no enums/namespaces/parameter properties; `verbatimModuleSyntax` — use `import type`).

## Animation conventions (from README)

- All easings/durations/colors live in `src/styles/tokens.css` as CSS variables (`--ease`, `--ease-out`, `--t-fast: 250ms`, `--t-slow: 600ms`); reuse them rather than hardcoding values.
- Animate only `transform` and `opacity`. Color/background changes are done with `::before` layers fading via opacity; the documented exception is link text `color` transition.
- Hover 200–250 ms, larger movements 500–800 ms.
- Must honor `prefers-reduced-motion: reduce` (no parallax/float/autoplay; shader renders a static frame).
- Shader: fbm noise whose time is mapped onto a circle in noise space (`cos/sin(2π·t/T)`, T ≈ 25 s) for a seamless loop; render only while in viewport (`IntersectionObserver`), cap DPR at 1.5, CSS gradient fallback without WebGL. `shader.frag` is imported with `?raw`.
- Pause animations when the tab is hidden (`visibilitychange`); keyboard/`:focus-within` support and `aria-label`s on controls.

## Tooling

`.claude/settings.json` enables the `modern-web-guidance@googlechrome` plugin; use its skill for HTML/CSS/client-side JS work.
