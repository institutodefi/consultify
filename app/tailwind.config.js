/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50:'#EEF2FA', 100:'#D8E0F2', 200:'#AFC0E3', 300:'#7E97CE', 400:'#4C6BB4', 500:'#2B4A93', 600:'#1B366F', 700:'#122A5C', 800:'#0A2A6C', 900:'#061B45' },
        brand: { orange:'#F5A623', orangeDark:'#E89313', cream:'#F4EFE5', ink:'#0A1530', muted:'#5B6680' },
      },
      fontFamily: { sans: ['Manrope','system-ui','sans-serif'], orbita: ['Rubik','Manrope','system-ui','sans-serif'] },
    },
  },
  plugins: [],
};
