import type { FastifyInstance } from 'fastify';
import {
  criarBaralhoEntradaSchema,
  criarTurmaEntradaSchema,
  importarPalavrasEntradaSchema,
  matricularEntradaSchema,
} from '@cadencia/contrato';
import { semPermissao } from '../../compartilhado/erros';
import { idsDaRota } from '../../compartilhado/parametros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeGestao } from './servico';

export async function registrarRotasDeGestao(
  app: FastifyInstance,
  { gestao }: { gestao: ServicoDeGestao },
): Promise<void> {
  /**
   * Toda rota daqui exige papel de professor.
   *
   * A checagem fica num gancho compartilhado em vez de repetida em cada rota:
   * repetir dez vezes é dez chances de esquecer numa, e a que esquecer não
   * aparece em teste de caminho feliz.
   */
  async function exigirProfessor(requisicao: Parameters<typeof usuarioDaRequisicao>[0]) {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');
  }

  const somenteProfessor = { preHandler: [app.exigirEntrada, exigirProfessor] };

  app.post('/turmas', somenteProfessor, async (requisicao, resposta) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const entrada = criarTurmaEntradaSchema.parse(requisicao.body);

    return resposta
      .status(201)
      .send(await gestao.criarTurma(id, entrada.nome, entrada.idioma));
  });

  app.delete('/turmas/:turmaId', somenteProfessor, async (requisicao, resposta) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const { turmaId } = idsDaRota(requisicao, 'turmaId');

    await gestao.arquivarTurma(id, turmaId);
    return resposta.status(204).send();
  });

  app.post(
    '/turmas/:turmaId/matriculas',
    somenteProfessor,
    async (requisicao, resposta) => {
      const { id } = usuarioDaRequisicao(requisicao);
      const { turmaId } = idsDaRota(requisicao, 'turmaId');
      const entrada = matricularEntradaSchema.parse(requisicao.body);

      const saida = await gestao.matricular(id, turmaId, entrada.email);

      // 201 quando algo passou a existir, 200 quando já existia. A diferença
      // deixa a tela dizer "convite enviado" em vez de "já estava na turma".
      return resposta.status(saida.situacao === 'ja_estava' ? 200 : 201).send(saida);
    },
  );

  app.delete(
    '/turmas/:turmaId/matriculas/:alunoId',
    somenteProfessor,
    async (requisicao, resposta) => {
      const { id } = usuarioDaRequisicao(requisicao);
      const { turmaId, alunoId } = idsDaRota(requisicao, 'turmaId', 'alunoId');

      await gestao.desmatricular(id, turmaId, alunoId);
      return resposta.status(204).send();
    },
  );

  app.get('/turmas/:turmaId/baralhos', somenteProfessor, async (requisicao) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const { turmaId } = idsDaRota(requisicao, 'turmaId');

    return gestao.listarBaralhos(id, turmaId);
  });

  app.post('/turmas/:turmaId/baralhos', somenteProfessor, async (requisicao, resposta) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const { turmaId } = idsDaRota(requisicao, 'turmaId');
    const entrada = criarBaralhoEntradaSchema.parse(requisicao.body);

    const baralho = await gestao.criarBaralho(
      id,
      turmaId,
      entrada.titulo,
      entrada.nivel ?? null,
    );
    return resposta.status(201).send(baralho);
  });

  app.post('/baralhos/:baralhoId/palavras', somenteProfessor, async (requisicao) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const { baralhoId } = idsDaRota(requisicao, 'baralhoId');
    const entrada = importarPalavrasEntradaSchema.parse(requisicao.body);

    return gestao.importarPalavras(id, baralhoId, entrada.texto);
  });

  app.delete('/baralhos/:baralhoId', somenteProfessor, async (requisicao, resposta) => {
    const { id } = usuarioDaRequisicao(requisicao);
    const { baralhoId } = idsDaRota(requisicao, 'baralhoId');

    await gestao.apagarBaralho(id, baralhoId);
    return resposta.status(204).send();
  });

  app.post(
    '/turmas/:turmaId/alunos/:alunoId/destravar/:cartaoId',
    somenteProfessor,
    async (requisicao, resposta) => {
      const { id } = usuarioDaRequisicao(requisicao);
      const { turmaId, alunoId, cartaoId } = idsDaRota(
        requisicao,
        'turmaId',
        'alunoId',
        'cartaoId',
      );

      await gestao.destravarPalavra(id, turmaId, alunoId, cartaoId);
      return resposta.status(204).send();
    },
  );
}
