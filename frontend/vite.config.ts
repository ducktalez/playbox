import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "PlayBox",
        short_name: "PlayBox",
        description: "Party & Quiz Games",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-512.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: "/maskable-icon-512.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
          // TODO: post-dev — add PNG icons (192x192, 512x512) via pwa-asset-generator
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/(?!api\/)/],
        runtimeCaching: [
          {
            // API responses — network first, fall back to cache for offline
            urlPattern: /^\/api\/v1\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60, // 5 minutes
              },
            },
          },
          {
            // Static media (sounds, images) — cache first for speed
            urlPattern: /^\/media\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "media-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8015",
        changeOrigin: true,
      },
      // NOTE: /media is NOT proxied here on purpose.
      // Static game assets (sounds, images) live in frontend/public/media/
      // and are served directly by Vite in dev and by the built bundle in prod.
      // Backend-uploaded user content is only accessible at http://localhost:8015/media/
      // during development — no frontend feature currently reads it.
    },
  },
});

