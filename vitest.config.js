import { defineConfig } from 'vitest/config'

// https://vitest.dev/config/
export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'backend/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/validaciones.js', 'backend/cuotas.js'],
      reporter: ['text'],
    },
  },
})
