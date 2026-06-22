/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#534AB7',
          light: '#EEEDFE',
        },
        success: '#1D9E75',
        warning: '#BA7517',
        danger: '#E24B4A',
        bgMain: '#F8F7F4',
        textPrimary: '#2C2C2A',
        textSecondary: '#888780',
        cardBorder: '#E0DED6',
      },
      fontFamily: {
        arabic: ['"Noto Naskh Arabic"', 'sans-serif'],
      },
      borderRadius: {
        custom: '10px',
      },
    },
  },
  plugins: [],
}

