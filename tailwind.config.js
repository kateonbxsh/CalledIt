/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#121417',
        line: '#d9ded8',
        field: '#f7f8f4',
        mint: '#2f7d63',
        coral: '#d95f46',
        citrus: '#d49a25',
        sky: '#3b75af',
        plum: '#7b5aa6',
        aqua: '#2c9c94',
      },
      boxShadow: {
        soft: '0 2px 12px rgba(18, 20, 23, 0.07), 0 1px 3px rgba(18, 20, 23, 0.04)',
        lift: '0 8px 28px rgba(18, 20, 23, 0.12), 0 2px 6px rgba(18, 20, 23, 0.06)',
        card: '0 1px 4px rgba(18, 20, 23, 0.06)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      fontSize: {
        '2xs': ['11px', '16px'],
      },
    },
  },
  plugins: [],
};
