import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serve o app em /minhas-financas/
export default defineConfig({
  base: '/minhas-financas/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'template.xlsx'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,xlsx}'],
      },
      manifest: {
        name: 'Minhas Finanças',
        short_name: 'Finanças',
        description: 'Controle simples do mês, CDI e dólares.',
        lang: 'pt-BR',
        theme_color: '#F6F7FB',
        background_color: '#F6F7FB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
