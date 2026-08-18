import type { FastifyInstance } from 'fastify';
import { diaDeEstudoSchema } from '@cadencia/contrato';
import type { DiaDeEstudo } from '@cadencia/dominio';
import { semPermissao } from '../../compartilhado/erros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDePontuacao } from './servico';

export async function registrarRotasDePontuacao(
  app: FastifyInstance,
  { pontuacao }: { pontuacao: ServicoDePontuacao },
): Promise<void> {
  app.get('/pontuacao', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const { turmaId, dia } = requisicao.query as { turmaId: string; dia: string };

    // O id vem do token: não existe forma de pedir a pontuação do colega.
    return pontuacao.resumoDoAluno(
      usuario.id,
      turmaId,
      diaDeEstudoSchema.parse(dia) as DiaDeEstudo,
    );
  });

  app.get('/pontuacao/ranking', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'aluno') throw semPermissao('Esta área é do aluno.');

    const { turmaId, dia } = requisicao.query as { turmaId: string; dia: string };

    // A matrícula é conferida no serviço: sem isso, trocar o id na URL mostraria
    // o ranking de uma turma alheia.
    return pontuacao.rankingDaTurma(
      usuario.id,
      turmaId,
      diaDeEstudoSchema.parse(dia) as DiaDeEstudo,
    );
  });
}
