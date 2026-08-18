import type { Nivel } from './nivelamento';

/**
 * Correção de redação.
 *
 * A parte que o modelo faz é **analisar e explicar**. O que ele não faz:
 *
 * - não conta palavras (código conta)
 * - não decide se o texto está no nível (regra decide)
 * - não dá nota final (o professor dá)
 *
 * Essa separação é a mesma do copiloto de atendimento, e existe pelo mesmo
 * motivo: modelo de linguagem erra contagem com confiança total, e um número
 * errado numa correção mina a confiança do aluno no resto do parecer.
 *
 * O que sobra para o modelo é justamente onde ele é bom — reconhecer que "I am
 * agree" é interferência do português e explicar por quê.
 */

export const CRITERIOS = ['gramatica', 'vocabulario', 'coesao', 'adequacao'] as const;

export type Criterio = (typeof CRITERIOS)[number];

export const NOME_DO_CRITERIO: Record<Criterio, string> = {
  gramatica: 'Gramática',
  vocabulario: 'Vocabulário',
  coesao: 'Coesão',
  adequacao: 'Adequação ao tema',
};

/**
 * Quantas palavras se espera em cada nível.
 *
 * Não é regra de ortografia: é o que uma escola pede numa tarefa de escrita, e
 * serve para o aluno saber se entregou pouco antes de o professor dizer.
 */
export const TAMANHO_ESPERADO: Record<Nivel, { minimo: number; ideal: number }> = {
  A1: { minimo: 30, ideal: 60 },
  A2: { minimo: 60, ideal: 100 },
  B1: { minimo: 100, ideal: 150 },
  B2: { minimo: 150, ideal: 220 },
  C1: { minimo: 200, ideal: 300 },
  C2: { minimo: 250, ideal: 350 },
};

/**
 * Conta palavras.
 *
 * Código conta; o modelo não. Parece exagero até a primeira vez em que ele
 * responde "seu texto tem aproximadamente 150 palavras" para um texto de 87 — e
 * o aluno acredita.
 */
export function contarPalavras(texto: string): number {
  const limpo = texto.replace(/[\u2018\u2019]/g, "'").trim();

  if (limpo.length === 0) return 0;

  return limpo.split(/\s+/).filter((palavra) => /[\p{L}\p{N}]/u.test(palavra)).length;
}

export interface AvaliacaoDeTamanho {
  palavras: number;
  minimo: number;
  ideal: number;
  situacao: 'curto' | 'aceitavel' | 'no_alvo';
}

export function avaliarTamanho(texto: string, nivel: Nivel): AvaliacaoDeTamanho {
  const palavras = contarPalavras(texto);
  const { minimo, ideal } = TAMANHO_ESPERADO[nivel];

  return {
    palavras,
    minimo,
    ideal,
    situacao: palavras < minimo ? 'curto' : palavras < ideal ? 'aceitavel' : 'no_alvo',
  };
}

export interface ApontamentoDaIa {
  criterio: Criterio;
  /** O trecho exato do texto do aluno. */
  trecho: string;
  sugestao: string;
  explicacao: string;
}

export interface AnaliseDaIa {
  apontamentos: ApontamentoDaIa[];
  resumo: string;
}

export interface ApontamentoVerificado extends ApontamentoDaIa {
  /**
   * O trecho realmente existe no texto do aluno?
   *
   * Modelo de linguagem parafraseia sem perceber. Um apontamento que cita um
   * trecho inexistente é confuso para o aluno — ele procura no próprio texto e
   * não acha.
   */
  encontrado: boolean;
}

/**
 * Confere a análise contra o texto original.
 *
 * Isto **não** julga se a correção está certa: julga se ela é rastreável. Um
 * apontamento cujo trecho não existe no texto vai marcado, e a tela o separa
 * dos demais em vez de escondê-lo — esconder tiraria do professor a chance de
 * perceber que o modelo está alucinando.
 */
export function verificarAnalise(
  analise: AnaliseDaIa,
  textoDoAluno: string,
): ApontamentoVerificado[] {
  const normalizado = normalizar(textoDoAluno);

  return analise.apontamentos.map((apontamento) => ({
    ...apontamento,
    encontrado: normalizado.includes(normalizar(apontamento.trecho)),
  }));
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quantos apontamentos por critério, para a tela agrupar. */
export function contarPorCriterio(
  apontamentos: readonly ApontamentoVerificado[],
): Record<Criterio, number> {
  const contagem = Object.fromEntries(CRITERIOS.map((criterio) => [criterio, 0])) as Record<
    Criterio,
    number
  >;

  for (const apontamento of apontamentos) {
    if (apontamento.encontrado) contagem[apontamento.criterio] += 1;
  }

  return contagem;
}

/** Limite de tamanho do texto aceito, para não estourar a janela do modelo. */
export const MAXIMO_DE_PALAVRAS = 800;
