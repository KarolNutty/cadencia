import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TETO_DIARIO_DE_XP, diaDeEstudoDe } from '@cadencia/dominio';
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

const FUSO = 'America/Sao_Paulo';

/** O dia como o cliente o calcularia — nunca o dia em UTC cru. */
function hoje(): string {
  return diaDeEstudoDe(new Date(), FUSO);
}

function comToken(acesso: string) {
  return { authorization: `Bearer ${acesso}` };
}

async function cenario(quantidadeDeCartas = 30) {
  const professor = await criarUsuario(sql, { papel: 'professor' });
  const aluno = await criarUsuario(sql, { papel: 'aluno' });

  const [turma] = await sql<{ id: string }[]>`
    INSERT INTO turmas ${sql({
      nome: 'Inglês A1',
      idioma: 'ingles',
      professor_id: professor.id,
    })}
    RETURNING id
  `;

  await sql`INSERT INTO matriculas ${sql({ turma_id: turma!.id, aluno_id: aluno.id })}`;

  const [baralho] = await sql<{ id: string }[]>`
    INSERT INTO baralhos ${sql({ turma_id: turma!.id, titulo: 'Verbos' })}
    RETURNING id
  `;

  const cartoes: string[] = [];
  for (let i = 0; i < quantidadeDeCartas; i += 1) {
    const [cartao] = await sql<{ id: string }[]>`
      INSERT INTO cartoes ${sql({
        baralho_id: baralho!.id,
        frente: `palavra ${i}`,
        verso: `tradução ${i}`,
        dica: null,
      })}
      RETURNING id
    `;
    cartoes.push(cartao!.id);
  }

  const { corpo } = await entrar(app, { ...aluno, senha: SENHA_PADRAO }, 'mobile');

  return { aluno, turmaId: turma!.id, cartoes, acesso: corpo.acesso };
}

async function revisar(
  acesso: string,
  turmaId: string,
  cartoes: readonly string[],
  avaliacao: 'errei' | 'dificil' | 'bom' | 'facil',
) {
  return app.inject({
    method: 'POST',
    url: '/estudo/revisoes',
    headers: comToken(acesso),
    payload: {
      turmaId,
      loteId: randomUUID(),
      revisoes: cartoes.map((cartaoId) => ({ cartaoId, avaliacao, dia: hoje() })),
    },
  });
}

async function pontuacaoDe(acesso: string, turmaId: string) {
  const resposta = await app.inject({
    method: 'GET',
    url: `/pontuacao?turmaId=${turmaId}&dia=${hoje()}`,
    headers: comToken(acesso),
  });

  return resposta.json();
}

describe('crédito de XP', () => {
  it('acertar carta vencida rende pontos', async () => {
    const { acesso, turmaId, cartoes } = await cenario(3);

    await revisar(acesso, turmaId, cartoes, 'bom');

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBeGreaterThan(0);
  });

  it('errar não rende nem desconta', async () => {
    const { acesso, turmaId, cartoes } = await cenario(3);

    await revisar(acesso, turmaId, cartoes, 'errei');

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBe(0);
  });

  it('marcar tudo como fácil não passa do teto diário', async () => {
    /**
     * É o teste que define a regra do produto.
     *
     * Sem o teto, quem marca "fácil" em trinta cartas lidera o ranking sem ter
     * estudado — e aprende o comportamento que destrói o próprio agendamento,
     * porque marcar fácil no que não se sabe manda a carta para daqui a meses.
     */
    const { acesso, turmaId, cartoes } = await cenario(30);

    await revisar(acesso, turmaId, cartoes, 'facil');

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBe(TETO_DIARIO_DE_XP);
  });

  it('o teto vale para o dia inteiro, e não por lote', async () => {
    // Enviar em três lotes seria a forma óbvia de contornar o limite.
    const { acesso, turmaId, cartoes } = await cenario(30);

    await revisar(acesso, turmaId, cartoes.slice(0, 10), 'bom');
    await revisar(acesso, turmaId, cartoes.slice(10, 20), 'bom');
    await revisar(acesso, turmaId, cartoes.slice(20, 30), 'bom');

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBe(TETO_DIARIO_DE_XP);
  });

  it('reenviar o mesmo lote não credita de novo', async () => {
    const { acesso, turmaId, cartoes } = await cenario(3);
    const loteId = randomUUID();

    const corpo = {
      turmaId,
      loteId,
      revisoes: cartoes.map((cartaoId) => ({ cartaoId, avaliacao: 'bom', dia: hoje() })),
    };

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: corpo,
    });
    const antes = (await pontuacaoDe(acesso, turmaId)).xpHoje;

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: corpo,
    });

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBe(antes);
  });

  it('o XP é calculado no servidor, e não aceito do cliente', async () => {
    // Mandar `xp` no corpo não pode ter efeito nenhum.
    const { acesso, turmaId, cartoes } = await cenario(2);

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        xp: 999_999,
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    expect((await pontuacaoDe(acesso, turmaId)).xpHoje).toBeLessThan(100);
  });
});

describe('ofensiva e nível', () => {
  it('estudar hoje começa a ofensiva', async () => {
    const { acesso, turmaId, cartoes } = await cenario(2);

    await revisar(acesso, turmaId, cartoes, 'bom');

    const resumo = await pontuacaoDe(acesso, turmaId);
    expect(resumo.ofensiva.dias).toBe(1);
    expect(resumo.ofensiva.emRisco).toBe(false);
  });

  it('quem nunca estudou começa no nível 1 sem ofensiva', async () => {
    const { acesso, turmaId } = await cenario(2);

    const resumo = await pontuacaoDe(acesso, turmaId);
    expect(resumo.nivel).toBe(1);
    expect(resumo.ofensiva.dias).toBe(0);
  });
});

describe('ranking', () => {
  it('lista a turma ordenada pelo XP da semana', async () => {
    const { acesso, turmaId, cartoes } = await cenario(3);
    await revisar(acesso, turmaId, cartoes, 'bom');

    const resposta = await app.inject({
      method: 'GET',
      url: `/pontuacao/ranking?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(acesso),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ranking[0].xpNaSemana).toBeGreaterThan(0);
  });

  it('aluno não vê o ranking de turma alheia', async () => {
    const meu = await cenario(2);
    const alheio = await cenario(2);

    const resposta = await app.inject({
      method: 'GET',
      url: `/pontuacao/ranking?turmaId=${alheio.turmaId}&dia=${hoje()}`,
      headers: comToken(meu.acesso),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('aluno não vê a pontuação de turma alheia', async () => {
    const meu = await cenario(2);
    const alheio = await cenario(2);

    const resposta = await app.inject({
      method: 'GET',
      url: `/pontuacao?turmaId=${alheio.turmaId}&dia=${hoje()}`,
      headers: comToken(meu.acesso),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('professor não acessa a área de pontuação do aluno', async () => {
    const { turmaId } = await cenario(2);
    const professor = await criarUsuario(sql, { papel: 'professor' });
    const { corpo } = await entrar(app, { ...professor, senha: SENHA_PADRAO }, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: `/pontuacao?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(corpo.acesso),
    });

    expect(resposta.statusCode).toBe(403);
  });
});
