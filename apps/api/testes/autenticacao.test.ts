import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../src/infra/banco';
import {
  construirApp,
  criarUsuario,
  encerrarBanco,
  entrar,
  limparDados,
  prepararBanco,
  SENHA_PADRAO,
} from './apoio';

// `!` é a atribuição definida: quem preenche é o `beforeAll`, e o TypeScript
// não tem como enxergar isso sozinho. A alternativa — tipar como opcional —
// obrigaria `app!.inject` em cada um dos vinte e cinco casos.
let sql!: Banco;
let app!: FastifyInstance;

beforeAll(async () => {
  sql = await prepararBanco();
  app = await construirApp(sql);
});

beforeEach(async () => {
  await limparDados(sql);
});

afterAll(async () => {
  // O `?.` continua necessário mesmo com a atribuição definida: se o
  // `beforeAll` falhar, `app` fica indefinido em execução, e um
  // "Cannot read properties of undefined" aqui esconderia o erro de verdade.
  await app?.close();
  await encerrarBanco();
});

describe('entrar', () => {
  it('devolve usuário e token de acesso', async () => {
    const usuario = await criarUsuario(sql);
    const { status, corpo } = await entrar(app, usuario);

    expect(status).toBe(201);
    expect(corpo.usuario.email).toBe(usuario.email);
    expect(corpo.acesso).toBeTypeOf('string');
  });

  it('nunca devolve o hash da senha', async () => {
    // O schema do contrato descarta campo desconhecido, mas o teste garante que
    // ninguém contorne o schema montando a resposta à mão.
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario);

    expect(JSON.stringify(corpo)).not.toContain('$argon2');
    expect(corpo.usuario).not.toHaveProperty('senhaHash');
    expect(corpo.usuario).not.toHaveProperty('senha_hash');
  });

  it('aceita e-mail com maiúsculas', async () => {
    const usuario = await criarUsuario(sql, { email: 'ana.silva@escola.com.br' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: 'Ana.Silva@Escola.Com.BR', senha: usuario.senha },
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('recusa senha errada', async () => {
    const usuario = await criarUsuario(sql);

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: usuario.email, senha: 'senha-errada-mas-longa' },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json().codigo).toBe('credenciais_invalidas');
  });

  it('usa a mesma mensagem para e-mail inexistente e senha errada', async () => {
    // Dizer "e-mail não cadastrado" entrega quais endereços existem na base.
    const usuario = await criarUsuario(sql);

    const senhaErrada = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: usuario.email, senha: 'senha-errada-mas-longa' },
    });

    const semUsuario = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: 'ninguem@escola.com.br', senha: SENHA_PADRAO },
    });

    expect(semUsuario.statusCode).toBe(senhaErrada.statusCode);
    expect(semUsuario.json()).toEqual(senhaErrada.json());
  });

  it('recusa corpo malformado com o campo problemático', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: 'nao-e-email', senha: 'curta' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos.map((c: { campo: string }) => c.campo)).toEqual(
      expect.arrayContaining(['email', 'senha']),
    );
  });

  it('registra a entrada e a recusa, sem guardar token nem senha', async () => {
    const usuario = await criarUsuario(sql);

    await entrar(app, usuario);
    await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: usuario.email, senha: 'senha-errada-mas-longa' },
    });

    const eventos = await sql<{ tipo: string; detalhe: string | null }[]>`
      SELECT tipo, detalhe FROM eventos_de_autenticacao ORDER BY id
    `;

    expect(eventos.map((e) => e.tipo)).toEqual(['entrada', 'entrada_recusada']);
    expect(JSON.stringify(eventos)).not.toContain(SENHA_PADRAO);
  });
});

describe('limite de tentativas', () => {
  /**
   * A chave junta IP **e** e-mail.
   *
   * Este é o teste que faltava quando o `keyGenerator` lia um corpo que ainda
   * não tinha sido interpretado: a chave degenerava em silêncio para só o IP, e
   * cinco tentativas de uma pessoa bloqueavam o login de todo mundo atrás do
   * mesmo endereço. Um teste que só contasse as tentativas de uma conta
   * passaria mesmo com o defeito.
   */
  async function tentar(email: string) {
    return app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email, senha: 'senha-errada-mas-longa' },
    });
  }

  it('bloqueia depois de cinco tentativas na mesma conta', async () => {
    const usuario = await criarUsuario(sql);

    for (let i = 0; i < 5; i += 1) {
      const resposta = await tentar(usuario.email);
      expect(resposta.statusCode).toBe(401);
    }

    expect((await tentar(usuario.email)).statusCode).toBe(429);
  });

  it('bloquear uma conta não bloqueia as outras do mesmo endereço', async () => {
    const alvo = await criarUsuario(sql);
    const vizinho = await criarUsuario(sql);

    for (let i = 0; i < 6; i += 1) await tentar(alvo.email);

    // Mesmo IP, outra conta: precisa continuar entrando normalmente.
    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: vizinho.email, senha: vizinho.senha },
    });

    expect(resposta.statusCode).toBe(201);
  });
});

describe('entrega do token de renovação', () => {
  it('no app, vem no corpo e não em cookie', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo, cookies } = await entrar(app, usuario, 'mobile');

    expect(corpo.renovacao).toBeTypeOf('string');
    expect(cookies).toHaveLength(0);
  });

  it('na web, vem em cookie httpOnly e NÃO no corpo', async () => {
    // Devolvê-lo no corpo permitiria a um script injetado lê-lo da resposta, o
    // que anularia todo o cuidado com o httpOnly.
    const usuario = await criarUsuario(sql);
    const { corpo, cookies } = await entrar(app, usuario, 'web');

    expect(corpo.renovacao).toBeUndefined();

    const cookie = cookies.find((c) => c.name === 'cadencia_renovacao');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    // O cookie só acompanha a rota de renovação, e não toda chamada da API.
    expect(cookie?.path).toBe('/sessoes/renovar');
  });

  it('sem cabeçalho de plataforma, assume o modo mais restritivo', async () => {
    const usuario = await criarUsuario(sql);

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes',
      payload: { email: usuario.email, senha: usuario.senha },
    });

    expect(resposta.json().renovacao).toBeUndefined();
    expect(resposta.cookies).toHaveLength(1);
  });
});

describe('renovar', () => {
  it('troca o token por um par novo', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario, 'mobile');

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.renovacao },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().renovacao).not.toBe(corpo.renovacao);
  });

  it('o token antigo deixa de valer', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario, 'mobile');

    await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.renovacao },
    });

    const segunda = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.renovacao },
    });

    expect(segunda.statusCode).toBe(401);
  });

  it('reusar um token já usado derruba a família inteira', async () => {
    // Só há duas explicações para um token usado reaparecer: ele vazou, ou
    // houve corrida. Nos dois casos a resposta é a mesma — e é isso que
    // transforma um roubo silencioso de trinta dias num logout percebido.
    const usuario = await criarUsuario(sql);
    const { corpo: primeiro } = await entrar(app, usuario, 'mobile');

    const renovacao = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: primeiro.renovacao },
    });

    const tokenAtual = renovacao.json().renovacao;

    // O atacante apresenta o token antigo.
    await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: primeiro.renovacao },
    });

    // E o token legítimo, que estava válido, também cai.
    const legitimo = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: tokenAtual },
    });

    expect(legitimo.statusCode).toBe(401);

    const [evento] = await sql<{ tipo: string }[]>`
      SELECT tipo FROM eventos_de_autenticacao WHERE tipo = 'reuso_detectado'
    `;
    expect(evento).toBeDefined();
  });

  it('derrubar uma família não desloga os outros aparelhos', async () => {
    // Cada entrada abre uma família própria — senão um token vazado no celular
    // deslogaria a pessoa também no computador.
    const usuario = await criarUsuario(sql);

    const celular = await entrar(app, usuario, 'mobile');
    const computador = await entrar(app, usuario, 'mobile');

    await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: celular.corpo.renovacao },
    });
    await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: celular.corpo.renovacao },
    });

    const doComputador = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: computador.corpo.renovacao },
    });

    expect(doComputador.statusCode).toBe(200);
  });

  it('recusa token inventado', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: 'nao.e.um.token' },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('recusa token de acesso apresentado como renovação', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario, 'mobile');

    const resposta = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.acesso },
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe('sair', () => {
  it('invalida o token daquele aparelho', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario, 'mobile');

    const saida = await app.inject({
      method: 'DELETE',
      url: '/sessoes',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.renovacao },
    });

    expect(saida.statusCode).toBe(204);

    const depois = await app.inject({
      method: 'POST',
      url: '/sessoes/renovar',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: corpo.renovacao },
    });

    expect(depois.statusCode).toBe(401);
  });

  it('sair com token inválido não devolve erro', async () => {
    // O objetivo de quem pediu para sair já está cumprido. Um 401 aqui só o
    // prenderia numa tela sem saída.
    const resposta = await app.inject({
      method: 'DELETE',
      url: '/sessoes',
      headers: { 'x-plataforma': 'mobile' },
      payload: { renovacao: 'lixo' },
    });

    expect(resposta.statusCode).toBe(204);
  });
});

describe('rota protegida', () => {
  it('responde com o usuário do token', async () => {
    const usuario = await criarUsuario(sql, { papel: 'professor' });
    const { corpo } = await entrar(app, usuario, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: '/eu',
      headers: { authorization: `Bearer ${corpo.acesso}` },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().usuario).toEqual({ id: usuario.id, papel: 'professor' });
  });

  it('recusa sem cabeçalho', async () => {
    expect((await app.inject({ method: 'GET', url: '/eu' })).statusCode).toBe(401);
  });

  it('recusa esquema que não é Bearer', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/eu',
      headers: { authorization: 'Basic YWJjOjEyMw==' },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('recusa token com o papel adulterado', async () => {
    // Trocar "aluno" por "professor" no corpo do token quebra a assinatura.
    const usuario = await criarUsuario(sql, { papel: 'aluno' });
    const { corpo } = await entrar(app, usuario, 'mobile');

    const [cabecalho, payload, assinatura] = (corpo.acesso as string).split('.');
    const conteudo = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    conteudo.papel = 'professor';
    const adulterado = `${cabecalho}.${Buffer.from(JSON.stringify(conteudo)).toString('base64url')}.${assinatura}`;

    const resposta = await app.inject({
      method: 'GET',
      url: '/eu',
      headers: { authorization: `Bearer ${adulterado}` },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('recusa token de renovação usado como acesso', async () => {
    const usuario = await criarUsuario(sql);
    const { corpo } = await entrar(app, usuario, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: '/eu',
      headers: { authorization: `Bearer ${corpo.renovacao}` },
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe('injeção de SQL', () => {
  it('trata caractere especial como texto', async () => {
    // A biblioteca parametriza por construção, mas o teste garante que ninguém
    // introduza concatenação depois.
    const nome = "Robert'); DROP TABLE usuarios; --";
    const usuario = await criarUsuario(sql, { nome });

    const { corpo } = await entrar(app, usuario, 'mobile');
    expect(corpo.usuario.nome).toBe(nome);

    // O acesso indexado é opcional por causa do `noUncheckedIndexedAccess`:
    // `count(*)` sempre devolve linha, mas o tipo não sabe disso, e o compilador
    // está certo em não deduzir.
    const linhas = await sql<{ total: string }[]>`
      SELECT count(*) AS total FROM usuarios
    `;
    expect(Number(linhas[0]?.total)).toBe(1);
  });
});

describe('cabeçalhos de segurança', () => {
  it('não anuncia o servidor e bloqueia enquadramento', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/saude' });

    expect(resposta.headers['x-powered-by']).toBeUndefined();
    expect(resposta.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
  });
});
