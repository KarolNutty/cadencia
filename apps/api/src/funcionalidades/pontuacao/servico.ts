import {
  type DiaDeEstudo,
  type LinhaDoRanking,
  calcularOfensiva,
  nivelDeXp,
  ordenarRanking,
} from '@cadencia/dominio';
import { naoEncontrado } from '../../compartilhado/erros';
import type { Banco, Executor } from '../../infra/banco';

/**
 * Pontuação e ranking.
 *
 * O XP é **sempre calculado no servidor**, a partir do agendamento que estava
 * gravado antes da revisão. O cliente não informa quanto ganhou, se
 * informasse, bastaria abrir o console do navegador para liderar o ranking.
 */

/**
 * O começo da semana corrente, para o recorte do ranking.
 *
 * Segunda-feira, e não domingo: quem estuda conta a semana pelos dias de aula,
 * e um ranking que zera no meio do fim de semana confunde.
 */
export function inicioDaSemana(dia: DiaDeEstudo): DiaDeEstudo {
  const data = new Date(`${dia}T00:00:00Z`);
  const diaDaSemana = (data.getUTCDay() + 6) % 7;
  data.setUTCDate(data.getUTCDate() - diaDaSemana);

  return data.toISOString().slice(0, 10) as DiaDeEstudo;
}

function paraDia(data: Date): DiaDeEstudo {
  return data.toISOString().slice(0, 10) as DiaDeEstudo;
}

export function criarServicoDePontuacao(sql: Banco) {
  return {
    /**
     * Credita o XP do dia. Roda dentro da transação do lote de revisões.
     *
     * Somar na mesma transação é o que impede o aluno ficar com o histórico
     * gravado e a pontuação perdida quando o processo cai no meio.
     */
    async creditar(
      executor: Executor,
      alunoId: string,
      turmaId: string,
      dia: DiaDeEstudo,
      xp: number,
    ): Promise<void> {
      if (xp <= 0) return;

      await executor`
        INSERT INTO pontos_por_dia ${executor({
          aluno_id: alunoId,
          turma_id: turmaId,
          dia,
          xp,
        })}
        ON CONFLICT (aluno_id, turma_id, dia) DO UPDATE
        SET xp = pontos_por_dia.xp + EXCLUDED.xp, atualizado_em = now()
      `;
    },

    /** Quanto o aluno já ganhou hoje, para o teto diário ser respeitado. */
    async xpDeHoje(
      executor: Executor,
      alunoId: string,
      turmaId: string,
      dia: DiaDeEstudo,
    ): Promise<number> {
      const [linha] = await executor<{ xp: number }[]>`
        SELECT xp FROM pontos_por_dia
        WHERE aluno_id = ${alunoId} AND turma_id = ${turmaId} AND dia = ${dia}
      `;

      return linha?.xp ?? 0;
    },

    /** O painel de pontuação do aluno. */
    async resumoDoAluno(alunoId: string, turmaId: string, hoje: DiaDeEstudo) {
      const matriculado = await sql`
        SELECT 1 FROM matriculas m
        JOIN turmas t ON t.id = m.turma_id
        WHERE m.aluno_id = ${alunoId}
          AND m.turma_id = ${turmaId}
          AND t.arquivada_em IS NULL
      `;

      if (matriculado.length === 0) throw naoEncontrado('Turma');

      const [totais] = await sql<{ total: string; hoje: string }[]>`
        SELECT coalesce(sum(xp), 0) AS total,
               coalesce(sum(xp) FILTER (WHERE dia = ${hoje}), 0) AS hoje
        FROM pontos_por_dia
        WHERE aluno_id = ${alunoId} AND turma_id = ${turmaId}
      `;

      const dias = await sql<{ dia: Date }[]>`
        SELECT DISTINCT r.dia
        FROM revisoes r
        JOIN cartoes c ON c.id = r.cartao_id
        JOIN baralhos b ON b.id = c.baralho_id
        WHERE r.aluno_id = ${alunoId} AND b.turma_id = ${turmaId}
        ORDER BY r.dia DESC
        LIMIT 400
      `;

      const xpTotal = Number(totais?.total ?? 0);

      return {
        xpTotal,
        xpHoje: Number(totais?.hoje ?? 0),
        ...nivelDeXp(xpTotal),
        ofensiva: calcularOfensiva(
          dias.map((linha) => paraDia(linha.dia)),
          hoje,
        ),
      };
    },

    /**
     * O ranking da semana da turma.
     *
     * **Da semana, e não de sempre.** Um ranking acumulado trava: quem entrou
     * depois nunca alcança, e quem lidera pode parar de estudar sem perder o
     * topo. Reiniciar toda semana devolve a chance a todo mundo.
     */
    async rankingDaTurma(alunoId: string, turmaId: string, hoje: DiaDeEstudo) {
      const matriculado = await sql`
        SELECT 1 FROM matriculas WHERE aluno_id = ${alunoId} AND turma_id = ${turmaId}
      `;

      if (matriculado.length === 0) throw naoEncontrado('Turma');

      const desde = inicioDaSemana(hoje);

      const linhas = await sql<{ aluno_id: string; nome: string; xp: string }[]>`
        SELECT u.id AS aluno_id, u.nome, coalesce(sum(p.xp), 0) AS xp
        FROM matriculas m
        JOIN usuarios u ON u.id = m.aluno_id
        LEFT JOIN pontos_por_dia p
          ON p.aluno_id = u.id AND p.turma_id = ${turmaId} AND p.dia >= ${desde}
        WHERE m.turma_id = ${turmaId}
        GROUP BY u.id, u.nome
      `;

      // Uma consulta só para as ofensivas de todos: buscar por aluno seria o
      // problema N+1, e com trinta alunos são trinta e uma idas ao banco.
      const ofensivas = await sql<{ aluno_id: string; dias: Date[] }[]>`
        SELECT r.aluno_id, array_agg(DISTINCT r.dia) AS dias
        FROM revisoes r
        JOIN cartoes c ON c.id = r.cartao_id
        JOIN baralhos b ON b.id = c.baralho_id
        WHERE b.turma_id = ${turmaId}
        GROUP BY r.aluno_id
      `;

      const porAluno = new Map(ofensivas.map((linha) => [linha.aluno_id, linha.dias]));

      const paraOrdenar: LinhaDoRanking[] = linhas.map((linha) => ({
        alunoId: linha.aluno_id,
        nome: linha.nome,
        xpNaSemana: Number(linha.xp),
        ofensiva: calcularOfensiva((porAluno.get(linha.aluno_id) ?? []).map(paraDia), hoje)
          .dias,
      }));

      return { desde, ranking: ordenarRanking(paraOrdenar) };
    },
  };
}

export type ServicoDePontuacao = ReturnType<typeof criarServicoDePontuacao>;
