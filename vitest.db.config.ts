import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
