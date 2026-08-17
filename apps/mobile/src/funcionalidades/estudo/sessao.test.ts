import { describe, expect, it } from 'vitest';
import { agendamentoNovo, agendar, diaDeEstudo } from '@cadencia/dominio';
import { paraEstudar, type CartaParaEstudar } from './conversao';
import {
  avaliar,
  cartaAtual,
  iniciarSessao,
  loteParaEnvio,
  progresso,
  quandoVolta,
  resumir,
  revelar,
  terminou,
} from './sessao';

const HOJE = diaDeEstudo('2026-08-16');

function carta(id: string): CartaParaEstudar {
  return {
    cartao: { id, frente: `frente ${id}`, verso: `verso ${id}`, dica: null },
    agendamento: agendamentoNovo(HOJE),
  };
}

const CARTAS = [carta('a'), carta('b'), carta('c')];

describe('andamento da sessão', () => {
  it('começa na primeira carta, sem revelar', () => {
    const estado = iniciarSessao(CARTAS, HOJE);

    expect(cartaAtual(estado)?.cartao.id).toBe('a');
    expect(estado.revelada).toBe(false);
    expect(terminou(estado)).toBe(false);
  });

  it('revelar mostra o verso', () => {
    expect(revelar(iniciarSessao(CARTAS, HOJE)).revelada).toBe(true);
  });

  it('avaliar avança e esconde o verso da próxima', () => {
    const estado = avaliar(revelar(iniciarSessao(CARTAS, HOJE)), 'bom');

    expect(cartaAtual(estado)?.cartao.id).toBe('b');
    expect(estado.revelada).toBe(false);
  });

  it('não avalia sem ter revelado', () => {
    // Sem ver a resposta o aluno não sabe se acertou, e o agendamento sairia de
    // um palpite.
    const inicial = iniciarSessao(CARTAS, HOJE);

    expect(avaliar(inicial, 'facil')).toBe(inicial);
  });

  it('termina depois da última carta', () => {
    let estado = iniciarSessao(CARTAS, HOJE);

    for (let i = 0; i < 3; i += 1) estado = avaliar(revelar(estado), 'bom');

    expect(terminou(estado)).toBe(true);
    expect(cartaAtual(estado)).toBeNull();
  });

  it('avaliar depois do fim não muda nada', () => {
    let estado = iniciarSessao(CARTAS, HOJE);
    for (let i = 0; i < 3; i += 1) estado = avaliar(revelar(estado), 'bom');

    expect(avaliar(revelar(estado), 'bom')).toBe(estado);
  });

  it('sessão vazia já nasce terminada', () => {
    expect(terminou(iniciarSessao([], HOJE))).toBe(true);
  });

  it('não altera o estado recebido', () => {
    const inicial = iniciarSessao(CARTAS, HOJE);
    const copia = { ...inicial, revisoes: [...inicial.revisoes] };

    avaliar(revelar(inicial), 'bom');

    expect(inicial).toEqual(copia);
  });
});

describe('cálculo local do agendamento', () => {
  it('produz exatamente o mesmo resultado do domínio', () => {
    /**
     * A garantia central do projeto.
     *
     * O app calcula para responder na hora; o servidor recalcula e manda. Como
     * os dois chamam o mesmo módulo, não há como divergirem — e este teste
     * falha se alguém reimplementar a regra "só no app, para ser mais rápido".
     */
    const estado = avaliar(revelar(iniciarSessao(CARTAS, HOJE)), 'bom');
    const esperado = agendar(CARTAS[0]!.agendamento, 'bom', HOJE);

    expect(estado.revisoes[0]?.agendamento).toEqual(esperado);
  });

  it('acompanha uma sequência de avaliações diferentes', () => {
    let estado = iniciarSessao(CARTAS, HOJE);

    estado = avaliar(revelar(estado), 'errei');
    estado = avaliar(revelar(estado), 'bom');
    estado = avaliar(revelar(estado), 'facil');

    expect(estado.revisoes.map((revisao) => revisao.avaliacao)).toEqual([
      'errei',
      'bom',
      'facil',
    ]);
    expect(estado.revisoes[0]?.agendamento.lapsos).toBe(1);
  });
});

describe('progresso', () => {
  it('conta o que já foi feito', () => {
    let estado = iniciarSessao(CARTAS, HOJE);
    estado = avaliar(revelar(estado), 'bom');

    expect(progresso(estado)).toEqual({
      feitas: 1,
      total: 3,
      restantes: 2,
      fracao: 1 / 3,
    });
  });

  it('sessão vazia mostra completa, e não dividida por zero', () => {
    expect(progresso(iniciarSessao([], HOJE)).fracao).toBe(1);
  });
});

describe('resumo', () => {
  it('separa acertos de erros', () => {
    let estado = iniciarSessao(CARTAS, HOJE);
    estado = avaliar(revelar(estado), 'bom');
    estado = avaliar(revelar(estado), 'errei');
    estado = avaliar(revelar(estado), 'facil');

    expect(resumir(estado)).toEqual({
      total: 3,
      acertos: 2,
      erros: 1,
      // Carta errada volta amanhã; primeiro acerto também tem intervalo de 1.
      voltamAmanha: 3,
    });
  });
});

describe('como a tela anuncia o retorno', () => {
  it('traduz o intervalo para linguagem de gente', () => {
    // "volta em 1 dia" faz a pessoa fazer a conta que o app podia ter feito.
    const com = (dias: number) =>
      quandoVolta({ ...agendamentoNovo(HOJE), intervaloDias: dias });

    expect(com(0)).toBe('amanhã');
    expect(com(1)).toBe('amanhã');
    expect(com(3)).toBe('em 3 dias');
    expect(com(7)).toBe('em 1 semana');
    expect(com(21)).toBe('em 3 semanas');
    expect(com(30)).toBe('em 1 mês');
    expect(com(120)).toBe('em 4 meses');
  });
});

describe('lote para envio', () => {
  it('manda o que o aluno respondeu, e não o agendamento calculado', () => {
    // Enviar o agendamento deixaria o cliente escolher os próprios intervalos —
    // e um app modificado marcaria tudo como sabido para sempre.
    let estado = iniciarSessao(CARTAS, HOJE);
    estado = avaliar(revelar(estado), 'bom');

    expect(loteParaEnvio(estado)).toEqual([{ cartaoId: 'a', avaliacao: 'bom', dia: HOJE }]);
    expect(JSON.stringify(loteParaEnvio(estado))).not.toContain('facilidade');
  });

  it('preserva a ordem em que as cartas foram avaliadas', () => {
    let estado = iniciarSessao(CARTAS, HOJE);
    estado = avaliar(revelar(estado), 'bom');
    estado = avaliar(revelar(estado), 'errei');

    expect(loteParaEnvio(estado).map((revisao) => revisao.cartaoId)).toEqual(['a', 'b']);
  });
});

describe('conversão do que vem da rede', () => {
  it('valida e marca a data vinda do servidor', () => {
    const carta = paraEstudar({
      cartao: { id: 'x', frente: 'f', verso: 'v', dica: null },
      agendamento: {
        intervaloDias: 3,
        facilidade: 2.5,
        repeticoes: 1,
        lapsos: 0,
        venceEm: '2026-08-20',
        sinalizado: false,
      },
    });

    expect(carta.agendamento.venceEm).toBe('2026-08-20');
  });

  it('data impossível do servidor estoura na porta de entrada', () => {
    // Melhor aqui, com a mensagem clara, do que três telas adiante num cálculo
    // que dá resultado estranho sem dizer por quê.
    expect(() =>
      paraEstudar({
        cartao: { id: 'x', frente: 'f', verso: 'v', dica: null },
        agendamento: {
          intervaloDias: 3,
          facilidade: 2.5,
          repeticoes: 1,
          lapsos: 0,
          venceEm: '2026-02-31',
          sinalizado: false,
        },
      }),
    ).toThrow(RangeError);
  });
});
