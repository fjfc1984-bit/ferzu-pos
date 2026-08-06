import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-ferzu.svg', 'robots.txt'],
      // F5: inyectar handler de Background Sync en el SW generado por Workbox
      injectManifest: undefined, // usar generateSW (default)
      additionalManifestEntries: [],
      manifest: {
        name: 'FERZU POS',
        short_name: 'FERZU',
        description: 'Sistema POS inteligente para Colombia',
        theme_color: '#059669',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/dashboard',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Activa el SW nuevo inmediatamente sin esperar a que el usuario
        // cierre todas las pestañas. Evita que usuarios queden atrapados
        // en versiones viejas cacheadas.
        skipWaiting: true,
        clientsClaim: true,
        // F5: importar handler de Background Sync
        importScripts: ['sw-background-sync.js'],
        // Archivos estáticos del bundle
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Estrategias de caché para APIs
        runtimeCaching: [
          {
            // Supabase REST — NetworkFirst (datos siempre frescos, fallback a caché)
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/(rest|auth)\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Backend propio — NetworkFirst con timeout corto
            urlPattern: /\/api\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ferzu-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 60 },
              networkTimeoutSeconds: 4,
            },
          },
          {
            // Google Fonts — CacheFirst (cambian raramente)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],

  resolve: { alias: { '@': path.resolve(__dirname, './src') } },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          query:    ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          dexie:    ['dexie'],
        },
      },
    },
  },

  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/__tests__/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/**/*.d.ts'],
    },
  },
})
