import type { FastifyInstance } from 'fastify';
import {
  corrigirEntradaSchema,
  criarTemaEntradaSchema,
  enviarRedacaoEntradaSchema,
} from '@cadencia/contrato';
import { semPermissao } from '../../compartilhado/erros';
import { porConta } from '../../compartilhado/limite';
import { idsDaRota } from '../../compartilhado/parametros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeRedacao } from './servico';

export async function registrarRotasDeRedacao(
  app: FastifyInstance,
  { redacao }: { redacao: ServicoDeRedacao },
): Promise<void> {
  /** -------------------------------------------------------------- aluno */

  app.get('/redacoes/temas', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const { turmaId } = requisicao.query as { turmaId: string };
    return redacao.temasDoAluno(usuario.id, turmaId);
  });

  app.post(
    '/redacoes',
    {
      preHandler: app.exigirEntrada,
      config: {
        // A análise custa uma chamada a um serviço externo. Sem limite, um laço
        // no console esgotaria a cota da escola em minutos.
        rateLimit: { max: 20, timeWindow: '10 minutes', keyGenerator: porConta },
      },
    },
    async (requisicao, resposta) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

      const entrada = enviarRedacaoEntradaSchema.parse(requisicao.body);

      // O id do aluno vem do token: não existe forma de entregar pelo colega.
      const salva = await redacao.enviar(usuario.id, entrada.temaId, entrada.texto);
      return resposta.status(201).send(salva);
    },
  );

  app.get('/redacoes/minha', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const { temaId } = requisicao.query as { temaId: string };
    return redacao.minhaRedacao(usuario.id, temaId);
  });

  /** ---------------------------------------------------------- professor */

  app.post(
    '/turmas/:turmaId/temas',
    { preHandler: app.exigirEntrada },
    async (requisicao, resposta) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId } = idsDaRota(requisicao, 'turmaId');
      const entrada = criarTemaEntradaSchema.parse(requisicao.body);

      const tema = await redacao.criarTema(
        usuario.id,
        turmaId,
        entrada.titulo,
        entrada.enunciado,
        entrada.nivel,
      );

      return resposta.status(201).send(tema);
    },
  );

  app.get(
    '/turmas/:turmaId/redacoes',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId } = idsDaRota(requisicao, 'turmaId');
      return redacao.filaDoProfessor(usuario.id, turmaId);
    },
  );

  app.get('/redacoes/:redacaoId', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

    const { redacaoId } = idsDaRota(requisicao, 'redacaoId');
    return redacao.paraCorrigir(usuario.id, redacaoId);
  });

  app.post(
    '/redacoes/:redacaoId/parecer',
    { preHandler: app.exigirEntrada },
    async (requisicao, resposta) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { redacaoId } = idsDaRota(requisicao, 'redacaoId');
      const entrada = corrigirEntradaSchema.parse(requisicao.body);

      await redacao.corrigir(usuario.id, redacaoId, entrada.parecer, entrada.nota);
      return resposta.status(204).send();
    },
  );
}
