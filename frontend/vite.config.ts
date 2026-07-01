import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The SPA calls the backend through /api, proxied to the Worker (wrangler dev
// defaults to :8787). Frontend and backend are separate apps (ADR-0015); the
// browser talks to the API over HTTP, it never computes postings itself.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
