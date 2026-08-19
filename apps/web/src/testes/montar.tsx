import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Cliente } from '@cadencia/cliente-api';
import { ProvedorDeSessao } from '@/provedores/sessao';
import { ProvedorDeTema } from '@/provedores/tema';

/**
 * Monta um componente com os provedores que a aplicação usa.
 *
 * Existe para o teste não precisar saber quais provedores existem. Cada vez que
 * um novo entra na raiz, todo teste que montava a árvore à mão quebra de uma
 * vez, e o erro fala do provedor, não da tela que está sendo testada.
 */
export function montarComProvedores(conteudo: ReactNode, cliente: Cliente) {
  const consultas = new QueryClient({
    // Sem retentativa: um teste que falha não deve esperar três tentativas para
    // dizer isso.
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={consultas}>
      <ProvedorDeTema>
        <ProvedorDeSessao clienteDeTeste={cliente}>{conteudo}</ProvedorDeSessao>
      </ProvedorDeTema>
    </QueryClientProvider>,
  );
}
