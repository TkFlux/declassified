import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f6f8',
          100: '#e8ecf0',
          200: '#cfd8e0',
          300: '#a8b8c6',
          400: '#7a93a8',
          500: '#5a7690',
          600: '#465e75',
          700: '#3a4d60',
          800: '#324251',
          900: '#2c3845',
          950: '#1a222b',
        },
        stamp: {
          red: '#b91c1c',
          amber: '#d97706',
          green: '#15803d',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
