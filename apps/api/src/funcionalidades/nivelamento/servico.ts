import type { ProximaPerguntaSaida, ResponderNivelamentoSaida } from '@cadencia/contrato';
import {
  type EstadoDoTeste,
  type Nivel,
  type Pergunta,
  NIVEIS,
  iniciarTeste,
  proximaPergunta,
  responder,
  resultado,
  terminou,
} from '@cadencia/dominio';
import { ErroDaApi, naoEncontrado } from '../../compartilhado/erros';
import type { Banco, Executor } from '../../infra/banco';

/**
 * O teste de nivelamento.
 *
 * **O estado da busca vive no servidor, e o gabarito nunca sai daqui.**
 *
 * A alternativa, mandar as perguntas com a resposta e deixar o navegador
 * calcular, seria mais simples e mais rápida, e destruiria o teste: qualquer
 * pessoa com o console aberto veria o gabarito antes de escolher, ou reescreveria
 * o estado para sair com C2. Um teste de nivelamento que pode ser burlado não
 * mede nível nenhum, e o aluno acaba numa turma onde não entende nada.
 */

interface LinhaDeTentativa {
  id: string;
  nivel_atual: Nivel;
  menor: number;
  maior: number;
  concluida_em: Date | null;
}

interface LinhaDeResposta {
  pergunta_id: string;
  nivel: Nivel;
  acertou: boolean;
}

export function criarServicoDeNivelamento(sql: Banco) {
  /** Reconstrói o estado do domínio a partir do que está gravado. */
  function montarEstado(
    tentativa: LinhaDeTentativa,
    respostas: readonly LinhaDeResposta[],
  ): EstadoDoTeste {
    return {
      nivelAtual: tentativa.nivel_atual,
      menor: tentativa.menor,
      maior: tentativa.maior,
      respostas: respostas.map((linha) => ({
        perguntaId: linha.pergunta_id,
        nivel: linha.nivel,
        acertou: linha.acertou,
      })),
    };
  }

  async function tentativaAberta(
    executor: Executor,
    alunoId: string,
    idioma: string,
  ): Promise<LinhaDeTentativa> {
    const [existente] = await executor<LinhaDeTentativa[]>`
      SELECT id, nivel_atual, menor, maior, concluida_em
      FROM tentativas_de_nivelamento
      WHERE aluno_id = ${alunoId} AND idioma = ${idioma} AND concluida_em IS NULL
      ORDER BY criada_em DESC
      LIMIT 1
    `;

    if (existente) return existente;

    const inicial = iniciarTeste();

    const [criada] = await executor<LinhaDeTentativa[]>`
      INSERT INTO tentativas_de_nivelamento ${executor({
        aluno_id: alunoId,
        idioma,
        nivel_atual: inicial.nivelAtual,
        menor: inicial.menor,
        maior: inicial.maior,
      })}
      RETURNING id, nivel_atual, menor, maior, concluida_em
    `;

    return criada!;
  }

  async function respostasDe(
    executor: Executor,
    tentativaId: string,
  ): Promise<LinhaDeResposta[]> {
    return executor<LinhaDeResposta[]>`
      SELECT pergunta_id, nivel, acertou
      FROM respostas_de_nivelamento
      WHERE tentativa_id = ${tentativaId}
      ORDER BY respondida_em
    `;
  }

  return {
    /** A próxima pergunta, sem o gabarito. */
    async proxima(alunoId: string, idioma: string): Promise<ProximaPerguntaSaida> {
      const tentativa = await tentativaAberta(sql, alunoId, idioma);
      const respostas = await respostasDe(sql, tentativa.id);
      const estado = montarEstado(tentativa, respostas);

      if (terminou(estado)) {
        return {
          pergunta: null,
          respondidas: respostas.length,
          resultado: resultado(estado),
        };
      }

      const banco = await sql<
        { id: string; nivel: Nivel; enunciado: string; alternativas: string[] }[]
      >`
        SELECT id, nivel, enunciado, alternativas
        FROM perguntas_de_nivelamento
        WHERE idioma = ${idioma}
      `;

      const escolhida = proximaPergunta(
        banco.map((linha) => ({ ...linha, correta: -1 }) as Pergunta),
        estado,
        new Set(respostas.map((resposta) => resposta.pergunta_id)),
      );

      if (!escolhida) {
        return { pergunta: null, respondidas: respostas.length, resultado: null };
      }

      return {
        pergunta: {
          id: escolhida.id,
          enunciado: escolhida.enunciado,
          alternativas: escolhida.alternativas,
        },
        respondidas: respostas.length,
        resultado: null,
      };
    },

    /**
     * Registra a resposta e devolve só se acertou.
     *
     * A correção acontece aqui, comparando com a coluna que nunca saiu do banco.
     */
    async responder(
      alunoId: string,
      idioma: string,
      perguntaId: string,
      escolha: number,
    ): Promise<ResponderNivelamentoSaida> {
      return sql.begin(async (transacao) => {
        const tentativa = await tentativaAberta(transacao, alunoId, idioma);
        const respostas = await respostasDe(transacao, tentativa.id);
        const estado = montarEstado(tentativa, respostas);

        if (terminou(estado)) {
          throw new ErroDaApi('conflito', 'Este teste já foi concluído.');
        }

        const [pergunta] = await transacao<{ nivel: Nivel; correta: number }[]>`
          SELECT nivel, correta FROM perguntas_de_nivelamento
          WHERE id = ${perguntaId} AND idioma = ${idioma}
        `;

        if (!pergunta) throw naoEncontrado('Pergunta');

        const acertou = escolha === pergunta.correta;

        // A pergunta responde pelo nível DELA, e não pelo nível em que a busca
        // estava: se o banco não tinha item do nível pedido, a escolha caiu no
        // mais próximo, e é esse que vale.
        const comNivelReal: EstadoDoTeste = { ...estado, nivelAtual: pergunta.nivel };
        const proximo = responder(comNivelReal, acertou);

        const gravadas = await transacao`
          INSERT INTO respostas_de_nivelamento ${transacao({
            tentativa_id: tentativa.id,
            pergunta_id: perguntaId,
            nivel: pergunta.nivel,
            acertou,
          })}
          ON CONFLICT (tentativa_id, pergunta_id) DO NOTHING
        `;

        // Repetir a mesma pergunta não altera nada: a medida ficaria inflada
        // por quem tentasse reenviar até acertar.
        if (gravadas.count === 0) {
          throw new ErroDaApi('conflito', 'Esta pergunta já foi respondida.');
        }

        await transacao`
          UPDATE tentativas_de_nivelamento
          SET nivel_atual = ${proximo.nivelAtual},
              menor = ${proximo.menor},
              maior = ${proximo.maior}
          WHERE id = ${tentativa.id}
        `;

        if (!terminou(proximo)) return { acertou, resultado: null };

        const final = resultado(proximo);

        await transacao`
          UPDATE tentativas_de_nivelamento
          SET nivel_final = ${final.nivel},
              confianca = ${final.confianca},
              concluida_em = now()
          WHERE id = ${tentativa.id}
        `;

        return { acertou, resultado: final };
      }) as Promise<ResponderNivelamentoSaida>;
    },

    /** O que o professor vê: quem fez o teste e com que nível. */
    async tentativasDaTurma(professorId: string, turmaId: string) {
      const daTurma = await sql`
        SELECT 1 FROM turmas
        WHERE id = ${turmaId} AND professor_id = ${professorId} AND arquivada_em IS NULL
      `;

      if (daTurma.length === 0) throw naoEncontrado('Turma');

      const linhas = await sql<
        {
          aluno_id: string;
          nome: string;
          nivel_final: Nivel | null;
          confianca: string | null;
          confirmado_em: Date | null;
        }[]
      >`
        SELECT u.id AS aluno_id, u.nome, t.nivel_final, t.confianca, t.confirmado_em
        FROM tentativas_de_nivelamento t
        JOIN usuarios u ON u.id = t.aluno_id
        JOIN matriculas m ON m.aluno_id = u.id AND m.turma_id = ${turmaId}
        WHERE t.concluida_em IS NOT NULL
        ORDER BY t.concluida_em DESC
      `;

      return {
        tentativas: linhas.map((linha) => ({
          alunoId: linha.aluno_id,
          nome: linha.nome,
          nivel: linha.nivel_final,
          confianca: linha.confianca === null ? null : Number(linha.confianca),
          confirmado: linha.confirmado_em !== null,
        })),
      };
    },
  };
}

export type ServicoDeNivelamento = ReturnType<typeof criarServicoDeNivelamento>;

/** Os níveis em ordem, para a tela do professor. */
export const ESCALA = NIVEIS;
