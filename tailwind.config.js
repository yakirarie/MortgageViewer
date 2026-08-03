/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme (default)
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          'surface-raised': 'var(--bg-surface-raised)',
        },
        border: {
          subtle: 'var(--border-subtle)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          warning: 'var(--accent-warning)',
          danger: 'var(--accent-danger)',
          info: 'var(--accent-info)',
        },
        track: {
          prime: 'var(--track-prime)',
          'fixed-unlinked': 'var(--track-fixed-unlinked)',
          'fixed-linked': 'var(--track-fixed-linked)',
          'variable-5y': 'var(--track-variable-5y)',
          'variable-5y-linked': 'var(--track-variable-5y-linked)',
          other: 'var(--track-other)',
        },
      },
    },
  },
  plugins: [],
}
