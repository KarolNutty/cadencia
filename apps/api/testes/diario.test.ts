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

async function cenario(quantidadeDeAlunos = 3) {
  const professor = await criarUsuario(sql, { papel: 'professor' });

  const [turma] = await sql<{ id: string }[]>`
    INSERT INTO turmas ${sql({
      nome: 'Inglês B1',
      idioma: 'ingles',
      professor_id: professor.id,
    })}
    RETURNING id
  `;

  const alunos = [];
  for (let i = 0; i < quantidadeDeAlunos; i += 1) {
    const aluno = await criarUsuario(sql, { papel: 'aluno' });
    await sql`INSERT INTO matriculas ${sql({ turma_id: turma!.id, aluno_id: aluno.id })}`;
    alunos.push(aluno);
  }

  const doProfessor = await entrar(app, { ...professor, senha: SENHA_PADRAO }, 'mobile');
  const doAluno = await entrar(app, { ...alunos[0]!, senha: SENHA_PADRAO }, 'mobile');

  return {
    turmaId: turma!.id,
    alunos,
    professor: doProfessor.corpo.acesso,
    aluno: doAluno.corpo.acesso,
  };
}

async function registrar(
  acesso: string,
  turmaId: string,
  dia: string,
  presencas: { alunoId: string; situacao: 'presente' | 'ausente' | 'justificada' }[],
) {
  return app.inject({
    method: 'POST',
    url: `/turmas/${turmaId}/aulas`,
    headers: comToken(acesso),
    payload: {
      dia,
      conteudo: 'Past simple, verbos irregulares.',
      dever: 'Exercícios 4 a 9.',
      encontro: null,
      presencas,
    },
  });
}

describe('registro de aula', () => {
  it('grava a aula com a chamada', async () => {
    const { professor, turmaId, alunos } = await cenario(3);

    const resposta = await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'presente' },
      { alunoId: alunos[1]!.id, situacao: 'ausente' },
      { alunoId: alunos[2]!.id, situacao: 'justificada' },
    ]);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ presentes: 1, ausentes: 1, justificadas: 1 });
  });

  it('registrar o mesmo dia de novo substitui', async () => {
    // Corrigir a chamada depois da aula é o caso comum. Obrigar a apagar antes
    // seria burocracia sem ganho.
    const { professor, turmaId, alunos } = await cenario(2);

    await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'ausente' },
      { alunoId: alunos[1]!.id, situacao: 'ausente' },
    ]);

    await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'presente' },
      { alunoId: alunos[1]!.id, situacao: 'presente' },
    ]);

    const aulas = await sql`SELECT 1 FROM aulas`;
    expect(aulas).toHaveLength(1);

    const presencas = await sql<{ situacao: string }[]>`SELECT situacao FROM presencas`;
    expect(presencas.every((linha) => linha.situacao === 'presente')).toBe(true);
  });

  it('recusa presença de quem não está na turma', async () => {
    // Aceitar em silêncio criaria registro órfão que ninguém encontra depois.
    const meu = await cenario(1);
    const outro = await cenario(1);

    const resposta = await registrar(meu.professor, meu.turmaId, '2026-08-10', [
      { alunoId: outro.alunos[0]!.id, situacao: 'presente' },
    ]);

    expect(resposta.statusCode).toBe(404);

    const aulas = await sql`SELECT 1 FROM aulas`;
    expect(aulas).toHaveLength(0);
  });

  it('recusa conteúdo vazio antes de tocar no banco', async () => {
    const { professor, turmaId } = await cenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/aulas`,
      headers: comToken(professor),
      payload: {
        dia: '2026-08-10',
        conteudo: ' ',
        dever: null,
        encontro: null,
        presencas: [],
      },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('recusa link de encontro que não é endereço', async () => {
    const { professor, turmaId } = await cenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: `/turmas/${turmaId}/aulas`,
      headers: comToken(professor),
      payload: {
        dia: '2026-08-10',
        conteudo: 'Aula normal.',
        dever: null,
        encontro: 'sala 3 do prédio',
        presencas: [],
      },
    });

    expect(resposta.statusCode).toBe(400);
  });
});

describe('frequência', () => {
  it('falta justificada não derruba a taxa', async () => {
    const { professor, turmaId, alunos } = await cenario(1);

    await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'presente' },
    ]);
    await registrar(professor, turmaId, '2026-08-11', [
      { alunoId: alunos[0]!.id, situacao: 'justificada' },
    ]);

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/frequencia`,
      headers: comToken(professor),
    });

    const aluno = resposta.json().alunos[0];
    expect(aluno.taxa).toBe(1);
    expect(aluno.justificadas).toBe(1);
    expect(aluno.total).toBe(2);
  });

  it('marca quem está abaixo do mínimo', async () => {
    const { professor, turmaId, alunos } = await cenario(1);

    for (const dia of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']) {
      await registrar(professor, turmaId, dia, [
        { alunoId: alunos[0]!.id, situacao: dia === '2026-08-10' ? 'presente' : 'ausente' },
      ]);
    }

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/frequencia`,
      headers: comToken(professor),
    });

    expect(resposta.json().alunos[0].emRisco).toBe(true);
  });

  it('quem nunca teve aula não aparece em risco', async () => {
    const { professor, turmaId } = await cenario(2);

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/frequencia`,
      headers: comToken(professor),
    });

    expect(
      resposta.json().alunos.every((aluno: { emRisco: boolean }) => !aluno.emRisco),
    ).toBe(true);
  });
});

describe('o que o aluno vê', () => {
  it('vê as próprias aulas e a própria frequência', async () => {
    const { professor, aluno, turmaId, alunos } = await cenario(2);

    await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'presente' },
      { alunoId: alunos[1]!.id, situacao: 'ausente' },
    ]);

    const resposta = await app.inject({
      method: 'GET',
      url: `/minhas-aulas?turmaId=${turmaId}`,
      headers: comToken(aluno),
    });

    expect(resposta.json().aulas).toHaveLength(1);
    expect(resposta.json().aulas[0].situacao).toBe('presente');
    expect(resposta.json().frequencia.taxa).toBe(1);
  });

  it('a resposta não traz a presença dos colegas', async () => {
    // A frequência de terceiros não é assunto do aluno.
    const { professor, aluno, turmaId, alunos } = await cenario(2);

    await registrar(professor, turmaId, '2026-08-10', [
      { alunoId: alunos[0]!.id, situacao: 'presente' },
      { alunoId: alunos[1]!.id, situacao: 'ausente' },
    ]);

    const resposta = await app.inject({
      method: 'GET',
      url: `/minhas-aulas?turmaId=${turmaId}`,
      headers: comToken(aluno),
    });

    expect(JSON.stringify(resposta.json())).not.toContain(alunos[1]!.id);
  });

  it('aluno não vê a frequência da turma', async () => {
    const { aluno, turmaId } = await cenario(2);

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/frequencia`,
      headers: comToken(aluno),
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('aluno não registra aula', async () => {
    const { aluno, turmaId } = await cenario(1);

    const resposta = await registrar(aluno, turmaId, '2026-08-10', []);
    expect(resposta.statusCode).toBe(403);
  });

  it('aluno não vê aulas de turma alheia', async () => {
    const meu = await cenario(1);
    const outro = await cenario(1);

    const resposta = await app.inject({
      method: 'GET',
      url: `/minhas-aulas?turmaId=${outro.turmaId}`,
      headers: comToken(meu.aluno),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('professor não registra aula em turma alheia', async () => {
    const meu = await cenario(1);
    const outro = await cenario(1);

    const resposta = await registrar(meu.professor, outro.turmaId, '2026-08-10', []);
    expect(resposta.statusCode).toBe(404);
  });
});
