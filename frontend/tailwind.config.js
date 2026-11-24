/** @type {import('tailwindcss').Config} */
// "The desk": a cool blotter surface, white index cards, green-black ink.
// Chrome stays monochrome — colour is reserved for people (each teammate owns
// an ink) and for urgency. Highlighter yellow appears only for live changes.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Body: a newsroom grotesk. Display: an inky, soft-cornered serif.
        // Mono: Space Mono, carried over from the author's portfolio, for keys,
        // counts and revision numbers.
        sans: ['"Schibsted Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces Variable"', 'Georgia', 'serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Modular scale (≈1.25) anchored on a 15px body.
        xs: ['0.8125rem', { lineHeight: '1.15rem' }], // 13
        sm: ['0.875rem', { lineHeight: '1.3rem' }], // 14
        base: ['0.9375rem', { lineHeight: '1.45rem' }], // 15
        lg: ['1.1875rem', { lineHeight: '1.55rem' }], // 19
        xl: ['1.5rem', { lineHeight: '1.75rem' }], // 24
        '2xl': ['1.875rem', { lineHeight: '2rem' }], // 30
        '3xl': ['3rem', { lineHeight: '2.85rem' }], // 48
        '4xl': ['4.75rem', { lineHeight: '4.25rem' }], // 76
      },
      colors: {
        blotter: { DEFAULT: '#D5DBD3', deep: '#C7CEC4', tray: '#CBD2C8' },
        card: '#FBFCF8',
        ink: { DEFAULT: '#18211C', soft: '#3A4640' },
        graphite: '#5B6861',
        rule: '#B4BDB2',
        cobalt: { DEFAULT: '#1856E8', deep: '#1043BC', wash: '#DCE6FD' },
        // Workflow colours, like coloured folder tabs: one per board column.
        status: {
          todo: '#4D5F86',
          'todo-wash': '#DCE3F0',
          progress: '#B26B00',
          'progress-wash': '#F4E2BC',
          review: '#6C46C2',
          'review-wash': '#E5DCF6',
          done: '#2E7D4F',
          'done-wash': '#D3EADA',
        },
        prio: { low: '#6B7A72', medium: '#3F6FD8', high: '#DD6416', urgent: '#D7362B' },
        alarm: { DEFAULT: '#D7362B', wash: '#F6D9D5' },
        marker: '#E4F04A',
        // Teammate inks (also used for avatars + live attribution).
        person: {
          cobalt: '#2B3FD6',
          magenta: '#B8327F',
          moss: '#2E7D4F',
          ochre: '#B97500',
          violet: '#6A3FC8',
          teal: '#0F7C86',
        },
      },
      borderRadius: {
        card: '3px',
        tray: '10px',
      },
      boxShadow: {
        // Paper on a desk: a hard 1px contact edge plus a short, cool cast.
        paper: '0 1px 0 #B4BDB2, 0 2px 6px -3px rgba(24,33,28,0.25)',
        lifted: '0 1px 0 #B4BDB2, 0 22px 40px -18px rgba(24,33,28,0.45)',
        inset: 'inset 0 1px 2px rgba(24,33,28,0.12)',
      },
      keyframes: {
        'marker-swipe': {
          '0%': { backgroundSize: '0% 58%' },
          '100%': { backgroundSize: '100% 58%' },
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      animation: {
        'marker-swipe': 'marker-swipe 520ms cubic-bezier(.2,.8,.2,1) forwards',
        blink: 'blink 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
