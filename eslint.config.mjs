import promise from 'eslint-plugin-promise';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['docs/templates/', '**/node_modules/', 'types/', 'zk_artifacts', 'zk_compile', 'abi/'],
  },
  ...compat.extends('eslint:recommended', 'plugin:promise/recommended', 'prettier'),
  {
    plugins: {
      promise,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
        artifacts: 'readonly',
        contract: 'readonly',
        assert: 'readonly',
        web3: 'readonly',
      },

      parser: tsParser,
    },

    rules: {
      'no-unused-vars': 'off',
    },
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
  },
];
