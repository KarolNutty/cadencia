import { describe, expect, it } from 'vitest';
import { type Agendamento, agendamentoNovo } from './agendamento';
import { type DiaDeEstudo, diaDeEstudo } from './dia-de-estudo';
import {
  type CartaAgendada,
  LIMITE_PADRAO_DA_SESSAO,
  montarSessao,
  resumirAluno,
  sequenciaDeDias,
} from './sessao';

const HOJE = diaDeEstudo('2026-08-16');

function carta(cartaoId: string, ajustes: Partial<Agendamento> = {}): CartaAgendada {
  return {
    cartaoId,
    agendamento: { ...agendamentoNovo(HOJE), ...ajustes },
  };
}

function dia(texto: string): DiaDeEstudo {
  return diaDeEstudo(texto);
}

describe('montar a sessão', () => {
  it('inclui só o que já venceu', () => {
    const sessao = montarSessao(
      [
        carta('vencida', { venceEm: dia('2026-08-10') }),
        carta('hoje', { venceEm: HOJE }),
        carta('amanha', { venceEm: dia('2026-08-17') }),
      ],
      HOJE,
    );

    expect(sessao.map((c) => c.cartaoId)).toEqual(['vencida', 'hoje']);
  });

  it('coloca a mais atrasada primeiro', () => {
    // Se o aluno só tem tempo para metade da sessão, a metade que ele fizer
    // precisa ser a que estava mais perto de ser esquecida.
    const sessao = montarSessao(
      [
        carta('recente', { venceEm: HOJE }),
        carta('antiga', { venceEm: dia('2026-07-01') }),
        carta('media', { venceEm: dia('2026-08-10') }),
      ],
      HOJE,
    );

    expect(sessao.map((c) => c.cartaoId)).toEqual(['antiga', 'media', 'recente']);
  });

  it('empate no vencimento é desfeito por quem o aluno mais erra', () => {
    const sessao = montarSessao(
      [
        carta('facil', { venceEm: HOJE, lapsos: 0 }),
        carta('dificil', { venceEm: HOJE, lapsos: 3 }),
      ],
      HOJE,
    );

    expect(sessao[0]?.cartaoId).toBe('dificil');
  });

  it('a ordem é estável entre aberturas', () => {
    // Sem o desempate final, duas cartas idênticas trocariam de lugar a cada
    // abertura, e o aluno sentiria o app "embaralhando" sozinho.
    const cartas = [carta('bbb', { venceEm: HOJE }), carta('aaa', { venceEm: HOJE })];

    expect(montarSessao(cartas, HOJE)).toEqual(montarSessao([...cartas].reverse(), HOJE));
  });

  it('respeita o limite da sessão', () => {
    const cartas = Array.from({ length: 40 }, (_, i) =>
      carta(`c${String(i).padStart(2, '0')}`, { venceEm: HOJE }),
    );

    expect(montarSessao(cartas, HOJE)).toHaveLength(LIMITE_PADRAO_DA_SESSAO);
    expect(montarSessao(cartas, HOJE, { limite: 5 })).toHaveLength(5);
  });

  it('deixa de fora as cartas sinalizadas', () => {
    // Elas já viraram assunto de aula. Continuar martelando o aluno com o que
    // ele não entendeu é o que faz alguém desistir do app.
    const sessao = montarSessao(
      [
        carta('normal', { venceEm: HOJE }),
        carta('sinalizada', { venceEm: HOJE, sinalizado: true }),
      ],
      HOJE,
    );

    expect(sessao.map((c) => c.cartaoId)).toEqual(['normal']);
  });

  it('mas permite incluí-las quando o professor pedir', () => {
    const sessao = montarSessao(
      [carta('sinalizada', { venceEm: HOJE, sinalizado: true })],
      HOJE,
      { incluirSinalizadas: true },
    );

    expect(sessao).toHaveLength(1);
  });

  it('devolve lista vazia quando não há nada a revisar', () => {
    const sessao = montarSessao([carta('futura', { venceEm: dia('2026-12-01') })], HOJE);
    expect(sessao).toEqual([]);
  });

  it('não altera a lista recebida', () => {
    const cartas = [carta('b', { venceEm: HOJE }), carta('a', { venceEm: HOJE })];
    const antes = cartas.map((c) => c.cartaoId);

    montarSessao(cartas, HOJE);

    expect(cartas.map((c) => c.cartaoId)).toEqual(antes);
  });
});

describe('resumo do aluno', () => {
  it('separa o que vence hoje, o que está em dia e o que foi sinalizado', () => {
    const resumo = resumirAluno(
      [
        carta('a', { venceEm: dia('2026-08-10') }),
        carta('b', { venceEm: HOJE }),
        carta('c', { venceEm: dia('2026-09-01') }),
        carta('d', { venceEm: HOJE, sinalizado: true }),
      ],
      HOJE,
    );

    expect(resumo).toEqual({ vencendoHoje: 2, sinalizadas: 1, emDia: 1, total: 4 });
  });

  it('carta sinalizada não conta como vencendo, mesmo estando vencida', () => {
    const resumo = resumirAluno(
      [carta('a', { venceEm: dia('2026-01-01'), sinalizado: true })],
      HOJE,
    );

    expect(resumo.vencendoHoje).toBe(0);
    expect(resumo.sinalizadas).toBe(1);
  });

  it('as partes sempre somam o total', () => {
    const cartas = [
      carta('a', { venceEm: dia('2026-08-01') }),
      carta('b', { venceEm: HOJE }),
      carta('c', { venceEm: dia('2026-10-01') }),
      carta('d', { venceEm: HOJE, sinalizado: true }),
      carta('e', { venceEm: dia('2026-09-09') }),
    ];

    const resumo = resumirAluno(cartas, HOJE);
    expect(resumo.vencendoHoje + resumo.emDia + resumo.sinalizadas).toBe(resumo.total);
  });

  it('lida com aluno sem nenhuma carta', () => {
    expect(resumirAluno([], HOJE)).toEqual({
      vencendoHoje: 0,
      sinalizadas: 0,
      emDia: 0,
      total: 0,
    });
  });
});

describe('sequência de dias', () => {
  it('conta dias seguidos até hoje', () => {
    const dias = ['2026-08-14', '2026-08-15', '2026-08-16'].map(dia);
    expect(sequenciaDeDias(dias, HOJE)).toBe(3);
  });

  it('não estudar hoje ainda não quebra a sequência', () => {
    // O dia não acabou. Zerar a sequência de quem estudou ontem, só porque
    // ainda não abriu o app hoje, é punir pelo relógio.
    const dias = ['2026-08-13', '2026-08-14', '2026-08-15'].map(dia);
    expect(sequenciaDeDias(dias, HOJE)).toBe(3);
  });

  it('faltar ontem quebra', () => {
    const dias = ['2026-08-12', '2026-08-13', '2026-08-14'].map(dia);
    expect(sequenciaDeDias(dias, HOJE)).toBe(0);
  });

  it('conta só o trecho seguido mais recente', () => {
    const dias = ['2026-08-01', '2026-08-02', '2026-08-15', '2026-08-16'].map(dia);
    expect(sequenciaDeDias(dias, HOJE)).toBe(2);
  });

  it('atravessa a virada do mês', () => {
    const dias = ['2026-07-30', '2026-07-31', '2026-08-01'].map(dia);
    expect(sequenciaDeDias(dias, diaDeEstudo('2026-08-01'))).toBe(3);
  });

  it('aluno que nunca estudou tem sequência zero', () => {
    expect(sequenciaDeDias([], HOJE)).toBe(0);
  });

  it('dias repetidos não inflam a contagem', () => {
    const dias = ['2026-08-16', '2026-08-16', '2026-08-15'].map(dia);
    expect(sequenciaDeDias(dias, HOJE)).toBe(2);
  });
});
