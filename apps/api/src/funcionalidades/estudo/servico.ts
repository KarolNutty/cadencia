import type { SessaoSaida } from '@cadencia/contrato';
import {
  type Agendamento,
  type Avaliacao,
  type DiaDeEstudo,
  agendar,
  diaDeEstudoDe,
  diasEntre,
  montarSessao,
  resumirAluno,
  sequenciaDeDias,
} from '@cadencia/dominio';
import { ErroDaApi, naoEncontrado } from '../../compartilhado/erros';
import type { Banco } from '../../infra/banco';
import { criarRepositorioDeEstudo } from './repositorio';

export interface RevisaoRecebida {
  cartaoId: string;
  avaliacao: Avaliacao;
  dia: DiaDeEstudo;
}

export interface ResultadoDoEnvio {
  agendamentos: { cartaoId: string; agendamento: Agendamento }[];
  jaProcessado: boolean;
}

/**
 * O dia vem do app, mas dentro de limites.
 *
 * Só o cliente sabe o fuso do aluno e se já passou das 4h — por isso ele
 * informa. Mas confiar sem limite deixaria alguém marcar estudo em 2050 e
 * sumir da lista de pendências para sempre, ou preencher meses de sequência
 * que nunca existiram.
 *
 * Um dia à frente cobre a diferença de fuso mais extrema. Sete dias atrás cobre
 * o app que ficou offline uma semana.
 */
const DIAS_ADIANTE_TOLERADOS = 1;
const DIAS_ATRAS_TOLERADOS = 7;

function conferirDia(dia: DiaDeEstudo, hojeNoServidor: DiaDeEstudo): void {
  const diferenca = diasEntre(hojeNoServidor, dia);

  if (diferenca > DIAS_ADIANTE_TOLERADOS || diferenca < -DIAS_ATRAS_TOLERADOS) {
    throw new ErroDaApi(
      'entrada_invalida',
      'A data da revisão está fora do intervalo aceito.',
      [{ campo: 'dia', motivo: `${dia} está distante demais de hoje.` }],
    );
  }
}

export function criarServicoDeEstudo(sql: Banco) {
  const repositorio = criarRepositorioDeEstudo(sql);

  /**
   * Confere a matrícula e responde 404 quando não há.
   *
   * **404, e não 403.** Um 403 confirma que aquela turma existe, e isso permite
   * mapear a base inteira só variando o id na URL. O 404 não distingue "não
   * existe" de "não é sua".
   */
  async function exigirMatricula(alunoId: string, turmaId: string): Promise<void> {
    if (!(await repositorio.temMatricula(alunoId, turmaId))) {
      throw naoEncontrado('Turma');
    }
  }

  /**
   * Confere que a turma é deste professor. 404 quando não é — mesmo motivo da
   * matrícula do aluno: um 403 confirmaria que aquela turma existe.
   */
  async function exigirTurmaDoProfessor(
    professorId: string,
    turmaId: string,
  ): Promise<void> {
    if (!(await repositorio.ehDonoDaTurma(professorId, turmaId))) {
      throw naoEncontrado('Turma');
    }
  }

  return {
    async minhasTurmas(usuarioId: string, papel: 'aluno' | 'professor') {
      return { turmas: await repositorio.listarTurmas(usuarioId, papel) };
    },

    async montarSessaoDoDia(
      alunoId: string,
      turmaId: string,
      hoje: DiaDeEstudo,
      limite?: number,
    ): Promise<SessaoSaida> {
      await exigirMatricula(alunoId, turmaId);

      const cartas = await repositorio.listarCartas(alunoId, turmaId, hoje);

      const selecionadas = montarSessao(
        cartas.map((carta) => ({
          cartaoId: carta.cartao.id,
          agendamento: carta.agendamento,
        })),
        hoje,
        limite === undefined ? {} : { limite },
      );

      const porId = new Map(cartas.map((carta) => [carta.cartao.id, carta]));

      return {
        cartas: selecionadas.map((escolhida) => {
          const carta = porId.get(escolhida.cartaoId)!;
          return { cartao: carta.cartao, agendamento: carta.agendamento };
        }),
        resumo: resumirAluno(
          cartas.map((carta) => ({
            cartaoId: carta.cartao.id,
            agendamento: carta.agendamento,
          })),
          hoje,
        ),
        sequenciaDeDias: sequenciaDeDias(
          await repositorio.diasEstudados(alunoId, turmaId),
          hoje,
        ),
      };
    },

    /**
     * O painel da turma: quem estudou, quem está devendo, o que travou.
     *
     * Não recebe um "hoje": **cada aluno tem o seu**. O professor pode estar em
     * São Paulo com o aluno em Lisboa, ou simplesmente abrir o painel às duas
     * da manhã — e nos dois casos um dia de referência único poria gente no dia
     * errado.
     */
    async painelDaTurma(professorId: string, turmaId: string) {
      await exigirTurmaDoProfessor(professorId, turmaId);

      const alunos = await repositorio.alunosDaTurma(turmaId);

      return {
        alunos: await Promise.all(
          alunos.map(async (aluno) => ({
            usuario: {
              id: aluno.id,
              nome: aluno.nome,
              email: aluno.email,
              papel: 'aluno' as const,
              fuso: aluno.fuso,
            },
            ultimoEstudo: aluno.ultimoEstudo,
            // O fuso é o do aluno, e não o do servidor nem o do professor.
            sequenciaDeDias: sequenciaDeDias(
              await repositorio.diasEstudados(aluno.id, turmaId),
              diaDeEstudoDe(new Date(), aluno.fuso),
            ),
            vencendoHoje: aluno.vencendoHoje,
            sinalizadas: aluno.sinalizadas,
          })),
        ),
      };
    },

    /** O que levar para a próxima aula deste aluno. */
    async sinalizadasDoAluno(professorId: string, turmaId: string, alunoId: string) {
      await exigirTurmaDoProfessor(professorId, turmaId);

      const aluno = await repositorio.alunoDaTurma(alunoId, turmaId);

      // Aluno de outra turma: 404, e não uma lista vazia. Lista vazia diria
      // "este aluno existe e não tem nada sinalizado", que é informação demais.
      if (!aluno) throw naoEncontrado('Aluno');

      return {
        aluno: {
          id: aluno.id,
          nome: aluno.nome,
          email: aluno.email,
          papel: 'aluno' as const,
          fuso: aluno.fuso,
        },
        cartas: await repositorio.cartasSinalizadas(alunoId, turmaId),
      };
    },

    /**
     * Processa o lote inteiro, ou nenhum.
     *
     * Uma transação para todo o lote: meio lote gravado deixaria o app sem
     * saber o que reenviar, e o histórico com buraco. E o `loteId` faz o
     * reenvio ser seguro — se a resposta se perder na volta, a segunda
     * tentativa reconhece que já processou em vez de duplicar a revisão.
     */
    async registrarRevisoes(
      alunoId: string,
      turmaId: string,
      loteId: string,
      revisoes: readonly RevisaoRecebida[],
      hojeNoServidor: DiaDeEstudo,
    ): Promise<ResultadoDoEnvio> {
      await exigirMatricula(alunoId, turmaId);

      for (const revisao of revisoes) conferirDia(revisao.dia, hojeNoServidor);

      const cartoesDaTurma = await repositorio.filtrarCartasDaTurma(
        turmaId,
        revisoes.map((revisao) => revisao.cartaoId),
      );

      for (const revisao of revisoes) {
        // Carta de outra turma no lote: 404, pelo mesmo motivo da matrícula.
        if (!cartoesDaTurma.has(revisao.cartaoId)) throw naoEncontrado('Cartão');
      }

      return sql.begin(async (transacao) => {
        const dentro = criarRepositorioDeEstudo(transacao);

        if (await dentro.loteJaExiste(loteId)) {
          const agendamentos = await Promise.all(
            revisoes.map(async (revisao) => ({
              cartaoId: revisao.cartaoId,
              agendamento: await dentro.agendamentoDe(
                alunoId,
                revisao.cartaoId,
                hojeNoServidor,
              ),
            })),
          );

          return { agendamentos, jaProcessado: true };
        }

        const agendamentos: ResultadoDoEnvio['agendamentos'] = [];

        // Em ordem cronológica: o agendamento de cada revisão depende do estado
        // deixado pela anterior. Fora de ordem, o resultado seria outro.
        const emOrdem = [...revisoes].sort((a, b) => a.dia.localeCompare(b.dia));

        for (const revisao of emOrdem) {
          const atual = await dentro.agendamentoDe(alunoId, revisao.cartaoId, revisao.dia);
          const novo = agendar(atual, revisao.avaliacao, revisao.dia);

          await dentro.gravarRevisao({
            alunoId,
            cartaoId: revisao.cartaoId,
            avaliacao: revisao.avaliacao,
            dia: revisao.dia,
            intervaloAnterior: atual.intervaloDias,
            intervaloNovo: novo.intervaloDias,
            loteId,
          });

          await dentro.salvarAgendamento(alunoId, revisao.cartaoId, novo);
          agendamentos.push({ cartaoId: revisao.cartaoId, agendamento: novo });
        }

        return { agendamentos, jaProcessado: false };
      }) as Promise<ResultadoDoEnvio>;
    },
  };
}

export type ServicoDeEstudo = ReturnType<typeof criarServicoDeEstudo>;
