import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],

      manifest: {
        name: 'متابع القراءة',
        short_name: 'مكتبتي',
        description: 'تتبع تقدمك في قراءة الكتب مع أصدقائك',
        lang: 'ar',
        dir: 'rtl',
        // `standalone` : lancée depuis l'écran d'accueil, l'app s'ouvre sans
        // barre d'adresse ni onglets — c'est ce qui la fait passer pour native.
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#F8F7F4',
        theme_color: '#534AB7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // `maskable` : Android recadre selon la forme du lanceur. Sans une
            // icône dédiée, le logo se retrouve rogné sur les lanceurs ronds.
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        // `mjs` est indispensable : le worker pdf.js est un module ES, il serait
        // silencieusement exclu du précache par un motif limité à `js`.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],

        // Le worker pdf.js pèse ~1 Mo. La limite par défaut (2 Mo) le laisserait
        // passer, mais de justesse : on la relève pour éviter qu'il soit un jour
        // exclu du précache en silence, ce qui casserait le lecteur hors ligne.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        // Toute URL inconnue retombe sur l'app (routage côté client).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//],

        runtimeCaching: [
          {
            // Polices Google : immuables une fois téléchargées.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // Couvertures : petites et stables. Ce sont elles qui donnent
            // l'impression d'une app instantanée au lancement.
            urlPattern: /\/storage\/v1\/object\/public\/books\/covers\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
          // Les PDF ne sont volontairement PAS mis en cache : plusieurs dizaines
          // de Mo chacun, ils satureraient le quota de stockage du navigateur et
          // provoqueraient l'éviction du reste. La lecture reste en ligne.
        ]
      },

      devOptions: {
        // Permet de tester l'installation avec `npm run dev`.
        enabled: true,
        type: 'module'
      }
    })
  ]
})
