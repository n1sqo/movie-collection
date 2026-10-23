import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// Shown in Settings so it's clear which build is running. CI passes the commit sha.
const version = `${new Date().toISOString().slice(0, 10)}·${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`

export default defineConfig({
  base: '/movie-collection/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Movie Collection',
        short_name: 'Movies',
        description: 'Моя колекція фільмів',
        lang: 'uk',
        start_url: '/movie-collection/',
        scope: '/movie-collection/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        navigateFallback: '/movie-collection/index.html',
        runtimeCaching: [
          {
            // Search thumbnails; collection posters live in IndexedDB.
            urlPattern: /^https:\/\/image\.tmdb\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
