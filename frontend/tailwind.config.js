/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        zinc: { 950: '#09090b', 900: '#18181b', 800: '#27272a', 700: '#3f3f46', 600: '#52525b', 500: '#71717a' },
        bauhaus: { red: '#d4362e', yellow: '#f0c832', blue: '#0066cc' },
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
