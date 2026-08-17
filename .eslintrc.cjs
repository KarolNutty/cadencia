module.exports = {
  root: true,
  env: { es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    eqeqeq: ['error', 'always'],
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // App e painel usam JSX; o painel roda no navegador.
      files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
      env: { es2022: true, browser: true },
      parserOptions: { ecmaFeatures: { jsx: true } },
      rules: {
        // `console.warn` no app vai para o log do dispositivo, que ninguém lê.
        'no-console': 'error',
      },
    },
    {
      // O domínio não pode conhecer HTTP, banco nem framework. Se um dia
      // alguém importar o contrato aqui, o build quebra — e é isso que mantém
      // a regra de negócio testável sem infraestrutura nenhuma.
      files: ['packages/dominio/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cadencia/*', 'zod', 'fastify', 'pg', 'react*'],
                message:
                  'O domínio é puro: sem contrato, sem framework, sem I/O. Se precisa disto, o código não pertence aqui.',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    '*.cjs',
    // Configuração do Metro e do Babel roda em CommonJS por exigência das
    // ferramentas, e não por escolha. Aplicar a regra de import de módulo aqui
    // seria cobrar de um arquivo o que ele não pode cumprir.
    'apps/mobile/metro.config.js',
    'apps/mobile/babel.config.js',
  ],
};
