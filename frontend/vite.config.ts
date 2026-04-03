import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
} as const

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { ...apiProxy },
  },
  // npm run preview: /api istekleri yine backend'e gider (aksi halde 404)
  preview: {
    proxy: { ...apiProxy },
  },
})
