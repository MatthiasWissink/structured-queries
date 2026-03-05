import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    typecheck: {
      enabled: true,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
