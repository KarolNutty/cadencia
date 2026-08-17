import type { Avaliacao, DiaDeEstudo } from '@cadencia/dominio';
import { agendamentoNovo, type Agendamento } from '@cadencia/dominio';
import type { Cartao } from '@cadencia/contrato';
import type { Executor } from '../../infra/banco';

export interface CartaDoAluno {
  cartao: Cartao;
  agendamento: Agendamento;
}

interface LinhaDeCarta {
  id: string;
  frente: string;
  verso: string;
  dica: string | null;
  intervalo_dias: number | null;
  facilidade: string | null;
  repeticoes: number | null;
  lapsos: number | null;
  vence_em: Date | null;
  sinalizado: boolean | null;
}

function paraDia(data: Date): DiaDeEstudo {
  // A coluna é DATE; o driver devolve Date à meia-noite UTC. Formatar de volta
  // em UTC evita o clássico de "um dia a menos" em fuso negativo.
  return data.toISOString().slice(0, 10) as DiaDeEstudo;
}

function paraCarta(linha: LinhaDeCarta, hoje: DiaDeEstudo): CartaDoAluno {
  const cartao: Cartao = {
    id: linha.id,
    frente: linha.frente,
    verso: linha.verso,
    dica: linha.dica,
  };

  // Sem linha em `agendamentos`, a carta nunca foi vista: nasce vencendo hoje.
  // Materializar todas no cadastro criaria milhares de linhas para alunos que
  // talvez nunca abram o baralho.
  if (linha.vence_em === null) {
    return { cartao, agendamento: agendamentoNovo(hoje) };
  }

  return {
    cartao,
    agendamento: {
      intervaloDias: linha.intervalo_dias!,
      // NUMERIC volta como texto para não perder precisão. Converter aqui, e
      // não deixar o número virar string silenciosamente lá na regra.
      facilidade: Number(linha.facilidade),
      repeticoes: linha.repeticoes!,
      lapsos: linha.lapsos!,
      venceEm: paraDia(linha.vence_em),
      sinalizado: linha.sinalizado!,
    },
  };
}

export function criarRepositorioDeEstudo(sql: Executor) {
  return {
    /**
     * O aluno está matriculado nesta turma?
     *
     * Toda consulta de estudo passa por aqui **antes** de tocar em qualquer
     * dado, e o id do aluno vem do token, nunca da URL. É o que impede trocar
     * o id no caminho e ler o progresso do colega.
     */
    async temMatricula(alunoId: string, turmaId: string): Promise<boolean> {
      const linhas = await sql`
        SELECT 1 FROM matriculas
        WHERE aluno_id = ${alunoId} AND turma_id = ${turmaId}
      `;
      return linhas.length > 0;
    },

    /**
     * As turmas de um usuário, conforme o papel dele.
     *
     * O id vem do token de quem chamou. Não existe parâmetro para pedir a lista
     * de outra pessoa — a rota simplesmente não oferece essa possibilidade, que
     * é mais forte do que oferecê-la e conferir depois.
     */
    async listarTurmas(
      usuarioId: string,
      papel: 'aluno' | 'professor',
    ): Promise<{ id: string; nome: string; idioma: string }[]> {
      if (papel === 'professor') {
        return sql<{ id: string; nome: string; idioma: string }[]>`
          SELECT id, nome, idioma FROM turmas
          WHERE professor_id = ${usuarioId}
          ORDER BY criada_em DESC
        `;
      }

      return sql<{ id: string; nome: string; idioma: string }[]>`
        SELECT t.id, t.nome, t.idioma
        FROM turmas t
        JOIN matriculas m ON m.turma_id = t.id
        WHERE m.aluno_id = ${usuarioId}
        ORDER BY m.matriculado_em DESC
      `;
    },

    /** Todas as cartas da turma, já com o estado daquele aluno em cada uma. */
    async listarCartas(
      alunoId: string,
      turmaId: string,
      hoje: DiaDeEstudo,
    ): Promise<CartaDoAluno[]> {
      const linhas = await sql<LinhaDeCarta[]>`
        SELECT c.id, c.frente, c.verso, c.dica,
               a.intervalo_dias, a.facilidade, a.repeticoes,
               a.lapsos, a.vence_em, a.sinalizado
        FROM cartoes c
        JOIN baralhos b ON b.id = c.baralho_id
        LEFT JOIN agendamentos a
          ON a.cartao_id = c.id AND a.aluno_id = ${alunoId}
        WHERE b.turma_id = ${turmaId}
        ORDER BY c.criado_em
      `;

      return linhas.map((linha) => paraCarta(linha, hoje));
    },

    /** O professor é dono desta turma? */
    async ehDonoDaTurma(professorId: string, turmaId: string): Promise<boolean> {
      const linhas = await sql`
        SELECT 1 FROM turmas WHERE id = ${turmaId} AND professor_id = ${professorId}
      `;
      return linhas.length > 0;
    },

    /**
     * Os alunos da turma, com o andamento de cada um.
     *
     * Uma consulta só, com agregação no banco. A alternativa — carregar os
     * alunos e depois consultar o progresso de cada um — é o problema N+1: com
     * trinta alunos, trinta e uma idas ao banco a cada abertura do painel.
     */
    async alunosDaTurma(turmaId: string): Promise<
      {
        id: string;
        nome: string;
        email: string;
        fuso: string;
        ultimoEstudo: DiaDeEstudo | null;
        vencendoHoje: number;
        sinalizadas: number;
      }[]
    > {
      const linhas = await sql<
        {
          id: string;
          nome: string;
          email: string;
          fuso: string;
          ultimo_estudo: Date | null;
          vencendo_hoje: string;
          sinalizadas: string;
        }[]
      >`
        SELECT
          u.id, u.nome, u.email, u.fuso,
          (SELECT max(r.dia) FROM revisoes r WHERE r.aluno_id = u.id) AS ultimo_estudo,
          -- O "hoje" é calculado por linha, no fuso de CADA aluno, e com a
          -- mesma regra das 4h do domínio. Usar um único dia de referência —
          -- o do servidor — faria quem está em outro fuso, ou quem estuda de
          -- madrugada, aparecer no dia errado para o professor.
          count(*) FILTER (
            WHERE a.sinalizado = false
              AND a.vence_em <= (timezone(u.fuso, now()) - interval '4 hours')::date
          ) AS vencendo_hoje,
          count(*) FILTER (WHERE a.sinalizado) AS sinalizadas
        FROM usuarios u
        JOIN matriculas m ON m.aluno_id = u.id
        LEFT JOIN agendamentos a ON a.aluno_id = u.id
        LEFT JOIN cartoes c ON c.id = a.cartao_id
        LEFT JOIN baralhos b ON b.id = c.baralho_id AND b.turma_id = ${turmaId}
        WHERE m.turma_id = ${turmaId}
        GROUP BY u.id, u.nome, u.email, u.fuso
        ORDER BY u.nome
      `;

      return linhas.map((linha) => ({
        id: linha.id,
        nome: linha.nome,
        email: linha.email,
        fuso: linha.fuso,
        ultimoEstudo: linha.ultimo_estudo === null ? null : paraDia(linha.ultimo_estudo),
        vencendoHoje: Number(linha.vencendo_hoje),
        sinalizadas: Number(linha.sinalizadas),
      }));
    },

    /** Um aluno específico, se ele estiver nesta turma. */
    async alunoDaTurma(
      alunoId: string,
      turmaId: string,
    ): Promise<{ id: string; nome: string; email: string; fuso: string } | null> {
      const linhas = await sql<{ id: string; nome: string; email: string; fuso: string }[]>`
        SELECT u.id, u.nome, u.email, u.fuso
        FROM usuarios u
        JOIN matriculas m ON m.aluno_id = u.id
        WHERE u.id = ${alunoId} AND m.turma_id = ${turmaId}
      `;

      return linhas[0] ?? null;
    },

    /** As cartas que este aluno errou tantas vezes que viraram assunto de aula. */
    async cartasSinalizadas(
      alunoId: string,
      turmaId: string,
    ): Promise<{ cartao: Cartao; lapsos: number; ultimaRevisao: DiaDeEstudo | null }[]> {
      const linhas = await sql<
        {
          id: string;
          frente: string;
          verso: string;
          dica: string | null;
          lapsos: number;
          ultima_revisao: Date | null;
        }[]
      >`
        SELECT c.id, c.frente, c.verso, c.dica, a.lapsos,
               (SELECT max(r.dia) FROM revisoes r
                WHERE r.aluno_id = a.aluno_id AND r.cartao_id = c.id) AS ultima_revisao
        FROM agendamentos a
        JOIN cartoes c ON c.id = a.cartao_id
        JOIN baralhos b ON b.id = c.baralho_id
        WHERE a.aluno_id = ${alunoId} AND b.turma_id = ${turmaId} AND a.sinalizado
        ORDER BY a.lapsos DESC, c.frente
      `;

      return linhas.map((linha) => ({
        cartao: {
          id: linha.id,
          frente: linha.frente,
          verso: linha.verso,
          dica: linha.dica,
        },
        lapsos: linha.lapsos,
        ultimaRevisao: linha.ultima_revisao === null ? null : paraDia(linha.ultima_revisao),
      }));
    },

    /** Em que dias este aluno estudou, do mais recente para trás. */
    async diasEstudados(alunoId: string, turmaId: string): Promise<DiaDeEstudo[]> {
      const linhas = await sql<{ dia: Date }[]>`
        SELECT DISTINCT r.dia
        FROM revisoes r
        JOIN cartoes c ON c.id = r.cartao_id
        JOIN baralhos b ON b.id = c.baralho_id
        WHERE r.aluno_id = ${alunoId} AND b.turma_id = ${turmaId}
        ORDER BY r.dia DESC
        LIMIT 400
      `;

      return linhas.map((linha) => paraDia(linha.dia));
    },

    /** Este lote já foi processado antes? */
    async loteJaExiste(loteId: string): Promise<boolean> {
      const linhas = await sql`SELECT 1 FROM revisoes WHERE lote_id = ${loteId} LIMIT 1`;
      return linhas.length > 0;
    },

    /** Quais destas cartas realmente pertencem à turma. */
    async filtrarCartasDaTurma(turmaId: string, cartaoIds: string[]): Promise<Set<string>> {
      if (cartaoIds.length === 0) return new Set();

      const linhas = await sql<{ id: string }[]>`
        SELECT c.id
        FROM cartoes c
        JOIN baralhos b ON b.id = c.baralho_id
        WHERE b.turma_id = ${turmaId} AND c.id IN ${sql(cartaoIds)}
      `;

      return new Set(linhas.map((linha) => linha.id));
    },

    async agendamentoDe(
      alunoId: string,
      cartaoId: string,
      hoje: DiaDeEstudo,
    ): Promise<Agendamento> {
      const linhas = await sql<LinhaDeCarta[]>`
        SELECT NULL::uuid AS id, '' AS frente, '' AS verso, NULL AS dica,
               intervalo_dias, facilidade, repeticoes, lapsos, vence_em, sinalizado
        FROM agendamentos
        WHERE aluno_id = ${alunoId} AND cartao_id = ${cartaoId}
      `;

      const linha = linhas[0];
      if (!linha || linha.vence_em === null) return agendamentoNovo(hoje);

      return paraCarta(linha, hoje).agendamento;
    },

    async gravarRevisao(dados: {
      alunoId: string;
      cartaoId: string;
      avaliacao: Avaliacao;
      dia: DiaDeEstudo;
      intervaloAnterior: number;
      intervaloNovo: number;
      loteId: string;
    }): Promise<void> {
      await sql`
        INSERT INTO revisoes ${sql({
          aluno_id: dados.alunoId,
          cartao_id: dados.cartaoId,
          avaliacao: dados.avaliacao,
          dia: dados.dia,
          intervalo_anterior: dados.intervaloAnterior,
          intervalo_novo: dados.intervaloNovo,
          lote_id: dados.loteId,
        })}
        ON CONFLICT (lote_id, cartao_id) DO NOTHING
      `;
    },

    async salvarAgendamento(
      alunoId: string,
      cartaoId: string,
      agendamento: Agendamento,
    ): Promise<void> {
      await sql`
        INSERT INTO agendamentos ${sql({
          aluno_id: alunoId,
          cartao_id: cartaoId,
          intervalo_dias: agendamento.intervaloDias,
          facilidade: agendamento.facilidade,
          repeticoes: agendamento.repeticoes,
          lapsos: agendamento.lapsos,
          vence_em: agendamento.venceEm,
          sinalizado: agendamento.sinalizado,
        })}
        ON CONFLICT (aluno_id, cartao_id) DO UPDATE SET
          intervalo_dias = EXCLUDED.intervalo_dias,
          facilidade     = EXCLUDED.facilidade,
          repeticoes     = EXCLUDED.repeticoes,
          lapsos         = EXCLUDED.lapsos,
          vence_em       = EXCLUDED.vence_em,
          sinalizado     = EXCLUDED.sinalizado,
          atualizado_em  = now()
      `;
    },
  };
}

export type RepositorioDeEstudo = ReturnType<typeof criarRepositorioDeEstudo>;
