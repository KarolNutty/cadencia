import { describe, expect, it } from 'vitest';
import {
  diaDeEstudo,
  diaDeEstudoDe,
  diasEntre,
  ehAnteriorOuIgual,
  ehDiaDeEstudo,
  somarDias,
} from './dia-de-estudo';

/** Ajuda a escrever o instante sem confundir hora local com UTC. */
function emUTC(texto: string): Date {
  return new Date(`${texto}Z`);
}

const SAO_PAULO = 'America/Sao_Paulo';
const LISBOA = 'Europe/Lisbon';
const TOQUIO = 'Asia/Tokyo';

describe('validação', () => {
  it('aceita data no formato correto', () => {
    expect(ehDiaDeEstudo('2026-08-16')).toBe(true);
  });

  it('recusa formato errado', () => {
    expect(ehDiaDeEstudo('16/08/2026')).toBe(false);
    expect(ehDiaDeEstudo('2026-8-16')).toBe(false);
    expect(ehDiaDeEstudo('')).toBe(false);
  });

  it('recusa data que passa no formato mas não existe no calendário', () => {
    // O regex aceitaria; o calendário não tem 31 de fevereiro.
    expect(ehDiaDeEstudo('2026-02-31')).toBe(false);
    expect(ehDiaDeEstudo('2026-13-01')).toBe(false);
  });

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(ehDiaDeEstudo('2028-02-29')).toBe(true);
    expect(ehDiaDeEstudo('2026-02-29')).toBe(false);
  });

  it('lança ao construir com valor inválido', () => {
    expect(() => diaDeEstudo('ontem')).toThrow(RangeError);
  });
});

describe('a que dia de estudo um instante pertence', () => {
  it('meio da tarde é o próprio dia', () => {
    expect(diaDeEstudoDe(emUTC('2026-08-16T18:00:00'), SAO_PAULO)).toBe('2026-08-16');
  });

  it('uma da manhã ainda é o dia anterior', () => {
    // Quem senta para estudar à 1h não terminou o dia dele. Se o corte fosse à
    // meia-noite, esse aluno perderia a sequência por estar estudando.
    expect(diaDeEstudoDe(emUTC('2026-08-17T04:30:00'), SAO_PAULO)).toBe('2026-08-16');
  });

  it('às 4h em ponto já é o dia novo', () => {
    expect(diaDeEstudoDe(emUTC('2026-08-17T07:00:00'), SAO_PAULO)).toBe('2026-08-17');
  });

  it('às 3h59 ainda é o dia anterior', () => {
    expect(diaDeEstudoDe(emUTC('2026-08-17T06:59:00'), SAO_PAULO)).toBe('2026-08-16');
  });

  it('a virada acontece na hora local de cada aluno, não em UTC', () => {
    // O mesmo instante: 05:00 UTC.
    const instante = emUTC('2026-08-17T05:00:00');

    // São Paulo: 02:00 — antes da virada, ainda é dia 16.
    expect(diaDeEstudoDe(instante, SAO_PAULO)).toBe('2026-08-16');
    // Lisboa: 06:00 — depois da virada, já é dia 17.
    expect(diaDeEstudoDe(instante, LISBOA)).toBe('2026-08-17');
    // Tóquio: 14:00 — dia 17 há horas.
    expect(diaDeEstudoDe(instante, TOQUIO)).toBe('2026-08-17');
  });

  it('atravessa a virada do mês', () => {
    expect(diaDeEstudoDe(emUTC('2026-09-01T04:00:00'), SAO_PAULO)).toBe('2026-08-31');
  });

  it('atravessa a virada do ano', () => {
    expect(diaDeEstudoDe(emUTC('2027-01-01T05:00:00'), SAO_PAULO)).toBe('2026-12-31');
  });

  it('usa a tabela de fusos do sistema, e não uma conta de deslocamento fixo', () => {
    // Lisboa muda de +00 para +01 no horário de verão. Uma conta fixa erraria
    // um dos dois casos; o mesmo instante de calendário precisa dar o mesmo dia.
    expect(diaDeEstudoDe(emUTC('2026-01-15T12:00:00'), LISBOA)).toBe('2026-01-15');
    expect(diaDeEstudoDe(emUTC('2026-07-15T12:00:00'), LISBOA)).toBe('2026-07-15');
  });
});

describe('aritmética de dias', () => {
  it('soma dias', () => {
    expect(somarDias(diaDeEstudo('2026-08-16'), 3)).toBe('2026-08-19');
  });

  it('soma atravessando o mês', () => {
    expect(somarDias(diaDeEstudo('2026-08-30'), 5)).toBe('2026-09-04');
  });

  it('soma atravessando o ano', () => {
    expect(somarDias(diaDeEstudo('2026-12-30'), 3)).toBe('2027-01-02');
  });

  it('lida com fevereiro em ano bissexto', () => {
    expect(somarDias(diaDeEstudo('2028-02-28'), 1)).toBe('2028-02-29');
    expect(somarDias(diaDeEstudo('2026-02-28'), 1)).toBe('2026-03-01');
  });

  it('soma zero devolve o mesmo dia', () => {
    expect(somarDias(diaDeEstudo('2026-08-16'), 0)).toBe('2026-08-16');
  });

  it('conta a distância entre dois dias', () => {
    expect(diasEntre(diaDeEstudo('2026-08-16'), diaDeEstudo('2026-08-19'))).toBe(3);
    expect(diasEntre(diaDeEstudo('2026-08-19'), diaDeEstudo('2026-08-16'))).toBe(-3);
  });

  it('a distância ignora horário de verão', () => {
    // Em outubro o Brasil já teve mudança de horário. Como o dia de estudo é
    // data de calendário, e não instante, isso não afeta a conta.
    expect(diasEntre(diaDeEstudo('2026-10-14'), diaDeEstudo('2026-10-21'))).toBe(7);
  });
});

describe('comparação', () => {
  it('compara dias como texto, porque o formato é ordenável', () => {
    expect(ehAnteriorOuIgual(diaDeEstudo('2026-08-09'), diaDeEstudo('2026-08-10'))).toBe(
      true,
    );
    expect(ehAnteriorOuIgual(diaDeEstudo('2026-08-10'), diaDeEstudo('2026-08-10'))).toBe(
      true,
    );
    expect(ehAnteriorOuIgual(diaDeEstudo('2026-08-11'), diaDeEstudo('2026-08-10'))).toBe(
      false,
    );
  });

  it('ordena certo mesmo com meses de um dígito', () => {
    // O zero à esquerda existe para isto: sem ele, "2026-9-01" viria depois de
    // "2026-10-01" na ordenação de texto.
    const dias = ['2026-10-01', '2026-09-30', '2026-09-02'].sort();
    expect(dias).toEqual(['2026-09-02', '2026-09-30', '2026-10-01']);
  });
});
