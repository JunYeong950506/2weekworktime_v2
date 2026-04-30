/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      boxShadow: {
        soft: '0 10px 30px -12px rgba(15, 23, 42, 0.25)',
      },
    },
  },
  plugins: [],
};
