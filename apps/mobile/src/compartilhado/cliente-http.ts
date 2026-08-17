import type { Erro } from '@cadencia/contrato';

/**
 * O cliente HTTP do app.
 *
 * `fetch` é injetável para o teste rodar sem rede — e porque um cliente que
 * chama `globalThis.fetch` direto só é testável com monkey patch global, que
 * vaza entre casos.
 */

export interface Tokens {
  acesso: string;
  renovacao: string;
}

export interface OpcoesDoCliente {
  baseUrl: string;
  obterTokens: () => Promise<Tokens | null>;
  salvarTokens: (tokens: Tokens) => Promise<void>;
  /** Chamado quando a renovação falha: a sessão acabou de verdade. */
  aoPerderSessao: () => Promise<void>;
  buscar?: typeof fetch;
}

export class FalhaDaApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: Erro,
  ) {
    super(corpo.mensagem);
    this.name = 'FalhaDaApi';
  }
}

export class SemRede extends Error {
  constructor(causa?: unknown) {
    super('Sem conexão com o servidor.');
    this.name = 'SemRede';
    this.cause = causa;
  }
}

export interface OpcoesDaChamada {
  metodo?: 'GET' | 'POST' | 'DELETE';
  corpo?: unknown;
  /** Rotas públicas não tentam renovar em caso de 401. */
  publica?: boolean;
}

export function criarCliente({
  baseUrl,
  obterTokens,
  salvarTokens,
  aoPerderSessao,
  buscar = fetch,
}: OpcoesDoCliente) {
  /**
   * A renovação em andamento, compartilhada por todas as chamadas.
   *
   * **É a peça que impede o app de se deslogar sozinho.** Quando o token de
   * acesso expira, várias chamadas em paralelo recebem 401 ao mesmo tempo. Sem
   * esta fila, cada uma dispararia a própria renovação — e o servidor, que
   * invalida o token de renovação a cada uso, veria o mesmo token chegando
   * várias vezes. Isso é exatamente a assinatura de um token roubado, então ele
   * derrubaria a família inteira e o aluno seria expulso no meio do estudo.
   *
   * Com a fila única, a primeira renova e as outras esperam o resultado dela.
   */
  let renovacaoEmAndamento: Promise<Tokens | null> | null = null;

  async function renovar(): Promise<Tokens | null> {
    renovacaoEmAndamento ??= (async () => {
      try {
        const tokens = await obterTokens();
        if (!tokens) return null;

        const resposta = await buscar(`${baseUrl}/sessoes/renovar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-plataforma': 'mobile' },
          body: JSON.stringify({ renovacao: tokens.renovacao }),
        });

        if (!resposta.ok) return null;

        const dados = (await resposta.json()) as { acesso: string; renovacao?: string };
        if (!dados.renovacao) return null;

        const novos = { acesso: dados.acesso, renovacao: dados.renovacao };
        await salvarTokens(novos);

        return novos;
      } catch {
        // Falha de rede na renovação não significa sessão perdida: o token
        // continua válido, só não deu para falar com o servidor agora.
        return null;
      } finally {
        // Zerado no `finally` para que a próxima expiração comece uma
        // renovação nova em vez de reaproveitar um resultado velho.
        renovacaoEmAndamento = null;
      }
    })();

    return renovacaoEmAndamento;
  }

  async function enviar(
    caminho: string,
    opcoes: OpcoesDaChamada,
    tokenDeAcesso: string | null,
  ): Promise<Response> {
    try {
      return await buscar(`${baseUrl}${caminho}`, {
        method: opcoes.metodo ?? 'GET',
        headers: {
          'content-type': 'application/json',
          'x-plataforma': 'mobile',
          ...(tokenDeAcesso ? { authorization: `Bearer ${tokenDeAcesso}` } : {}),
        },
        ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
      });
    } catch (causa) {
      throw new SemRede(causa);
    }
  }

  async function interpretar<T>(resposta: Response): Promise<T> {
    if (resposta.status === 204) return undefined as T;

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null;
    }

    if (!resposta.ok) {
      const erro = (corpo ?? {
        codigo: 'entrada_invalida',
        mensagem: 'Algo deu errado.',
      }) as Erro;
      throw new FalhaDaApi(resposta.status, erro);
    }

    return corpo as T;
  }

  return {
    async chamar<T>(caminho: string, opcoes: OpcoesDaChamada = {}): Promise<T> {
      const tokens = opcoes.publica ? null : await obterTokens();
      const primeira = await enviar(caminho, opcoes, tokens?.acesso ?? null);

      if (primeira.status !== 401 || opcoes.publica) {
        return interpretar<T>(primeira);
      }

      const renovados = await renovar();

      if (!renovados) {
        await aoPerderSessao();
        return interpretar<T>(primeira);
      }

      // Uma tentativa só. Se o token recém-emitido também é recusado, insistir
      // vira laço infinito contra um servidor que já disse não.
      const segunda = await enviar(caminho, opcoes, renovados.acesso);

      if (segunda.status === 401) await aoPerderSessao();

      return interpretar<T>(segunda);
    },
  };
}

export type Cliente = ReturnType<typeof criarCliente>;
