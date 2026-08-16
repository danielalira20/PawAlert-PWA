// .eslintrc.js
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['/dist/*', '/.expo/*', '/node_modules/*', '/e2e/*'],
  rules: {
    // Apagamos estas reglas temporales para no bloquearte mientras
    // refactorizas código antiguo.
    '@typescript-eslint/no-explicit-any': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
};