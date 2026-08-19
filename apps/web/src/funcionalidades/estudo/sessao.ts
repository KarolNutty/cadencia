import type { CartaDaSessao, Cartao } from '@cadencia/contrato';
import {
  type Agendamento,
  type Avaliacao,
  type DiaDeEstudo,
  agendar,
  diaDeEstudo,
} from '@cadencia/dominio';

/**
 * A sessão de estudo, como estado puro.
 *
 * **Aqui está a tese do projeto.** Quando o aluno avalia uma carta, o próximo
 * agendamento é calculado **neste navegador**, chamando o mesmo
 * `packages/dominio` que o servidor chama. A tela responde na hora, quem
 * avalia vinte cartas seguidas não pode esperar a rede a cada uma.
 *
 * O servidor recalcula ao receber o lote, e a resposta dele é a autoridade.
 * Como é o mesmo módulo importado, e não a mesma regra escrita duas vezes, os
 * dois não têm como divergir.
 */

export interface CartaParaEstudar {
  cartao: Cartao;
  agendamento: Agendamento;
}

/**
 * A fronteira entre o que vem da rede e o que o domínio aceita.
 *
 * O contrato descreve o formato do fio, onde data é só texto. O domínio usa um
 * tipo marcado, que só existe depois da validação, e é aqui que uma data
 * impossível vinda do servidor estoura, na porta de entrada, em vez de três
 * telas adiante.
 */
export function paraEstudar(bruta: CartaDaSessao): CartaParaEstudar {
  return {
    cartao: bruta.cartao,
    agendamento: {
      intervaloDias: bruta.agendamento.intervaloDias,
      facilidade: bruta.agendamento.facilidade,
      repeticoes: bruta.agendamento.repeticoes,
      lapsos: bruta.agendamento.lapsos,
      venceEm: diaDeEstudo(bruta.agendamento.venceEm),
      sinalizado: bruta.agendamento.sinalizado,
    },
  };
}

export interface RevisaoLocal {
  cartaoId: string;
  avaliacao: Avaliacao;
  dia: DiaDeEstudo;
  /** O que o app calculou, para mostrar "volta em 3 dias" na hora. */
  agendamento: Agendamento;
}

export interface EstadoDaSessao {
  cartas: readonly CartaParaEstudar[];
  indice: number;
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
 * Avalia e avança.
 *
 * Avaliar sem ter revelado não é permitido: sem ver a resposta, o aluno não
 * sabe se acertou, e o agendamento sairia de um palpite.
 */
export function avaliar(estado: EstadoDaSessao, avaliacao: Avaliacao): EstadoDaSessao {
  const carta = cartaAtual(estado);
  if (!carta || !estado.revelada) return estado;

  return {
    ...estado,
    indice: estado.indice + 1,
    revelada: false,
    revisoes: [
      ...estado.revisoes,
      {
        cartaoId: carta.cartao.id,
        avaliacao,
        dia: estado.dia,
        agendamento: agendar(carta.agendamento, avaliacao, estado.dia),
      },
    ],
  };
}

export function progresso(estado: EstadoDaSessao) {
  const total = estado.cartas.length;
  const feitas = Math.min(estado.indice, total);

  return { feitas, total, restantes: total - feitas };
}

export function resumir(estado: EstadoDaSessao) {
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
 * "volta em 1 dia" é pior que "amanhã", a pessoa faz a conta que o software
 * podia ter feito.
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
 * O agendamento calculado aqui **não** é enviado: quem decide o estado final é
 * o servidor. Mandá-lo abriria a porta para o cliente escolher os próprios
 * intervalos, e um navegador com o console aberto marcaria tudo como sabido
 * para sempre.
 */
export function loteParaEnvio(estado: EstadoDaSessao) {
  return estado.revisoes.map((revisao) => ({
    cartaoId: revisao.cartaoId,
    avaliacao: revisao.avaliacao,
    dia: revisao.dia,
  }));
}
