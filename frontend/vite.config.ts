import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Config Vite : plugin React (JSX/Fast Refresh) + plugin Tailwind CSS v4.
// Le serveur dev tourne sur le port 5173 par défaut (voir README).
export default defineConfig({
  plugins: [react(), tailwindcss()],

  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },

  server: {
    port: 5173,
  },
})
