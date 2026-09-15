import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'surface-canvas': '#000000',
        'surface-card': '#050811',
        'surface-elevated': '#0d1322',
        'border-hard': '#1e293b',
        'accent-gain': '#10b981',
        'accent-loss': '#f43f5e',
        'accent-cyan': '#06b6d4',
        'text-primary': '#f1f5f9',
        'text-secondary': '#64748b',
        'text-muted': '#334155',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
        sans: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '1px',
        md: '3px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
      },
      boxShadow: {
        hard: '1px 1px 0 #1e293b',
        'hard-gain': '0 0 0 1px #10b981',
        'hard-loss': '0 0 0 1px #f43f5e',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        scan: 'scan 1.5s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
