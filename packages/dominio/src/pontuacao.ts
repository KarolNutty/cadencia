import type { Agendamento, Avaliacao } from './agendamento';
import { type DiaDeEstudo, diasEntre } from './dia-de-estudo';

/**
 * Pontuação, ofensiva e ranking.
 *
 * A regra que organiza tudo aqui é uma só:
 *
 * > **Ponto não se ganha por volume.**
 *
 * Parece detalhe de produto e é decisão de engenharia. Dar ponto por carta
 * avaliada faz o aluno marcar "fácil" trinta vezes e liderar o ranking sem ter
 * estudado, e, pior, ensina exatamente o comportamento que destrói o
 * agendamento dele, porque marcar fácil no que não se sabe manda a carta para
 * daqui a dois meses.
 *
 * O sistema de pontos não pode premiar o que o produto existe para evitar.
 */

/** Só carta que estava vencida vale ponto. */
const XP_POR_ACERTO = 10;

/** Acertar de primeira uma carta que já tinha sido esquecida vale mais. */
const XP_BONUS_RECUPERACAO = 5;

/**
 * Teto diário.
 *
 * Sem ele, quem tem uma tarde livre passa na frente de quem estuda vinte
 * minutos todo dia, e o ranking passaria a medir tempo disponível, não
 * constância. O teto é o que faz a ofensiva valer mais que a maratona.
 */
export const TETO_DIARIO_DE_XP = 200;

export interface RevisaoPontuavel {
  avaliacao: Avaliacao;
  /** O agendamento **antes** da revisão. */
  agendamentoAnterior: Agendamento;
}

/**
 * Quanto uma revisão vale.
 *
 * Zero para carta que não estava vencida: revisar adiantado é livre, mas não
 * rende, senão bastaria abrir o baralho inteiro toda hora.
 */
export function xpDaRevisao(revisao: RevisaoPontuavel, dia: DiaDeEstudo): number {
  const vencida = diasEntre(revisao.agendamentoAnterior.venceEm, dia) >= 0;
  if (!vencida) return 0;

  // Errar não tira ponto: punir o erro empurra o aluno a marcar "bom" no que
  // não sabe, e aí o agendamento passa a mentir.
  if (revisao.avaliacao === 'errei') return 0;

  const recuperada = revisao.agendamentoAnterior.lapsos > 0;

  return XP_POR_ACERTO + (recuperada ? XP_BONUS_RECUPERACAO : 0);
}

/** O total do dia, já com o teto aplicado. */
export function xpDoDia(
  revisoes: readonly RevisaoPontuavel[],
  dia: DiaDeEstudo,
  xpJaGanhoHoje = 0,
): number {
  const bruto = revisoes.reduce((soma, revisao) => soma + xpDaRevisao(revisao, dia), 0);
  const espaco = Math.max(0, TETO_DIARIO_DE_XP - xpJaGanhoHoje);

  return Math.min(bruto, espaco);
}

/**
 * O nível do aluno a partir do XP acumulado.
 *
 * A escala cresce, mas não explode: dobrar a cada nível faria o aluno ficar
 * preso no quinto por meses. Aqui cada nível pede um pouco mais que o anterior,
 * de forma que subir continue acontecendo enquanto ele estuda.
 */
export function nivelDeXp(xpTotal: number): {
  nivel: number;
  atual: number;
  proximo: number;
} {
  let nivel = 1;
  let acumulado = 0;
  let passo = 100;

  while (acumulado + passo <= xpTotal) {
    acumulado += passo;
    nivel += 1;
    passo = Math.round(passo * 1.35);
  }

  return { nivel, atual: xpTotal - acumulado, proximo: passo };
}

export interface Ofensiva {
  dias: number;
  /** A pessoa ainda pode estudar hoje e manter a sequência? */
  emRisco: boolean;
  /** O recorde já alcançado. */
  recorde: number;
}

/**
 * A ofensiva: dias seguidos de estudo.
 *
 * Estudou hoje, a ofensiva está garantida. Estudou ontem mas ainda não hoje,
 * ela está **em risco**, e é esse aviso que o produto precisa dar, não o número
 * cru. Faltou ontem e hoje, zerou.
 */
export function calcularOfensiva(
  diasEstudados: readonly DiaDeEstudo[],
  hoje: DiaDeEstudo,
): Ofensiva {
  const conjunto = new Set(diasEstudados);

  const estudouHoje = conjunto.has(hoje);
  const ontem = deslocar(hoje, -1);
  const estudouOntem = conjunto.has(ontem);

  let dias = 0;
  let cursor = estudouHoje ? hoje : estudouOntem ? ontem : null;

  while (cursor !== null && conjunto.has(cursor)) {
    dias += 1;
    cursor = deslocar(cursor, -1);
  }

  return {
    dias,
    // Em risco só faz sentido quando existe uma sequência para perder.
    emRisco: !estudouHoje && dias > 0,
    recorde: maiorSequencia(conjunto),
  };
}

function deslocar(dia: DiaDeEstudo, passo: number): DiaDeEstudo {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + passo);
  return data.toISOString().slice(0, 10) as DiaDeEstudo;
}

function maiorSequencia(dias: ReadonlySet<string>): number {
  let maior = 0;

  for (const dia of dias) {
    // Só conta a partir do início de cada sequência: sem isto, uma sequência de
    // trinta dias seria percorrida trinta vezes.
    if (dias.has(deslocar(dia as DiaDeEstudo, -1))) continue;

    let tamanho = 0;
    let cursor: DiaDeEstudo | null = dia as DiaDeEstudo;

    while (cursor !== null && dias.has(cursor)) {
      tamanho += 1;
      cursor = deslocar(cursor, 1);
    }

    maior = Math.max(maior, tamanho);
  }

  return maior;
}

export interface LinhaDoRanking {
  alunoId: string;
  nome: string;
  xpNaSemana: number;
  ofensiva: number;
}

export interface PosicaoNoRanking extends LinhaDoRanking {
  posicao: number;
  /** Empate recebe a mesma posição. */
  empatado: boolean;
}

/**
 * Ordena o ranking da semana.
 *
 * **Da semana, e não de sempre.** Um ranking acumulado desde o começo trava:
 * quem entrou depois nunca alcança, e quem lidera pode parar de estudar sem
 * perder o topo. Reiniciar toda semana devolve a chance a todo mundo, que é o
 * único jeito de um ranking motivar em vez de desanimar.
 */
export function ordenarRanking(linhas: readonly LinhaDoRanking[]): PosicaoNoRanking[] {
  const ordenadas = [...linhas].sort((a, b) => {
    if (b.xpNaSemana !== a.xpNaSemana) return b.xpNaSemana - a.xpNaSemana;
    // Desempate pela ofensiva: constância vale mais que um dia bom.
    if (b.ofensiva !== a.ofensiva) return b.ofensiva - a.ofensiva;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return ordenadas.map((linha, indice) => {
    const anterior = ordenadas[indice - 1];
    const proximo = ordenadas[indice + 1];

    const mesmoQueAnterior = anterior?.xpNaSemana === linha.xpNaSemana;
    const mesmoQueProximo = proximo?.xpNaSemana === linha.xpNaSemana;

    return {
      ...linha,
      // Empate mantém a posição do primeiro do grupo.
      posicao: mesmoQueAnterior
        ? ordenadas.findIndex((outra) => outra.xpNaSemana === linha.xpNaSemana) + 1
        : indice + 1,
      empatado: Boolean(mesmoQueAnterior || mesmoQueProximo),
    };
  });
}
