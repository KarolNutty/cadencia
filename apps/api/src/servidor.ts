import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import limitador from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Ambiente } from '@cadencia/config';
import { ErroDaApi } from './compartilhado/erros';
import { criarExigirEntrada } from './compartilhado/autenticar';
import { conectar, type Banco } from './infra/banco';
import { criarServicoDeAutenticacao } from './funcionalidades/autenticacao/servico';
import { registrarRotasDeAutenticacao } from './funcionalidades/autenticacao/rotas';
import { registrarRotasDeEstudo } from './funcionalidades/estudo/rotas';
import { criarServicoDeEstudo } from './funcionalidades/estudo/servico';
import { registrarRotasDeGestao } from './funcionalidades/gestao/rotas';
import { criarServicoDeGestao } from './funcionalidades/gestao/servico';
import { registrarRotasDeNivelamento } from './funcionalidades/nivelamento/rotas';
import { criarServicoDeNivelamento } from './funcionalidades/nivelamento/servico';
import { registrarRotasDePontuacao } from './funcionalidades/pontuacao/rotas';
import { criarServicoDePontuacao } from './funcionalidades/pontuacao/servico';
import { escolherProvedor as escolherParceiro } from './funcionalidades/conversa/provedor';
import { registrarRotasDeConversa } from './funcionalidades/conversa/rotas';
import { criarServicoDeConversa } from './funcionalidades/conversa/servico';
import { escolherProvedor } from './funcionalidades/redacao/provedor';
import { registrarRotasDeRedacao } from './funcionalidades/redacao/rotas';
import { criarServicoDeRedacao } from './funcionalidades/redacao/servico';
import { criarEmissor } from './funcionalidades/autenticacao/tokens';

export interface OpcoesDoServidor {
  ambiente: Ambiente;
  /** Injetável para o teste usar a conexão dele e limpar entre casos. */
  banco?: Banco;
}

export interface Servidor {
  app: FastifyInstance;
  sql: Banco;
}

export async function construirServidor({
  ambiente,
  banco,
}: OpcoesDoServidor): Promise<Servidor> {
  const sql = banco ?? conectar({ url: ambiente.DATABASE_URL });

  const app = Fastify({
    // Em produção o log vai para o coletor; em teste, silêncio.
    logger: ambiente.producao ? true : false,
    // O IP real vem do proxy. Sem isto, o limite por IP contaria todo mundo
    // como se fosse o mesmo cliente — o balanceador.
    trustProxy: ambiente.producao,
  });

  await app.register(helmet, {
    // A API não serve HTML, então uma CSP restritiva é gratuita: se alguém
    // abrir um endpoint no navegador, nada é executado.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    hsts: ambiente.producao ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  await app.register(cors, {
    // Lista explícita, nunca `true`. `carregarAmbiente` recusa subir em
    // produção sem ela — e recusa origem em http, porque o cookie vai com
    // Secure e simplesmente não seria enviado.
    origin: ambiente.ORIGENS_PERMITIDAS.length > 0 ? ambiente.ORIGENS_PERMITIDAS : false,
    // Necessário para o navegador mandar o cookie de renovação.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  await app.register(cookie);

  await app.register(limitador, {
    global: false,
    /**
     * `preHandler`, e não o padrão `onRequest`.
     *
     * No `onRequest` o corpo ainda não foi interpretado, e `requisicao.body` é
     * `undefined`. A chave da rota de login, que junta IP e e-mail, degeneraria
     * em silêncio para só o IP — e aí cinco tentativas de uma pessoa
     * bloqueariam o login de todo mundo atrás do mesmo endereço. Numa escola
     * com rede compartilhada, isso derruba a turma inteira.
     *
     * O custo é interpretar o corpo antes de aplicar o limite. Aceitável aqui:
     * o corpo do login é pequeno e o limite continua barrando a tentativa.
     */
    hook: 'preHandler',
    keyGenerator: (requisicao) => requisicao.ip,
  });

  const emissor = criarEmissor({
    acesso: ambiente.SEGREDO_ACESSO,
    renovacao: ambiente.SEGREDO_RENOVACAO,
  });

  const exigirEntrada = criarExigirEntrada(emissor);
  const autenticacao = criarServicoDeAutenticacao(sql, emissor);

  app.decorate('exigirEntrada', exigirEntrada);

  /**
   * Tradutor único de erro para resposta.
   *
   * Sem ele, cada rota decide o próprio formato e o cliente precisa tratar
   * várias formas de erro. E, principalmente: um erro não previsto vira 500
   * **sem detalhe**, porque mensagem de exceção costuma conter nome de tabela,
   * trecho de query e caminho de arquivo.
   */
  app.setErrorHandler((erro, requisicao, resposta) => {
    if (erro instanceof ErroDaApi) {
      return resposta.status(erro.status).send(erro.paraResposta());
    }

    if (erro instanceof ZodError) {
      return resposta.status(400).send({
        codigo: 'entrada_invalida',
        mensagem: 'Confira os campos enviados.',
        campos: erro.issues.map((problema) => ({
          campo: problema.path.join('.') || '(raiz)',
          motivo: problema.message,
        })),
      });
    }

    // O limitador do Fastify sinaliza pelo statusCode, e o tipo do erro no
    // handler é amplo o suficiente para exigir a checagem.
    if (
      typeof erro === 'object' &&
      erro !== null &&
      'statusCode' in erro &&
      erro.statusCode === 429
    ) {
      return resposta.status(429).send({
        codigo: 'entrada_invalida',
        mensagem: 'Tentativas demais. Espere um pouco e tente de novo.',
      });
    }

    requisicao.log.error({ erro }, 'erro não tratado');

    return resposta.status(500).send({
      codigo: 'entrada_invalida',
      mensagem: 'Algo deu errado. Tente novamente.',
    });
  });

  app.get('/saude', async () => ({ ok: true }));

  await registrarRotasDeAutenticacao(app, { autenticacao, producao: ambiente.producao });
  await registrarRotasDeEstudo(app, { estudo: criarServicoDeEstudo(sql) });
  await registrarRotasDeGestao(app, { gestao: criarServicoDeGestao(sql) });
  await registrarRotasDeNivelamento(app, {
    nivelamento: criarServicoDeNivelamento(sql),
  });
  await registrarRotasDePontuacao(app, { pontuacao: criarServicoDePontuacao(sql) });
  await registrarRotasDeRedacao(app, {
    // Sem chave, o provedor simulado assume: o projeto roda por completo sem
    // credencial, e quem clona vê a correção funcionando.
    redacao: criarServicoDeRedacao(sql, escolherProvedor(ambiente.GEMINI_API_KEY)),
  });
  await registrarRotasDeConversa(app, {
    conversa: criarServicoDeConversa(sql, escolherParceiro(ambiente.GEMINI_API_KEY)),
  });

  return { app, sql };
}
