import {
  MAXIMO_DA_MENSAGEM,
  MAXIMO_DE_FALAS,
  type CorrecaoNaFala,
  type Fala,
  type Nivel,
  correcoesValidas,
  falasRestantes,
  janelaDeContexto,
  podeContinuar,
} from '@cadencia/dominio';
import { ErroDaApi, naoEncontrado } from '../../compartilhado/erros';
import type { Banco } from '../../infra/banco';
import type { ProvedorDeConversa } from './provedor';

/**
 * Prática de conversação.
 *
 * O histórico vive no banco e a janela é montada aqui. O cliente manda só a
 * mensagem nova: se mandasse o histórico, daria para reescrevê-lo e induzir o
 * modelo a qualquer coisa, inclusive a sair do papel de professor.
 */

interface LinhaDeConversa {
  id: string;
  aluno_id: string;
  cenario: string;
  nivel: Nivel;
  encerrada_em: Date | null;
}

interface LinhaDeFala {
  autor: 'aluno' | 'assistente';
  texto: string;
  correcoes: CorrecaoNaFala[] | null;
}

export function criarServicoDeConversa(sql: Banco, provedor: ProvedorDeConversa) {
  async function minhaConversa(
    alunoId: string,
    conversaId: string,
  ): Promise<LinhaDeConversa> {
    const [conversa] = await sql<LinhaDeConversa[]>`
      SELECT id, aluno_id, cenario, nivel, encerrada_em
      FROM conversas
      WHERE id = ${conversaId} AND aluno_id = ${alunoId}
    `;

    // 404 quando é de outro aluno: um 403 confirmaria que a conversa existe.
    if (!conversa) throw naoEncontrado('Conversa');
    return conversa;
  }

  async function falasDe(conversaId: string): Promise<LinhaDeFala[]> {
    return sql<LinhaDeFala[]>`
      SELECT autor, texto, correcoes FROM falas
      WHERE conversa_id = ${conversaId}
      ORDER BY dita_em
    `;
  }

  return {
    async comecar(alunoId: string, turmaId: string, cenario: string, nivel: Nivel) {
      const matriculado = await sql`
        SELECT 1 FROM matriculas m
        JOIN turmas t ON t.id = m.turma_id
        WHERE m.aluno_id = ${alunoId}
          AND m.turma_id = ${turmaId}
          AND t.arquivada_em IS NULL
      `;

      if (matriculado.length === 0) throw naoEncontrado('Turma');

      const [conversa] = await sql<{ id: string }[]>`
        INSERT INTO conversas ${sql({
          aluno_id: alunoId,
          turma_id: turmaId,
          cenario,
          nivel,
        })}
        RETURNING id
      `;

      return { id: conversa!.id, cenario, nivel, falas: [], restantes: MAXIMO_DE_FALAS };
    },

    async ler(alunoId: string, conversaId: string) {
      const conversa = await minhaConversa(alunoId, conversaId);
      const falas = await falasDe(conversaId);

      const doAluno = falas.filter((fala) => fala.autor === 'aluno').length;

      return {
        id: conversa.id,
        cenario: conversa.cenario,
        nivel: conversa.nivel,
        falas: falas.map((fala) => ({
          autor: fala.autor,
          texto: fala.texto,
          correcoes: fala.correcoes ?? [],
        })),
        restantes: falasRestantes({
          falasDoAluno: doAluno,
          encerrada: conversa.encerrada_em !== null,
        }),
      };
    },

    /**
     * Uma fala do aluno, e a resposta.
     *
     * As duas são gravadas na mesma transação. Gravar só a do aluno quando o
     * provedor falha deixaria a conversa com uma pergunta sem resposta, e a
     * próxima chamada mandaria uma janela que termina no aluno, confundindo o
     * modelo.
     */
    async falar(alunoId: string, conversaId: string, mensagem: string) {
      const conversa = await minhaConversa(alunoId, conversaId);
      const falas = await falasDe(conversaId);

      const doAluno = falas.filter((fala) => fala.autor === 'aluno').length;

      if (
        !podeContinuar({ falasDoAluno: doAluno, encerrada: conversa.encerrada_em !== null })
      ) {
        throw new ErroDaApi('conflito', 'Esta conversa chegou ao fim. Comece outra.');
      }

      const texto = mensagem.trim();

      if (texto.length === 0) {
        throw new ErroDaApi('entrada_invalida', 'Escreva alguma coisa.');
      }

      if (texto.length > MAXIMO_DA_MENSAGEM) {
        throw new ErroDaApi(
          'entrada_invalida',
          `A mensagem passa de ${MAXIMO_DA_MENSAGEM} caracteres.`,
        );
      }

      const historico: Fala[] = falas.map((fala) => ({
        autor: fala.autor,
        texto: fala.texto,
      }));

      const resposta = await provedor.conversar({
        cenario: conversa.cenario,
        nivel: conversa.nivel,
        idioma: 'inglês',
        janela: janelaDeContexto(historico),
        mensagem: texto,
      });

      // Correção que cita trecho inexistente é descartada: numa conversa não há
      // professor para julgar depois, e o aluno não teria como localizá-la.
      const correcoes = correcoesValidas(resposta.correcoes, texto);

      await sql.begin(async (transacao) => {
        await transacao`
          INSERT INTO falas ${transacao({
            conversa_id: conversaId,
            autor: 'aluno',
            texto,
            correcoes: correcoes as never,
          })}
        `;

        await transacao`
          INSERT INTO falas ${transacao({
            conversa_id: conversaId,
            autor: 'assistente',
            texto: resposta.resposta,
            correcoes: null,
          })}
        `;
      });

      const restantes = falasRestantes({
        falasDoAluno: doAluno + 1,
        encerrada: false,
      });

      if (restantes === 0) {
        await sql`UPDATE conversas SET encerrada_em = now() WHERE id = ${conversaId}`;
      }

      return { resposta: resposta.resposta, correcoes, restantes };
    },

    /** As conversas anteriores do aluno, para ele reabrir. */
    async minhas(alunoId: string, turmaId: string) {
      const linhas = await sql<
        {
          id: string;
          cenario: string;
          nivel: Nivel;
          falas: string;
          encerrada_em: Date | null;
        }[]
      >`
        SELECT c.id, c.cenario, c.nivel, count(f.id) AS falas, c.encerrada_em
        FROM conversas c
        LEFT JOIN falas f ON f.conversa_id = c.id AND f.autor = 'aluno'
        WHERE c.aluno_id = ${alunoId} AND c.turma_id = ${turmaId}
        GROUP BY c.id
        ORDER BY c.criada_em DESC
        LIMIT 20
      `;

      return {
        conversas: linhas.map((linha) => ({
          id: linha.id,
          cenario: linha.cenario,
          nivel: linha.nivel,
          falas: Number(linha.falas),
          encerrada: linha.encerrada_em !== null,
        })),
      };
    },
  };
}

export type ServicoDeConversa = ReturnType<typeof criarServicoDeConversa>;
