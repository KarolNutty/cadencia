import type { Nivel } from './nivelamento';

/**
 * Prática de conversação.
 *
 * O modelo não guarda memória entre chamadas, então o histórico viaja junto a
 * cada mensagem. Isso tem custo direto: cada palavra reenviada é cobrada de
 * novo, e uma conversa longa fica cara em progressão.
 *
 * As regras aqui decidem o que vai junto e o que fica para trás. São puras, e
 * por isso o cálculo de custo pode ser testado sem gastar cota nenhuma.
 */

export type Autor = 'aluno' | 'assistente';

export interface Fala {
  autor: Autor;
  texto: string;
}

/** Quantas falas acompanham a mensagem nova. */
export const FALAS_NA_JANELA = 12;

/** Tamanho máximo de uma mensagem do aluno, em caracteres. */
export const MAXIMO_DA_MENSAGEM = 600;

/** Quantas falas do aluno uma conversa comporta antes de encerrar. */
export const MAXIMO_DE_FALAS = 40;

/**
 * A janela que vai para o modelo.
 *
 * Só as últimas falas, e sempre começando por uma do aluno. Cortar no meio de
 * um par pergunta e resposta faz o modelo responder a uma fala dele mesmo, e a
 * conversa perde o fio.
 */
export function janelaDeContexto(historico: readonly Fala[]): Fala[] {
  const recentes = historico.slice(-FALAS_NA_JANELA);

  const primeiroDoAluno = recentes.findIndex((fala) => fala.autor === 'aluno');
  if (primeiroDoAluno <= 0) return recentes;

  return recentes.slice(primeiroDoAluno);
}

export interface EstadoDaConversa {
  falasDoAluno: number;
  encerrada: boolean;
}

export function podeContinuar(estado: EstadoDaConversa): boolean {
  return !estado.encerrada && estado.falasDoAluno < MAXIMO_DE_FALAS;
}

/**
 * Quanto falta antes do fim.
 *
 * A tela avisa quando está perto. Uma conversa que simplesmente para de
 * responder parece defeito, e a pessoa recarrega a página achando que travou.
 */
export function falasRestantes(estado: EstadoDaConversa): number {
  return Math.max(0, MAXIMO_DE_FALAS - estado.falasDoAluno);
}

export interface CorrecaoNaFala {
  trecho: string;
  sugestao: string;
}

export interface RespostaDaConversa {
  /** O que o parceiro de conversa respondeu, na língua estudada. */
  resposta: string;
  /** Correções do que o aluno acabou de escrever. Pode vir vazio. */
  correcoes: CorrecaoNaFala[];
}

/**
 * Confere as correções contra o que o aluno realmente escreveu.
 *
 * Mesma barreira da redação, e pelo mesmo motivo: o modelo parafraseia sem
 * perceber, e uma correção que cita trecho inexistente confunde quem está
 * aprendendo. Aqui a correção inválida é **descartada**, não marcada: numa
 * conversa não há professor para julgar depois, e mostrar ao aluno uma correção
 * que ele não consegue localizar só atrapalha.
 */
export function correcoesValidas(
  correcoes: readonly CorrecaoNaFala[],
  textoDoAluno: string,
): CorrecaoNaFala[] {
  const normalizado = normalizar(textoDoAluno);

  return correcoes.filter(
    (correcao) =>
      correcao.trecho.trim().length > 0 &&
      correcao.sugestao.trim().length > 0 &&
      normalizar(correcao.trecho) !== normalizar(correcao.sugestao) &&
      normalizado.includes(normalizar(correcao.trecho)),
  );
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Como o parceiro de conversa deve falar em cada nível.
 *
 * Sem isto o modelo responde sempre no mesmo registro, que costuma ser alto
 * demais para iniciante. Um aluno de A1 que recebe uma resposta de C1 não
 * pratica, ele desiste.
 */
export const REGISTRO_POR_NIVEL: Record<Nivel, string> = {
  A1: 'frases curtas, presente simples, vocabulário do dia a dia',
  A2: 'frases simples, passado e futuro básicos, vocabulário cotidiano',
  B1: 'frases de tamanho médio, conectivos comuns, vocabulário geral',
  B2: 'frases naturais, expressões idiomáticas comuns, algum vocabulário abstrato',
  C1: 'linguagem natural e fluida, nuance, expressões menos comuns',
  C2: 'linguagem de falante nativo, sem simplificação',
};
