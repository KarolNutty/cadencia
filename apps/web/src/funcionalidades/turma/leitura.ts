import type { TurmaDoProfessor } from '@cadencia/contrato';
import { type DiaDeEstudo, diasEntre } from '@cadencia/dominio';

type Aluno = TurmaDoProfessor['alunos'][number];

/**
 * Como o professor lê a situação de cada aluno.
 *
 * Isto é função pura de propósito: é a regra que decide o que aparece em
 * destaque no painel, e ela precisa ser testável sem renderizar nada.
 */

export type Situacao = 'travado' | 'sumido' | 'atrasado' | 'em_dia';

/** Depois de quantos dias sem abrir o app o aluno "sumiu". */
export const DIAS_PARA_SUMIR = 7;

/**
 * A ordem de prioridade não é alfabética nem por nome.
 *
 * O professor abre isto antes da aula com pouco tempo. Quem tem carta travada
 * vem primeiro porque é a única situação em que **ele** precisa agir, as
 * outras o aluno resolve sozinho estudando.
 */
export function situacaoDo(aluno: Aluno, hoje: DiaDeEstudo): Situacao {
  if (aluno.sinalizadas > 0) return 'travado';

  const sumiu =
    aluno.ultimoEstudo === null ||
    diasEntre(aluno.ultimoEstudo as DiaDeEstudo, hoje) >= DIAS_PARA_SUMIR;

  if (sumiu) return 'sumido';
  if (aluno.vencendoHoje > 0) return 'atrasado';

  return 'em_dia';
}

const PESO: Record<Situacao, number> = {
  travado: 0,
  sumido: 1,
  atrasado: 2,
  em_dia: 3,
};

export function ordenarPorPrioridade(alunos: readonly Aluno[], hoje: DiaDeEstudo): Aluno[] {
  return [...alunos].sort((a, b) => {
    const porSituacao = PESO[situacaoDo(a, hoje)] - PESO[situacaoDo(b, hoje)];
    if (porSituacao !== 0) return porSituacao;

    // Dentro da mesma situação, quem tem mais cartas travadas primeiro.
    const porTravadas = b.sinalizadas - a.sinalizadas;
    if (porTravadas !== 0) return porTravadas;

    // Desempate estável, para a lista não dançar entre recargas.
    return a.usuario.nome.localeCompare(b.usuario.nome, 'pt-BR');
  });
}

export interface ResumoDaTurma {
  total: number;
  travados: number;
  sumidos: number;
  emDia: number;
}

export function resumirTurma(alunos: readonly Aluno[], hoje: DiaDeEstudo): ResumoDaTurma {
  let travados = 0;
  let sumidos = 0;
  let emDia = 0;

  for (const aluno of alunos) {
    const situacao = situacaoDo(aluno, hoje);
    if (situacao === 'travado') travados += 1;
    else if (situacao === 'sumido') sumidos += 1;
    else if (situacao === 'em_dia') emDia += 1;
  }

  return { total: alunos.length, travados, sumidos, emDia };
}

/**
 * Como a data aparece na tela.
 *
 * "há 3 dias" responde a pergunta do professor; "2026-08-14" obriga ele a fazer
 * a conta.
 */
export function desdeQuando(dia: string | null, hoje: DiaDeEstudo): string {
  if (dia === null) return 'nunca estudou';

  const dias = diasEntre(dia as DiaDeEstudo, hoje);

  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 14) return 'há uma semana';
  if (dias < 30) return `há ${Math.round(dias / 7)} semanas`;

  return `há ${Math.round(dias / 30)} ${Math.round(dias / 30) === 1 ? 'mês' : 'meses'}`;
}
