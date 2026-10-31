import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**', 'coverage/**', 'test/fixtures/**', 'site/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    printWidth: 100,
    ignorePatterns: [
      'dist/**',
      'coverage/**',
      'test/fixtures/**',
      'test/**/__snapshots__/**',
      'site/**',
      'pageslens.config.schema.json',
      'package-lock.json',
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
  pack: {
    entry: ['src/bin.ts'],
    format: ['esm'],
    platform: 'node',
    sourcemap: true,
  },
});
