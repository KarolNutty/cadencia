import { type Agendamento } from './agendamento';
import { type DiaDeEstudo, ehAnteriorOuIgual, somarDias } from './dia-de-estudo';

export interface CartaAgendada {
  cartaoId: string;
  agendamento: Agendamento;
}

export interface OpcoesSessao {
  /** Teto de cartas por sessão. */
  limite?: number;
  /** Cartas sinalizadas continuam na sessão? Padrão: não. */
  incluirSinalizadas?: boolean;
}

/**
 * Quantas cartas de uma vez.
 *
 * Vinte é o que cabe numa espera de ônibus. Uma sessão que não termina é uma
 * sessão que o aluno abandona no meio, e abandonar ensina que o app é um peso.
 */
export const LIMITE_PADRAO_DA_SESSAO = 20;

/**
 * Monta a sessão de hoje.
 *
 * A ordem não é aleatória: o mais atrasado vem primeiro. Se o aluno só tem
 * tempo para metade da sessão, a metade que ele fez é a que estava mais perto
 * de ser esquecida.
 */
export function montarSessao(
  cartas: readonly CartaAgendada[],
  hoje: DiaDeEstudo,
  opcoes: OpcoesSessao = {},
): CartaAgendada[] {
  const { limite = LIMITE_PADRAO_DA_SESSAO, incluirSinalizadas = false } = opcoes;

  const vencidas = cartas.filter((carta) => {
    if (!incluirSinalizadas && carta.agendamento.sinalizado) return false;
    return ehAnteriorOuIgual(carta.agendamento.venceEm, hoje);
  });

  const ordenadas = [...vencidas].sort((a, b) => {
    // Mais atrasada primeiro.
    const porVencimento = a.agendamento.venceEm.localeCompare(b.agendamento.venceEm);
    if (porVencimento !== 0) return porVencimento;

    // Empate: a que o aluno mais erra vem antes.
    const porLapso = b.agendamento.lapsos - a.agendamento.lapsos;
    if (porLapso !== 0) return porLapso;

    // Desempate estável, para a ordem não mudar entre aberturas.
    return a.cartaoId.localeCompare(b.cartaoId);
  });

  return ordenadas.slice(0, limite);
}

export interface ResumoDoAluno {
  vencendoHoje: number;
  sinalizadas: number;
  emDia: number;
  total: number;
}

export function resumirAluno(
  cartas: readonly CartaAgendada[],
  hoje: DiaDeEstudo,
): ResumoDoAluno {
  let vencendoHoje = 0;
  let sinalizadas = 0;

  for (const { agendamento } of cartas) {
    if (agendamento.sinalizado) {
      sinalizadas += 1;
      continue;
    }
    if (ehAnteriorOuIgual(agendamento.venceEm, hoje)) vencendoHoje += 1;
  }

  return {
    vencendoHoje,
    sinalizadas,
    emDia: cartas.length - vencendoHoje - sinalizadas,
    total: cartas.length,
  };
}

/**
 * Dias seguidos de estudo, contando para trás a partir de hoje.
 *
 * Não ter estudado **hoje** ainda não quebra a sequência: o dia não acabou. Só
 * a ausência de ontem quebra. Zerar a sequência às 4h da manhã de quem estudou
 * todos os dias seria punir por causa do relógio.
 */
export function sequenciaDeDias(
  diasEstudados: readonly DiaDeEstudo[],
  hoje: DiaDeEstudo,
): number {
  const conjunto = new Set<string>(diasEstudados);
  if (conjunto.size === 0) return 0;

  // Reusa a aritmética de dias em vez de repetir a conta aqui. Data duplicada
  // em dois lugares é onde bug de calendário nasce: um lado é corrigido e o
  // outro fica para trás.
  let cursor: DiaDeEstudo = conjunto.has(hoje) ? hoje : somarDias(hoje, -1);
  let total = 0;

  while (conjunto.has(cursor)) {
    total += 1;
    cursor = somarDias(cursor, -1);
  }

  return total;
}
