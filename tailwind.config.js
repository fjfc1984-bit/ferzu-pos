/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },

      // ── Paleta principal FERZU POS ──────────────────────────────────────
      colors: {
        brand: {
          50:  '#ecfdf5',  // emerald-50
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',  // emerald-500
          600: '#059669',  // emerald-600 — color principal FERZU
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },

      // ── Animaciones ─────────────────────────────────────────────────────
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-6px)' },
          '40%':      { transform: 'translateX(6px)' },
          '60%':      { transform: 'translateX(-4px)' },
          '80%':      { transform: 'translateX(4px)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shake:    'shake 0.5s ease-in-out',
        fadeIn:   'fadeIn 0.2s ease-out',
        slideUp:  'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
