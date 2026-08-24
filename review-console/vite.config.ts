import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const motu = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': motu('./src'),
      // The kit, from SOURCE. `@motu/chrome/react` is the one compiled corner of an otherwise
      // as-authored package, so the exports map points at `dist/react` — correct for a published
      // consumer and wrong for this one, which is the console motu's own chrome is designed in.
      // Without this, every kit edit needs `pnpm build:packages` before it is visible here. The
      // lagoon aliases it the same way, for the same reason.
      '@motu/chrome/react': motu('../packages/chrome/src/react/index.tsx'),
    },
  },
  server: {
    // The host runs on the same machine; proxying keeps the console same-origin so the browser needs
    // no CORS grant and the token never has to travel to a third party.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8818', changeOrigin: true },
      '/shot': { target: 'http://127.0.0.1:8818', changeOrigin: true },
    },
  },
})
