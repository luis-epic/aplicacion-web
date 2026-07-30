import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'development-csp-exceptions',
      transformIndexHtml(html) {
        if (command !== 'serve') return html

        return html
          .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
          .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
          .replace(
            'https://geocoding-api.open-meteo.com; worker-src',
            'https://geocoding-api.open-meteo.com ws: wss:; worker-src',
          )
      },
    },
  ],
}))
