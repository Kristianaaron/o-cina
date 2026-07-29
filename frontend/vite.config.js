import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8002'

/**
 * Production builds keep base `/static/` (FastAPI StaticFiles mount).
 * Dev uses `/` so HMR / soft navigations to `/` don't hit Vite's base-URL error page.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/' : '/',
  plugins: [
    react(),
    {
      name: 'dev-static-alias',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Old bookmarks / Cursor preview hitting /static/* → app root in dev
          if (req.url === '/static' || req.url?.startsWith('/static/')) {
            const rest = req.url.replace(/^\/static\/?/, '/') || '/'
            res.statusCode = 302
            res.setHeader('Location', rest === '//' ? '/' : rest)
            res.end()
            return
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 3001,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: backend,
        changeOrigin: true,
        ws: true,
      },
    },
  },
}))
