import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The mentor server runs separately in development (npm run mentor); production routes /api via Caddy.
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
})
