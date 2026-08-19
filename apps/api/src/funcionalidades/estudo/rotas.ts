import type { FastifyInstance } from 'fastify';
import {
  diaDeEstudoSchema,
  enviarRevisoesEntradaSchema,
  sessaoEntradaSchema,
} from '@cadencia/contrato';
import type { DiaDeEstudo } from '@cadencia/dominio';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { semPermissao } from '../../compartilhado/erros';
import { idsDaRota } from '../../compartilhado/parametros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeEstudo } from './servico';

/**
 * O "hoje" do servidor, usado só para conferir se o dia informado pelo app é
 * plausível. Quem manda no dia de estudo é o cliente, ver `servico.ts`.
 */
function hojeNoServidor(): DiaDeEstudo {
  return diaDeEstudoDe(new Date(), 'UTC');
}

export async function registrarRotasDeEstudo(
  app: FastifyInstance,
  { estudo }: { estudo: ServicoDeEstudo },
): Promise<void> {
  app.get('/turmas', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    return estudo.minhasTurmas(usuario.id, usuario.papel);
  });

  app.get('/estudo/sessao', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);

    // Rota de aluno. 403 aqui não revela nada sobre um recurso: é o próprio
    // perfil que não permite a ação.
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const entrada = sessaoEntradaSchema.parse(requisicao.query);

    return estudo.montarSessaoDoDia(
      // O id vem do TOKEN, nunca da query. É isto que impede trocar o id na
      // URL e ler a sessão do colega.
      usuario.id,
      entrada.turmaId,
      entrada.dia as DiaDeEstudo,
      entrada.limite,
    );
  });

  app.get(
    '/turmas/:turmaId/alunos',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId } = idsDaRota(requisicao, 'turmaId');

      // O id do professor vem do token: não existe forma de pedir o painel da
      // turma de outra pessoa. E o "hoje" de cada aluno sai do fuso dele.
      return estudo.painelDaTurma(usuario.id, turmaId);
    },
  );

  app.get(
    '/turmas/:turmaId/palavras-travadas',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId } = idsDaRota(requisicao, 'turmaId');
      return estudo.palavrasParaAula(usuario.id, turmaId);
    },
  );

  app.get(
    '/turmas/:turmaId/alunos/:alunoId/sinalizadas',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { turmaId, alunoId } = idsDaRota(requisicao, 'turmaId', 'alunoId');

      return estudo.sinalizadasDoAluno(usuario.id, turmaId, alunoId);
    },
  );

  app.post('/estudo/revisoes', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const entrada = enviarRevisoesEntradaSchema.parse(requisicao.body);

    return estudo.registrarRevisoes(
      usuario.id,
      entrada.turmaId,
      entrada.loteId,
      entrada.revisoes.map((revisao) => ({
        cartaoId: revisao.cartaoId,
        avaliacao: revisao.avaliacao,
        dia: diaDeEstudoSchema.parse(revisao.dia) as DiaDeEstudo,
      })),
      hojeNoServidor(),
    );
  });
}
