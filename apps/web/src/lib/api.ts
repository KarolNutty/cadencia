import type {
  BaralhosSaida,
  EnviarRevisoesSaida,
  ImportarPalavrasSaida,
  MatricularSaida,
  MinhasTurmasSaida,
  Nivel,
  PontuacaoSaida,
  ProximaPerguntaSaida,
  RankingSaida,
  ResponderNivelamentoSaida,
  SessaoSaida,
  Turma,
} from '@cadencia/contrato';
import type { Avaliacao, DiaDeEstudo } from '@cadencia/dominio';
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

/** ------------------------------------------------------------- estudo */

export const buscarSessao = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<SessaoSaida>(
    `/estudo/sessao?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );

/**
 * Sobe o lote inteiro ao fim da sessão.
 *
 * Vinte requisições numa conexão instável é o caminho para metade se perder. O
 * `loteId` torna o reenvio seguro: se a resposta se perder na volta, a segunda
 * tentativa manda o mesmo identificador e o servidor reconhece que já
 * processou, em vez de duplicar o histórico.
 */
export const enviarRevisoes = (
  cliente: Cliente,
  turmaId: string,
  loteId: string,
  revisoes: readonly { cartaoId: string; avaliacao: Avaliacao; dia: DiaDeEstudo }[],
) =>
  cliente.chamar<EnviarRevisoesSaida>('/estudo/revisoes', {
    metodo: 'POST',
    corpo: { turmaId, loteId, revisoes },
  });

/** `crypto.randomUUID` é padrão do navegador desde 2021; não precisa de pacote. */
export const novoLoteId = (): string => crypto.randomUUID();

/** -------------------------------------------------------- nivelamento */

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

export const buscarPontuacao = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<PontuacaoSaida>(
    `/pontuacao?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );

export const buscarRanking = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<RankingSaida>(
    `/pontuacao/ranking?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );
