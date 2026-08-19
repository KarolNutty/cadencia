import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { BarreiraDeErro } from '@/componentes/BarreiraDeErro';
import { ProvedorDeSessao } from '@/provedores/sessao';
import { ProvedorDeTema } from '@/provedores/tema';
import './estilos.css';

const consultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <BarreiraDeErro>
      <QueryClientProvider client={consultas}>
        <ProvedorDeTema>
          <ProvedorDeSessao>
            <App />
          </ProvedorDeSessao>
        </ProvedorDeTema>
      </QueryClientProvider>
    </BarreiraDeErro>
  </StrictMode>,
);
