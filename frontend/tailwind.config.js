/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#deeeff',
          100: '#b3d4ff',
          200: '#80bcff',
          300: '#4da3ff',
          400: '#1a8aff',
          500: '#007aff',
          600: '#0065d4',
          700: '#0052aa',
          800: '#003e80',
          900: '#002b57',
        },
        accent: '#007aff',
        surface: {
          page: '#ffffff',
          card: '#ffffff',
          input: '#ffffff',
        },
        border: '#ebebeb',
      },
      fontFamily: {
        sans: ['Lato', 'Arial', 'Helvetica', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '12px',
        xl: '14px',
        '2xl': '16px',
        '3xl': '20px',
        full: '9999px',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        card: '0 0 8px rgba(0,0,0,0.05)',
        modal: '0 10px 40px rgba(0,0,0,0.12)',
        blue: '0 4px 14px rgba(0,122,255,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-up': 'slideUp 0.3s ease forwards',
        blob: 'blob 7s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
