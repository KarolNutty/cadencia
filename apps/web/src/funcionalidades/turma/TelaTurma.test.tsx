// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '@cadencia/cliente-api';
import { ProvedorDeSessao } from '../../compartilhado/sessao';
import { TelaTurma } from './TelaTurma';

/**
 * A tela é exercitada de verdade, com um cliente falso no lugar da rede.
 *
 * O que está sob teste é o que o professor **vê**: a ordem da lista, o rótulo
 * de cada situação e a navegação para o detalhe. A regra de ordenação já tem
 * teste próprio em `leitura.test.ts`; aqui a pergunta é se a tela usa a regra.
 */

const ALUNOS = {
  alunos: [
    {
      usuario: {
        id: 'a1',
        nome: 'Ana Souza',
        email: 'ana@escola.com.br',
        papel: 'aluno' as const,
        fuso: 'America/Sao_Paulo',
      },
      ultimoEstudo: new Date().toISOString().slice(0, 10),
      sequenciaDeDias: 5,
      vencendoHoje: 0,
      sinalizadas: 0,
    },
    {
      usuario: {
        id: 'b2',
        nome: 'Bruno Lima',
        email: 'bruno@escola.com.br',
        papel: 'aluno' as const,
        fuso: 'America/Sao_Paulo',
      },
      ultimoEstudo: new Date().toISOString().slice(0, 10),
      sequenciaDeDias: 2,
      vencendoHoje: 4,
      sinalizadas: 3,
    },
  ],
};

function clienteFalso(respostas: Record<string, unknown>): Cliente {
  // O padrão mais específico vence, como num roteador de verdade. Casar pelo
  // primeiro prefixo encontrado faz `/turmas/t1/alunos/b2/sinalizadas` bater em
  // `/turmas/` e devolver a resposta errada — e o teste acusa o componente por
  // um defeito que está no dublê.
  const padroes = Object.keys(respostas).sort((a, b) => b.length - a.length);

  return {
    chamar: vi.fn(async (caminho: string) => {
      const chave = padroes.find((padrao) => caminho.startsWith(padrao));
      if (!chave) throw new Error(`sem resposta preparada para ${caminho}`);
      return respostas[chave];
    }),
  } as unknown as Cliente;
}

function montar(cliente: Cliente) {
  const consultas = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={consultas}>
      <ProvedorDeSessao clienteDeTeste={cliente}>
        <TelaTurma />
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
}

const RESPOSTAS = {
  '/turmas/': ALUNOS,
  '/turmas': { turmas: [{ id: 't1', nome: 'Inglês A1', idioma: 'ingles' }] },
};

afterEach(() => vi.clearAllMocks());

describe('painel da turma', () => {
  it('mostra o nome da turma e os alunos', async () => {
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText('Inglês A1')).toBeTruthy();
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
  });

  it('põe quem tem palavra travada no topo, e não em ordem alfabética', async () => {
    // "Ana" viria antes de "Bruno" no alfabeto. A lista não é um cadastro: é
    // uma fila de quem precisa de atenção.
    montar(clienteFalso(RESPOSTAS));

    await screen.findByText('Bruno Lima');

    const linhas = screen.getAllByRole('row').slice(1);
    expect(within(linhas[0]!).getByText('Bruno Lima')).toBeTruthy();
  });

  it('destaca a quantidade de palavras travadas', async () => {
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText('Travado · 3')).toBeTruthy();
  });

  it('abre a lista de dois números como o resumo do dia', async () => {
    montar(clienteFalso(RESPOSTAS));

    // O número que abre a tela é o de travados, e não o de matriculados: total
    // é dado de cadastro, travado muda o que o professor faz na aula.
    expect(await screen.findByText('1')).toBeTruthy();
    expect(screen.getByText(/aluno com palavra travada/)).toBeTruthy();
  });

  it('usa tabela de verdade, para leitor de tela e teclado funcionarem', async () => {
    montar(clienteFalso(RESPOSTAS));

    await screen.findByText('Ana Souza');

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('abre o detalhe ao clicar no nome', async () => {
    const cliente = clienteFalso({
      ...RESPOSTAS,
      '/turmas/t1/alunos/b2/sinalizadas': {
        aluno: ALUNOS.alunos[1]!.usuario,
        cartas: [
          {
            cartao: { id: 'c1', frente: 'though', verso: 'embora', dica: null },
            lapsos: 5,
            ultimaRevisao: new Date().toISOString().slice(0, 10),
          },
        ],
      },
    });

    montar(cliente);

    await usuario.click(await screen.findByText('Bruno Lima'));

    expect(await screen.findByText('Palavras travadas')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('though')).toBeTruthy());
    expect(screen.getByText('5 erros')).toBeTruthy();
  });

  it('avisa quando a turma não tem aluno', async () => {
    montar(
      clienteFalso({
        '/turmas/': { alunos: [] },
        '/turmas': { turmas: [{ id: 't1', nome: 'Inglês A1', idioma: 'ingles' }] },
      }),
    );

    expect(await screen.findByText(/Nenhum aluno matriculado/)).toBeTruthy();
  });
});
