import type { Papel } from '@cadencia/contrato';

/**
 * As seções do portal, por papel.
 *
 * **Isto é navegação, não segurança.** Esconder um item de menu não protege
 * nada: quem quiser é só chamar a rota direto. A proteção real está na API, que
 * confere o papel no token e a posse do recurso em cada consulta, e há testes
 * de integração provando os dois.
 *
 * O que este arquivo evita é outra coisa: um aluno entrar no portal e encontrar
 * a interface do professor pela frente, com botões que só devolvem erro.
 */

export const SECOES_DO_PROFESSOR = [
  { chave: 'aula', rotulo: 'Próxima aula', descricao: 'O que revisar' },
  { chave: 'alunos', rotulo: 'Alunos', descricao: 'Quem está na turma' },
  { chave: 'palavras', rotulo: 'Palavras', descricao: 'O conteúdo' },
  { chave: 'turmas', rotulo: 'Turmas', descricao: 'Criar e arquivar' },
  { chave: 'correcoes', rotulo: 'Redações', descricao: 'Temas e correção' },
  { chave: 'diario', rotulo: 'Diário', descricao: 'Aulas e presença' },
] as const;

export const SECOES_DO_ALUNO = [
  { chave: 'estudar', rotulo: 'Estudar', descricao: 'O que vence hoje' },
  { chave: 'progresso', rotulo: 'Progresso', descricao: 'Como você está indo' },
  { chave: 'ranking', rotulo: 'Ranking', descricao: 'A turma nesta semana' },
  { chave: 'redacao', rotulo: 'Redação', descricao: 'Escreva e receba retorno' },
  { chave: 'conversa', rotulo: 'Conversação', descricao: 'Pratique conversando' },
  { chave: 'aulas', rotulo: 'Aulas', descricao: 'Conteúdo e dever' },
  { chave: 'nivelamento', rotulo: 'Nivelamento', descricao: 'Descubra seu nível' },
] as const;

export type SecaoDoProfessor = (typeof SECOES_DO_PROFESSOR)[number]['chave'];
export type SecaoDoAluno = (typeof SECOES_DO_ALUNO)[number]['chave'];
export type Secao = SecaoDoProfessor | SecaoDoAluno;

export interface ItemDeMenu {
  chave: Secao;
  rotulo: string;
  descricao: string;
}

export function secoesDe(papel: Papel): readonly ItemDeMenu[] {
  return papel === 'professor' ? SECOES_DO_PROFESSOR : SECOES_DO_ALUNO;
}

export function secaoInicialDe(papel: Papel): Secao {
  return papel === 'professor' ? 'aula' : 'estudar';
}
