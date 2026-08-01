import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'out', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/renderer/src/hooks/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      // Allow absolute imports from renderer src
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
})
