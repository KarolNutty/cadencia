import type {
  ConversaSaida,
  FalarSaida,
  MinhasConversasSaida,
  Nivel,
} from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarConversas = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<MinhasConversasSaida>(`/conversas?turmaId=${encodeURIComponent(turmaId)}`);

export const comecarConversa = (
  cliente: Cliente,
  turmaId: string,
  cenario: string,
  nivel: Nivel,
) =>
  cliente.chamar<ConversaSaida>('/conversas', {
    metodo: 'POST',
    corpo: { turmaId, cenario, nivel },
  });

export const buscarConversa = (cliente: Cliente, conversaId: string) =>
  cliente.chamar<ConversaSaida>(`/conversas/${conversaId}`);

/** Só a mensagem nova sobe: o histórico vive no servidor. */
export const falar = (cliente: Cliente, conversaId: string, mensagem: string) =>
  cliente.chamar<FalarSaida>(`/conversas/${conversaId}/falas`, {
    metodo: 'POST',
    corpo: { mensagem },
  });
