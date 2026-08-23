import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // The host runs on the same machine; proxying keeps the console same-origin so the browser needs
    // no CORS grant and the token never has to travel to a third party.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8818', changeOrigin: true },
      '/shot': { target: 'http://127.0.0.1:8818', changeOrigin: true },
    },
  },
})
