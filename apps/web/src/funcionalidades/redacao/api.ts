import type {
  FilaDeRedacoesSaida,
  Nivel,
  RedacaoSaida,
  TemasSaida,
} from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarTemas = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<TemasSaida>(`/redacoes/temas?turmaId=${encodeURIComponent(turmaId)}`);

export const enviarRedacao = (cliente: Cliente, temaId: string, texto: string) =>
  cliente.chamar<RedacaoSaida>('/redacoes', {
    metodo: 'POST',
    corpo: { temaId, texto },
  });

export const buscarMinhaRedacao = (cliente: Cliente, temaId: string) =>
  cliente.chamar<RedacaoSaida>(`/redacoes/minha?temaId=${encodeURIComponent(temaId)}`);

export const criarTema = (
  cliente: Cliente,
  turmaId: string,
  titulo: string,
  enunciado: string,
  nivel: Nivel,
) =>
  cliente.chamar<{ id: string }>(`/turmas/${turmaId}/temas`, {
    metodo: 'POST',
    corpo: { titulo, enunciado, nivel },
  });

export const buscarFilaDeRedacoes = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<FilaDeRedacoesSaida>(`/turmas/${turmaId}/redacoes`);

export const buscarRedacao = (cliente: Cliente, redacaoId: string) =>
  cliente.chamar<RedacaoSaida>(`/redacoes/${redacaoId}`);

export const enviarParecer = (
  cliente: Cliente,
  redacaoId: string,
  parecer: string,
  nota: number | null,
) =>
  cliente.chamar<void>(`/redacoes/${redacaoId}/parecer`, {
    metodo: 'POST',
    corpo: { parecer, nota },
  });

/** ----------------------------------------------------------- conversa */
