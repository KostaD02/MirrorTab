import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  tseslint.configs.strictTypeChecked,
  {
    ignores: [
      'dist',
      'node_modules',
      'vite.config.ts',
      'eslint.config.ts',
      'manifest.config.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
]);
