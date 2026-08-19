// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '@cadencia/cliente-api';
import { TelaConversa } from '@/funcionalidades/conversa/TelaConversa';
import { Estrutura } from '@/componentes/Estrutura';
import { montarComProvedores } from '@/testes/montar';

/**
 * A rolagem da conversa.
 *
 * Numa sala de mensagens, o cabeçalho e o campo de escrever ficam parados e só
 * as falas correm. Isso exige desligar a rolagem da página, e desligar a
 * rolagem da página exige religá-la ao sair, senão o resto do aplicativo trava
 * e o defeito aparece numa tela que não tem nada a ver com esta.
 */

const TURMA = { id: 't1', nome: 'Inglês B1', idioma: 'ingles' };

function clienteCom(conversas: unknown[]) {
  return {
    chamar: vi.fn(async (caminho: string) => {
      if (caminho.startsWith('/turmas')) return { turmas: [TURMA] };
      if (caminho.startsWith('/conversas?')) return { conversas };
      return {};
    }),
  } as unknown as Cliente;
}

function montar(cliente: Cliente) {
  return montarComProvedores(
    <Estrutura secao="conversa" aoTrocarSecao={() => {}}>
      <TelaConversa />
    </Estrutura>,
    cliente,
  );
}

afterEach(() => {
  document.documentElement.classList.remove('sem-rolagem');
});

describe('rolagem da página', () => {
  it('a lista de conversas deixa a página rolar normalmente', async () => {
    montar(clienteCom([]));

    await waitFor(() => expect(screen.getByText('Pratique conversando')).toBeTruthy());

    expect(document.documentElement.classList.contains('sem-rolagem')).toBe(false);
  });

  it('dentro de uma conversa, a página para de rolar', async () => {
    const cliente = {
      chamar: vi.fn(async (caminho: string) => {
        if (caminho.startsWith('/turmas')) return { turmas: [TURMA] };
        if (caminho.startsWith('/conversas?')) {
          return {
            conversas: [
              {
                id: 'c1',
                cenario: 'no aeroporto',
                nivel: 'B1',
                falas: 2,
                encerrada: false,
              },
            ],
          };
        }
        return {
          id: 'c1',
          cenario: 'no aeroporto',
          nivel: 'B1',
          falas: [],
          restantes: 40,
        };
      }),
    } as unknown as Cliente;

    montar(cliente);

    await usuario.click(await screen.findByRole('button', { name: 'Continuar' }));

    await waitFor(() =>
      expect(document.documentElement.classList.contains('sem-rolagem')).toBe(true),
    );
  });

  it('sair da conversa devolve a rolagem', async () => {
    // Sem isto, o aplicativo inteiro fica travado depois de uma conversa, e
    // ninguém liga o defeito à tela que o causou.
    const cliente = {
      chamar: vi.fn(async (caminho: string) => {
        if (caminho.startsWith('/turmas')) return { turmas: [TURMA] };
        if (caminho.startsWith('/conversas?')) {
          return {
            conversas: [
              {
                id: 'c1',
                cenario: 'no aeroporto',
                nivel: 'B1',
                falas: 2,
                encerrada: false,
              },
            ],
          };
        }
        return { id: 'c1', cenario: 'no aeroporto', nivel: 'B1', falas: [], restantes: 40 };
      }),
    } as unknown as Cliente;

    montar(cliente);

    await usuario.click(await screen.findByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(document.documentElement.classList.contains('sem-rolagem')).toBe(true),
    );

    await usuario.click(screen.getByRole('button', { name: /Voltar/ }));

    await waitFor(() =>
      expect(document.documentElement.classList.contains('sem-rolagem')).toBe(false),
    );
  });
});
