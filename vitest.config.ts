import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config()

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
    typecheck: { tsconfig: './tsconfig.test.json' },
  },
})
