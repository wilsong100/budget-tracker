import { defineConfig, type ViteUserConfig as UserConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Three build targets from one codebase (see docs/PLAN.md, Architecture):
//   web      dist/web/          the hosted app at /budget-planner/
//   offline  dist/offline/budget.html  one self-contained file for Etsy, no sync
//   premium  dist/premium/premium.js   the sync module, served by the decision-tools Worker
export const WEB_BASE = '/budget-planner/';

export default defineConfig(({ mode }): UserConfig => {
  if (mode === 'premium') {
    return {
      publicDir: false,
      build: {
        outDir: 'dist/premium',
        emptyOutDir: true,
        lib: {
          entry: 'src/sync/index.ts',
          formats: ['es'],
          fileName: () => 'premium.js',
        },
      },
    };
  }

  if (mode === 'offline') {
    return {
      base: './',
      publicDir: false,
      plugins: [
        preact(),
        viteSingleFile(),
        {
          name: 'rename-offline-html',
          enforce: 'post',
          generateBundle(_options, bundle) {
            const page = bundle['index.html'];
            if (page) {
              page.fileName = 'budget.html';
            }
          },
        },
      ],
      build: { outDir: 'dist/offline', emptyOutDir: true },
    };
  }

  // web, development and test
  return {
    base: WEB_BASE,
    plugins: [preact()],
    build: { outDir: 'dist/web', emptyOutDir: true },
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        include: ['src/domain/**'],
        exclude: ['src/**/*.test.ts', 'src/domain/__fixtures__/**', 'src/domain/index.ts'],
        // CLAUDE.md: src/domain is fully unit-tested.
        thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  };
});
