import { describe, expect, it } from 'vitest';
import { diaDeEstudoSchema, fusoSchema } from './comuns';
import { revisaoSchema, usuarioSchema } from './modelos';
import {
  entrarEntradaSchema,
  enviarRevisoesEntradaSchema,
  erroSchema,
  sessaoEntradaSchema,
} from './rotas';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OUTRO_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * O contrato é a primeira linha de defesa da API.
 *
 * Cada teste aqui descreve algo que **não pode** chegar ao banco. É mais barato
 * recusar uma entrada malformada do que descobrir meses depois um fuso escrito
 * errado no cadastro de um aluno.
 */

describe('dia de estudo', () => {
  it('aceita data válida', () => {
    expect(diaDeEstudoSchema.safeParse('2026-08-16').success).toBe(true);
  });

  it('recusa formato brasileiro, que é o erro mais provável', () => {
    expect(diaDeEstudoSchema.safeParse('16/08/2026').success).toBe(false);
  });

  it('recusa data que existe no formato mas não no calendário', () => {
    // O regex sozinho deixaria passar. É por isso que existe o refine.
    expect(diaDeEstudoSchema.safeParse('2026-02-31').success).toBe(false);
    expect(diaDeEstudoSchema.safeParse('2026-13-01').success).toBe(false);
  });

  it('recusa data com instante junto', () => {
    // Dia de estudo é data de negócio. Aceitar instante aqui reabriria toda a
    // confusão de fuso que o formato existe para evitar.
    expect(diaDeEstudoSchema.safeParse('2026-08-16T10:00:00Z').success).toBe(false);
  });
});

describe('fuso horário', () => {
  it('aceita identificador IANA de verdade', () => {
    expect(fusoSchema.safeParse('America/Sao_Paulo').success).toBe(true);
    expect(fusoSchema.safeParse('Europe/Lisbon').success).toBe(true);
  });

  it('recusa nome inventado', () => {
    // "Brasilia" gravado no cadastro só quebraria meses depois, no primeiro
    // cálculo de dia de estudo daquele aluno.
    expect(fusoSchema.safeParse('Brasilia').success).toBe(false);
    expect(fusoSchema.safeParse('GMT-3').success).toBe(false);
    expect(fusoSchema.safeParse('').success).toBe(false);
  });
});

describe('entrar', () => {
  it('aceita credenciais bem formadas', () => {
    const resultado = entrarEntradaSchema.safeParse({
      email: 'aluna@escola.com.br',
      senha: 'senha-bem-grande',
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa e-mail inválido', () => {
    expect(
      entrarEntradaSchema.safeParse({ email: 'aluna', senha: 'senha-bem-grande' }).success,
    ).toBe(false);
  });

  it('recusa senha curta antes de chegar ao banco', () => {
    const resultado = entrarEntradaSchema.safeParse({
      email: 'aluna@escola.com.br',
      senha: 'curta',
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain('8 caracteres');
  });
});

describe('usuário', () => {
  const valido = {
    id: UUID,
    nome: 'Ana Beatriz',
    email: 'ana@escola.com.br',
    papel: 'aluno',
    fuso: 'America/Sao_Paulo',
  };

  it('aceita usuário completo', () => {
    expect(usuarioSchema.safeParse(valido).success).toBe(true);
  });

  it('recusa papel fora dos dois existentes', () => {
    // "admin" chegando aqui viraria um papel que nenhuma rota sabe autorizar.
    expect(usuarioSchema.safeParse({ ...valido, papel: 'admin' }).success).toBe(false);
  });

  it('recusa id que não é uuid', () => {
    expect(usuarioSchema.safeParse({ ...valido, id: '42' }).success).toBe(false);
  });

  it('remove campo desconhecido em vez de repassá-lo', () => {
    // Um `senhaHash` vindo do banco não pode vazar para a resposta só porque
    // alguém esqueceu de removê-lo no mapeamento.
    const resultado = usuarioSchema.parse({ ...valido, senhaHash: 'segredo' });

    expect(resultado).not.toHaveProperty('senhaHash');
  });
});

describe('sessão de estudo', () => {
  it('aceita pedido mínimo', () => {
    expect(
      sessaoEntradaSchema.safeParse({ turmaId: UUID, dia: '2026-08-16' }).success,
    ).toBe(true);
  });

  it('converte o limite que chega como texto na query', () => {
    // `?limite=10` chega como string. Sem o coerce, a API receberia texto onde
    // espera número e o erro apareceria só no `slice`.
    const resultado = sessaoEntradaSchema.parse({
      turmaId: UUID,
      dia: '2026-08-16',
      limite: '10',
    });

    expect(resultado.limite).toBe(10);
  });

  it('recusa limite absurdo', () => {
    expect(
      sessaoEntradaSchema.safeParse({ turmaId: UUID, dia: '2026-08-16', limite: 5000 })
        .success,
    ).toBe(false);
  });
});

describe('envio de revisões', () => {
  const revisao = { cartaoId: UUID, avaliacao: 'bom', dia: '2026-08-16' };

  it('aceita um lote válido', () => {
    const resultado = enviarRevisoesEntradaSchema.safeParse({
      turmaId: UUID,
      loteId: OUTRO_UUID,
      revisoes: [revisao],
    });

    expect(resultado.success).toBe(true);
  });

  it('exige o identificador do lote', () => {
    // É ele que torna o reenvio seguro quando a resposta se perde na volta.
    const resultado = enviarRevisoesEntradaSchema.safeParse({
      turmaId: UUID,
      revisoes: [revisao],
    });

    expect(resultado.success).toBe(false);
  });

  it('recusa lote vazio', () => {
    expect(
      enviarRevisoesEntradaSchema.safeParse({
        turmaId: UUID,
        loteId: OUTRO_UUID,
        revisoes: [],
      }).success,
    ).toBe(false);
  });

  it('recusa lote grande demais', () => {
    const enorme = Array.from({ length: 300 }, () => revisao);

    expect(
      enviarRevisoesEntradaSchema.safeParse({
        turmaId: UUID,
        loteId: OUTRO_UUID,
        revisoes: enorme,
      }).success,
    ).toBe(false);
  });

  it('recusa avaliação que não existe', () => {
    expect(
      enviarRevisoesEntradaSchema.safeParse({
        turmaId: UUID,
        loteId: OUTRO_UUID,
        revisoes: [{ ...revisao, avaliacao: 'mais_ou_menos' }],
      }).success,
    ).toBe(false);
  });

  it('recusa o lote inteiro quando uma revisão está malformada', () => {
    // Meio lote aceito seria pior que nenhum: o app não teria como saber o que
    // reenviar, e o histórico ficaria com buraco.
    const resultado = enviarRevisoesEntradaSchema.safeParse({
      turmaId: UUID,
      loteId: OUTRO_UUID,
      revisoes: [revisao, { ...revisao, dia: 'ontem' }],
    });

    expect(resultado.success).toBe(false);
  });
});

describe('revisão', () => {
  it('exige o dia, que vem do app e não do servidor', () => {
    const resultado = revisaoSchema.safeParse({ cartaoId: UUID, avaliacao: 'bom' });
    expect(resultado.success).toBe(false);
  });
});

describe('erro', () => {
  it('carrega código e mensagem', () => {
    const resultado = erroSchema.safeParse({
      codigo: 'sem_permissao',
      mensagem: 'Esta turma não é sua.',
    });

    expect(resultado.success).toBe(true);
  });

  it('detalha os campos quando a entrada é inválida', () => {
    // O cliente precisa saber QUAL campo recusar na tela, não só que houve erro.
    const resultado = erroSchema.safeParse({
      codigo: 'entrada_invalida',
      mensagem: 'Confira os campos.',
      campos: [{ campo: 'email', motivo: 'E-mail inválido.' }],
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa código de erro inventado', () => {
    // Cada código precisa ter tratamento no cliente. Um código novo que
    // ninguém trata vira tela branca.
    expect(erroSchema.safeParse({ codigo: 'deu_ruim', mensagem: 'x' }).success).toBe(false);
  });
});
