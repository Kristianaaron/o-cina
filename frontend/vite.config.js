import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8002'

export default defineConfig({
  base: '/static/',
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: backend,
        changeOrigin: true,
      },
    },
  },
})
