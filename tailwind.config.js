/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        urgency: {
          low: '#06A77D',
          medium: '#F77F00',
          high: '#E63946',
        },
        primary: {
          500: '#1F77B4',
          600: '#1A5F8F',
        },
        text: {
          dark: '#2C3E50',
          gray: '#7F8C8D',
        },
        brand: {
          lightBg: '#ECF0F1',
          white: '#FFFFFF',
          errorLight: '#FADBD8',
          successLight: '#D5F4E6',
          warningLight: '#FEF3C7',
        }
      },
      borderRadius: {
        'button': 8,
        'card': 12,
      }
    },
  },
  plugins: [],
}