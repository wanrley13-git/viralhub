/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sans': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'display': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'serif': ['"Instrument Serif"', 'Georgia', 'serif'],
        'mono': ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        'background': '#08080A',
        'surface': '#111114',
        'surface-flat': '#18181D',
        'surface-raised': '#1F1F26',
        'primary': '#37B24D',
        'primary-hover': '#2F9E44',
        'primary-glow': 'rgba(55, 178, 77, 0.12)',
        'accent': '#69DB7C',
        'accent-muted': 'rgba(105, 219, 124, 0.1)',
        'border-subtle': 'rgba(255, 255, 255, 0.06)',
        'border-hover': 'rgba(255, 255, 255, 0.12)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
      },
      boxShadow: {
        'glow-sm': '0 0 20px rgba(55, 178, 77, 0.15)',
        'glow-md': '0 0 40px rgba(55, 178, 77, 0.2)',
        'glow-lg': '0 0 60px rgba(55, 178, 77, 0.25)',
        'card': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 24px rgba(55, 178, 77, 0.06)',
        'modal': '0 32px 80px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
}
