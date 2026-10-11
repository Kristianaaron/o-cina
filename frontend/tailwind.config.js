/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        zinc: { 950: '#09090b', 900: '#18181b', 800: '#27272a', 700: '#3f3f46', 600: '#52525b', 500: '#71717a' },
        bauhaus: { red: '#d4362e', yellow: '#f0c832', blue: '#0066cc' },
        // Surface ramp — canvas → raised. Matches the node field (#07070a).
        ink: { 0: '#07070a', 1: '#0b0b0f', 2: '#111116', 3: '#18181e' },
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        float: '0 16px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        lit: '0 0 8px rgba(255, 255, 255, 0.45)',
      },
    },
  },
  plugins: [],
}
