import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/static/',
  plugins: [react()],
  server: {
    port: 3001,
    proxy: { '/api': 'http://localhost:8002' },
  },
})
