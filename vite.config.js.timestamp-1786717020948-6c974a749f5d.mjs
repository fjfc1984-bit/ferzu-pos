// vite.config.js
import { defineConfig } from "file:///sessions/friendly-kind-newton/mnt/ferzu-pos/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/friendly-kind-newton/mnt/ferzu-pos/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/friendly-kind-newton/mnt/ferzu-pos/node_modules/vite-plugin-pwa/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/sessions/friendly-kind-newton/mnt/ferzu-pos";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo-ferzu.svg", "robots.txt"],
      // F5: inyectar handler de Background Sync en el SW generado por Workbox
      injectManifest: void 0,
      // usar generateSW (default)
      additionalManifestEntries: [],
      manifest: {
        name: "FERZU POS",
        short_name: "FERZU",
        description: "Sistema POS inteligente para Colombia",
        theme_color: "#059669",
        background_color: "#030712",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/dashboard",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        // Activa el SW nuevo inmediatamente sin esperar a que el usuario
        // cierre todas las pestañas. Evita que usuarios queden atrapados
        // en versiones viejas cacheadas.
        skipWaiting: true,
        clientsClaim: true,
        // F5: importar handler de Background Sync
        importScripts: ["sw-background-sync.js"],
        // Archivos estáticos del bundle
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Estrategias de caché para APIs
        runtimeCaching: [
          {
            // Supabase REST — NetworkFirst (datos siempre frescos, fallback a caché)
            urlPattern: /^https:\/\/[a-z]+\.supabase\.co\/(rest|auth)\//i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5
            }
          },
          {
            // Backend propio — NetworkFirst con timeout corto
            urlPattern: /\/api\//i,
            handler: "NetworkFirst",
            options: {
              cacheName: "ferzu-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 60 },
              networkTimeoutSeconds: 4
            }
          },
          {
            // Google Fonts — CacheFirst (cambian raramente)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  resolve: { alias: { "@": path.resolve(__vite_injected_original_dirname, "./src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          supabase: ["@supabase/supabase-js"],
          dexie: ["dexie"]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.js"],
    include: ["src/__tests__/**/*.{test,spec}.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/main.jsx", "src/**/*.d.ts"]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZnJpZW5kbHkta2luZC1uZXd0b24vbW50L2Zlcnp1LXBvc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2ZyaWVuZGx5LWtpbmQtbmV3dG9uL21udC9mZXJ6dS1wb3Mvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2ZyaWVuZGx5LWtpbmQtbmV3dG9uL21udC9mZXJ6dS1wb3Mvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSdcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2xvZ28tZmVyenUuc3ZnJywgJ3JvYm90cy50eHQnXSxcbiAgICAgIC8vIEY1OiBpbnllY3RhciBoYW5kbGVyIGRlIEJhY2tncm91bmQgU3luYyBlbiBlbCBTVyBnZW5lcmFkbyBwb3IgV29ya2JveFxuICAgICAgaW5qZWN0TWFuaWZlc3Q6IHVuZGVmaW5lZCwgLy8gdXNhciBnZW5lcmF0ZVNXIChkZWZhdWx0KVxuICAgICAgYWRkaXRpb25hbE1hbmlmZXN0RW50cmllczogW10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnRkVSWlUgUE9TJyxcbiAgICAgICAgc2hvcnRfbmFtZTogJ0ZFUlpVJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTaXN0ZW1hIFBPUyBpbnRlbGlnZW50ZSBwYXJhIENvbG9tYmlhJyxcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjMDU5NjY5JyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyMwMzA3MTInLFxuICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXG4gICAgICAgIG9yaWVudGF0aW9uOiAncG9ydHJhaXQtcHJpbWFyeScsXG4gICAgICAgIHN0YXJ0X3VybDogJy9kYXNoYm9hcmQnLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL3B3YS0xOTJ4MTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgeyBzcmM6ICcvcHdhLTUxMng1MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycsIHB1cnBvc2U6ICdhbnkgbWFza2FibGUnIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICAvLyBBY3RpdmEgZWwgU1cgbnVldm8gaW5tZWRpYXRhbWVudGUgc2luIGVzcGVyYXIgYSBxdWUgZWwgdXN1YXJpb1xuICAgICAgICAvLyBjaWVycmUgdG9kYXMgbGFzIHBlc3RhXHUwMEYxYXMuIEV2aXRhIHF1ZSB1c3VhcmlvcyBxdWVkZW4gYXRyYXBhZG9zXG4gICAgICAgIC8vIGVuIHZlcnNpb25lcyB2aWVqYXMgY2FjaGVhZGFzLlxuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICAvLyBGNTogaW1wb3J0YXIgaGFuZGxlciBkZSBCYWNrZ3JvdW5kIFN5bmNcbiAgICAgICAgaW1wb3J0U2NyaXB0czogWydzdy1iYWNrZ3JvdW5kLXN5bmMuanMnXSxcbiAgICAgICAgLy8gQXJjaGl2b3MgZXN0XHUwMEUxdGljb3MgZGVsIGJ1bmRsZVxuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxzdmcsd29mZjJ9J10sXG4gICAgICAgIC8vIEVzdHJhdGVnaWFzIGRlIGNhY2hcdTAwRTkgcGFyYSBBUElzXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gU3VwYWJhc2UgUkVTVCBcdTIwMTQgTmV0d29ya0ZpcnN0IChkYXRvcyBzaWVtcHJlIGZyZXNjb3MsIGZhbGxiYWNrIGEgY2FjaFx1MDBFOSlcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvW2Etel0rXFwuc3VwYWJhc2VcXC5jb1xcLyhyZXN0fGF1dGgpXFwvL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3VwYWJhc2UtYXBpJyxcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAyMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgfSxcbiAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiA1LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIC8vIEJhY2tlbmQgcHJvcGlvIFx1MjAxNCBOZXR3b3JrRmlyc3QgY29uIHRpbWVvdXQgY29ydG9cbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC9hcGlcXC8vaSxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdmZXJ6dS1hcGknLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDEwMCwgbWF4QWdlU2Vjb25kczogMzAgKiA2MCB9LFxuICAgICAgICAgICAgICBuZXR3b3JrVGltZW91dFNlY29uZHM6IDQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gR29vZ2xlIEZvbnRzIFx1MjAxNCBDYWNoZUZpcnN0IChjYW1iaWFuIHJhcmFtZW50ZSlcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nb29nbGVhcGlzXFwuY29tXFwvL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2dvb2dsZS1mb250cy1zdHlsZXNoZWV0cycsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMTAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nc3RhdGljXFwuY29tXFwvL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2dvb2dsZS1mb250cy13ZWJmb250cycsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMzAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcblxuICByZXNvbHZlOiB7IGFsaWFzOiB7ICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJykgfSB9LFxuXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHZlbmRvcjogICBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1yb3V0ZXItZG9tJ10sXG4gICAgICAgICAgcXVlcnk6ICAgIFsnQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5J10sXG4gICAgICAgICAgc3VwYWJhc2U6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXG4gICAgICAgICAgZGV4aWU6ICAgIFsnZGV4aWUnXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcblxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHByb3h5OiB7ICcvYXBpJzogeyB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLCBjaGFuZ2VPcmlnaW46IHRydWUgfSB9LFxuICB9LFxuXG4gIHRlc3Q6IHtcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIHNldHVwRmlsZXM6IFsnLi9zcmMvX190ZXN0c19fL3NldHVwLmpzJ10sXG4gICAgaW5jbHVkZTogWydzcmMvX190ZXN0c19fLyoqLyoue3Rlc3Qsc3BlY30ue2pzLGpzeH0nXSxcbiAgICBjb3ZlcmFnZToge1xuICAgICAgcHJvdmlkZXI6ICd2OCcsXG4gICAgICByZXBvcnRlcjogWyd0ZXh0JywgJ2xjb3YnXSxcbiAgICAgIGluY2x1ZGU6IFsnc3JjLyoqLyoue2pzLGpzeH0nXSxcbiAgICAgIGV4Y2x1ZGU6IFsnc3JjL21haW4uanN4JywgJ3NyYy8qKi8qLmQudHMnXSxcbiAgICB9LFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBc1QsU0FBUyxvQkFBb0I7QUFDblYsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixPQUFPLFVBQVU7QUFIakIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1As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
