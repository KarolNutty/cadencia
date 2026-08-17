import { describe, expect, it, vi } from 'vitest';
import { FalhaDaApi, SemRede, criarCliente, type Tokens } from './cliente';

const TOKENS: Tokens = { acesso: 'acesso-1', renovacao: 'renovacao-1' };

function resposta(status: number, corpo: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Cenario {
  respostas: Response[];
  tokens?: Tokens | null;
}

function montar({ respostas, tokens = TOKENS }: Cenario) {
  let atuais = tokens;
  const chamadas: { url: string; opcoes: RequestInit }[] = [];
  const salvos: Tokens[] = [];
  const perdaDeSessao = vi.fn(async () => {});

  let indice = 0;
  const buscar = vi.fn(async (url: string | URL | Request, opcoes?: RequestInit) => {
    chamadas.push({ url: String(url), opcoes: opcoes ?? {} });
    const proxima = respostas[indice];
    indice += 1;
    if (!proxima) throw new Error('resposta não preparada para esta chamada');
    return proxima;
  }) as unknown as typeof fetch;

  const cliente = criarCliente({
    baseUrl: 'https://api.teste',
    obterTokens: async () => atuais,
    salvarTokens: async (novos) => {
      salvos.push(novos);
      atuais = novos;
    },
    aoPerderSessao: perdaDeSessao,
    buscar,
  });

  return { cliente, chamadas, salvos, perdaDeSessao, buscar };
}

describe('chamada comum', () => {
  it('manda o token de acesso e devolve o corpo', async () => {
    const { cliente, chamadas } = montar({ respostas: [resposta(200, { ok: true })] });

    const dados = await cliente.chamar<{ ok: boolean }>('/eu');

    expect(dados).toEqual({ ok: true });
    expect(chamadas[0]?.url).toBe('https://api.teste/eu');
    expect((chamadas[0]?.opcoes.headers as Record<string, string>).authorization).toBe(
      'Bearer acesso-1',
    );
  });

  it('identifica a plataforma, para o token não vir em cookie', async () => {
    const { cliente, chamadas } = montar({ respostas: [resposta(200)] });

    await cliente.chamar('/eu');

    expect((chamadas[0]?.opcoes.headers as Record<string, string>)['x-plataforma']).toBe(
      'mobile',
    );
  });

  it('rota pública não manda token', async () => {
    const { cliente, chamadas } = montar({ respostas: [resposta(201, {})] });

    await cliente.chamar('/sessoes', { metodo: 'POST', corpo: {}, publica: true });

    expect(
      (chamadas[0]?.opcoes.headers as Record<string, string>).authorization,
    ).toBeUndefined();
  });

  it('lida com 204 sem corpo', async () => {
    const { cliente } = montar({ respostas: [resposta(204)] });

    await expect(cliente.chamar('/sessoes', { metodo: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('erros', () => {
  it('transforma erro da API em FalhaDaApi com o código', async () => {
    const { cliente } = montar({
      respostas: [
        resposta(404, { codigo: 'nao_encontrado', mensagem: 'Turma não encontrada.' }),
      ],
    });

    await expect(cliente.chamar('/estudo/sessao')).rejects.toMatchObject({
      status: 404,
      corpo: { codigo: 'nao_encontrado' },
    });
  });

  it('falha de rede vira SemRede, e não FalhaDaApi', async () => {
    // A tela trata os dois de formas diferentes: um pede "tente de novo", o
    // outro mostra a mensagem do servidor.
    const cliente = criarCliente({
      baseUrl: 'https://api.teste',
      obterTokens: async () => TOKENS,
      salvarTokens: async () => {},
      aoPerderSessao: async () => {},
      buscar: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(SemRede);
  });

  it('resposta de erro sem JSON ainda vira FalhaDaApi', async () => {
    const cliente = criarCliente({
      baseUrl: 'https://api.teste',
      obterTokens: async () => TOKENS,
      salvarTokens: async () => {},
      aoPerderSessao: async () => {},
      buscar: (async () =>
        new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch,
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(FalhaDaApi);
  });
});

describe('renovação de token', () => {
  it('renova ao receber 401 e repete a chamada', async () => {
    const { cliente, chamadas, salvos } = montar({
      respostas: [
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'Entre para continuar.' }),
        resposta(200, { acesso: 'acesso-2', renovacao: 'renovacao-2' }),
        resposta(200, { ok: true }),
      ],
    });

    const dados = await cliente.chamar<{ ok: boolean }>('/eu');

    expect(dados).toEqual({ ok: true });
    expect(chamadas[1]?.url).toBe('https://api.teste/sessoes/renovar');
    expect(salvos[0]).toEqual({ acesso: 'acesso-2', renovacao: 'renovacao-2' });
    // A repetição usa o token novo.
    expect((chamadas[2]?.opcoes.headers as Record<string, string>).authorization).toBe(
      'Bearer acesso-2',
    );
  });

  it('renova UMA vez para várias chamadas paralelas', async () => {
    /**
     * É o teste mais importante deste arquivo.
     *
     * Quando o token expira, todas as chamadas em voo recebem 401 juntas. Sem
     * a fila única, cada uma dispararia a própria renovação — e o servidor, que
     * invalida o token de renovação a cada uso, veria o mesmo token chegando
     * três vezes. Essa é exatamente a assinatura de um token roubado: ele
     * derrubaria a família inteira, e o aluno seria expulso no meio do estudo.
     *
     * O recurso de segurança do servidor e o cliente ingênuo se combinam para
     * produzir um logout constante que ninguém consegue reproduzir.
     */
    const { cliente, chamadas } = montar({
      respostas: [
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
        resposta(200, { acesso: 'acesso-2', renovacao: 'renovacao-2' }),
        resposta(200, { ok: 1 }),
        resposta(200, { ok: 2 }),
        resposta(200, { ok: 3 }),
      ],
    });

    await Promise.all([cliente.chamar('/a'), cliente.chamar('/b'), cliente.chamar('/c')]);

    const renovacoes = chamadas.filter((chamada) =>
      chamada.url.endsWith('/sessoes/renovar'),
    );
    expect(renovacoes).toHaveLength(1);
  });

  it('avisa a perda de sessão quando a renovação é recusada', async () => {
    const { cliente, perdaDeSessao } = montar({
      respostas: [
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
      ],
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(FalhaDaApi);
    expect(perdaDeSessao).toHaveBeenCalledOnce();
  });

  it('não tenta renovar quando não há sessão guardada', async () => {
    const { cliente, chamadas, perdaDeSessao } = montar({
      respostas: [resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' })],
      tokens: null,
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(FalhaDaApi);
    expect(chamadas).toHaveLength(1);
    expect(perdaDeSessao).toHaveBeenCalledOnce();
  });

  it('não insiste quando o token recém-emitido também é recusado', async () => {
    // Insistir contra um servidor que já disse não vira laço infinito.
    const { cliente, chamadas, perdaDeSessao } = montar({
      respostas: [
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
        resposta(200, { acesso: 'acesso-2', renovacao: 'renovacao-2' }),
        resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' }),
      ],
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(FalhaDaApi);
    expect(chamadas).toHaveLength(3);
    expect(perdaDeSessao).toHaveBeenCalledOnce();
  });

  it('rota pública não renova mesmo recebendo 401', async () => {
    // Senha errada no login devolve 401. Tentar renovar aqui seria perseguir
    // uma sessão que nunca existiu.
    const { cliente, chamadas } = montar({
      respostas: [resposta(401, { codigo: 'credenciais_invalidas', mensagem: 'x' })],
    });

    await expect(
      cliente.chamar('/sessoes', { metodo: 'POST', corpo: {}, publica: true }),
    ).rejects.toBeInstanceOf(FalhaDaApi);

    expect(chamadas).toHaveLength(1);
  });

  it('falha de rede durante a renovação não derruba a sessão guardada', async () => {
    // O token continua válido; só não deu para falar com o servidor agora.
    let indice = 0;
    const perdaDeSessao = vi.fn(async () => {});

    const cliente = criarCliente({
      baseUrl: 'https://api.teste',
      obterTokens: async () => TOKENS,
      salvarTokens: async () => {},
      aoPerderSessao: perdaDeSessao,
      buscar: (async () => {
        indice += 1;
        if (indice === 1)
          return resposta(401, { codigo: 'nao_autenticado', mensagem: 'x' });
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });

    await expect(cliente.chamar('/eu')).rejects.toBeInstanceOf(FalhaDaApi);
    expect(perdaDeSessao).toHaveBeenCalledOnce();
  });
});
