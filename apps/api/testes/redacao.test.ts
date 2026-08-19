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

function comToken(acesso: string) {
  return { authorization: `Bearer ${acesso}` };
}

async function cenario() {
  const professor = await criarUsuario(sql, { papel: 'professor' });
  const aluno = await criarUsuario(sql, { papel: 'aluno' });

  const [turma] = await sql<{ id: string }[]>`
    INSERT INTO turmas ${sql({
      nome: 'Inglês B1',
      idioma: 'ingles',
      professor_id: professor.id,
    })}
    RETURNING id
  `;

  await sql`INSERT INTO matriculas ${sql({ turma_id: turma!.id, aluno_id: aluno.id })}`;

  const doProfessor = await entrar(app, { ...professor, senha: SENHA_PADRAO }, 'mobile');
  const doAluno = await entrar(app, { ...aluno, senha: SENHA_PADRAO }, 'mobile');

  const tema = await app.inject({
    method: 'POST',
    url: `/turmas/${turma!.id}/temas`,
    headers: comToken(doProfessor.corpo.acesso),
    payload: {
      titulo: 'Um dia inesquecível',
      enunciado: 'Descreva um dia que você não esquece. Use o passado.',
      nivel: 'B1',
    },
  });

  return {
    turmaId: turma!.id,
    temaId: tema.json().id,
    professor: doProfessor.corpo.acesso,
    aluno: doAluno.corpo.acesso,
    alunoId: aluno.id,
  };
}

async function enviarRedacao(acesso: string, temaId: string, texto: string) {
  return app.inject({
    method: 'POST',
    url: '/redacoes',
    headers: comToken(acesso),
    payload: { temaId, texto },
  });
}

describe('entrega da redação', () => {
  it('guarda o texto e devolve a análise', async () => {
    const { aluno, temaId } = await cenario();

    const resposta = await enviarRedacao(
      aluno,
      temaId,
      'Last summer I went to the beach. Yes, I am agree it was the best day.',
    );

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().analisadaPorIa).toBe(true);
    expect(resposta.json().apontamentos.length).toBeGreaterThan(0);
  });

  it('conta as palavras no servidor, e não confia no cliente', async () => {
    // Modelo de linguagem erra contagem com confiança total; aqui quem conta é
    // o mesmo módulo que o navegador usa.
    const { aluno, temaId } = await cenario();

    const resposta = await enviarRedacao(aluno, temaId, 'One two three four five');

    expect(resposta.json().tamanho.palavras).toBe(5);
    expect(resposta.json().tamanho.situacao).toBe('curto');
  });

  it('todo apontamento é verificado contra o texto original', async () => {
    // É a barreira contra o modelo citar trecho que não existe.
    const { aluno, temaId } = await cenario();

    const resposta = await enviarRedacao(aluno, temaId, 'I am agree with this idea.');

    for (const apontamento of resposta.json().apontamentos) {
      expect(apontamento).toHaveProperty('encontrado');
    }

    expect(resposta.json().apontamentos[0].encontrado).toBe(true);
  });

  it('recusa texto vazio', async () => {
    const { aluno, temaId } = await cenario();

    expect((await enviarRedacao(aluno, temaId, '   ')).statusCode).toBe(400);
  });

  it('recusa texto acima do limite', async () => {
    // Sem limite, um texto de trinta páginas estoura a janela do modelo.
    const { aluno, temaId } = await cenario();
    const enorme = Array(900).fill('word').join(' ');

    expect((await enviarRedacao(aluno, temaId, enorme)).statusCode).toBe(400);
  });

  it('reenviar substitui e apaga a correção anterior', async () => {
    // A correção era sobre outro texto; mantê-la enganaria o aluno.
    const { aluno, professor, temaId } = await cenario();

    const primeira = await enviarRedacao(aluno, temaId, 'First version of my text.');

    await app.inject({
      method: 'POST',
      url: `/redacoes/${primeira.json().id}/parecer`,
      headers: comToken(professor),
      payload: { parecer: 'Bom trabalho.', nota: 8 },
    });

    await enviarRedacao(aluno, temaId, 'Second and completely different version.');

    const minha = await app.inject({
      method: 'GET',
      url: `/redacoes/minha?temaId=${temaId}`,
      headers: comToken(aluno),
    });

    expect(minha.json().parecer).toBeNull();
    expect(minha.json().corrigida).toBe(false);

    const todas = await sql`SELECT 1 FROM redacoes`;
    expect(todas).toHaveLength(1);
  });
});

describe('acesso a redação alheia', () => {
  it('aluno não entrega em tema de outra turma', async () => {
    const meu = await cenario();
    const alheio = await cenario();

    const resposta = await enviarRedacao(meu.aluno, alheio.temaId, 'My text here.');

    expect(resposta.statusCode).toBe(404);
  });

  it('professor não vê redação de turma alheia', async () => {
    const meu = await cenario();
    const alheio = await cenario();

    const entregue = await enviarRedacao(alheio.aluno, alheio.temaId, 'Some text here.');

    const resposta = await app.inject({
      method: 'GET',
      url: `/redacoes/${entregue.json().id}`,
      headers: comToken(meu.professor),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('professor não corrige redação de turma alheia', async () => {
    const meu = await cenario();
    const alheio = await cenario();

    const entregue = await enviarRedacao(alheio.aluno, alheio.temaId, 'Some text here.');

    const resposta = await app.inject({
      method: 'POST',
      url: `/redacoes/${entregue.json().id}/parecer`,
      headers: comToken(meu.professor),
      payload: { parecer: 'Invadindo.', nota: 0 },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('aluno não acessa a fila de correção do professor', async () => {
    const { aluno, turmaId } = await cenario();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/redacoes`,
      headers: comToken(aluno),
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('aluno não propõe tema', async () => {
    const { aluno, turmaId } = await cenario();

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/temas`,
      headers: comToken(aluno),
      payload: { titulo: 'Meu tema', enunciado: 'Escrevam sobre mim.', nivel: 'A1' },
    });

    expect(resposta.statusCode).toBe(403);
  });
});

describe('limite de envios', () => {
  it('o limite é por conta, e não por endereço', async () => {
    /**
     * Numa escola com rede compartilhada, todos os alunos saem pelo mesmo IP.
     * Com a chave por endereço, os envios de uma turma somariam e a última
     * pessoa a escrever seria bloqueada, o mesmo defeito que o limite de login
     * já teve neste projeto.
     */
    const primeiro = await cenario();
    const segundo = await cenario();

    // O primeiro aluno esgota boa parte da própria cota.
    for (let i = 0; i < 20; i += 1) {
      await enviarRedacao(
        primeiro.aluno,
        primeiro.temaId,
        `Version number ${i} of my text.`,
      );
    }

    // O segundo, do mesmo endereço, precisa continuar entregando normalmente.
    const resposta = await enviarRedacao(
      segundo.aluno,
      segundo.temaId,
      'My own text, from another account.',
    );

    expect(resposta.statusCode).toBe(201);
  });
});

describe('parecer do professor', () => {
  it('registra o parecer e a nota', async () => {
    const { aluno, professor, temaId } = await cenario();

    const entregue = await enviarRedacao(aluno, temaId, 'My text about the beach.');

    const resposta = await app.inject({
      method: 'POST',
      url: `/redacoes/${entregue.json().id}/parecer`,
      headers: comToken(professor),
      payload: { parecer: 'Bem estruturado. Cuide dos tempos verbais.', nota: 8 },
    });

    expect(resposta.statusCode).toBe(204);

    const minha = await app.inject({
      method: 'GET',
      url: `/redacoes/minha?temaId=${temaId}`,
      headers: comToken(aluno),
    });

    expect(minha.json().nota).toBe(8);
    expect(minha.json().corrigida).toBe(true);
  });

  it('a nota é opcional: o parecer é o que importa', async () => {
    const { aluno, professor, temaId } = await cenario();
    const entregue = await enviarRedacao(aluno, temaId, 'Another text here.');

    const resposta = await app.inject({
      method: 'POST',
      url: `/redacoes/${entregue.json().id}/parecer`,
      headers: comToken(professor),
      payload: { parecer: 'Vamos conversar na aula.', nota: null },
    });

    expect(resposta.statusCode).toBe(204);
  });

  it('a fila mostra as pendentes primeiro', async () => {
    const { aluno, professor, temaId, turmaId } = await cenario();
    const entregue = await enviarRedacao(aluno, temaId, 'Text to correct.');

    const antes = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/redacoes`,
      headers: comToken(professor),
    });

    expect(antes.json().redacoes[0].corrigida).toBe(false);

    await app.inject({
      method: 'POST',
      url: `/redacoes/${entregue.json().id}/parecer`,
      headers: comToken(professor),
      payload: { parecer: 'ok', nota: null },
    });

    const depois = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/redacoes`,
      headers: comToken(professor),
    });

    expect(depois.json().redacoes[0].corrigida).toBe(true);
  });
});
