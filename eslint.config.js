import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'node_modules/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      // Security: never build DOM from HTML strings. External data must go in via textContent.
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: 'Do not assign HTML strings (XSS risk). Build nodes with the h() helper / textContent.',
        },
        {
          selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]",
          message: 'Do not inject HTML strings (XSS risk). Build nodes with the h() helper / textContent.',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
