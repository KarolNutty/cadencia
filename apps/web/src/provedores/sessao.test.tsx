// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FalhaDaApi, type Cliente } from '@cadencia/cliente-api';
import { ProvedorDeSessao, useSessao } from '@/provedores/sessao';

/**
 * Retomada de sessão.
 *
 * O token de acesso vive só em memória, que é a escolha certa contra script
 * injetado, e memória some no recarregamento. Sem retomar a sessão pelo cookie
 * de renovação, essa escolha custaria um logout a cada F5, e alguém acabaria
 * trocando o token para `localStorage` "porque estava deslogando".
 */

function Espiao() {
  const { usuario, carregando } = useSessao();

  if (carregando) return <span>carregando</span>;
  return <span>{usuario ? usuario.nome : 'sem sessão'}</span>;
}

function montar(cliente: Cliente) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProvedorDeSessao clienteDeTeste={cliente}>
        <Espiao />
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
}

const HELENA = {
  id: 'p1',
  nome: 'Helena Prado',
  email: 'helena@escola.com.br',
  papel: 'professor' as const,
  fuso: 'America/Sao_Paulo',
};

describe('ao abrir a página', () => {
  it('recupera a sessão quando o cookie ainda vale', async () => {
    const cliente = {
      chamar: vi.fn(async () => ({ usuario: HELENA })),
    } as unknown as Cliente;

    montar(cliente);

    expect(await screen.findByText('Helena Prado')).toBeTruthy();
    expect(cliente.chamar).toHaveBeenCalledWith('/eu');
  });

  it('mostra o carregamento antes de decidir', () => {
    // Mostrar a entrada aqui faria a tela piscar a cada recarregamento para
    // quem já está autenticado.
    const cliente = {
      chamar: vi.fn(() => new Promise(() => {})),
    } as unknown as Cliente;

    montar(cliente);

    expect(screen.getByText('carregando')).toBeTruthy();
  });

  it('sem cookie válido, cai para a tela de entrada em silêncio', async () => {
    // Não é erro: é a primeira visita de alguém.
    const cliente = {
      chamar: vi.fn(async () => {
        throw new FalhaDaApi(401, {
          codigo: 'nao_autenticado',
          mensagem: 'Entre para continuar.',
        });
      }),
    } as unknown as Cliente;

    montar(cliente);

    await waitFor(() => expect(screen.getByText('sem sessão')).toBeTruthy());
  });

  it('falha de rede também termina o carregamento', async () => {
    // Sem o `finally`, a tela ficaria presa nos pontinhos para sempre.
    const cliente = {
      chamar: vi.fn(async () => {
        throw new Error('sem rede');
      }),
    } as unknown as Cliente;

    montar(cliente);

    await waitFor(() => expect(screen.queryByText('carregando')).toBeNull());
  });
});
