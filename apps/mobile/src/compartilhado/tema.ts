/**
 * A identidade visual vem do nome: cadência é ritmo.
 *
 * Três decisões concretas, e nenhuma é decoração:
 *
 * 1. **A palavra é o herói.** Na tela de estudo ela ocupa o centro em serifada
 *    de alto contraste, grande. Tudo o mais recua. Um app de idioma cuja tela
 *    principal é dominada por botões e barras ensina a olhar para os botões.
 *
 * 2. **Fundo escuro só na sessão.** O estudo é um momento de foco, e a tela
 *    escura funciona como luz de palco: a palavra ilumina, o resto some. As
 *    outras telas são claras — inverter isso cansaria quem usa de dia.
 *
 * 3. **O progresso é marcado por batidas**, uma por carta, e não por uma barra
 *    contínua. É a assinatura do nome: quem estuda vê quantas faltam contando
 *    traços, do jeito que se marca compasso.
 */

export const cores = {
  /** Fundo da sessão de estudo. Quase preto, com desvio para o violeta. */
  tinta: '#16141F',
  tintaSuave: '#241F33',

  papel: '#FBFAF8',
  superficie: '#FFFFFF',

  texto: '#1A1726',
  textoMedio: '#5A5470',
  textoFraco: '#8F89A3',
  /** Sobre o fundo escuro. */
  textoClaro: '#F4F2FA',
  textoClaroMedio: '#A9A2C4',

  /** Cor de marca: índigo saturado. */
  marca: '#4B3FE4',
  marcaFraca: '#EBE9FD',

  linha: '#E7E4EF',
  linhaEscura: '#332C47',

  /** Fundo e texto de controle inativo. */
  inativo: '#E9E7EE',
  textoInativo: '#9A96A8',

  /** As quatro avaliações. */
  errei: '#D6455B',
  dificil: '#D08420',
  bom: '#3B7DD8',
  facil: '#2C9367',
} as const;

/**
 * Escala tipográfica.
 *
 * A serifada aparece **só na palavra estudada**. Em botão e rótulo ela viraria
 * enfeite; presa ao conteúdo, vira assinatura — e separa visualmente "o que
 * você está aprendendo" de "os controles do app".
 */
export const fontes = {
  palavra: 'DMSerifDisplay_400Regular',
  texto: 'DMSans_400Regular',
  textoMedio: 'DMSans_500Medium',
  textoForte: 'DMSans_700Bold',
} as const;

export const espaco = {
  minimo: 4,
  pequeno: 8,
  medio: 16,
  grande: 24,
  enorme: 40,
} as const;

export const raio = {
  pequeno: 8,
  medio: 12,
  grande: 20,
  circulo: 999,
} as const;

/** Cor e rótulo de cada avaliação, num lugar só. */
export const avaliacoes = [
  { valor: 'errei', rotulo: 'Errei', cor: cores.errei },
  { valor: 'dificil', rotulo: 'Difícil', cor: cores.dificil },
  { valor: 'bom', rotulo: 'Bom', cor: cores.bom },
  { valor: 'facil', rotulo: 'Fácil', cor: cores.facil },
] as const;
