module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    jest: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'semi': ['error', 'always'],
    'quotes': ['warn', 'single'],
    'indent': ['warn', 2],
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-undef': 'error',
    'no-duplicate-imports': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'client/',
    'data/'
  ]
};
