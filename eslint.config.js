import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // src/domain is pure: no DOM, no storage, no network (CLAUDE.md).
    files: ['src/domain/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'fetch',
        'XMLHttpRequest',
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Calendar days must come from ISO date strings in Europe/London, never Date getters.
          selector:
            'CallExpression[callee.property.name=/^(get|getUTC)(Date|Day|Month|FullYear|Hours)$/]',
          message: 'Use the ISO date helpers in src/domain, not Date getters, for calendar days.',
        },
      ],
    },
  },
  prettier,
);
