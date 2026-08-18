import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  type EntrarSaida,
  cadastrarEntradaSchema,
  entrarEntradaSchema,
  plataformaSchema,
} from '@cadencia/contrato';
import { naoAutenticado } from '../../compartilhado/erros';
import { porEnderecoEConta } from '../../compartilhado/limite';
import { VIDA_DA_RENOVACAO_EM_SEGUNDOS, VIDA_DO_ACESSO_EM_SEGUNDOS } from './tokens';
import type { ServicoDeAutenticacao, SessaoCriada } from './servico';

/** Nome do cookie do token de renovação, só usado pelo navegador. */
const COOKIE_DE_RENOVACAO = 'cadencia_renovacao';

/**
 * Onde o token de renovação é entregue depende da plataforma.
 *
 * | | Guarda onde | Contra o quê |
 * |---|---|---|
 * | Web | Cookie `httpOnly` + `Secure` + `SameSite=Strict` | XSS: script injetado não lê cookie httpOnly |
 * | App | Corpo da resposta, e daí para o armazenamento seguro do sistema | Outro app ou quem pega o aparelho |
 *
 * A plataforma vem de um cabeçalho explícito. Adivinhar pelo `User-Agent`
 * erraria — e errar aqui significa ou o app sem token, ou o navegador com um
 * token legível por script.
 */
function entregarSessao(
  resposta: FastifyReply,
  sessao: SessaoCriada,
  plataforma: 'web' | 'mobile',
  producao: boolean,
): EntrarSaida {
  if (plataforma === 'web') {
    resposta.setCookie(COOKIE_DE_RENOVACAO, sessao.renovacao, {
      httpOnly: true,
      // Em desenvolvimento o front roda em http; com Secure ligado o cookie
      // simplesmente não seria enviado, e o login pareceria quebrado.
      secure: producao,
      sameSite: 'strict',
      // O cookie só é mandado para a própria rota de renovação. Não há motivo
      // para ele acompanhar cada chamada de listagem.
      path: '/sessoes/renovar',
      maxAge: VIDA_DA_RENOVACAO_EM_SEGUNDOS,
    });

    // Sem o token no corpo: devolvê-lo permitiria a um script injetado lê-lo
    // da resposta, o que anularia todo o cuidado com o httpOnly.
    return {
      usuario: sessao.usuario,
      acesso: sessao.acesso,
      expiraEm: VIDA_DO_ACESSO_EM_SEGUNDOS,
    };
  }

  return {
    usuario: sessao.usuario,
    acesso: sessao.acesso,
    expiraEm: VIDA_DO_ACESSO_EM_SEGUNDOS,
    renovacao: sessao.renovacao,
  };
}

function lerPlataforma(cabecalho: unknown): 'web' | 'mobile' {
  const resultado = plataformaSchema.safeParse(cabecalho);
  // O padrão é web, que é o modo mais restritivo: na dúvida, o token vai para
  // o cookie e não aparece no corpo.
  return resultado.success ? resultado.data : 'web';
}

export interface OpcoesDasRotas {
  autenticacao: ServicoDeAutenticacao;
  producao: boolean;
}

export async function registrarRotasDeAutenticacao(
  app: FastifyInstance,
  { autenticacao, producao }: OpcoesDasRotas,
): Promise<void> {
  app.post(
    '/sessoes',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          /*
           * A chave junta endereço e e-mail tentado.
           *
           * Só por IP não segura ataque distribuído, que troca de endereço a
           * cada tentativa. Só por conta permite varrer muitas contas com uma
           * tentativa em cada. Juntando, os dois caminhos ficam caros.
           */
          keyGenerator: porEnderecoEConta('email'),
        },
      },
    },
    async (requisicao, resposta) => {
      const entrada = entrarEntradaSchema.parse(requisicao.body);
      const plataforma = lerPlataforma(requisicao.headers['x-plataforma']);

      const sessao = await autenticacao.entrar(entrada.email, entrada.senha, {
        ip: requisicao.ip,
      });

      return resposta
        .status(201)
        .send(entregarSessao(resposta, sessao, plataforma, producao));
    },
  );

  app.post(
    '/usuarios',
    {
      config: {
        // Mais folgado que o login: cadastro legítimo é raro, mas errar o
        // formulário três vezes seguidas é comum.
        rateLimit: { max: 8, timeWindow: '10 minutes' },
      },
    },
    async (requisicao, resposta) => {
      const entrada = cadastrarEntradaSchema.parse(requisicao.body);
      const plataforma = lerPlataforma(requisicao.headers['x-plataforma']);

      const sessao = await autenticacao.cadastrar(entrada, { ip: requisicao.ip });

      return resposta.status(201).send({
        ...entregarSessao(resposta, sessao, plataforma, producao),
        turmasQueEntrou: sessao.turmasQueEntrou,
      });
    },
  );

  app.post(
    '/sessoes/renovar',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (requisicao, resposta) => {
      const plataforma = lerPlataforma(requisicao.headers['x-plataforma']);

      const doCorpo = (requisicao.body as { renovacao?: unknown } | undefined)?.renovacao;
      const token =
        plataforma === 'web'
          ? requisicao.cookies[COOKIE_DE_RENOVACAO]
          : typeof doCorpo === 'string'
            ? doCorpo
            : undefined;

      if (!token) throw naoAutenticado('Sessão inválida.');

      const sessao = await autenticacao.renovar(token, { ip: requisicao.ip });

      return resposta.send(entregarSessao(resposta, sessao, plataforma, producao));
    },
  );

  app.delete('/sessoes', async (requisicao, resposta) => {
    const plataforma = lerPlataforma(requisicao.headers['x-plataforma']);

    const doCorpo = (requisicao.body as { renovacao?: unknown } | undefined)?.renovacao;
    const token =
      plataforma === 'web'
        ? requisicao.cookies[COOKIE_DE_RENOVACAO]
        : typeof doCorpo === 'string'
          ? doCorpo
          : undefined;

    if (token) await autenticacao.sair(token, { ip: requisicao.ip });

    // O cookie é limpo mesmo sem token válido: o objetivo de quem pediu para
    // sair já está cumprido, e devolver erro aqui só o prenderia numa tela.
    resposta.clearCookie(COOKIE_DE_RENOVACAO, { path: '/sessoes/renovar' });

    return resposta.status(204).send();
  });

  app.get('/eu', { preHandler: app.exigirEntrada }, async (requisicao) => {
    return { usuario: requisicao.usuario };
  });
}
