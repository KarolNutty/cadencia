import {
  type DiaDeEstudo,
  type RegistroDePresenca,
  type Situacao,
  calcularFrequencia,
  emRiscoPorFalta,
  resumirChamada,
} from '@cadencia/dominio';
import { naoEncontrado } from '../../compartilhado/erros';
import type { Banco, Executor } from '../../infra/banco';

/**
 * Diário de classe.
 *
 * O registro da aula e a chamada são gravados juntos. Aula sem chamada e
 * chamada sem aula são estados que a secretaria não sabe interpretar, e evitar
 * que existam é mais barato que ensinar todo mundo a lidar com eles.
 */

interface LinhaDeAula {
  id: string;
  dia: Date;
  conteudo: string;
  dever: string | null;
  encontro: string | null;
}

function paraDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function criarServicoDeDiario(sql: Banco) {
  async function exigirTurmaDoProfessor(
    executor: Executor,
    professorId: string,
    turmaId: string,
  ): Promise<void> {
    const linhas = await executor`
      SELECT 1 FROM turmas
      WHERE id = ${turmaId} AND professor_id = ${professorId} AND arquivada_em IS NULL
    `;

    if (linhas.length === 0) throw naoEncontrado('Turma');
  }

  return {
    /**
     * Registra a aula com a chamada, numa transação só.
     *
     * Reregistrar o mesmo dia substitui: corrigir a chamada depois da aula é o
     * caso comum, e obrigar a apagar antes seria burocracia sem ganho.
     */
    async registrarAula(
      professorId: string,
      turmaId: string,
      dados: {
        dia: DiaDeEstudo;
        conteudo: string;
        dever: string | null;
        encontro: string | null;
        presencas: readonly RegistroDePresenca[];
      },
    ) {
      return sql.begin(async (transacao) => {
        await exigirTurmaDoProfessor(transacao, professorId, turmaId);

        const matriculados = await transacao<{ aluno_id: string }[]>`
          SELECT aluno_id FROM matriculas WHERE turma_id = ${turmaId}
        `;

        const daTurma = new Set(matriculados.map((linha) => linha.aluno_id));

        // Presença de quem não está na turma é recusada. Aceitar em silêncio
        // criaria registro órfão que ninguém encontra depois.
        for (const presenca of dados.presencas) {
          if (!daTurma.has(presenca.alunoId)) throw naoEncontrado('Aluno');
        }

        const [aula] = await transacao<{ id: string }[]>`
          INSERT INTO aulas ${transacao({
            turma_id: turmaId,
            dia: dados.dia,
            conteudo: dados.conteudo,
            dever: dados.dever,
            encontro: dados.encontro,
          })}
          ON CONFLICT (turma_id, dia) DO UPDATE SET
            conteudo = EXCLUDED.conteudo,
            dever = EXCLUDED.dever,
            encontro = EXCLUDED.encontro
          RETURNING id
        `;

        // A chamada é substituída inteira: mesclar registro novo com antigo
        // deixaria a presença de um aluno removido da turma pendurada na aula.
        await transacao`DELETE FROM presencas WHERE aula_id = ${aula!.id}`;

        for (const presenca of dados.presencas) {
          await transacao`
            INSERT INTO presencas ${transacao({
              aula_id: aula!.id,
              aluno_id: presenca.alunoId,
              situacao: presenca.situacao,
            })}
          `;
        }

        return { id: aula!.id, ...resumirChamada(dados.presencas) };
      });
    },

    /** As aulas da turma, da mais recente para trás. */
    async aulasDaTurma(professorId: string, turmaId: string) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const aulas = await sql<(LinhaDeAula & { presentes: string; ausentes: string })[]>`
        SELECT a.id, a.dia, a.conteudo, a.dever, a.encontro,
               count(*) FILTER (WHERE p.situacao = 'presente') AS presentes,
               count(*) FILTER (WHERE p.situacao = 'ausente') AS ausentes
        FROM aulas a
        LEFT JOIN presencas p ON p.aula_id = a.id
        WHERE a.turma_id = ${turmaId}
        GROUP BY a.id
        ORDER BY a.dia DESC
        LIMIT 60
      `;

      return {
        aulas: aulas.map((aula) => ({
          id: aula.id,
          dia: paraDia(aula.dia),
          conteudo: aula.conteudo,
          dever: aula.dever,
          encontro: aula.encontro,
          presentes: Number(aula.presentes),
          ausentes: Number(aula.ausentes),
        })),
      };
    },

    /** Uma aula específica, com a chamada, para o professor editar. */
    async aula(professorId: string, turmaId: string, aulaId: string) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const [aula] = await sql<LinhaDeAula[]>`
        SELECT id, dia, conteudo, dever, encontro
        FROM aulas WHERE id = ${aulaId} AND turma_id = ${turmaId}
      `;

      if (!aula) throw naoEncontrado('Aula');

      const presencas = await sql<{ aluno_id: string; situacao: Situacao }[]>`
        SELECT aluno_id, situacao FROM presencas WHERE aula_id = ${aulaId}
      `;

      return {
        id: aula.id,
        dia: paraDia(aula.dia),
        conteudo: aula.conteudo,
        dever: aula.dever,
        encontro: aula.encontro,
        presencas: presencas.map((linha) => ({
          alunoId: linha.aluno_id,
          situacao: linha.situacao,
        })),
      };
    },

    /**
     * A frequência da turma inteira.
     *
     * Uma consulta com agregação, e não uma por aluno: com trinta matriculados,
     * o caminho ingênuo seriam trinta e uma idas ao banco a cada abertura.
     */
    async frequenciaDaTurma(professorId: string, turmaId: string) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const linhas = await sql<
        { aluno_id: string; nome: string; situacoes: (Situacao | null)[] }[]
      >`
        SELECT u.id AS aluno_id, u.nome,
               array_remove(array_agg(p.situacao), NULL) AS situacoes
        FROM matriculas m
        JOIN usuarios u ON u.id = m.aluno_id
        LEFT JOIN aulas a ON a.turma_id = m.turma_id
        LEFT JOIN presencas p ON p.aula_id = a.id AND p.aluno_id = u.id
        WHERE m.turma_id = ${turmaId}
        GROUP BY u.id, u.nome
        ORDER BY u.nome
      `;

      return {
        alunos: linhas.map((linha) => {
          const frequencia = calcularFrequencia(
            linha.situacoes.filter(Boolean) as Situacao[],
          );

          return {
            alunoId: linha.aluno_id,
            nome: linha.nome,
            ...frequencia,
            emRisco: emRiscoPorFalta(frequencia),
          };
        }),
      };
    },

    /** O que o aluno vê: as aulas dele e a própria frequência. */
    async minhasAulas(alunoId: string, turmaId: string) {
      const matriculado = await sql`
        SELECT 1 FROM matriculas m
        JOIN turmas t ON t.id = m.turma_id
        WHERE m.aluno_id = ${alunoId}
          AND m.turma_id = ${turmaId}
          AND t.arquivada_em IS NULL
      `;

      if (matriculado.length === 0) throw naoEncontrado('Turma');

      const aulas = await sql<(LinhaDeAula & { situacao: Situacao | null })[]>`
        SELECT a.id, a.dia, a.conteudo, a.dever, a.encontro, p.situacao
        FROM aulas a
        LEFT JOIN presencas p ON p.aula_id = a.id AND p.aluno_id = ${alunoId}
        WHERE a.turma_id = ${turmaId}
        ORDER BY a.dia DESC
        LIMIT 60
      `;

      const frequencia = calcularFrequencia(
        aulas.map((aula) => aula.situacao).filter(Boolean) as Situacao[],
      );

      return {
        aulas: aulas.map((aula) => ({
          id: aula.id,
          dia: paraDia(aula.dia),
          conteudo: aula.conteudo,
          dever: aula.dever,
          encontro: aula.encontro,
          situacao: aula.situacao,
        })),
        frequencia,
        emRisco: emRiscoPorFalta(frequencia),
      };
    },
  };
}

export type ServicoDeDiario = ReturnType<typeof criarServicoDeDiario>;
