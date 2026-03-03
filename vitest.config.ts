import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
        'src/WBM/bootstrap/**',
        'src/WBM/core/types.ts',
        'src/WBM/infra/**',
        'src/WBM/ui/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
