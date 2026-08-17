import { describe, expect, it } from 'vitest';
import type { TurmaDoProfessor } from '@cadencia/contrato';
import { diaDeEstudo } from '@cadencia/dominio';
import {
  DIAS_PARA_SUMIR,
  desdeQuando,
  ordenarPorPrioridade,
  resumirTurma,
  situacaoDo,
} from './leitura';

const HOJE = diaDeEstudo('2026-08-16');

type Aluno = TurmaDoProfessor['alunos'][number];

function aluno(nome: string, ajustes: Partial<Omit<Aluno, 'usuario'>> = {}): Aluno {
  return {
    usuario: {
      id: nome,
      nome,
      email: `${nome}@escola.com.br`,
      papel: 'aluno',
      fuso: 'America/Sao_Paulo',
    },
    ultimoEstudo: '2026-08-16',
    sequenciaDeDias: 3,
    vencendoHoje: 0,
    sinalizadas: 0,
    ...ajustes,
  };
}

describe('situação do aluno', () => {
  it('carta travada vem antes de tudo', () => {
    // É a única situação em que o PROFESSOR precisa agir. As outras o aluno
    // resolve sozinho estudando.
    expect(situacaoDo(aluno('a', { sinalizadas: 2, vencendoHoje: 10 }), HOJE)).toBe(
      'travado',
    );
  });

  it('quem não estuda há uma semana sumiu', () => {
    const antigo = aluno('a', { ultimoEstudo: '2026-08-09' });
    expect(situacaoDo(antigo, HOJE)).toBe('sumido');
  });

  it('seis dias ainda não é sumido', () => {
    // O limite existe para não alarmar por causa de um fim de semana estendido.
    expect(situacaoDo(aluno('a', { ultimoEstudo: '2026-08-10' }), HOJE)).toBe('em_dia');
    expect(DIAS_PARA_SUMIR).toBe(7);
  });

  it('quem nunca estudou conta como sumido', () => {
    expect(situacaoDo(aluno('a', { ultimoEstudo: null }), HOJE)).toBe('sumido');
  });

  it('com cartas vencendo, está atrasado', () => {
    expect(situacaoDo(aluno('a', { vencendoHoje: 5 }), HOJE)).toBe('atrasado');
  });

  it('sem nada pendente, está em dia', () => {
    expect(situacaoDo(aluno('a'), HOJE)).toBe('em_dia');
  });
});

describe('ordem do painel', () => {
  it('põe travado, sumido, atrasado e em dia, nessa ordem', () => {
    const lista = [
      aluno('Em dia'),
      aluno('Atrasado', { vencendoHoje: 3 }),
      aluno('Sumido', { ultimoEstudo: '2026-07-01' }),
      aluno('Travado', { sinalizadas: 1 }),
    ];

    expect(ordenarPorPrioridade(lista, HOJE).map((a) => a.usuario.nome)).toEqual([
      'Travado',
      'Sumido',
      'Atrasado',
      'Em dia',
    ]);
  });

  it('entre travados, quem tem mais cartas presas vem antes', () => {
    const lista = [aluno('Uma', { sinalizadas: 1 }), aluno('Cinco', { sinalizadas: 5 })];

    expect(ordenarPorPrioridade(lista, HOJE)[0]?.usuario.nome).toBe('Cinco');
  });

  it('a ordem é estável entre recargas', () => {
    // Sem o desempate por nome, dois alunos iguais trocariam de lugar a cada
    // atualização e a lista pareceria instável.
    const lista = [aluno('Beatriz'), aluno('Ana')];

    expect(ordenarPorPrioridade(lista, HOJE)).toEqual(
      ordenarPorPrioridade([...lista].reverse(), HOJE),
    );
  });

  it('não altera a lista recebida', () => {
    const lista = [aluno('B'), aluno('A')];
    const antes = lista.map((a) => a.usuario.nome);

    ordenarPorPrioridade(lista, HOJE);

    expect(lista.map((a) => a.usuario.nome)).toEqual(antes);
  });
});

describe('resumo da turma', () => {
  it('conta cada situação', () => {
    const lista = [
      aluno('a', { sinalizadas: 1 }),
      aluno('b', { ultimoEstudo: null }),
      aluno('c', { vencendoHoje: 2 }),
      aluno('d'),
    ];

    expect(resumirTurma(lista, HOJE)).toEqual({
      total: 4,
      travados: 1,
      sumidos: 1,
      emDia: 1,
    });
  });

  it('turma vazia não quebra', () => {
    expect(resumirTurma([], HOJE).total).toBe(0);
  });
});

describe('como a data é escrita', () => {
  it('traduz para linguagem de gente', () => {
    // "há 3 dias" responde a pergunta; "2026-08-13" obriga a fazer a conta.
    expect(desdeQuando('2026-08-16', HOJE)).toBe('hoje');
    expect(desdeQuando('2026-08-15', HOJE)).toBe('ontem');
    expect(desdeQuando('2026-08-13', HOJE)).toBe('há 3 dias');
    expect(desdeQuando('2026-08-08', HOJE)).toBe('há uma semana');
    expect(desdeQuando('2026-07-25', HOJE)).toBe('há 3 semanas');
    expect(desdeQuando('2026-06-01', HOJE)).toBe('há 3 meses');
    expect(desdeQuando(null, HOJE)).toBe('nunca estudou');
  });

  it('data no futuro não vira número negativo na tela', () => {
    // Acontece com aluno em fuso adiantado: para ele o dia já virou.
    expect(desdeQuando('2026-08-17', HOJE)).toBe('hoje');
  });
});
