/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
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