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
import { registrarRotasDeDiario } from './funcionalidades/diario/rotas';
import { criarServicoDeDiario } from './funcionalidades/diario/servico';
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

/**
 * Como o log se comporta em cada ambiente.
 *
 * Produção: JSON, que é o que agregador de log consome.
 * Desenvolvimento: formato legível, para o erro ser lido direto no terminal.
 * Teste: silêncio, senão cada execução despeja centenas de linhas.
 */
function registrador(modo: 'development' | 'test' | 'production') {
  if (modo === 'test') return false;
  if (modo === 'production') return true;

  return {
    level: 'info',
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  };
}

export async function construirServidor({
  ambiente,
  banco,
}: OpcoesDoServidor): Promise<Servidor> {
  const sql = banco ?? conectar({ url: ambiente.DATABASE_URL });

  const app = Fastify({
    /*
     * Três modos, e não dois.
     *
     * A intenção sempre foi silenciar o log nos testes, mas a condição era
     * `producao ? true : false`, e desenvolvimento caiu no mesmo balde. O
     * resultado é que `requisicao.log.error` escrevia no vazio justamente na
     * máquina de quem tenta entender o que aconteceu, e uma falha de provedor
     * de IA ficou como "algo deu errado" sem nenhuma pista.
     */
    logger: registrador(ambiente.NODE_ENV),

    // O log de cada requisição só interessa em produção; em desenvolvimento
    // ele esconde o que importa no meio do ruído.
    disableRequestLogging: ambiente.NODE_ENV !== 'production',

    // O IP real vem do proxy. Sem isto, o limite por IP contaria todo mundo
    // como se fosse o mesmo cliente, o balanceador.
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
    // produção sem ela, e recusa origem em http, porque o cookie vai com
    // Secure e simplesmente não seria enviado.
    origin: ambiente.ORIGENS_PERMITIDAS.length > 0 ? ambiente.ORIGENS_PERMITIDAS : false,
    // Necessário para o navegador mandar o cookie de renovação.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  await app.register(cookie);

  /*
   * Corpo vazio com `content-type: application/json` é aceito.
   *
   * O padrão do Fastify recusa a combinação, e ela é legítima aqui: sair e
   * renovar no navegador não mandam corpo, porque o token viaja no cookie. Sem
   * isto, o erro estoura antes da rota e fala de JSON vazio, o que manda quem
   * investiga para o lado errado.
   */
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_requisicao, corpo, feito) => {
      if (corpo === '') return feito(null, undefined);

      try {
        feito(null, JSON.parse(corpo as string));
      } catch {
        feito(
          new ErroDaApi('entrada_invalida', 'O corpo não é um JSON válido.'),
          undefined,
        );
      }
    },
  );

  await app.register(limitador, {
    global: false,
    /**
     * `preHandler`, e não o padrão `onRequest`.
     *
     * No `onRequest` o corpo ainda não foi interpretado, e `requisicao.body` é
     * `undefined`. A chave da rota de login, que junta IP e e-mail, degeneraria
     * em silêncio para só o IP, e aí cinco tentativas de uma pessoa
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
      /*
       * Falha de serviço externo também vai para o log.
       *
       * A tela mostra o que a pessoa precisa fazer; o log guarda o que quem
       * opera precisa investigar. Sem isso, um provedor recusando a chave só
       * aparece na tela de quem estiver usando no momento, e some quando a
       * página é recarregada.
       */
      if (erro.codigo === 'servico_indisponivel') {
        requisicao.log.error(
          { rota: requisicao.url, motivo: erro.campos?.[0]?.motivo },
          erro.message,
        );
      }

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

    /*
     * `{ erro }` registra `{}`.
     *
     * `Error` guarda mensagem e pilha em propriedades não enumeráveis, e o
     * serializador de log passa por cima delas. O objeto sai vazio e o log
     * vira ruído com aparência de informação, que é pior do que não registrar:
     * dá a impressão de que já se olhou.
     *
     * Os campos vão extraídos, um a um.
     */
    requisicao.log.error(
      {
        rota: `${requisicao.method} ${requisicao.url}`,
        tipo: erro instanceof Error ? erro.name : typeof erro,
        mensagem: erro instanceof Error ? erro.message : String(erro),
        pilha: erro instanceof Error ? erro.stack : undefined,
        // Erro de driver de banco carrega o código do Postgres, que costuma
        // dizer mais que a mensagem.
        codigoDoBanco:
          typeof erro === 'object' && erro !== null && 'code' in erro
            ? String(erro.code)
            : undefined,
      },
      'erro não tratado',
    );

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
    redacao: criarServicoDeRedacao(
      sql,
      escolherProvedor(ambiente.GEMINI_API_KEY, ambiente.GEMINI_MODELO),
    ),
  });
  await registrarRotasDeConversa(app, {
    conversa: criarServicoDeConversa(
      sql,
      escolherParceiro(ambiente.GEMINI_API_KEY, ambiente.GEMINI_MODELO),
    ),
  });
  await registrarRotasDeDiario(app, { diario: criarServicoDeDiario(sql) });

  return { app, sql };
}
