module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Remove project reference to avoid TSConfig parsing issues with test files
  },
  rules: {
    // Disable conflicting base ESLint rules in favor of TypeScript versions
    'no-unused-vars': 'off',
    'no-undef': 'off',
    'no-redeclare': 'off',
    
    // TypeScript-specific rules (replacing @typescript-eslint/recommended)
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-inferrable-types': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-empty-function': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // General code quality rules
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',
  },
  overrides: [
    {
      // Less strict rules for test files
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-console': 'off',
      },
    },
  ],
};