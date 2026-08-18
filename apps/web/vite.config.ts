import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@cadencia/cliente-api': resolve(
        __dirname,
        '../../packages/cliente-api/src/index.ts',
      ),
      '@cadencia/contrato': resolve(__dirname, '../../packages/contrato/src/index.ts'),
      '@cadencia/dominio': resolve(__dirname, '../../packages/dominio/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // O CORS da API só autoriza esta origem; mudar a porta aqui exige mudar
    // ORIGENS_PERMITIDAS lá, e o erro seria uma requisição bloqueada pelo
    // navegador sem explicação óbvia.
    strictPort: true,
  },
});
