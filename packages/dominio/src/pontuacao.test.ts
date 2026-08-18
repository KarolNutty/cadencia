import { describe, expect, it } from 'vitest';
import { agendamentoNovo, type Agendamento } from './agendamento';
import { diaDeEstudo } from './dia-de-estudo';
import {
  TETO_DIARIO_DE_XP,
  calcularOfensiva,
  nivelDeXp,
  ordenarRanking,
  xpDaRevisao,
  xpDoDia,
} from './pontuacao';

const HOJE = diaDeEstudo('2026-08-16');

function agendamento(ajustes: Partial<Agendamento> = {}): Agendamento {
  return { ...agendamentoNovo(HOJE), ...ajustes };
}

describe('XP não vem de volume', () => {
  it('carta vencida acertada rende ponto', () => {
    const xp = xpDaRevisao(
      { avaliacao: 'bom', agendamentoAnterior: agendamento({ venceEm: HOJE }) },
      HOJE,
    );

    expect(xp).toBeGreaterThan(0);
  });

  it('carta que ainda não venceu não rende nada', () => {
    // Senão bastaria abrir o baralho inteiro toda hora para subir no ranking.
    const xp = xpDaRevisao(
      {
        avaliacao: 'facil',
        agendamentoAnterior: agendamento({ venceEm: diaDeEstudo('2026-08-30') }),
      },
      HOJE,
    );

    expect(xp).toBe(0);
  });

  it('marcar "fácil" cem vezes não rende mais que o teto', () => {
    // É o teste que define a regra: quem tenta inflar o ranking marcando fácil
    // em tudo esbarra no limite do dia.
    const revisoes = Array.from({ length: 100 }, () => ({
      avaliacao: 'facil' as const,
      agendamentoAnterior: agendamento({ venceEm: HOJE }),
    }));

    expect(xpDoDia(revisoes, HOJE)).toBe(TETO_DIARIO_DE_XP);
  });

  it('errar não tira ponto', () => {
    // Punir o erro empurra o aluno a marcar "bom" no que não sabe, e aí o
    // agendamento passa a mentir.
    const xp = xpDaRevisao(
      { avaliacao: 'errei', agendamentoAnterior: agendamento({ venceEm: HOJE }) },
      HOJE,
    );

    expect(xp).toBe(0);
  });

  it('recuperar uma carta que já foi esquecida vale mais', () => {
    const comum = xpDaRevisao(
      { avaliacao: 'bom', agendamentoAnterior: agendamento({ venceEm: HOJE, lapsos: 0 }) },
      HOJE,
    );
    const recuperada = xpDaRevisao(
      { avaliacao: 'bom', agendamentoAnterior: agendamento({ venceEm: HOJE, lapsos: 2 }) },
      HOJE,
    );

    expect(recuperada).toBeGreaterThan(comum);
  });

  it('o teto considera o que já foi ganho antes no mesmo dia', () => {
    const revisoes = Array.from({ length: 50 }, () => ({
      avaliacao: 'bom' as const,
      agendamentoAnterior: agendamento({ venceEm: HOJE }),
    }));

    expect(xpDoDia(revisoes, HOJE, TETO_DIARIO_DE_XP - 30)).toBe(30);
    expect(xpDoDia(revisoes, HOJE, TETO_DIARIO_DE_XP)).toBe(0);
  });
});

describe('níveis', () => {
  it('começa no nível 1', () => {
    expect(nivelDeXp(0).nivel).toBe(1);
  });

  it('sobe conforme o XP acumula', () => {
    expect(nivelDeXp(100).nivel).toBe(2);
    expect(nivelDeXp(1000).nivel).toBeGreaterThan(3);
  });

  it('a exigência cresce, mas não explode', () => {
    // Dobrar a cada nível prenderia o aluno no quinto por meses.
    const quinto = nivelDeXp(2000);
    const decimo = nivelDeXp(20_000);

    expect(decimo.nivel).toBeGreaterThan(quinto.nivel);
    expect(decimo.nivel - quinto.nivel).toBeLessThan(12);
  });

  it('informa quanto falta para o próximo', () => {
    const estado = nivelDeXp(150);

    expect(estado.atual).toBe(50);
    expect(estado.proximo).toBeGreaterThan(estado.atual);
  });
});

describe('ofensiva', () => {
  it('conta os dias seguidos até hoje', () => {
    const dias = ['2026-08-14', '2026-08-15', '2026-08-16'].map(diaDeEstudo);
    expect(calcularOfensiva(dias, HOJE).dias).toBe(3);
  });

  it('quem estudou ontem e ainda não hoje está em risco', () => {
    // É o aviso que o produto precisa dar, não o número cru.
    const ofensiva = calcularOfensiva([diaDeEstudo('2026-08-15')], HOJE);

    expect(ofensiva.dias).toBe(1);
    expect(ofensiva.emRisco).toBe(true);
  });

  it('quem já estudou hoje não está em risco', () => {
    expect(calcularOfensiva([HOJE], HOJE).emRisco).toBe(false);
  });

  it('faltar dois dias zera', () => {
    const ofensiva = calcularOfensiva([diaDeEstudo('2026-08-10')], HOJE);

    expect(ofensiva.dias).toBe(0);
    expect(ofensiva.emRisco).toBe(false);
  });

  it('buraco no meio não conta como sequência', () => {
    const dias = ['2026-08-10', '2026-08-11', '2026-08-15', '2026-08-16'].map(diaDeEstudo);
    expect(calcularOfensiva(dias, HOJE).dias).toBe(2);
  });

  it('guarda o recorde mesmo depois de perder a sequência', () => {
    const dias = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-16'].map(
      diaDeEstudo,
    );

    const ofensiva = calcularOfensiva(dias, HOJE);

    expect(ofensiva.dias).toBe(1);
    expect(ofensiva.recorde).toBe(4);
  });

  it('sem nenhum dia estudado, tudo em zero', () => {
    expect(calcularOfensiva([], HOJE)).toEqual({ dias: 0, emRisco: false, recorde: 0 });
  });
});

describe('ranking', () => {
  const linhas = [
    { alunoId: 'a', nome: 'Ana', xpNaSemana: 120, ofensiva: 3 },
    { alunoId: 'b', nome: 'Bruno', xpNaSemana: 300, ofensiva: 1 },
    { alunoId: 'c', nome: 'Carla', xpNaSemana: 120, ofensiva: 7 },
  ];

  it('ordena por XP da semana', () => {
    expect(ordenarRanking(linhas)[0]?.nome).toBe('Bruno');
  });

  it('empate no XP desempata pela ofensiva', () => {
    // Constância vale mais que um dia bom.
    const ordenado = ordenarRanking(linhas);
    expect(ordenado[1]?.nome).toBe('Carla');
  });

  it('empatados recebem a mesma posição', () => {
    const empate = [
      { alunoId: 'a', nome: 'Ana', xpNaSemana: 100, ofensiva: 2 },
      { alunoId: 'b', nome: 'Bruno', xpNaSemana: 100, ofensiva: 2 },
    ];

    const ordenado = ordenarRanking(empate);

    expect(ordenado[0]?.posicao).toBe(1);
    expect(ordenado[1]?.posicao).toBe(1);
    expect(ordenado.every((linha) => linha.empatado)).toBe(true);
  });

  it('não altera a lista recebida', () => {
    const copia = [...linhas];
    ordenarRanking(linhas);
    expect(linhas).toEqual(copia);
  });

  it('turma vazia devolve lista vazia', () => {
    expect(ordenarRanking([])).toEqual([]);
  });
});
