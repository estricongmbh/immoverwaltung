/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.css", // Hinzugefügt, um sicherzustellen, dass Tailwind diese Datei verarbeitet
    "./src/**/*.{js,ts,jsx,tsx,css}",
  ],
  theme: {
    extend: {
      // HIER IST DIE ÄNDERUNG
      fontFamily: {
        sans: ['Verdana', 'sans-serif'],
      },
    },
  },
  plugins: [],
}