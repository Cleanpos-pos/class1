/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'trust-blue': '#0056b3',
        'trust-blue-hover': '#004494',
        'eco-green': '#28a745',
        'fresh-white': '#FFFFFF',
        'text-grey': '#333333',
      },
      fontFamily: {
        sans: ['Open Sans', 'sans-serif'],
        heading: ['Roboto', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
