import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3317',
      '/mcp': 'http://localhost:3317',
      '/.well-known': 'http://localhost:3317',
      '/embed.js': 'http://localhost:3317',
      '/oauth/authorize': 'http://localhost:3317',
      '/oauth/token': 'http://localhost:3317',
      '/oauth/register': 'http://localhost:3317',
      '/oauth/revoke': 'http://localhost:3317',
    },
  },
})
