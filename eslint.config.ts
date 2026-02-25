import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true, // auto-detect tsconfig
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
]);
