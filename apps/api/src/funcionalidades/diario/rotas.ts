import type { FastifyInstance } from 'fastify';
import { registrarAulaEntradaSchema } from '@cadencia/contrato';
import type { DiaDeEstudo } from '@cadencia/dominio';
import { semPermissao } from '../../compartilhado/erros';
import { idsDaRota } from '../../compartilhado/parametros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeDiario } from './servico';

export async function registrarRotasDeDiario(
  app: FastifyInstance,
  { diario }: { diario: ServicoDeDiario },
): Promise<void> {
  function exigirProfessor(requisicao: Parameters<typeof usuarioDaRequisicao>[0]) {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'professor') throw semPermissao('O diário é do professor.');
    return usuario;
  }

  app.post(
    '/turmas/:turmaId/aulas',
    { preHandler: app.exigirEntrada },
    async (requisicao, resposta) => {
      const usuario = exigirProfessor(requisicao);
      const { turmaId } = idsDaRota(requisicao, 'turmaId');
      const entrada = registrarAulaEntradaSchema.parse(requisicao.body);

      const aula = await diario.registrarAula(usuario.id, turmaId, {
        dia: entrada.dia as DiaDeEstudo,
        conteudo: entrada.conteudo,
        dever: entrada.dever,
        encontro: entrada.encontro,
        presencas: entrada.presencas,
      });

      return resposta.status(201).send(aula);
    },
  );

  app.get(
    '/turmas/:turmaId/aulas',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = exigirProfessor(requisicao);
      const { turmaId } = idsDaRota(requisicao, 'turmaId');

      return diario.aulasDaTurma(usuario.id, turmaId);
    },
  );

  app.get(
    '/turmas/:turmaId/aulas/:aulaId',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = exigirProfessor(requisicao);
      const { turmaId, aulaId } = idsDaRota(requisicao, 'turmaId', 'aulaId');

      return diario.aula(usuario.id, turmaId, aulaId);
    },
  );

  app.get(
    '/turmas/:turmaId/frequencia',
    { preHandler: app.exigirEntrada },
    async (requisicao) => {
      const usuario = exigirProfessor(requisicao);
      const { turmaId } = idsDaRota(requisicao, 'turmaId');

      return diario.frequenciaDaTurma(usuario.id, turmaId);
    },
  );

  /** O aluno vê as próprias aulas e a própria frequência. */
  app.get('/minhas-aulas', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const { turmaId } = requisicao.query as { turmaId: string };

    // O id vem do token: não existe forma de ver a frequência do colega.
    return diario.minhasAulas(usuario.id, turmaId);
  });
}
