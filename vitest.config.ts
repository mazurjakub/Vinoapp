/**
 * File: vitest.config.ts
 * Created: 2026-10-02
 * Description: Vitest configuration: test environment, test file pattern, IndexedDB setup and no live network.
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setupIndexedDB.ts', './src/test/setupNoNetwork.ts'],
  },
})
