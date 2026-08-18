import type { FastifyInstance } from 'fastify';
import { responderNivelamentoEntradaSchema } from '@cadencia/contrato';
import { semPermissao } from '../../compartilhado/erros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeNivelamento } from './servico';

/**
 * Enquanto a plataforma atende uma escola de inglês, o idioma é fixo.
 *
 * Aceitá-lo pela URL agora seria inventar um parâmetro que nenhuma tela usa — e
 * abrir a porta para pedir um idioma que não existe. Quando houver mais de um,
 * ele vem da turma do aluno, e não da requisição.
 */
const IDIOMA = 'ingles';

export async function registrarRotasDeNivelamento(
  app: FastifyInstance,
  { nivelamento }: { nivelamento: ServicoDeNivelamento },
): Promise<void> {
  app.get('/nivelamento/proxima', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('O teste é do aluno.');

    return nivelamento.proxima(usuario.id, IDIOMA);
  });

  app.post(
    '/nivelamento/responder',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'aluno') throw semPermissao('O teste é do aluno.');

      const entrada = responderNivelamentoEntradaSchema.parse(requisicao.body);

      // O id do aluno vem do token: não existe forma de responder pelo colega.
      return nivelamento.responder(usuario.id, IDIOMA, entrada.perguntaId, entrada.escolha);
    },
  );

  app.get(
    '/turmas/:turmaId/nivelamentos',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId } = requisicao.params as { turmaId: string };
      return nivelamento.tentativasDaTurma(usuario.id, turmaId);
    },
  );
}
