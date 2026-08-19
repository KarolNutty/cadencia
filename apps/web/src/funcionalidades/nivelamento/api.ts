import type { ProximaPerguntaSaida, ResponderNivelamentoSaida } from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarProximaPergunta = (cliente: Cliente) =>
  cliente.chamar<ProximaPerguntaSaida>('/nivelamento/proxima');

export const responderNivelamento = (
  cliente: Cliente,
  perguntaId: string,
  escolha: number,
) =>
  cliente.chamar<ResponderNivelamentoSaida>('/nivelamento/responder', {
    metodo: 'POST',
    corpo: { perguntaId, escolha },
  });

/** ---------------------------------------------------------- pontuação */
