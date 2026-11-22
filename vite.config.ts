import type { Plugin } from 'vite';
import { defineConfig, type ViteUserConfig as UserConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Three build targets from one codebase (see docs/PLAN.md, Architecture):
//   web      dist/web/          the hosted app at /budget-planner/
//   offline  dist/offline/budget.html  one self-contained file for Etsy, no sync
//   premium  dist/premium/premium.js   the sync module, served by the decision-tools Worker
export const WEB_BASE = '/budget-planner/';

/**
 * The site's fonts (decision-tools DESIGN.md), loaded the same way as its other pages. Only the
 * hosted app gets them: the offline file must make no network requests, so it uses system fonts.
 */
function siteFonts(): Plugin {
  const href =
    'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap';
  return {
    name: 'site-fonts',
    transformIndexHtml: () => [
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        injectTo: 'head',
      },
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        injectTo: 'head',
      },
      { tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head' },
    ],
  };
}

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

  if (mode === 'harness') {
    // Test pages for Playwright and for looking at by hand. Never published.
    return {
      base: WEB_BASE,
      publicDir: false,
      plugins: [preact()],
      build: {
        outDir: 'dist/harness',
        emptyOutDir: true,
        rollupOptions: { input: { storage: 'dev/storage-harness.html' } },
      },
    };
  }

  // web, development and test
  return {
    base: WEB_BASE,
    plugins: [preact(), siteFonts()],
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
