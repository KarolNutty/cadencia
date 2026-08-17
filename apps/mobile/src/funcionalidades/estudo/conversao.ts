import type { CartaDaSessao as CartaDoContrato } from '@cadencia/contrato';
import type { Cartao } from '@cadencia/contrato';
import { type Agendamento, diaDeEstudo } from '@cadencia/dominio';

/**
 * A fronteira entre o que vem da rede e o que o domínio aceita.
 *
 * O contrato descreve o **formato do fio**, onde uma data é só texto. O domínio
 * usa um tipo marcado, que só existe se tiver passado pela validação. Os dois
 * são propositalmente diferentes: é o que impede uma string qualquer virar dia
 * de estudo no meio de um cálculo.
 *
 * Esta conversão é onde a marca é aplicada — e onde uma data inválida vinda do
 * servidor estoura na porta de entrada, e não três telas adiante.
 */

export interface CartaParaEstudar {
  cartao: Cartao;
  agendamento: Agendamento;
}

export function paraEstudar(bruta: CartaDoContrato): CartaParaEstudar {
  return {
    cartao: bruta.cartao,
    agendamento: {
      intervaloDias: bruta.agendamento.intervaloDias,
      facilidade: bruta.agendamento.facilidade,
      repeticoes: bruta.agendamento.repeticoes,
      lapsos: bruta.agendamento.lapsos,
      // Valida e marca. Data impossível vinda do servidor lança aqui.
      venceEm: diaDeEstudo(bruta.agendamento.venceEm),
      sinalizado: bruta.agendamento.sinalizado,
    },
  };
}
