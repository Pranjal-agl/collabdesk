/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Clash Display"', '"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#050508',
          900: '#0a0a12',
          850: '#0e0e18',
          800: '#13131f',
          700: '#1c1c2e',
        },
      },
      keyframes: {
        'aurora-a': {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(60px,-40px) scale(1.15)' },
          '66%': { transform: 'translate(-40px,30px) scale(0.95)' },
        },
        'aurora-b': {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(-70px,50px) scale(1.2)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-dot': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'aurora-a': 'aurora-a 18s ease-in-out infinite',
        'aurora-b': 'aurora-b 24s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
      boxShadow: {
        glow: '0 0 24px -6px rgba(129,140,248,0.45)',
        'glow-sm': '0 0 12px -4px rgba(129,140,248,0.5)',
        card: '0 8px 32px -12px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
