import type { MatricularSaida, Nivel, Usuario } from '@cadencia/contrato';
import { lerLista, type ResultadoDaImportacao } from '@cadencia/dominio';
import { ErroDaApi, naoEncontrado } from '../../compartilhado/erros';
import type { Banco, Executor } from '../../infra/banco';

/**
 * Gestão do professor: turmas, matrícula e conteúdo.
 *
 * Toda operação confere primeiro que a turma é de quem está pedindo, e responde
 * 404 quando não é — nunca 403, que confirmaria a existência do registro.
 */

interface LinhaDeUsuario {
  id: string;
  nome: string;
  email: string;
  papel: 'aluno' | 'professor';
  fuso: string;
}

export function criarServicoDeGestao(sql: Banco) {
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
    async criarTurma(professorId: string, nome: string, idioma: string) {
      const [turma] = await sql<{ id: string; nome: string; idioma: string }[]>`
        INSERT INTO turmas ${sql({ nome, idioma, professor_id: professorId })}
        RETURNING id, nome, idioma
      `;

      return turma!;
    },

    /** Arquiva em vez de apagar: o histórico dos alunos não pode ir junto. */
    async arquivarTurma(professorId: string, turmaId: string): Promise<void> {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);
      await sql`UPDATE turmas SET arquivada_em = now() WHERE id = ${turmaId}`;
    },

    /**
     * Matricula por e-mail.
     *
     * Três desfechos possíveis, e a tela precisa distinguir os três: a pessoa
     * já tem conta e foi matriculada, ainda não tem e ficou convidada, ou já
     * estava na turma. Um "ok" genérico deixaria o professor sem saber se
     * precisa avisar o aluno para se cadastrar.
     */
    async matricular(
      professorId: string,
      turmaId: string,
      email: string,
    ): Promise<MatricularSaida> {
      return sql.begin(async (transacao) => {
        await exigirTurmaDoProfessor(transacao, professorId, turmaId);

        const [pessoa] = await transacao<LinhaDeUsuario[]>`
          SELECT id, nome, email, papel, fuso FROM usuarios WHERE email = ${email}
        `;

        if (!pessoa) {
          await transacao`
            INSERT INTO convites ${transacao({
              turma_id: turmaId,
              email,
              criado_por: professorId,
            })}
            ON CONFLICT (turma_id, email) DO NOTHING
          `;

          return { situacao: 'convidado' as const, aluno: null };
        }

        if (pessoa.papel !== 'aluno') {
          throw new ErroDaApi(
            'conflito',
            'Esse e-mail pertence a um professor. Só alunos entram em turma.',
          );
        }

        const jaEstava = await transacao`
          SELECT 1 FROM matriculas
          WHERE turma_id = ${turmaId} AND aluno_id = ${pessoa.id}
        `;

        if (jaEstava.length > 0) {
          return { situacao: 'ja_estava' as const, aluno: paraUsuario(pessoa) };
        }

        await transacao`
          INSERT INTO matriculas ${transacao({ turma_id: turmaId, aluno_id: pessoa.id })}
        `;

        return { situacao: 'matriculado' as const, aluno: paraUsuario(pessoa) };
      }) as Promise<MatricularSaida>;
    },

    /** Tira o aluno da turma. O histórico de estudo dele permanece. */
    async desmatricular(professorId: string, turmaId: string, alunoId: string) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const apagadas = await sql`
        DELETE FROM matriculas
        WHERE turma_id = ${turmaId} AND aluno_id = ${alunoId}
      `;

      if (apagadas.count === 0) throw naoEncontrado('Aluno');
    },

    async listarBaralhos(professorId: string, turmaId: string) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const baralhos = await sql<
        { id: string; titulo: string; nivel: Nivel | null; palavras: string }[]
      >`
        SELECT b.id, b.titulo, b.nivel, count(c.id) AS palavras
        FROM baralhos b
        LEFT JOIN cartoes c ON c.baralho_id = b.id
        WHERE b.turma_id = ${turmaId}
        GROUP BY b.id, b.titulo, b.nivel
        ORDER BY b.criado_em
      `;

      return {
        baralhos: baralhos.map((baralho) => ({
          id: baralho.id,
          titulo: baralho.titulo,
          nivel: baralho.nivel,
          palavras: Number(baralho.palavras),
        })),
      };
    },

    async criarBaralho(
      professorId: string,
      turmaId: string,
      titulo: string,
      nivel: Nivel | null,
    ) {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const [baralho] = await sql<{ id: string }[]>`
        INSERT INTO baralhos ${sql({ turma_id: turmaId, titulo, nivel })}
        RETURNING id
      `;

      return { id: baralho!.id, titulo, nivel, palavras: 0 };
    },

    /**
     * Importa a lista colada.
     *
     * O que já existe no baralho é **ignorado, não duplicado** — reimportar uma
     * lista corrigida é o fluxo normal, e duplicar faria o aluno ver a mesma
     * carta duas vezes. A garantia vem do índice único, e não de conferir antes:
     * conferir antes perde numa corrida entre duas importações.
     */
    async importarPalavras(professorId: string, baralhoId: string, texto: string) {
      const resultado: ResultadoDaImportacao = lerLista(texto);

      return sql.begin(async (transacao) => {
        const [baralho] = await transacao<{ turma_id: string; ordem: string }[]>`
          SELECT b.turma_id, coalesce(max(c.ordem), 0) AS ordem
          FROM baralhos b
          LEFT JOIN cartoes c ON c.baralho_id = b.id
          WHERE b.id = ${baralhoId}
          GROUP BY b.turma_id
        `;

        if (!baralho) throw naoEncontrado('Baralho');
        await exigirTurmaDoProfessor(transacao, professorId, baralho.turma_id);

        let ordem = Number(baralho.ordem);
        let criadas = 0;

        for (const palavra of resultado.palavras) {
          ordem += 1;

          const inseridas = await transacao<{ id: string }[]>`
            INSERT INTO cartoes ${transacao({
              baralho_id: baralhoId,
              frente: palavra.frente,
              verso: palavra.verso,
              dica: palavra.dica,
              ordem,
            })}
            ON CONFLICT (baralho_id, lower(trim(frente))) DO NOTHING
            RETURNING id
          `;

          if (inseridas.length > 0) criadas += 1;
        }

        return {
          criadas,
          jaExistiam: resultado.palavras.length - criadas,
          problemas: resultado.problemas,
          repetidas: resultado.repetidas,
        };
      });
    },

    async apagarBaralho(professorId: string, baralhoId: string): Promise<void> {
      const [baralho] = await sql<{ turma_id: string }[]>`
        SELECT turma_id FROM baralhos WHERE id = ${baralhoId}
      `;

      if (!baralho) throw naoEncontrado('Baralho');
      await exigirTurmaDoProfessor(sql, professorId, baralho.turma_id);

      await sql`DELETE FROM baralhos WHERE id = ${baralhoId}`;
    },

    /**
     * Devolve uma palavra travada ao estudo.
     *
     * É o botão "revisamos em aula". Sem ele o ciclo fica aberto: a carta sai da
     * revisão do aluno, o professor explica, e ela nunca volta — o oposto do que
     * o produto promete.
     *
     * Os lapsos são zerados junto: manter o contador em quatro faria a carta ser
     * sinalizada de novo no erro seguinte, e a explicação não teria valido nada.
     */
    async destravarPalavra(
      professorId: string,
      turmaId: string,
      alunoId: string,
      cartaoId: string,
    ): Promise<void> {
      await exigirTurmaDoProfessor(sql, professorId, turmaId);

      const atualizadas = await sql`
        UPDATE agendamentos SET sinalizado = false, lapsos = 0, atualizado_em = now()
        WHERE aluno_id = ${alunoId} AND cartao_id = ${cartaoId} AND sinalizado
      `;

      if (atualizadas.count === 0) throw naoEncontrado('Palavra travada');
    },
  };
}

function paraUsuario(linha: LinhaDeUsuario): Usuario {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel,
    fuso: linha.fuso,
  };
}

export type ServicoDeGestao = ReturnType<typeof criarServicoDeGestao>;
