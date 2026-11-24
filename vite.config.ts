import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Vite nie przepisuje <link rel="preload"> do plików z node_modules, a fonty są
// odkrywane dopiero po pobraniu CSS (łańcuch HTML → CSS → woff2). Wstrzykujemy preload
// zhashowanych woff2 z bundla, żeby pobierały się równolegle z CSS.
const preloadFonts = (): Plugin => ({
  name: 'preload-fonts',
  transformIndexHtml: {
    order: 'post',
    handler(_html, ctx) {
      if (!ctx.bundle) return
      return Object.keys(ctx.bundle)
        .filter((file) => /red-hat-display-latin(-ext)?-wght-normal.*\.woff2$/.test(file))
        .map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/${file}` },
          injectTo: 'head' as const,
        }))
    },
  },
})

export default defineConfig({ plugins: [preloadFonts()] })
