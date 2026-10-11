/** @type {import('tailwindcss').Config} */
const { tailwindThemeColors } = require('./config/theme.cjs');

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tailwindThemeColors(),
      // Sticker aisle look: Atkinson Hyperlegible Next for everything read, Bagel Fat One for titles and stickers.
      fontFamily: {
        sans: ['Atkinson Hyperlegible Next', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Bagel Fat One', 'Atkinson Hyperlegible Next', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '2xl': '18px', '3xl': '24px' },
    },
  },
  plugins: [],
};
