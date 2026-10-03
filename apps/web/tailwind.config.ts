import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--cf-bg-base)',
        surface: {
          1: 'var(--cf-bg-surface-1)',
          2: 'var(--cf-bg-surface-2)',
          hover: 'var(--cf-bg-surface-hover)',
        },
        text: {
          primary: 'var(--cf-text-primary)',
          secondary: 'var(--cf-text-secondary)',
          muted: 'var(--cf-text-muted)',
        },
        accent: {
          DEFAULT: 'var(--cf-accent-primary)',
          hover: 'var(--cf-accent-hover)',
        },
        border: 'var(--cf-border)',
        success: 'var(--cf-success)',
        warning: 'var(--cf-warning)',
        danger: 'var(--cf-danger)',
        info: 'var(--cf-info)',
      },
      borderRadius: {
        sm: 'var(--cf-radius-sm)',
        md: 'var(--cf-radius-md)',
        lg: 'var(--cf-radius-lg)',
      },
      fontFamily: {
        sans: ['var(--cf-font-sans)'],
        mono: ['var(--cf-font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
