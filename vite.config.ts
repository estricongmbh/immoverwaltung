import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Wir importieren die Werkzeuge direkt hier
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vitejs.dev/config/
export default defineConfig({
  // NEUER ABSCHNITT: Hier zwingen wir Vite, PostCSS mit Tailwind zu benutzen
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  plugins: [react()],
})