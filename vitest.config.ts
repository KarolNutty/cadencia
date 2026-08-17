import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@cadencia/cliente-api': resolve(__dirname, 'packages/cliente-api/src/index.ts'),
  '@cadencia/config': resolve(__dirname, 'packages/config/src/index.ts'),
  '@cadencia/contrato': resolve(__dirname, 'packages/contrato/src/index.ts'),
  '@cadencia/dominio': resolve(__dirname, 'packages/dominio/src/index.ts'),
};

/**
 * Duas suítes separadas de propósito.
 *
 * `npm test` roda só o que não precisa de infraestrutura — e por isso roda em
 * qualquer máquina, em segundos, sem Docker. Os testes de integração exigem o
 * Postgres do `docker compose` e ficam em `npm run test:integracao`.
 *
 * Misturar as duas faria alguém sem Docker ver falha vermelha num código que
 * está correto, e o hábito que nasce daí é ignorar teste vermelho.
 */
export default defineConfig({
  // O plugin do React é necessário para os testes de componente do painel: sem
  // ele, o JSX dos arquivos .tsx não é transformado.
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    environment: 'node',
    include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['{apps,packages}/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/index.ts', '**/principal.tsx'],
    },
  },
});
