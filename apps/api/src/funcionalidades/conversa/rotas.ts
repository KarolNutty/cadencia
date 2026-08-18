import type { FastifyInstance } from 'fastify';
import { comecarConversaEntradaSchema, falarEntradaSchema } from '@cadencia/contrato';
import { semPermissao } from '../../compartilhado/erros';
import { porConta } from '../../compartilhado/limite';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeConversa } from './servico';

export async function registrarRotasDeConversa(
  app: FastifyInstance,
  { conversa }: { conversa: ServicoDeConversa },
): Promise<void> {
  function exigirAluno(requisicao: Parameters<typeof usuarioDaRequisicao>[0]) {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('A conversa é do aluno.');
    return usuario;
  }

  app.get('/conversas', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = exigirAluno(requisicao);
    const { turmaId } = requisicao.query as { turmaId: string };

    return conversa.minhas(usuario.id, turmaId);
  });

  app.post(
    '/conversas',
    { preHandler: app.exigirEntrada },
    async (requisicao, resposta) => {
      const usuario = exigirAluno(requisicao);
      const entrada = comecarConversaEntradaSchema.parse(requisicao.body);

      const nova = await conversa.comecar(
        usuario.id,
        entrada.turmaId,
        entrada.cenario,
        entrada.nivel,
      );

      return resposta.status(201).send(nova);
    },
  );

  app.get(
    '/conversas/:conversaId',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = exigirAluno(requisicao);
      const { conversaId } = requisicao.params as { conversaId: string };

      // O id do aluno vem do token: não existe forma de ler a conversa do colega.
      return conversa.ler(usuario.id, conversaId);
    },
  );

  app.post(
    '/conversas/:conversaId/falas',
    {
      preHandler: app.exigirEntrada,
      config: {
        /*
         * Cada fala é uma chamada paga ao provedor. A chave é a conta, e não o
         * endereço: numa escola com rede compartilhada, a cota por IP seria
         * consumida pela turma e a última pessoa a praticar ficaria de fora.
         */
        rateLimit: { max: 60, timeWindow: '10 minutes', keyGenerator: porConta },
      },
    },
    async (requisicao) => {
      const usuario = exigirAluno(requisicao);
      const { conversaId } = requisicao.params as { conversaId: string };
      const entrada = falarEntradaSchema.parse(requisicao.body);

      return conversa.falar(usuario.id, conversaId, entrada.mensagem);
    },
  );
}
