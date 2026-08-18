import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  corrigirEntradaSchema,
  criarTemaEntradaSchema,
  enviarRedacaoEntradaSchema,
} from '@cadencia/contrato';
import { semPermissao } from '../../compartilhado/erros';
import { usuarioDaRequisicao } from '../../compartilhado/autenticar';
import type { ServicoDeRedacao } from './servico';

/**
 * A chave do limite é a **conta**, não o endereço.
 *
 * Por IP, dez redações de alunos diferentes numa escola com rede compartilhada
 * bloqueariam a turma inteira — o mesmo defeito que o limite de login já teve.
 * O custo que se quer conter aqui é por pessoa: cada análise é uma chamada paga
 * ao provedor, e quem gasta é quem envia.
 *
 * O token é resumido antes de virar chave: guardar credencial em memória, mesmo
 * como índice de um mapa, é guardar credencial.
 */
function porConta(requisicao: FastifyRequest): string {
  const autorizacao = requisicao.headers.authorization;
  if (!autorizacao) return requisicao.ip;

  return createHash('sha256').update(autorizacao).digest('hex').slice(0, 32);
}

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

      const { turmaId } = requisicao.params as { turmaId: string };
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

      const { turmaId } = requisicao.params as { turmaId: string };
      return redacao.filaDoProfessor(usuario.id, turmaId);
    },
  );

  app.get('/redacoes/:redacaoId', { preHandler: app.exigirEntrada }, async (requisicao) => {
    const usuario = usuarioDaRequisicao(requisicao);
    if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

    const { redacaoId } = requisicao.params as { redacaoId: string };
    return redacao.paraCorrigir(usuario.id, redacaoId);
  });

  app.post(
    '/redacoes/:redacaoId/parecer',
    { preHandler: app.exigirEntrada },
    async (requisicao, resposta) => {
      const usuario = usuarioDaRequisicao(requisicao);
      if (usuario.papel !== 'professor') throw semPermissao('Esta área é do professor.');

      const { redacaoId } = requisicao.params as { redacaoId: string };
      const entrada = corrigirEntradaSchema.parse(requisicao.body);

      await redacao.corrigir(usuario.id, redacaoId, entrada.parecer, entrada.nota);
      return resposta.status(204).send();
    },
  );
}
