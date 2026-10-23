/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        alif: {
          bg: '#F7F6F2',
          surface: '#FFFFFF',
          muted: '#EFECE6',
          charcoal: '#1C1D21',
          black: '#0B0B0D',
          grey: '#6B7280',
          border: '#E2E0D8'
        }
      }
    }
  },
  plugins: []
};
