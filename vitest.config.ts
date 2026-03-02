import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/WBM/**/*.ts'],
      exclude: [
        'src/WBM/index.ts',
        'src/WBM/core/types.ts',
        'src/WBM/infra/**',
        'src/WBM/ui/**',
      ],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 70,
        statements: 90,
      },
    },
  },
});
