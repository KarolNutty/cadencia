import type {
  BaralhosSaida,
  ImportarPalavrasSaida,
  MatricularSaida,
  MinhasTurmasSaida,
  Nivel,
  Turma,
} from '@cadencia/contrato';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarTurmas = (cliente: Cliente) =>
  cliente.chamar<MinhasTurmasSaida>('/turmas');

export const criarTurma = (cliente: Cliente, nome: string, idioma: string) =>
  cliente.chamar<Turma>('/turmas', { metodo: 'POST', corpo: { nome, idioma } });

export const arquivarTurma = (cliente: Cliente, turmaId: string) =>
  cliente.chamar<void>(`/turmas/${turmaId}`, { metodo: 'DELETE' });

export const matricular = (cliente: Cliente, turmaId: string, email: string) =>
  cliente.chamar<MatricularSaida>(`/turmas/${turmaId}/matriculas`, {
    metodo: 'POST',
    corpo: { email },
  });

export const desmatricular = (cliente: Cliente, turmaId: string, alunoId: string) =>
  cliente.chamar<void>(`/turmas/${turmaId}/matriculas/${alunoId}`, { metodo: 'DELETE' });

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

export const destravarPalavra = (
  cliente: Cliente,
  turmaId: string,
  alunoId: string,
  cartaoId: string,
) =>
  cliente.chamar<void>(`/turmas/${turmaId}/alunos/${alunoId}/destravar/${cartaoId}`, {
    metodo: 'POST',
  });
