import love from 'eslint-config-love'
import stylistic from '@stylistic/eslint-plugin'

const tsFiles = ['**/*.ts']

export default [
  // FORMATTING RULES
  {
    ...stylistic.configs.recommended,
    files: tsFiles
  },
  {
    files: tsFiles,
    rules: {
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/indent': 'off', // too buggy when using decorators
      '@stylistic/max-statements-per-line': ['error', { max: 3 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/type-generic-spacing': 'error'
    }
  },
  // STRUCTURAL RULES
  {
    ...love,
    files: tsFiles
  },
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.eslint.json'
      }
    },
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/class-methods-use-this': 'off',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }], // disallow <string> casting, confusing vs generics
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/max-params': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowEmpty: true }],
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off', // too noisy with defensive coding and any-typed values
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', // often load-bearing at call boundaries; autofix breaks compilation
      '@typescript-eslint/no-unsafe-argument': 'off', // dosgato passes any (DB rows, GraphQL inputs, templating data) pervasively
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-destructuring': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreConditionalTests: true, ignorePrimitives: { bigint: false, boolean: false, number: false, string: true } }],
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowAny: true }],
      '@typescript-eslint/return-await': ['error', 'always'], // avoid accidentally breaking async stacktraces in node 14+
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off', // method refs passed as comparators/callbacks are invoked immediately, not detached
      'arrow-body-style': 'off', // allow `{ return ... }` to control line width
      complexity: 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'max-depth': 'off',
      'max-lines': 'off',
      'max-nested-callbacks': 'off',
      'new-cap': 'off',
      'no-await-in-loop': 'off',
      'no-console': 'off', // server-side logging is intentional
      'no-negated-condition': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'prefer-named-capture-group': 'off',
      'prefer-template': 'off',
      'preserve-caught-error': 'off',
      'promise/avoid-new': 'off',
      'require-atomic-updates': 'off',
      'require-unicode-regexp': 'off'
    }
  },
  // RELAXED RULES FOR TEST FILES
  {
    files: ['testserver/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off'
    }
  }
]
