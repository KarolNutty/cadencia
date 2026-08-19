import { type DiaDeEstudo, somarDias } from './dia-de-estudo';

/** O que o aluno respondeu depois de ver o verso da carta. */
export type Avaliacao = 'errei' | 'dificil' | 'bom' | 'facil';

export interface Agendamento {
  /** Dias até a próxima revisão, decidido na revisão anterior. */
  intervaloDias: number;
  /** Quão fácil esta carta é para este aluno. Multiplica o intervalo. */
  facilidade: number;
  /** Acertos seguidos. Errar zera. */
  repeticoes: number;
  /** Quantas vezes o aluno já errou esta carta no total. Nunca zera. */
  lapsos: number;
  venceEm: DiaDeEstudo;
  /** A carta virou problema de ensino, não de agendamento. */
  sinalizado: boolean;
}

/**
 * Teto do intervalo.
 *
 * O SM-2 puro manda uma carta bem sabida para daqui a três anos. Num curso de
 * seis meses isso equivale a apagá-la: o aluno chega na prova sem ter revisto.
 * O teto existe porque o calendário da escola existe.
 */
export const TETO_INTERVALO_DIAS = 120;

/**
 * Piso da facilidade.
 *
 * O SM-2 deixa a facilidade cair até 1.3, e aí a carta volta praticamente todo
 * dia, para sempre. Numa turma real isso vira um punhado de cartas que o aluno
 * odeia e que dominam toda sessão, e ele para de estudar. O piso mais alto
 * garante que o intervalo sempre cresça depois de dois acertos.
 */
export const FACILIDADE_MINIMA = 1.6;
export const FACILIDADE_MAXIMA = 2.8;
export const FACILIDADE_INICIAL = 2.5;

/**
 * A partir daqui, insistir no agendamento é ignorar o problema.
 *
 * Uma carta errada quatro vezes não precisa de outro intervalo, precisa que o
 * professor explique de novo. O app sinaliza e sai do caminho.
 */
export const LAPSOS_PARA_SINALIZAR = 4;

/** Quanto cada avaliação mexe na facilidade. Errar tem peso próprio, abaixo. */
const AJUSTE_DE_FACILIDADE: Record<Exclude<Avaliacao, 'errei'>, number> = {
  dificil: -0.15,
  bom: 0,
  facil: 0.15,
};

const PENALIDADE_POR_ERRO = 0.2;

/** Os dois primeiros acertos usam degraus fixos; depois o intervalo cresce sozinho. */
const DEGRAUS_INICIAIS = [1, 3];

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Estado de uma carta que o aluno nunca viu. */
export function agendamentoNovo(hoje: DiaDeEstudo): Agendamento {
  return {
    intervaloDias: 0,
    facilidade: FACILIDADE_INICIAL,
    repeticoes: 0,
    lapsos: 0,
    venceEm: hoje,
    sinalizado: false,
  };
}

/**
 * Calcula quando a carta volta, a partir do que o aluno respondeu.
 *
 * Função pura: mesmas entradas, mesma saída, sem relógio e sem banco.
 *
 * **É este arquivo que roda nos dois lados.** O app chama para responder na
 * hora, o aluno avalia trinta cartas seguidas e esperar a rede a cada uma
 * destruiria o ritmo do estudo. O servidor chama de novo ao receber a revisão, e
 * o resultado dele é a autoridade. Como é o mesmo módulo importado, os dois não
 * têm como divergir.
 */
export function agendar(
  atual: Agendamento,
  avaliacao: Avaliacao,
  hoje: DiaDeEstudo,
): Agendamento {
  if (avaliacao === 'errei') {
    const lapsos = atual.lapsos + 1;

    return {
      // Volta amanhã, não hoje: rever a mesma carta na mesma sessão é
      // memorizar a tela, não a palavra.
      intervaloDias: 1,
      facilidade: limitar(
        atual.facilidade - PENALIDADE_POR_ERRO,
        FACILIDADE_MINIMA,
        FACILIDADE_MAXIMA,
      ),
      repeticoes: 0,
      lapsos,
      venceEm: somarDias(hoje, 1),
      sinalizado: atual.sinalizado || lapsos >= LAPSOS_PARA_SINALIZAR,
    };
  }

  const repeticoes = atual.repeticoes + 1;

  const facilidade = limitar(
    atual.facilidade + AJUSTE_DE_FACILIDADE[avaliacao],
    FACILIDADE_MINIMA,
    FACILIDADE_MAXIMA,
  );

  const degrau = DEGRAUS_INICIAIS[repeticoes - 1];
  const intervaloBruto =
    degrau ?? Math.round(Math.max(atual.intervaloDias, 1) * facilidade);

  const intervaloDias = Math.min(intervaloBruto, TETO_INTERVALO_DIAS);

  return {
    intervaloDias,
    facilidade,
    repeticoes,
    lapsos: atual.lapsos,
    venceEm: somarDias(hoje, intervaloDias),
    // Acertar não apaga o sinal: quem decide que a carta voltou ao normal é o
    // professor, na aula, e não uma resposta certa isolada.
    sinalizado: atual.sinalizado,
  };
}

export interface Revisao {
  avaliacao: Avaliacao;
  dia: DiaDeEstudo;
}

/**
 * Reproduz o histórico inteiro para chegar ao estado atual.
 *
 * O banco guarda o agendamento pronto, porque "o que vence hoje" roda a cada
 * abertura do app e não pode ser uma reconstrução. Mas as revisões são
 * append-only, então o estado sempre pode ser recalculado, e há um teste que
 * compara os dois caminhos. Se divergirem, algo escreveu no agendamento sem
 * passar por aqui.
 */
export function reconstruir(
  revisoes: readonly Revisao[],
  inicio: DiaDeEstudo,
): Agendamento {
  return revisoes.reduce(
    (estado, revisao) => agendar(estado, revisao.avaliacao, revisao.dia),
    agendamentoNovo(inicio),
  );
}
