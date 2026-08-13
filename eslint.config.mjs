// NOTE ON DEVIATION FROM THE PLAN:
// The plan (docs/plans/framework-setup-plan.md §7) specifies `.eslintrc.cjs`.
// The installed `eslint` version (10.x) no longer supports the legacy
// eslintrc format at all — ESLint 9+ requires "flat config"
// (https://eslint.org/docs/latest/use/configure/migration-guide). This file
// is the flat-config equivalent: same plugins/rules intent
// (`@typescript-eslint` recommended + `eslint-plugin-playwright` recommended
// + `eslint-config-prettier` last to disable stylistic conflicts), just in
// the config format the installed tooling actually loads.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'reports/**',
      'blob-report/**',
      'dist/**',
      'build/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  prettierConfig,
];
