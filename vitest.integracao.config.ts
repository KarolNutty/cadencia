import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Testes que exigem o Postgres real, subido pelo `docker compose`.
 *
 *   npm run banco:subir
 *   npm run test:integracao
 */
export default defineConfig({
  resolve: {
    alias: {
      '@cadencia/cliente-api': resolve(__dirname, 'packages/cliente-api/src/index.ts'),
      '@cadencia/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@cadencia/contrato': resolve(__dirname, 'packages/contrato/src/index.ts'),
      '@cadencia/dominio': resolve(__dirname, 'packages/dominio/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/*/testes/**/*.test.ts'],
    // Em série: os casos compartilham o mesmo banco e limpam as tabelas entre
    // si. Em paralelo, um TRUNCATE apagaria os dados do outro no meio.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
