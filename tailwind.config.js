/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colore personalizzato per "Bordighera Domani"
        'bd-blue': '#1e3a8a', 
      }
    },
  },
  plugins: [],
}
