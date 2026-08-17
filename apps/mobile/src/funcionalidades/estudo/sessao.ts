import {
  type Agendamento,
  type Avaliacao,
  type DiaDeEstudo,
  agendar,
} from '@cadencia/dominio';
import type { CartaParaEstudar } from './conversao';

/**
 * A sessão de estudo, como estado puro.
 *
 * **Aqui está a tese do projeto.** Quando o aluno avalia uma carta, o próximo
 * agendamento é calculado **neste aparelho**, chamando o mesmo
 * `packages/dominio` que o servidor chama. A tela responde na hora — o aluno
 * avalia trinta cartas em três minutos, e esperar a rede a cada uma destruiria
 * o ritmo do estudo.
 *
 * O servidor recalcula ao receber o lote, e a resposta dele é a autoridade. Como
 * é o mesmo módulo importado, e não a mesma regra escrita duas vezes, os dois
 * não têm como divergir.
 *
 * Sendo função pura, isto é testável sem renderizar tela nenhuma — e o teste
 * roda em Node, junto com o resto.
 */

export interface RevisaoLocal {
  cartaoId: string;
  avaliacao: Avaliacao;
  dia: DiaDeEstudo;
  /** O que o app calculou. Serve para mostrar "volta em X dias" na hora. */
  agendamento: Agendamento;
}

export interface EstadoDaSessao {
  cartas: readonly CartaParaEstudar[];
  indice: number;
  /** O verso está à mostra? */
  revelada: boolean;
  revisoes: readonly RevisaoLocal[];
  dia: DiaDeEstudo;
}

export function iniciarSessao(
  cartas: readonly CartaParaEstudar[],
  dia: DiaDeEstudo,
): EstadoDaSessao {
  return { cartas, indice: 0, revelada: false, revisoes: [], dia };
}

export function cartaAtual(estado: EstadoDaSessao): CartaParaEstudar | null {
  return estado.cartas[estado.indice] ?? null;
}

export function terminou(estado: EstadoDaSessao): boolean {
  return estado.indice >= estado.cartas.length;
}

export function revelar(estado: EstadoDaSessao): EstadoDaSessao {
  if (terminou(estado) || estado.revelada) return estado;
  return { ...estado, revelada: true };
}

/**
 * Avalia a carta e avança.
 *
 * Avaliar sem ter revelado o verso não é permitido: sem ver a resposta, o aluno
 * não tem como saber se acertou, e o agendamento sairia de um palpite.
 */
export function avaliar(estado: EstadoDaSessao, avaliacao: Avaliacao): EstadoDaSessao {
  const carta = cartaAtual(estado);
  if (!carta || !estado.revelada) return estado;

  const agendamento = agendar(carta.agendamento, avaliacao, estado.dia);

  return {
    ...estado,
    indice: estado.indice + 1,
    revelada: false,
    revisoes: [
      ...estado.revisoes,
      { cartaoId: carta.cartao.id, avaliacao, dia: estado.dia, agendamento },
    ],
  };
}

export interface ProgressoDaSessao {
  feitas: number;
  total: number;
  restantes: number;
  /** De 0 a 1, para a barra de progresso. */
  fracao: number;
}

export function progresso(estado: EstadoDaSessao): ProgressoDaSessao {
  const total = estado.cartas.length;
  const feitas = Math.min(estado.indice, total);

  return {
    feitas,
    total,
    restantes: total - feitas,
    fracao: total === 0 ? 1 : feitas / total,
  };
}

export interface ResumoDaSessao {
  total: number;
  acertos: number;
  erros: number;
  /** Quantas cartas voltam já amanhã. */
  voltamAmanha: number;
}

export function resumir(estado: EstadoDaSessao): ResumoDaSessao {
  const erros = estado.revisoes.filter((revisao) => revisao.avaliacao === 'errei').length;

  return {
    total: estado.revisoes.length,
    acertos: estado.revisoes.length - erros,
    erros,
    voltamAmanha: estado.revisoes.filter(
      (revisao) => revisao.agendamento.intervaloDias <= 1,
    ).length,
  };
}

/**
 * Como a tela anuncia o próximo encontro com a carta.
 *
 * Números crus ("intervalo: 1") não dizem nada a quem está estudando. E "volta
 * em 1 dia" é pior que "amanhã" — a pessoa faz a conta que o app podia ter
 * feito.
 */
export function quandoVolta(agendamento: Agendamento): string {
  const dias = agendamento.intervaloDias;

  if (dias <= 1) return 'amanhã';
  if (dias < 7) return `em ${dias} dias`;
  if (dias < 30) {
    const semanas = Math.round(dias / 7);
    return semanas === 1 ? 'em 1 semana' : `em ${semanas} semanas`;
  }

  const meses = Math.round(dias / 30);
  return meses === 1 ? 'em 1 mês' : `em ${meses} meses`;
}

/**
 * O lote pronto para subir.
 *
 * O `agendamento` calculado localmente **não** é enviado: quem decide o estado
 * final é o servidor. Mandá-lo abriria a porta para o cliente escolher os
 * próprios intervalos — e um aluno com o app modificado marcaria tudo como
 * sabido para sempre.
 */
export function loteParaEnvio(
  estado: EstadoDaSessao,
): { cartaoId: string; avaliacao: Avaliacao; dia: DiaDeEstudo }[] {
  return estado.revisoes.map((revisao) => ({
    cartaoId: revisao.cartaoId,
    avaliacao: revisao.avaliacao,
    dia: revisao.dia,
  }));
}
