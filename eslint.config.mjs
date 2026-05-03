import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import stylistic from '@stylistic/eslint-plugin'

export default defineConfig([
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  stylistic.configs.recommended,
  globalIgnores(['dist/**']),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['off'],
      '@stylistic/max-statements-per-line': ['error', { max: 2 }],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
