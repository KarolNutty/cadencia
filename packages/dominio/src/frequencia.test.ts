import { describe, expect, it } from 'vitest';
import {
  TAXA_MINIMA,
  calcularFrequencia,
  chamadaInicial,
  emRiscoPorFalta,
  resumirChamada,
  type Situacao,
} from './frequencia';

describe('cálculo de frequência', () => {
  it('conta cada situação', () => {
    const frequencia = calcularFrequencia([
      'presente',
      'presente',
      'ausente',
      'justificada',
    ]);

    expect(frequencia.presentes).toBe(2);
    expect(frequencia.ausentes).toBe(1);
    expect(frequencia.justificadas).toBe(1);
    expect(frequencia.total).toBe(4);
  });

  it('falta justificada não conta contra a taxa', () => {
    const comJustificada = calcularFrequencia(['presente', 'justificada']);
    expect(comJustificada.taxa).toBe(1);
  });

  it('mas a justificada continua no total', () => {
    /**
     * Tirá-la dos dois lados faria quem faltou justificadamente dez vezes ter a
     * mesma frequência de quem nunca faltou, e a escola perderia de vista o
     * aluno que está sumindo com motivo.
     */
    const frequencia = calcularFrequencia(['presente', 'justificada', 'justificada']);

    expect(frequencia.taxa).toBe(1);
    expect(frequencia.total).toBe(3);
    expect(frequencia.justificadas).toBe(2);
  });

  it('falta sem justificativa derruba a taxa', () => {
    const frequencia = calcularFrequencia(['presente', 'presente', 'ausente', 'ausente']);
    expect(frequencia.taxa).toBe(0.5);
  });

  it('sem aula nenhuma, a taxa é cheia', () => {
    // Ninguém começa devendo.
    expect(calcularFrequencia([]).taxa).toBe(1);
  });

  it('só justificadas não geram divisão por zero', () => {
    expect(calcularFrequencia(['justificada', 'justificada']).taxa).toBe(1);
  });
});

describe('risco por falta', () => {
  it('marca quem passou do limite', () => {
    const muitasFaltas: Situacao[] = [
      'presente',
      'ausente',
      'ausente',
      'ausente',
      'presente',
    ];

    expect(emRiscoPorFalta(calcularFrequencia(muitasFaltas))).toBe(true);
  });

  it('não alarma no começo do curso', () => {
    // A taxa oscila demais nas primeiras aulas, e alarmar cedo faz o professor
    // ignorar o alarme depois.
    expect(emRiscoPorFalta(calcularFrequencia(['ausente']))).toBe(false);
    expect(emRiscoPorFalta(calcularFrequencia(['presente', 'ausente']))).toBe(false);
  });

  it('quem está no limite exato não está em risco', () => {
    const noLimite: Situacao[] = ['presente', 'presente', 'presente', 'ausente'];
    const frequencia = calcularFrequencia(noLimite);

    expect(frequencia.taxa).toBe(TAXA_MINIMA);
    expect(emRiscoPorFalta(frequencia)).toBe(false);
  });
});

describe('chamada', () => {
  it('começa com todos presentes', () => {
    /**
     * O professor marca as exceções. Começar com todos ausentes obrigaria a
     * marcar trinta pessoas numa aula normal, e o esquecimento produziria falta
     * em quem estava lá, que é o erro mais caro dos dois.
     */
    const chamada = chamadaInicial(['a', 'b', 'c']);

    expect(chamada).toHaveLength(3);
    expect(chamada.every((registro) => registro.situacao === 'presente')).toBe(true);
  });

  it('turma vazia gera chamada vazia', () => {
    expect(chamadaInicial([])).toEqual([]);
  });

  it('resume o que foi marcado', () => {
    const resumo = resumirChamada([
      { alunoId: 'a', situacao: 'presente' },
      { alunoId: 'b', situacao: 'ausente' },
      { alunoId: 'c', situacao: 'justificada' },
      { alunoId: 'd', situacao: 'presente' },
    ]);

    expect(resumo).toEqual({ presentes: 2, ausentes: 1, justificadas: 1 });
  });
});
