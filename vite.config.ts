import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base path so assets resolve correctly whether deployed at a custom
  // domain, root domain, or a GitHub Pages repository subdirectory
  // (https://<username>.github.io/<repo-name>/).
  base: './',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
})

