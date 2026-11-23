// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  // Type-aware rules, e.g. no-floating-promises and no-unsafe-*.
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // _-prefixed args are required by a signature, e.g. Express's
          // 4-argument error handler.
          argsIgnorePattern: '^_',
          // Lets `const { type, ...rest } = obj` drop a field.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // node:test's describe/it return promises the runner tracks itself.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
  {
    // This config file isn't part of the TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Last, so it switches off any rule that would fight Prettier.
  prettier,
);
