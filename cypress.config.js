import { defineConfig } from 'cypress'
import { loadEnv } from 'vite'

// Mismo puerto que usa Vite (FRONTEND_PORT en .env).
const env = loadEnv('', process.cwd(), '')

// https://docs.cypress.io/app/references/configuration
export default defineConfig({
  e2e: {
    baseUrl: `http://localhost:${Number(env.FRONTEND_PORT) || 5173}`,
    supportFile: false,
  },
})
