import type { BaralhosSaida, ImportarPalavrasSaida, Nivel } from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarBaralhos = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<BaralhosSaida>(`/turmas/${turmaId}/baralhos`);

export const criarBaralho = (
  cliente: Cliente,
  turmaId: string,
  titulo: string,
  nivel: Nivel | null,
) =>
  cliente.chamar<{ id: string }>(`/turmas/${turmaId}/baralhos`, {
    metodo: 'POST',
    corpo: { titulo, nivel },
  });

export const importarPalavras = (cliente: Cliente, baralhoId: string, texto: string) =>
  cliente.chamar<ImportarPalavrasSaida>(`/baralhos/${baralhoId}/palavras`, {
    metodo: 'POST',
    corpo: { texto },
  });

export const apagarBaralho = (cliente: Cliente, baralhoId: string) =>
  cliente.chamar<void>(`/baralhos/${baralhoId}`, { metodo: 'DELETE' });
