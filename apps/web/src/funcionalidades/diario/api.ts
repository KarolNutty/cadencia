import type {
  AulasDaTurmaSaida,
  FrequenciaDaTurmaSaida,
  MinhasAulasSaida,
  RegistrarAulaEntrada,
} from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarAulas = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<AulasDaTurmaSaida>(`/turmas/${turmaId}/aulas`);

export const registrarAula = (
  cliente: Cliente,
  turmaId: string,
  aula: RegistrarAulaEntrada,
) =>
  cliente.chamar<{ id: string }>(`/turmas/${turmaId}/aulas`, {
    metodo: 'POST',
    corpo: aula,
  });

export const buscarFrequencia = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<FrequenciaDaTurmaSaida>(`/turmas/${turmaId}/frequencia`);

export const buscarMinhasAulas = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<MinhasAulasSaida>(`/minhas-aulas?turmaId=${encodeURIComponent(turmaId)}`);
