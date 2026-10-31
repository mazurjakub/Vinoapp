/**
 * File: vite.config.ts
 * Created: 2026-10-03
 * Description: Vite build configuration, including the PWA manifest and service worker.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vinařský deník',
        short_name: 'Vinař',
        lang: 'cs',
        display: 'standalone',
        theme_color: '#5b2a4a',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // Maskable: artwork sits inside the central 80% safe zone so launcher masks don't clip it.
          { src: 'pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})