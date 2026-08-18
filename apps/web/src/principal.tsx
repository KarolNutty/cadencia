import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { ProvedorDeSessao } from '@/providers/sessao';
import './estilos.css';

const consultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </QueryClientProvider>
  </StrictMode>,
);
