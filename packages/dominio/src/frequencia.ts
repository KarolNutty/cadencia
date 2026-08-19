/**
 * Frequência.
 *
 * Regras puras sobre presença. O que está aqui decide o que a escola cobra do
 * aluno, então precisa ser testável sem banco e sem tela.
 */

export type Situacao = 'presente' | 'ausente' | 'justificada';

export interface RegistroDePresenca {
  alunoId: string;
  situacao: Situacao;
}

export interface FrequenciaDoAluno {
  presentes: number;
  ausentes: number;
  justificadas: number;
  total: number;
  /** De 0 a 1. */
  taxa: number;
}

/**
 * Falta justificada não conta contra a frequência, mas **conta no total**.
 *
 * Tirá-la dos dois lados faria quem faltou justificadamente dez vezes ter a
 * mesma taxa de quem nunca faltou, e a escola perderia de vista o aluno que
 * está sumindo com motivo. O que muda é o peso, não a existência.
 */
export function calcularFrequencia(situacoes: readonly Situacao[]): FrequenciaDoAluno {
  const presentes = situacoes.filter((s) => s === 'presente').length;
  const ausentes = situacoes.filter((s) => s === 'ausente').length;
  const justificadas = situacoes.filter((s) => s === 'justificada').length;

  const total = situacoes.length;
  const contam = presentes + ausentes;

  return {
    presentes,
    ausentes,
    justificadas,
    total,
    // Sem aula com presença cobrável, a taxa é 1: ninguém começa devendo.
    taxa: contam === 0 ? 1 : presentes / contam,
  };
}

/** A partir de qual taxa a escola costuma reprovar por falta. */
export const TAXA_MINIMA = 0.75;

export function emRiscoPorFalta(frequencia: FrequenciaDoAluno): boolean {
  // Duas aulas não dizem nada sobre frequência: a taxa oscila demais no começo,
  // e alarmar cedo faz o professor ignorar o alarme depois.
  return frequencia.total >= 4 && frequencia.taxa < TAXA_MINIMA;
}

/**
 * A chamada começa com todos presentes.
 *
 * O professor marca as exceções. Começar com todos ausentes obrigaria a marcar
 * trinta pessoas para registrar uma aula normal, e o esquecimento produziria
 * falta em quem estava lá, que é o erro mais caro dos dois.
 */
export function chamadaInicial(alunoIds: readonly string[]): RegistroDePresenca[] {
  return alunoIds.map((alunoId) => ({ alunoId, situacao: 'presente' as const }));
}

export interface ResumoDaChamada {
  presentes: number;
  ausentes: number;
  justificadas: number;
}

export function resumirChamada(registros: readonly RegistroDePresenca[]): ResumoDaChamada {
  return {
    presentes: registros.filter((r) => r.situacao === 'presente').length,
    ausentes: registros.filter((r) => r.situacao === 'ausente').length,
    justificadas: registros.filter((r) => r.situacao === 'justificada').length,
  };
}
