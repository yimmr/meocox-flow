/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#070A10',
          900: '#0B0F17',
          850: '#0F1623',
          800: '#111827',
          750: '#1A2234',
          700: '#1F2937',
          650: '#2B3649',
          600: '#374151',
        },
        brand: {
          500: '#6366F1', // Indigo
          600: '#4F46E5',
          cyan: '#06B6D4',
        }
      }
    },
  },
  plugins: [],
}
