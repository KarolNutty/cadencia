/**
 * Teste de nivelamento adaptativo.
 *
 * Um teste fixo de sessenta perguntas mede tédio: o aluno de A1 erra as
 * quarenta últimas e o de C1 acerta as quarenta primeiras, e ninguém aprende
 * nada com isso. O adaptativo escolhe **a próxima pergunta pela resposta
 * anterior** e para quando a incerteza cai, quinze itens bastam para separar
 * A2 de B1.
 *
 * O modelo é uma busca binária sobre a escala do Quadro Comum Europeu, com duas
 * proteções: nunca pula mais de um nível por resposta, e exige confirmação
 * antes de fechar. Sem isso, um chute certo no começo levaria alguém para C1.
 *
 * Função pura, sem relógio e sem banco.
 */

export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Nivel = (typeof NIVEIS)[number];

export interface Pergunta {
  id: string;
  nivel: Nivel;
  enunciado: string;
  alternativas: string[];
  /** Índice da alternativa correta. */
  correta: number;
}

export interface Resposta {
  perguntaId: string;
  nivel: Nivel;
  acertou: boolean;
}

export interface EstadoDoTeste {
  respostas: readonly Resposta[];
  /** Onde a busca está agora. */
  nivelAtual: Nivel;
  /** Limites que ainda podem ser o resultado. */
  menor: number;
  maior: number;
}

/** Onde o teste começa: no meio da escala, sem supor nada sobre a pessoa. */
export const NIVEL_INICIAL: Nivel = 'B1';

/**
 * Quantas perguntas no máximo.
 *
 * Quinze é o ponto em que a busca já convergiu na esmagadora maioria dos casos.
 * Continuar depois disso troca precisão marginal por abandono.
 */
export const MAXIMO_DE_PERGUNTAS = 15;

/** Nenhum nível é decidido com menos que isto, mesmo com a busca fechada. */
export const MINIMO_DE_PERGUNTAS = 8;

/** Quantos acertos seguidos no mesmo nível confirmam que ele foi atingido. */
const CONFIRMACOES = 2;

function indice(nivel: Nivel): number {
  return NIVEIS.indexOf(nivel);
}

export function iniciarTeste(): EstadoDoTeste {
  return {
    respostas: [],
    nivelAtual: NIVEL_INICIAL,
    menor: 0,
    maior: NIVEIS.length - 1,
  };
}

/**
 * Registra a resposta e decide o próximo nível.
 *
 * Acertou, sobe um; errou, desce um, **nunca mais que isso**. Saltar dois
 * níveis por causa de um chute é como um teste de nivelamento erra: a pessoa
 * cai numa turma onde não entende nada, e desiste antes da segunda aula.
 */
export function responder(estado: EstadoDoTeste, acertou: boolean): EstadoDoTeste {
  const atual = indice(estado.nivelAtual);

  const respostas = [
    ...estado.respostas,
    {
      perguntaId: `${estado.nivelAtual}-${estado.respostas.length}`,
      nivel: estado.nivelAtual,
      acertou,
    },
  ];

  /*
   * A resposta estreita o intervalo.
   *
   * Acertar em X significa "pelo menos X", então o piso sobe até X. Errar em X
   * significa "abaixo de X", o teto vai para **X menos um**, e não para X.
   *
   * A diferença parece detalhe e não é: mantendo X no intervalo depois de errar
   * ali, ele nunca fecha. O aluno de A2 acerta em A2, sobe para B1, erra, volta
   * para A2, e oscila entre os dois até o limite de perguntas, sem nunca
   * convergir. O teste `converge antes do máximo` existe por causa disso.
   */
  const menor = acertou ? Math.max(estado.menor, atual) : estado.menor;
  const maior = acertou
    ? estado.maior
    : Math.max(estado.menor, Math.min(estado.maior, atual - 1));

  const proximo = Math.min(Math.max(acertou ? atual + 1 : atual - 1, menor), maior);

  return {
    respostas,
    nivelAtual: NIVEIS[proximo]!,
    menor,
    maior,
  };
}

/**
 * O teste acabou?
 *
 * Acaba quando o intervalo fechou **e** o nível foi confirmado, ou quando o
 * limite de perguntas chegou. O piso de perguntas existe porque um intervalo
 * pode fechar cedo por sorte, e ninguém deve ser nivelado com três respostas.
 */
export function terminou(estado: EstadoDoTeste): boolean {
  if (estado.respostas.length >= MAXIMO_DE_PERGUNTAS) return true;
  if (estado.respostas.length < MINIMO_DE_PERGUNTAS) return false;

  if (estado.menor !== estado.maior) return false;

  const noNivel = estado.respostas.filter(
    (resposta) => indice(resposta.nivel) === estado.menor,
  );

  return noNivel.length >= CONFIRMACOES;
}

export interface ResultadoDoTeste {
  nivel: Nivel;
  /**
   * De 0 a 1. Combina duas coisas: quão fechado o intervalo ficou e **quão
   * coerentes** foram as respostas.
   *
   * Só a largura do intervalo não basta. Quem responde ao acaso pode fechar o
   * intervalo por sorte e receber confiança máxima, e o professor confiaria
   * num número que não mede nada. A coerência é o que separa "convergiu" de
   * "deu certo por acaso".
   */
  confianca: number;
  acertos: number;
  total: number;
  /**
   * Respostas que contradizem a escala: acertou uma difícil e errou uma mais
   * fácil. Uma ou duas são normais; muitas indicam chute.
   */
  incoerencias: number;
}

/**
 * O nível ao fim do teste.
 *
 * É o **maior nível em que a pessoa acertou**, e não a média das respostas.
 * Média puxaria para baixo quem errou uma pergunta difícil no começo, e o
 * teste existe para achar o teto, não a nota.
 */
export function resultado(estado: EstadoDoTeste): ResultadoDoTeste {
  const acertos = estado.respostas.filter((resposta) => resposta.acertou);

  const teto = acertos.reduce(
    (maior, resposta) => Math.max(maior, indice(resposta.nivel)),
    // Sem nenhum acerto, o resultado é o primeiro nível: a pessoa está
    // começando, e mandá-la para A2 seria pior que mandá-la para A1.
    0,
  );

  const largura = estado.maior - estado.menor;
  const porIntervalo = 1 - largura / (NIVEIS.length - 1);

  const incoerencias = contarIncoerencias(estado.respostas);
  const porCoerencia =
    estado.respostas.length === 0 ? 0 : 1 - incoerencias / estado.respostas.length;

  const confianca = Math.max(0, Math.min(1, porIntervalo * porCoerencia));

  return {
    nivel: NIVEIS[teto]!,
    confianca: Number(confianca.toFixed(2)),
    acertos: acertos.length,
    total: estado.respostas.length,
    incoerencias,
  };
}

/**
 * Conta respostas que contradizem a escala.
 *
 * Se a pessoa acertou algo de C1, espera-se que acerte o que for de A2. Errar
 * abaixo do que já provou saber é sinal de chute, de desatenção, ou de que a
 * pergunta estava mal escrita, o que também interessa saber.
 */
function contarIncoerencias(respostas: readonly Resposta[]): number {
  const tetoAcertado = respostas
    .filter((resposta) => resposta.acertou)
    .reduce((maior, resposta) => Math.max(maior, indice(resposta.nivel)), -1);

  if (tetoAcertado < 0) return 0;

  /*
   * `<=`, e não `<`.
   *
   * Errar **no mesmo nível** em que já se acertou é contradição igual, e é
   * exatamente o padrão de quem responde ao acaso, que fica oscilando num nível
   * só. Contar apenas os erros abaixo deixaria esse caso passar com confiança
   * máxima.
   */
  return respostas.filter(
    (resposta) => !resposta.acertou && indice(resposta.nivel) <= tetoAcertado,
  ).length;
}

/**
 * Escolhe a próxima pergunta do banco.
 *
 * Prefere uma do nível atual que a pessoa ainda não viu. Se acabaram as do
 * nível, aceita a mais próxima, repetir pergunta invalidaria a medida.
 */
export function proximaPergunta(
  banco: readonly Pergunta[],
  estado: EstadoDoTeste,
  jaVistas: ReadonlySet<string>,
): Pergunta | null {
  const disponiveis = banco.filter((pergunta) => !jaVistas.has(pergunta.id));
  if (disponiveis.length === 0) return null;

  const alvo = indice(estado.nivelAtual);

  return [...disponiveis].sort(
    (a, b) => Math.abs(indice(a.nivel) - alvo) - Math.abs(indice(b.nivel) - alvo),
  )[0]!;
}
