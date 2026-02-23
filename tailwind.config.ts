import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  darkMode: 'selector',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
      colors: {
        page: 'rgb(var(--color-bg-page) / <alpha-value>)',
        surface: 'rgb(var(--color-bg-surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-bg-surface-elevated) / <alpha-value>)',
        header: 'rgb(var(--color-bg-header) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        content: 'rgb(var(--color-text) / <alpha-value>)',
        'content-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        'content-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--color-accent-hover) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
