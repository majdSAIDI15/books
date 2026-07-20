/** @type {import('tailwindcss').Config} */
export default {
  // Par défaut Tailwind applique la stratégie `media` : les variantes `dark:`
  // du panneau de notes s'activaient selon les préférences système, alors que
  // tout le reste de l'application reste clair — panneau sombre sur fond clair
  // (§2.14). En stratégie `class`, elles n'agissent que sous un ancêtre `.dark`,
  // donc jamais aujourd'hui. Un vrai thème sombre pourra les réactiver d'un coup.
  darkMode: 'class',
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

