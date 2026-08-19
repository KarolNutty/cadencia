import {
  MAXIMO_DE_PALAVRAS,
  type AnaliseDaIa,
  type Nivel,
  avaliarTamanho,
  contarPalavras,
  verificarAnalise,
} from '@cadencia/dominio';
import { ErroDaApi, naoEncontrado } from '../../compartilhado/erros';
import type { Banco } from '../../infra/banco';
import type { ProvedorDeAnalise } from './provedor';

/**
 * Correção de redação.
 *
 * A IA analisa, o código verifica, o professor avalia. Nenhuma das três etapas
 * substitui a outra, e a do meio existe porque modelo de linguagem cita
 * trechos que não estão no texto quando parafraseia sem perceber.
 */

interface LinhaDeRedacao {
  id: string;
  tema_id: string;
  aluno_id: string;
  texto: string;
  palavras: number;
  analise: AnaliseDaIa | null;
  provedor: string | null;
  parecer: string | null;
  nota: number | null;
  corrigida_em: Date | null;
  enviada_em: Date;
}

export function criarServicoDeRedacao(sql: Banco, provedor: ProvedorDeAnalise) {
  async function temaDaTurmaDoAluno(alunoId: string, temaId: string) {
    const [tema] = await sql<
      { id: string; titulo: string; enunciado: string; nivel: Nivel; idioma: string }[]
    >`
      SELECT t.id, t.titulo, t.enunciado, t.nivel, tu.idioma
      FROM temas_de_redacao t
      JOIN turmas tu ON tu.id = t.turma_id
      JOIN matriculas m ON m.turma_id = tu.id
      WHERE t.id = ${temaId} AND m.aluno_id = ${alunoId} AND tu.arquivada_em IS NULL
    `;

    // 404 quando o tema é de outra turma: um 403 confirmaria que ele existe.
    if (!tema) throw naoEncontrado('Tema');
    return tema;
  }

  return {
    /** Os temas abertos para o aluno, com o que ele já entregou. */
    async temasDoAluno(alunoId: string, turmaId: string) {
      const linhas = await sql<
        {
          id: string;
          titulo: string;
          enunciado: string;
          nivel: Nivel;
          redacao_id: string | null;
          corrigida_em: Date | null;
        }[]
      >`
        SELECT t.id, t.titulo, t.enunciado, t.nivel,
               r.id AS redacao_id, r.corrigida_em
        FROM temas_de_redacao t
        JOIN matriculas m ON m.turma_id = t.turma_id AND m.aluno_id = ${alunoId}
        LEFT JOIN redacoes r ON r.tema_id = t.id AND r.aluno_id = ${alunoId}
        WHERE t.turma_id = ${turmaId}
        ORDER BY t.criado_em DESC
      `;

      return {
        temas: linhas.map((linha) => ({
          id: linha.id,
          titulo: linha.titulo,
          enunciado: linha.enunciado,
          nivel: linha.nivel,
          entregue: linha.redacao_id !== null,
          corrigida: linha.corrigida_em !== null,
        })),
      };
    },

    /**
     * Recebe o texto, analisa e guarda.
     *
     * A análise acontece **antes** de responder, e não numa fila. É uma escolha
     * consciente: o aluno acabou de escrever e espera o retorno agora. Numa
     * escala maior isso vira trabalho assíncrono, e aí o texto é gravado
     * primeiro, e a análise chega depois.
     */
    async enviar(alunoId: string, temaId: string, texto: string) {
      const tema = await temaDaTurmaDoAluno(alunoId, temaId);

      const palavras = contarPalavras(texto);

      if (palavras === 0) {
        throw new ErroDaApi('entrada_invalida', 'O texto está vazio.');
      }

      if (palavras > MAXIMO_DE_PALAVRAS) {
        throw new ErroDaApi(
          'entrada_invalida',
          `O texto passa de ${MAXIMO_DE_PALAVRAS} palavras.`,
        );
      }

      let analise: AnaliseDaIa | null = null;
      let nomeDoProvedor: string | null = null;

      try {
        analise = await provedor.analisar({
          texto,
          nivel: tema.nivel,
          tema: `${tema.titulo}, ${tema.enunciado}`,
          idioma: tema.idioma,
        });
        nomeDoProvedor = provedor.nome;
      } catch {
        // O texto é guardado mesmo sem análise. Perder a redação porque a IA
        // caiu seria trocar o trabalho do aluno pela conveniência do sistema, // e o professor ainda pode corrigir à mão.
        analise = null;
      }

      const [salva] = await sql<{ id: string }[]>`
        INSERT INTO redacoes ${sql({
          tema_id: temaId,
          aluno_id: alunoId,
          texto,
          palavras,
          analise: analise as never,
          provedor: nomeDoProvedor,
          analisada_em: analise ? new Date() : null,
        })}
        ON CONFLICT (tema_id, aluno_id) DO UPDATE SET
          texto = EXCLUDED.texto,
          palavras = EXCLUDED.palavras,
          analise = EXCLUDED.analise,
          provedor = EXCLUDED.provedor,
          analisada_em = EXCLUDED.analisada_em,
          enviada_em = now(),
          -- Reenviar apaga a correção anterior: ela era sobre outro texto.
          parecer = NULL,
          nota = NULL,
          corrigida_em = NULL
        RETURNING id
      `;

      return {
        id: salva!.id,
        tamanho: avaliarTamanho(texto, tema.nivel),
        apontamentos: analise ? verificarAnalise(analise, texto) : [],
        resumo: analise?.resumo ?? null,
        analisadaPorIa: analise !== null,
      };
    },

    /** A redação do aluno, com a análise verificada e o parecer do professor. */
    async minhaRedacao(alunoId: string, temaId: string) {
      const tema = await temaDaTurmaDoAluno(alunoId, temaId);

      const [linha] = await sql<LinhaDeRedacao[]>`
        SELECT * FROM redacoes WHERE tema_id = ${temaId} AND aluno_id = ${alunoId}
      `;

      if (!linha) throw naoEncontrado('Redação');

      return {
        id: linha.id,
        texto: linha.texto,
        tamanho: avaliarTamanho(linha.texto, tema.nivel),
        apontamentos: linha.analise ? verificarAnalise(linha.analise, linha.texto) : [],
        resumo: linha.analise?.resumo ?? null,
        analisadaPorIa: linha.analise !== null,
        parecer: linha.parecer,
        nota: linha.nota,
        corrigida: linha.corrigida_em !== null,
      };
    },

    /** A fila do professor: o que foi entregue e ainda não tem parecer. */
    async filaDoProfessor(professorId: string, turmaId: string) {
      const daTurma = await sql`
        SELECT 1 FROM turmas
        WHERE id = ${turmaId} AND professor_id = ${professorId} AND arquivada_em IS NULL
      `;

      if (daTurma.length === 0) throw naoEncontrado('Turma');

      const linhas = await sql<
        {
          id: string;
          aluno_id: string;
          nome: string;
          titulo: string;
          palavras: number;
          corrigida_em: Date | null;
          enviada_em: Date;
        }[]
      >`
        SELECT r.id, r.aluno_id, u.nome, t.titulo, r.palavras, r.corrigida_em, r.enviada_em
        FROM redacoes r
        JOIN temas_de_redacao t ON t.id = r.tema_id
        JOIN usuarios u ON u.id = r.aluno_id
        WHERE t.turma_id = ${turmaId}
        -- Pendentes primeiro: é o que o professor abriu a tela para fazer.
        ORDER BY r.corrigida_em IS NOT NULL, r.enviada_em DESC
      `;

      return {
        redacoes: linhas.map((linha) => ({
          id: linha.id,
          alunoId: linha.aluno_id,
          nome: linha.nome,
          tema: linha.titulo,
          palavras: linha.palavras,
          corrigida: linha.corrigida_em !== null,
        })),
      };
    },

    /** Uma redação específica, para o professor corrigir. */
    async paraCorrigir(professorId: string, redacaoId: string) {
      const [linha] = await sql<
        (LinhaDeRedacao & {
          nome: string;
          nivel: Nivel;
          titulo: string;
          enunciado: string;
        })[]
      >`
        SELECT r.*, u.nome, t.nivel, t.titulo, t.enunciado
        FROM redacoes r
        JOIN temas_de_redacao t ON t.id = r.tema_id
        JOIN turmas tu ON tu.id = t.turma_id
        JOIN usuarios u ON u.id = r.aluno_id
        WHERE r.id = ${redacaoId} AND tu.professor_id = ${professorId}
      `;

      if (!linha) throw naoEncontrado('Redação');

      return {
        id: linha.id,
        aluno: linha.nome,
        tema: linha.titulo,
        enunciado: linha.enunciado,
        texto: linha.texto,
        tamanho: avaliarTamanho(linha.texto, linha.nivel),
        apontamentos: linha.analise ? verificarAnalise(linha.analise, linha.texto) : [],
        resumo: linha.analise?.resumo ?? null,
        analisadaPorIa: linha.analise !== null,
        parecer: linha.parecer,
        nota: linha.nota,
        corrigida: linha.corrigida_em !== null,
      };
    },

    /** O parecer do professor. É ele quem avalia; a IA só apontou. */
    async corrigir(
      professorId: string,
      redacaoId: string,
      parecer: string,
      nota: number | null,
    ) {
      const atualizadas = await sql`
        UPDATE redacoes SET
          parecer = ${parecer},
          nota = ${nota},
          corrigida_em = now()
        WHERE id = ${redacaoId}
          AND tema_id IN (
            SELECT t.id FROM temas_de_redacao t
            JOIN turmas tu ON tu.id = t.turma_id
            WHERE tu.professor_id = ${professorId}
          )
      `;

      if (atualizadas.count === 0) throw naoEncontrado('Redação');
    },

    /** Cria um tema de redação para a turma. */
    async criarTema(
      professorId: string,
      turmaId: string,
      titulo: string,
      enunciado: string,
      nivel: Nivel,
    ) {
      const daTurma = await sql`
        SELECT 1 FROM turmas
        WHERE id = ${turmaId} AND professor_id = ${professorId} AND arquivada_em IS NULL
      `;

      if (daTurma.length === 0) throw naoEncontrado('Turma');

      const [tema] = await sql<{ id: string }[]>`
        INSERT INTO temas_de_redacao ${sql({
          turma_id: turmaId,
          titulo,
          enunciado,
          nivel,
        })}
        RETURNING id
      `;

      return { id: tema!.id, titulo, enunciado, nivel };
    },
  };
}

export type ServicoDeRedacao = ReturnType<typeof criarServicoDeRedacao>;
