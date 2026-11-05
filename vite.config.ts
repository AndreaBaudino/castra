import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// shown on the account page: the build day, and the commit when built from git
let commit = ''
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // not a git checkout
}

// BASE lets the app be served from a sub-path (e.g. GitHub Pages: /centurion-companion/)
const base = process.env.BASE ?? '/'

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify({ date: new Date().toISOString().slice(0, 10), commit }) },
  plugins: [
    react(),
    VitePWA({
      // the app asks before switching to a new version (a game may be in progress): see AppBanners.tsx
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'badge-96.png'],
      manifest: {
        name: 'Castra · Centurion Commander',
        short_name: 'Castra',
        description: 'Meta, life counter e mazzi per Centurion Commander',
        lang: 'it',
        theme_color: '#0b0b0c',
        background_color: '#0b0b0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['push-sw.js'], // push notifications
        // the fonts too: the app (the life counter at a tournament) must look the same offline
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // the guides in public/ (castra.pdf…) are files, not app pages: the browser must fetch them
        navigateFallbackDenylist: [/\.pdf$/],
        runtimeCaching: [
          {
            // card images and mana symbols: cache-first, they never change
            urlPattern: /^https:\/\/(cards|svgs)\.scryfall\.io\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
