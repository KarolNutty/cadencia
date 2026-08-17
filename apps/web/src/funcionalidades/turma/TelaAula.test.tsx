// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cliente } from '@cadencia/cliente-api';
import { Estrutura } from '../../compartilhado/Estrutura';
import { ProvedorDeSessao } from '../../compartilhado/sessao';
import { TelaAula } from './TelaAula';

/**
 * A tela é exercitada de verdade, com um cliente falso no lugar da rede.
 *
 * O que está sob teste é o que o professor **vê**: quais palavras aparecem
 * primeiro, como o resumo é escrito e se o detalhe do aluno abre. A regra de
 * ordenação da turma tem teste próprio em `leitura.test.ts`.
 */

const HOJE = new Date().toISOString().slice(0, 10);

function aluno(id: string, nome: string, ajustes: Record<string, unknown> = {}) {
  return {
    usuario: {
      id,
      nome,
      email: `${id}@escola.com.br`,
      papel: 'aluno',
      fuso: 'America/Sao_Paulo',
    },
    ultimoEstudo: HOJE,
    sequenciaDeDias: 3,
    vencendoHoje: 0,
    sinalizadas: 0,
    ...ajustes,
  };
}

function palavra(frente: string, nomes: string[], erros = 8) {
  return {
    cartao: { id: frente, frente, verso: `tradução de ${frente}`, dica: null },
    alunos: nomes.length,
    errosTotais: erros,
    nomes,
  };
}

const RESPOSTAS = {
  '/turmas': { turmas: [{ id: 't1', nome: 'Inglês A1', idioma: 'ingles' }] },
  '/turmas/t1/alunos': {
    alunos: [
      aluno('a1', 'Ana Souza'),
      aluno('b2', 'Bruno Lima', { sinalizadas: 2, vencendoHoje: 4 }),
    ],
  },
  '/turmas/t1/palavras-travadas': {
    palavras: [
      palavra('though', ['Ana Souza', 'Bruno Lima', 'Carla Reis', 'Davi Nunes'], 21),
      palavra('awkward', ['Bruno Lima'], 5),
    ],
  },
};

function clienteFalso(respostas: Record<string, unknown>): Cliente {
  // O padrão mais específico vence, como num roteador de verdade. Casar pelo
  // primeiro prefixo faria `/turmas/t1/alunos` bater em `/turmas`.
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
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProvedorDeSessao clienteDeTeste={cliente}>
        <Estrutura secao="aula" aoTrocarSecao={() => {}}>
          <TelaAula aoAbrirAluno={() => {}} />
        </Estrutura>
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('a abertura', () => {
  it('nomeia a palavra que mais gente travou', async () => {
    // O professor abre isto com cinco minutos antes da aula. O título já é a
    // resposta, e não um rótulo genérico de painel.
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText(/4 alunos empacaram em/)).toBeTruthy();
  });

  it('conta quantos alunos estão travados, sem repetir quem aparece duas vezes', async () => {
    montar(clienteFalso(RESPOSTAS));

    // Bruno aparece nas duas palavras: são 4 alunos distintos, não 5.
    expect(await screen.findByText(/de 4 alunos/)).toBeTruthy();
  });

  it('quando nada travou, o texto convida em vez de mostrar zero', async () => {
    montar(
      clienteFalso({ ...RESPOSTAS, '/turmas/t1/palavras-travadas': { palavras: [] } }),
    );

    expect(await screen.findByText(/Nada travado por enquanto/)).toBeTruthy();
    expect(screen.getByText(/dando conta sozinha/)).toBeTruthy();
  });
});

describe('os verbetes', () => {
  it('mostra a palavra, a tradução e quem travou', async () => {
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText('though')).toBeTruthy();
    expect(screen.getByText('tradução de though')).toBeTruthy();
    expect(screen.getByText(/Ana, Bruno e mais 2/)).toBeTruthy();
  });

  it('com um aluno só, escreve o nome e o que houve', async () => {
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText('Bruno travou aqui')).toBeTruthy();
  });

  it('põe a palavra de mais gente primeiro', async () => {
    // A ordem vem do servidor, mas a tela não pode reordenar por conta própria.
    montar(clienteFalso(RESPOSTAS));

    await screen.findByText('though');

    // Buscar `listitem` na página inteira pegaria também os itens do menu
    // lateral. A lista tem nome acessível, o que resolve o teste e melhora a
    // leitura por leitor de tela.
    const verbetes = within(
      screen.getByRole('list', { name: /palavras travadas/i }),
    ).getAllByRole('listitem');

    expect(within(verbetes[0]!).getByText('though')).toBeTruthy();
  });

  it('marca com cor forte a palavra que muita gente travou', async () => {
    // A gravidade precisa ser vista de longe, sem ler número nenhum.
    montar(clienteFalso(RESPOSTAS));

    await screen.findByText('though');

    const verbetes = within(
      screen.getByRole('list', { name: /palavras travadas/i }),
    ).getAllByRole('listitem');

    expect(verbetes[0]!.className).toContain('verbete--critico');
    expect(verbetes[1]!.className).not.toContain('verbete--critico');
  });
});

describe('a turma na lateral', () => {
  it('lista os alunos com o estado de cada um', async () => {
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByText('Bruno Lima')).toBeTruthy();
    expect(screen.getByText('travado')).toBeTruthy();
  });

  it('o nome do aluno é um botão, para abrir o detalhe', async () => {
    // A navegação em si é responsabilidade do App; aqui basta garantir que a
    // tela oferece o caminho.
    montar(clienteFalso(RESPOSTAS));

    expect(await screen.findByRole('button', { name: /Bruno Lima/ })).toBeTruthy();
  });
});
