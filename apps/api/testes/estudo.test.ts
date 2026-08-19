import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Banco } from '../src/infra/banco';
import {
  SENHA_PADRAO as SENHA_DE_TESTE,
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

/**
 * O dia de estudo do aluno, como o **app** o calcularia.
 *
 * Antes isto era `new Date().toISOString().slice(0, 10)`, o dia em UTC, cru.
 * Parece equivalente e não é: quem roda o teste às onze da noite no Brasil já
 * está no dia seguinte em UTC, e a regra das 4h joga esse dia de volta. O teste
 * passava de manhã e falhava à noite.
 *
 * O cliente é quem informa o dia, no fuso dele. O teste faz igual.
 */
function hoje(): string {
  return diaDeEstudoDe(new Date(), FUSO_DO_ALUNO);
}

/** O mesmo padrão de `criarUsuario`. */
const FUSO_DO_ALUNO = 'America/Sao_Paulo';

interface Cenario {
  aluno: UsuarioDeTeste;
  acesso: string;
  turmaId: string;
  cartoes: string[];
}

async function montarCenario(quantidadeDeCartas = 3): Promise<Cenario> {
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

  const turmaId = turma!.id;

  await sql`INSERT INTO matriculas ${sql({ turma_id: turmaId, aluno_id: aluno.id })}`;

  const [baralho] = await sql<{ id: string }[]>`
    INSERT INTO baralhos ${sql({ turma_id: turmaId, titulo: 'Verbos' })}
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

  const { corpo } = await entrar(app, aluno, 'mobile');

  return { aluno, acesso: corpo.acesso, turmaId, cartoes };
}

function comToken(acesso: string) {
  return { authorization: `Bearer ${acesso}` };
}

describe('minhas turmas', () => {
  it('devolve a turma em que o aluno está matriculado', async () => {
    const { acesso } = await montarCenario(1);

    const resposta = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(acesso),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().turmas).toHaveLength(1);
    expect(resposta.json().turmas[0].nome).toBe('Inglês A1');
  });

  it('não devolve turma de outro aluno', async () => {
    // A rota não aceita id de usuário: ela usa o do token. Não oferecer o
    // parâmetro é mais forte do que oferecê-lo e conferir depois.
    await montarCenario(1);
    const forasteiro = await criarUsuario(sql, { papel: 'aluno' });
    const { corpo } = await entrar(app, forasteiro, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(corpo.acesso),
    });

    expect(resposta.json().turmas).toEqual([]);
  });

  it('professor recebe as turmas que leciona', async () => {
    const professor = await criarUsuario(sql, { papel: 'professor' });

    await sql`
      INSERT INTO turmas ${sql({
        nome: 'Espanhol B1',
        idioma: 'espanhol',
        professor_id: professor.id,
      })}
    `;

    const { corpo } = await entrar(app, professor, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: '/turmas',
      headers: comToken(corpo.acesso),
    });

    expect(resposta.json().turmas[0].nome).toBe('Espanhol B1');
  });

  it('exige autenticação', async () => {
    expect((await app.inject({ method: 'GET', url: '/turmas' })).statusCode).toBe(401);
  });
});

describe('sessão do dia', () => {
  it('traz as cartas novas, todas vencendo hoje', async () => {
    const { acesso, turmaId } = await montarCenario(3);

    const resposta = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(acesso),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cartas).toHaveLength(3);
    expect(resposta.json().resumo.vencendoHoje).toBe(3);
  });

  it('respeita o limite pedido', async () => {
    const { acesso, turmaId } = await montarCenario(5);

    const resposta = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}&limite=2`,
      headers: comToken(acesso),
    });

    expect(resposta.json().cartas).toHaveLength(2);
  });

  it('exige autenticação', async () => {
    const { turmaId } = await montarCenario(1);

    const resposta = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}`,
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('professor não acessa a área do aluno', async () => {
    const { turmaId } = await montarCenario(1);
    const professor = await criarUsuario(sql, { papel: 'professor' });
    const { corpo } = await entrar(app, professor, 'mobile');

    const resposta = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(corpo.acesso),
    });

    // 403 aqui não revela nada sobre um recurso: é o próprio perfil que não
    // permite a ação.
    expect(resposta.statusCode).toBe(403);
  });
});

describe('acesso a recurso alheio', () => {
  /**
   * O furo mais comum em sistema real: trocar o id na URL.
   *
   * Não exige ferramenta nenhuma, e o endpoint "funciona", por isso não
   * aparece em revisão apressada nem em teste de rota feliz.
   */

  it('aluno não lê a sessão de outra turma', async () => {
    const cenarioA = await montarCenario(2);
    const cenarioB = await montarCenario(2);

    const resposta = await app.inject({
      method: 'GET',
      // Token do aluno A, id da turma do aluno B.
      url: `/estudo/sessao?turmaId=${cenarioB.turmaId}&dia=${hoje()}`,
      headers: comToken(cenarioA.acesso),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('responde 404 e não 403, para não confirmar que a turma existe', async () => {
    const cenario = await montarCenario(1);

    const daTurmaAlheia = await montarCenario(1);
    const inexistente = randomUUID();

    const alheia = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${daTurmaAlheia.turmaId}&dia=${hoje()}`,
      headers: comToken(cenario.acesso),
    });

    const naoExiste = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${inexistente}&dia=${hoje()}`,
      headers: comToken(cenario.acesso),
    });

    // As duas respostas precisam ser indistinguíveis. Se diferissem, dava para
    // varrer ids e mapear quais turmas existem.
    expect(alheia.statusCode).toBe(404);
    expect(naoExiste.statusCode).toBe(404);
    expect(alheia.json()).toEqual(naoExiste.json());
  });

  it('aluno não grava revisão em turma alheia', async () => {
    const cenarioA = await montarCenario(1);
    const cenarioB = await montarCenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(cenarioA.acesso),
      payload: {
        turmaId: cenarioB.turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cenarioB.cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('carta de outra turma dentro do lote derruba o lote inteiro', async () => {
    // Um lote meio aceito seria pior: o aluno teria progresso parcial e o app
    // não saberia o que reenviar.
    const cenario = await montarCenario(2);
    const outro = await montarCenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(cenario.acesso),
      payload: {
        turmaId: cenario.turmaId,
        loteId: randomUUID(),
        revisoes: [
          { cartaoId: cenario.cartoes[0], avaliacao: 'bom', dia: hoje() },
          { cartaoId: outro.cartoes[0], avaliacao: 'bom', dia: hoje() },
        ],
      },
    });

    expect(resposta.statusCode).toBe(404);

    const gravadas = await sql`SELECT 1 FROM revisoes`;
    expect(gravadas).toHaveLength(0);
  });
});

describe('painel do professor', () => {
  async function cenarioComProfessor() {
    const cenario = await montarCenario(3);

    const [dono] = await sql<{ professor_id: string }[]>`
      SELECT professor_id FROM turmas WHERE id = ${cenario.turmaId}
    `;

    const [linha] = await sql<{ email: string }[]>`
      SELECT email FROM usuarios WHERE id = ${dono!.professor_id}
    `;

    const { corpo } = await entrar(
      app,
      { email: linha!.email, senha: SENHA_DE_TESTE },
      'mobile',
    );

    return { ...cenario, professorAcesso: corpo.acesso };
  }

  it('lista os alunos da turma com o andamento', async () => {
    const { professorAcesso, turmaId, aluno } = await cenarioComProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/alunos`,
      headers: comToken(professorAcesso),
    });

    expect(resposta.statusCode).toBe(200);

    const [primeiro] = resposta.json().alunos;
    expect(primeiro.usuario.id).toBe(aluno.id);
    expect(primeiro.vencendoHoje).toBe(0);
    expect(primeiro.ultimoEstudo).toBeNull();
  });

  it('usa o fuso de cada aluno, e não o do servidor', async () => {
    const { professorAcesso, acesso, turmaId, cartoes } = await cenarioComProfessor();

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/alunos`,
      headers: comToken(professorAcesso),
    });

    const [primeiro] = resposta.json().alunos;
    expect(primeiro.ultimoEstudo).toBe(hoje());
    expect(primeiro.sequenciaDeDias).toBe(1);
  });

  it('professor não vê turma de outro professor', async () => {
    const meu = await cenarioComProfessor();
    const alheio = await cenarioComProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${alheio.turmaId}/alunos`,
      headers: comToken(meu.professorAcesso),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('aluno não acessa a área do professor', async () => {
    const { acesso, turmaId } = await cenarioComProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/alunos`,
      headers: comToken(acesso),
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('agrupa as palavras travadas da turma, com quem travou em cada uma', async () => {
    // A pergunta do professor é "o que eu ensino na aula", e não "como vai cada
    // um". Agrupar por palavra é o que responde isso.
    const { professorAcesso, acesso, turmaId, cartoes } = await cenarioComProfessor();

    for (let i = 0; i < 4; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/estudo/revisoes',
        headers: comToken(acesso),
        payload: {
          turmaId,
          loteId: randomUUID(),
          revisoes: [{ cartaoId: cartoes[0], avaliacao: 'errei', dia: hoje() }],
        },
      });
    }

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/palavras-travadas`,
      headers: comToken(professorAcesso),
    });

    expect(resposta.statusCode).toBe(200);

    const [primeira] = resposta.json().palavras;
    expect(primeira.cartao.frente).toBe('palavra 0');
    expect(primeira.alunos).toBe(1);
    expect(primeira.errosTotais).toBe(4);
    expect(primeira.nomes).toEqual(['Ana Beatriz']);
  });

  it('professor não vê as palavras de turma alheia', async () => {
    const meu = await cenarioComProfessor();
    const alheio = await cenarioComProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${alheio.turmaId}/palavras-travadas`,
      headers: comToken(meu.professorAcesso),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('mostra as cartas sinalizadas de um aluno', async () => {
    const { professorAcesso, acesso, turmaId, cartoes, aluno } =
      await cenarioComProfessor();

    // Quatro erros na mesma carta: a partir daí ela vira assunto de aula.
    for (let i = 0; i < 4; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/estudo/revisoes',
        headers: comToken(acesso),
        payload: {
          turmaId,
          loteId: randomUUID(),
          revisoes: [{ cartaoId: cartoes[0], avaliacao: 'errei', dia: hoje() }],
        },
      });
    }

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${turmaId}/alunos/${aluno.id}/sinalizadas`,
      headers: comToken(professorAcesso),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cartas).toHaveLength(1);
    expect(resposta.json().cartas[0].lapsos).toBe(4);
  });

  it('aluno de outra turma responde 404, e não lista vazia', async () => {
    // Lista vazia diria "este aluno existe e não tem nada sinalizado".
    const meu = await cenarioComProfessor();
    const alheio = await cenarioComProfessor();

    const resposta = await app.inject({
      method: 'GET',
      url: `/turmas/${meu.turmaId}/alunos/${alheio.aluno.id}/sinalizadas`,
      headers: comToken(meu.professorAcesso),
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('registrar revisões', () => {
  it('agenda a carta e devolve o novo estado', async () => {
    const { acesso, turmaId, cartoes } = await montarCenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    expect(resposta.statusCode).toBe(200);

    const [agendado] = resposta.json().agendamentos;
    expect(agendado.agendamento.intervaloDias).toBe(1);
    expect(agendado.agendamento.repeticoes).toBe(1);
  });

  it('a carta sai da sessão depois de acertada', async () => {
    const { acesso, turmaId, cartoes } = await montarCenario(2);

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    const sessao = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(acesso),
    });

    expect(sessao.json().cartas).toHaveLength(1);
    expect(sessao.json().cartas[0].cartao.id).toBe(cartoes[1]);
  });

  it('reenviar o mesmo lote não duplica o histórico', async () => {
    // Se a resposta se perder na volta, o app reenvia. A garantia é do índice
    // único no banco, e não de um "select antes do insert" que perde numa
    // corrida entre duas requisições.
    const { acesso, turmaId, cartoes } = await montarCenario(1);
    const loteId = randomUUID();

    const corpo = {
      turmaId,
      loteId,
      revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
    };

    const primeira = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: corpo,
    });

    const segunda = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: corpo,
    });

    expect(primeira.json().jaProcessado).toBe(false);
    expect(segunda.json().jaProcessado).toBe(true);

    const revisoes = await sql`SELECT 1 FROM revisoes`;
    expect(revisoes).toHaveLength(1);
  });

  it('grava o lote inteiro em ordem cronológica', async () => {
    // O agendamento de cada revisão depende do estado que a anterior deixou.
    const { acesso, turmaId, cartoes } = await montarCenario(1);

    const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [
          { cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() },
          { cartaoId: cartoes[0], avaliacao: 'bom', dia: ontem },
        ],
      },
    });

    // Dois acertos seguidos levam ao segundo degrau, de três dias.
    const [linha] = await sql<{ repeticoes: number; intervalo_dias: number }[]>`
      SELECT repeticoes, intervalo_dias FROM agendamentos
    `;

    expect(linha?.repeticoes).toBe(2);
    expect(linha?.intervalo_dias).toBe(3);
  });

  it('recusa data distante demais', async () => {
    // Confiar sem limite deixaria alguém marcar estudo em 2050 e sumir da
    // lista de pendências para sempre.
    const { acesso, turmaId, cartoes } = await montarCenario(1);

    const resposta = await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: '2050-01-01' }],
      },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('conta a sequência de dias estudados', async () => {
    const { acesso, turmaId, cartoes } = await montarCenario(1);

    await app.inject({
      method: 'POST',
      url: '/estudo/revisoes',
      headers: comToken(acesso),
      payload: {
        turmaId,
        loteId: randomUUID(),
        revisoes: [{ cartaoId: cartoes[0], avaliacao: 'bom', dia: hoje() }],
      },
    });

    const sessao = await app.inject({
      method: 'GET',
      url: `/estudo/sessao?turmaId=${turmaId}&dia=${hoje()}`,
      headers: comToken(acesso),
    });

    expect(sessao.json().sequenciaDeDias).toBe(1);
  });
});
