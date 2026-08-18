import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../src/infra/banco';
import {
  SENHA_PADRAO,
  construirApp,
  criarUsuario,
  encerrarBanco,
  entrar,
  limparDados,
  prepararBanco,
  type UsuarioDeTeste,
} from './apoio';

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
  await app?.close();
  await encerrarBanco();
});

interface Professor {
  usuario: UsuarioDeTeste;
  acesso: string;
}

async function professor(): Promise<Professor> {
  const usuario = await criarUsuario(sql, { papel: 'professor' });
  const { corpo } = await entrar(app, usuario, 'mobile');
  return { usuario, acesso: corpo.acesso };
}

function comToken(acesso: string) {
  return { authorization: `Bearer ${acesso}` };
}

async function criarTurma(acesso: string, nome = 'Inglês A1'): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/turmas',
    headers: comToken(acesso),
    payload: { nome, idioma: 'ingles' },
  });

  return resposta.json().id;
}

async function criarBaralho(acesso: string, turmaId: string): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/turmas/${turmaId}/baralhos`,
    headers: comToken(acesso),
    payload: { titulo: 'Verbos', nivel: 'A2' },
  });

  return resposta.json().id;
}

describe('turmas', () => {
  it('cria e aparece na listagem do professor', async () => {
    const { acesso } = await professor();
    await criarTurma(acesso, 'Espanhol B1');

    const resposta = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(acesso),
    });

    expect(resposta.json().turmas[0].nome).toBe('Espanhol B1');
  });

  it('recusa nome vazio antes de chegar ao banco', async () => {
    const { acesso } = await professor();

    const resposta = await app.inject({
      method: 'POST',
      url: '/turmas',
      headers: comToken(acesso),
      payload: { nome: ' ', idioma: 'ingles' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('aluno não cria turma', async () => {
    const aluno = await criarUsuario(sql, { papel: 'aluno' });
    const { corpo } = await entrar(app, aluno, 'mobile');

    const resposta = await app.inject({
      method: 'POST',
      url: '/turmas',
      headers: comToken(corpo.acesso),
      payload: { nome: 'Minha turma', idioma: 'ingles' },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('arquivar some da lista sem apagar o histórico', async () => {
    // Apagar levaria junto o estudo de todos os alunos da turma.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);

    await app.inject({
      method: 'DELETE',
      url: `/turmas/${turmaId}`,
      headers: comToken(acesso),
    });

    const listagem = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(acesso),
    });

    expect(listagem.json().turmas).toHaveLength(0);

    const noBanco = await sql`SELECT 1 FROM turmas WHERE id = ${turmaId}`;
    expect(noBanco).toHaveLength(1);
  });

  it('o aluno também deixa de ver a turma arquivada', async () => {
    // Filtrar só do lado do professor deixaria o aluno estudando uma turma
    // que, para a escola, já acabou.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const aluno = await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: aluno.email },
    });

    const entrada = await entrar(app, { ...aluno, senha: SENHA_PADRAO }, 'mobile');

    const antes = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(entrada.corpo.acesso),
    });
    expect(antes.json().turmas).toHaveLength(1);

    await app.inject({
      method: 'DELETE',
      url: `/turmas/${turmaId}`,
      headers: comToken(acesso),
    });

    const depois = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(entrada.corpo.acesso),
    });
    expect(depois.json().turmas).toHaveLength(0);
  });

  it('a sessão de estudo de turma arquivada responde 404', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const aluno = await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: aluno.email },
    });

    const entrada = await entrar(app, { ...aluno, senha: SENHA_PADRAO }, 'mobile');

    await app.inject({
      method: 'DELETE',
      url: `/turmas/${turmaId}`,
      headers: comToken(acesso),
    });

    const hoje = new Date().toISOString().slice(0, 10);
    const sessao = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje}`,
      headers: comToken(entrada.corpo.acesso),
    });

    expect(sessao.statusCode).toBe(404);
  });

  it('professor não arquiva turma de outro', async () => {
    const meu = await professor();
    const outro = await professor();
    const turmaAlheia = await criarTurma(outro.acesso);

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/turmas/${turmaAlheia}`,
      headers: comToken(meu.acesso),
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('matrícula', () => {
  it('matricula quem já tem conta', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const aluno = await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: 'ana@escola.com.br' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().situacao).toBe('matriculado');
    expect(resposta.json().aluno.id).toBe(aluno.id);
  });

  it('convida quem ainda não tem conta, em vez de falhar', async () => {
    // O professor não pode criar a conta de outra pessoa — definir a senha de
    // alguém é o que nunca se deve fazer. O convite espera a pessoa entrar.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: 'novo@escola.com.br' },
    });

    expect(resposta.json()).toEqual({ situacao: 'convidado', aluno: null });

    const convites = await sql`SELECT 1 FROM convites WHERE email = 'novo@escola.com.br'`;
    expect(convites).toHaveLength(1);
  });

  it('distingue "já estava" de "acabei de matricular"', async () => {
    // Um "ok" genérico deixaria o professor sem saber se precisa avisar o aluno.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    const corpo = { email: 'ana@escola.com.br' };
    const url = `/turmas/${turmaId}/matriculas`;

    await app.inject({ method: 'POST', url, headers: comToken(acesso), payload: corpo });
    const segunda = await app.inject({
      method: 'POST',
      url,
      headers: comToken(acesso),
      payload: corpo,
    });

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().situacao).toBe('ja_estava');
  });

  it('convidar duas vezes não duplica o convite', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const corpo = { email: 'novo@escola.com.br' };
    const url = `/turmas/${turmaId}/matriculas`;

    await app.inject({ method: 'POST', url, headers: comToken(acesso), payload: corpo });
    await app.inject({ method: 'POST', url, headers: comToken(acesso), payload: corpo });

    const convites = await sql`SELECT 1 FROM convites`;
    expect(convites).toHaveLength(1);
  });

  it('recusa matricular um professor como aluno', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const outro = await criarUsuario(sql, {
      papel: 'professor',
      email: 'prof@escola.com.br',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: outro.email },
    });

    expect(resposta.statusCode).toBe(409);
  });

  it('aceita e-mail com maiúsculas', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: 'Ana@Escola.Com.BR' },
    });

    expect(resposta.json().situacao).toBe('matriculado');
  });

  it('desmatricular tira da turma e preserva o estudo', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const aluno = await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: aluno.email },
    });

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/turmas/${turmaId}/matriculas/${aluno.id}`,
      headers: comToken(acesso),
    });

    expect(resposta.statusCode).toBe(204);

    const matriculas = await sql`SELECT 1 FROM matriculas WHERE turma_id = ${turmaId}`;
    expect(matriculas).toHaveLength(0);

    const usuarios = await sql`SELECT 1 FROM usuarios WHERE id = ${aluno.id}`;
    expect(usuarios).toHaveLength(1);
  });

  it('professor não matricula em turma alheia', async () => {
    const meu = await professor();
    const outro = await professor();
    const turmaAlheia = await criarTurma(outro.acesso);

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaAlheia}/matriculas`,
      headers: comToken(meu.acesso),
      payload: { email: 'qualquer@escola.com.br' },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('cadastro e convite', () => {
  it('quem se cadastra com e-mail convidado entra na turma na hora', async () => {
    // Sem isto o convite ficaria guardado para sempre, e o professor teria de
    // convidar de novo — sem saber que precisa.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: 'nova@escola.com.br' },
    });

    const cadastro = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { 'x-plataforma': 'mobile' },
      payload: {
        nome: 'Nova Aluna',
        email: 'nova@escola.com.br',
        senha: 'uma-senha-bem-comprida',
      },
    });

    expect(cadastro.statusCode).toBe(201);
    expect(cadastro.json().turmasQueEntrou).toBe(1);

    const turmas = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(cadastro.json().acesso),
    });

    expect(turmas.json().turmas[0].id).toBe(turmaId);
  });

  it('quem se cadastra sem convite entra sem turma', async () => {
    const cadastro = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { 'x-plataforma': 'mobile' },
      payload: {
        nome: 'Sem Convite',
        email: 'sozinho@escola.com.br',
        senha: 'uma-senha-bem-comprida',
      },
    });

    expect(cadastro.json().turmasQueEntrou).toBe(0);
  });

  it('quem se cadastra é sempre aluno, mesmo pedindo outro papel', async () => {
    // Aceitar o papel na entrada deixaria qualquer pessoa se declarar professor
    // e ver a turma inteira.
    const cadastro = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { 'x-plataforma': 'mobile' },
      payload: {
        nome: 'Esperto',
        email: 'esperto@escola.com.br',
        senha: 'uma-senha-bem-comprida',
        papel: 'professor',
      },
    });

    expect(cadastro.json().usuario.papel).toBe('aluno');
  });

  it('recusa e-mail já cadastrado', async () => {
    await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });

    const cadastro = await app.inject({
      method: 'POST',
      url: '/usuarios',
      payload: {
        nome: 'Ana Outra',
        email: 'ana@escola.com.br',
        senha: 'uma-senha-bem-comprida',
      },
    });

    expect(cadastro.statusCode).toBe(409);
  });

  it('recusa senha curta antes de tocar no banco', async () => {
    const cadastro = await app.inject({
      method: 'POST',
      url: '/usuarios',
      payload: { nome: 'Curta', email: 'curta@escola.com.br', senha: 'curta123' },
    });

    expect(cadastro.statusCode).toBe(400);

    const usuarios = await sql`SELECT 1 FROM usuarios WHERE email = 'curta@escola.com.br'`;
    expect(usuarios).toHaveLength(0);
  });

  it('o convite é marcado como aceito e não vale duas vezes', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(acesso),
      payload: { email: 'nova@escola.com.br' },
    });

    await app.inject({
      method: 'POST',
      url: '/usuarios',
      payload: {
        nome: 'Nova Aluna',
        email: 'nova@escola.com.br',
        senha: 'uma-senha-bem-comprida',
      },
    });

    const pendentes = await sql`SELECT 1 FROM convites WHERE aceito_em IS NULL`;
    expect(pendentes).toHaveLength(0);
  });
});

describe('baralhos e palavras', () => {
  it('cria baralho e lista com a contagem de palavras', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    await criarBaralho(acesso, turmaId);

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/baralhos`,
      headers: comToken(acesso),
    });

    expect(resposta.json().baralhos[0]).toMatchObject({
      titulo: 'Verbos',
      nivel: 'A2',
      palavras: 0,
    });
  });

  it('importa a lista colada', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const baralhoId = await criarBaralho(acesso, turmaId);

    const resposta = await app.inject({
      method: 'POST',
      url: `/baralhos/${baralhoId}/palavras`,
      headers: comToken(acesso),
      payload: {
        texto: 'though — embora — parece "through"\nto gather; reunir\nawkward = sem jeito',
      },
    });

    expect(resposta.json().criadas).toBe(3);

    const cartoes = await sql<{ frente: string; dica: string | null }[]>`
      SELECT frente, dica FROM cartoes ORDER BY ordem
    `;
    expect(cartoes.map((c) => c.frente)).toEqual(['though', 'to gather', 'awkward']);
    expect(cartoes[0]?.dica).toBe('parece "through"');
  });

  it('devolve as linhas problemáticas em vez de recusar tudo', async () => {
    // Recusar o lote inteiro faria o professor procurar a agulha sozinho.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const baralhoId = await criarBaralho(acesso, turmaId);

    const resposta = await app.inject({
      method: 'POST',
      url: `/baralhos/${baralhoId}/palavras`,
      headers: comToken(acesso),
      payload: { texto: 'though — embora\npalavra solta\nawkward = sem jeito' },
    });

    expect(resposta.json().criadas).toBe(2);
    expect(resposta.json().problemas[0].linha).toBe(2);
  });

  it('reimportar a mesma lista não duplica', async () => {
    // Corrigir a lista e colar de novo é o fluxo normal. Duplicar faria o aluno
    // ver a mesma carta duas vezes na sessão.
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const baralhoId = await criarBaralho(acesso, turmaId);

    const corpo = { texto: 'though — embora\nawkward — sem jeito' };
    const url = `/baralhos/${baralhoId}/palavras`;

    await app.inject({ method: 'POST', url, headers: comToken(acesso), payload: corpo });
    const segunda = await app.inject({
      method: 'POST',
      url,
      headers: comToken(acesso),
      payload: corpo,
    });

    expect(segunda.json().criadas).toBe(0);
    expect(segunda.json().jaExistiam).toBe(2);

    const cartoes = await sql`SELECT 1 FROM cartoes`;
    expect(cartoes).toHaveLength(2);
  });

  it('a mesma palavra em outro baralho é permitida', async () => {
    const { acesso } = await professor();
    const turmaId = await criarTurma(acesso);
    const primeiro = await criarBaralho(acesso, turmaId);

    const segundo = (
      await app.inject({
        method: 'POST',
        url: `/turmas/${turmaId}/baralhos`,
        headers: comToken(acesso),
        payload: { titulo: 'Revisão', nivel: null },
      })
    ).json().id;

    const corpo = { texto: 'though — embora' };

    await app.inject({
      method: 'POST',
      url: `/baralhos/${primeiro}/palavras`,
      headers: comToken(acesso),
      payload: corpo,
    });
    const outra = await app.inject({
      method: 'POST',
      url: `/baralhos/${segundo}/palavras`,
      headers: comToken(acesso),
      payload: corpo,
    });

    expect(outra.json().criadas).toBe(1);
  });

  it('professor não importa em baralho de turma alheia', async () => {
    const meu = await professor();
    const outro = await professor();
    const turmaAlheia = await criarTurma(outro.acesso);
    const baralhoAlheio = await criarBaralho(outro.acesso, turmaAlheia);

    const resposta = await app.inject({
      method: 'POST',
      url: `/baralhos/${baralhoAlheio}/palavras`,
      headers: comToken(meu.acesso),
      payload: { texto: 'though — embora' },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('destravar palavra', () => {
  async function cenarioComPalavraTravada() {
    const prof = await professor();
    const turmaId = await criarTurma(prof.acesso);
    const baralhoId = await criarBaralho(prof.acesso, turmaId);

    await app.inject({
      method: 'POST',
      url: `/baralhos/${baralhoId}/palavras`,
      headers: comToken(prof.acesso),
      payload: { texto: 'though — embora' },
    });

    const aluno = await criarUsuario(sql, { papel: 'aluno', email: 'ana@escola.com.br' });
    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/matriculas`,
      headers: comToken(prof.acesso),
      payload: { email: aluno.email },
    });

    const entrada = await entrar(app, { ...aluno, senha: SENHA_PADRAO }, 'mobile');
    const [cartao] = await sql<{ id: string }[]>`SELECT id FROM cartoes`;
    const hoje = new Date().toISOString().slice(0, 10);

    // Quatro erros: a partir daí a carta é sinalizada.
    for (let i = 0; i < 4; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/estudo/revisoes',
        headers: comToken(entrada.corpo.acesso),
        payload: {
          turmaId,
          loteId: randomUUID(),
          revisoes: [{ cartaoId: cartao!.id, avaliacao: 'errei', dia: hoje }],
        },
      });
    }

    return { prof, turmaId, alunoId: aluno.id, cartaoId: cartao!.id, hoje };
  }

  it('devolve a palavra ao estudo e zera os lapsos', async () => {
    // Manter o contador em quatro faria a carta ser sinalizada de novo no erro
    // seguinte, e a explicação em aula não teria valido nada.
    const { prof, turmaId, alunoId, cartaoId } = await cenarioComPalavraTravada();

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/alunos/${alunoId}/destravar/${cartaoId}`,
      headers: comToken(prof.acesso),
    });

    expect(resposta.statusCode).toBe(204);

    const [agendamento] = await sql<{ sinalizado: boolean; lapsos: number }[]>`
      SELECT sinalizado, lapsos FROM agendamentos WHERE cartao_id = ${cartaoId}
    `;

    expect(agendamento?.sinalizado).toBe(false);
    expect(agendamento?.lapsos).toBe(0);
  });

  it('a palavra some da lista de travadas do professor', async () => {
    const { prof, turmaId, alunoId, cartaoId } = await cenarioComPalavraTravada();

    await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/alunos/${alunoId}/destravar/${cartaoId}`,
      headers: comToken(prof.acesso),
    });

    const travadas = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/palavras-travadas`,
      headers: comToken(prof.acesso),
    });

    expect(travadas.json().palavras).toHaveLength(0);
  });

  it('destravar uma palavra que não estava travada responde 404', async () => {
    const { prof, turmaId, alunoId, cartaoId } = await cenarioComPalavraTravada();
    const url = `/turmas/${turmaId}/alunos/${alunoId}/destravar/${cartaoId}`;

    await app.inject({ method: 'POST', url, headers: comToken(prof.acesso) });
    const segunda = await app.inject({
      method: 'POST',
      url,
      headers: comToken(prof.acesso),
    });

    expect(segunda.statusCode).toBe(404);
  });

  it('professor de outra turma não destrava', async () => {
    const { turmaId, alunoId, cartaoId } = await cenarioComPalavraTravada();
    const intruso = await professor();

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/alunos/${alunoId}/destravar/${cartaoId}`,
      headers: comToken(intruso.acesso),
    });

    expect(resposta.statusCode).toBe(404);
  });
});
