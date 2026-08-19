import { describe, expect, it } from 'vitest';
import {
  type Agendamento,
  type Avaliacao,
  FACILIDADE_INICIAL,
  FACILIDADE_MAXIMA,
  FACILIDADE_MINIMA,
  LAPSOS_PARA_SINALIZAR,
  TETO_INTERVALO_DIAS,
  agendamentoNovo,
  agendar,
  reconstruir,
} from './agendamento';
import { diaDeEstudo, somarDias } from './dia-de-estudo';

const HOJE = diaDeEstudo('2026-08-16');

/** Aplica uma sequência de avaliações, avançando o dia conforme o intervalo. */
function estudar(avaliacoes: readonly Avaliacao[], inicio = HOJE): Agendamento {
  let estado = agendamentoNovo(inicio);
  let dia = inicio;

  for (const avaliacao of avaliacoes) {
    estado = agendar(estado, avaliacao, dia);
    dia = estado.venceEm;
  }

  return estado;
}

describe('carta nova', () => {
  it('começa vencendo hoje, sem histórico', () => {
    const novo = agendamentoNovo(HOJE);

    expect(novo.venceEm).toBe(HOJE);
    expect(novo.repeticoes).toBe(0);
    expect(novo.lapsos).toBe(0);
    expect(novo.facilidade).toBe(FACILIDADE_INICIAL);
    expect(novo.sinalizado).toBe(false);
  });
});

describe('acertar', () => {
  it('o primeiro acerto traz a carta de volta amanhã', () => {
    const estado = agendar(agendamentoNovo(HOJE), 'bom', HOJE);

    expect(estado.intervaloDias).toBe(1);
    expect(estado.venceEm).toBe(somarDias(HOJE, 1));
    expect(estado.repeticoes).toBe(1);
  });

  it('o segundo acerto usa o degrau de três dias', () => {
    const estado = estudar(['bom', 'bom']);

    expect(estado.intervaloDias).toBe(3);
    expect(estado.repeticoes).toBe(2);
  });

  it('a partir do terceiro, o intervalo cresce pela facilidade', () => {
    const estado = estudar(['bom', 'bom', 'bom']);

    // 3 dias × facilidade 2.5 = 7.5, arredondado para 8.
    expect(estado.intervaloDias).toBe(8);
  });

  it('acertos seguidos aumentam o intervalo sem parar', () => {
    const intervalos: number[] = [];
    let estado = agendamentoNovo(HOJE);
    let dia = HOJE;

    for (let i = 0; i < 6; i += 1) {
      estado = agendar(estado, 'bom', dia);
      dia = estado.venceEm;
      intervalos.push(estado.intervaloDias);
    }

    for (let i = 1; i < intervalos.length; i += 1) {
      expect(intervalos[i]!).toBeGreaterThan(intervalos[i - 1]!);
    }
  });

  it('"fácil" aumenta a facilidade e "difícil" reduz', () => {
    expect(estudar(['facil']).facilidade).toBeGreaterThan(FACILIDADE_INICIAL);
    expect(estudar(['dificil']).facilidade).toBeLessThan(FACILIDADE_INICIAL);
  });

  it('a facilidade não passa do teto, por mais fácil que a carta seja', () => {
    const estado = estudar(Array<Avaliacao>(12).fill('facil'));
    expect(estado.facilidade).toBeLessThanOrEqual(FACILIDADE_MAXIMA);
  });
});

describe('errar', () => {
  it('a carta volta amanhã, não na mesma sessão', () => {
    // Rever a mesma carta minutos depois é memorizar a tela, não a palavra.
    const estado = agendar(estudar(['bom', 'bom', 'bom']), 'errei', HOJE);

    expect(estado.intervaloDias).toBe(1);
    expect(estado.venceEm).toBe(somarDias(HOJE, 1));
  });

  it('zera os acertos seguidos', () => {
    const estado = agendar(estudar(['bom', 'bom', 'bom']), 'errei', HOJE);
    expect(estado.repeticoes).toBe(0);
  });

  it('conta o lapso, e o contador nunca zera', () => {
    let estado = agendar(agendamentoNovo(HOJE), 'errei', HOJE);
    expect(estado.lapsos).toBe(1);

    estado = agendar(estado, 'bom', HOJE);
    estado = agendar(estado, 'bom', HOJE);
    expect(estado.lapsos).toBe(1);

    estado = agendar(estado, 'errei', HOJE);
    expect(estado.lapsos).toBe(2);
  });

  it('reduz a facilidade, mas nunca abaixo do piso', () => {
    // Sem o piso, a carta cairia para "volta todo dia, para sempre", e um
    // punhado dessas domina toda sessão até o aluno desistir do app.
    let estado = agendamentoNovo(HOJE);
    for (let i = 0; i < 15; i += 1) {
      estado = agendar(estado, 'errei', HOJE);
    }

    expect(estado.facilidade).toBe(FACILIDADE_MINIMA);
  });

  it('mesmo no piso, dois acertos fazem o intervalo crescer de novo', () => {
    // É o que o piso garante: sempre existe caminho de volta.
    let estado = agendamentoNovo(HOJE);
    for (let i = 0; i < 15; i += 1) {
      estado = agendar(estado, 'errei', HOJE);
    }

    let dia = HOJE;
    const intervalos: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      estado = agendar(estado, 'bom', dia);
      dia = estado.venceEm;
      intervalos.push(estado.intervaloDias);
    }

    expect(intervalos.at(-1)!).toBeGreaterThan(intervalos[0]!);
  });
});

describe('teto de intervalo', () => {
  it('nenhuma carta é agendada além do teto', () => {
    // O SM-2 puro mandaria uma carta bem sabida para daqui a três anos. Num
    // curso de seis meses isso equivale a apagá-la do estudo.
    const estado = estudar(Array<Avaliacao>(20).fill('facil'));

    expect(estado.intervaloDias).toBe(TETO_INTERVALO_DIAS);
  });

  it('o teto não trava o crescimento antes da hora', () => {
    const estado = estudar(['bom', 'bom', 'bom', 'bom']);

    expect(estado.intervaloDias).toBeGreaterThan(3);
    expect(estado.intervaloDias).toBeLessThan(TETO_INTERVALO_DIAS);
  });
});

describe('sinalizar para o professor', () => {
  it('não sinaliza antes do limite de lapsos', () => {
    let estado = agendamentoNovo(HOJE);
    for (let i = 0; i < LAPSOS_PARA_SINALIZAR - 1; i += 1) {
      estado = agendar(estado, 'errei', HOJE);
    }

    expect(estado.sinalizado).toBe(false);
  });

  it('sinaliza ao atingir o limite', () => {
    // A partir daqui, insistir no agendamento é ignorar o problema: a carta
    // precisa que o professor explique de novo, não de outro intervalo.
    let estado = agendamentoNovo(HOJE);
    for (let i = 0; i < LAPSOS_PARA_SINALIZAR; i += 1) {
      estado = agendar(estado, 'errei', HOJE);
    }

    expect(estado.sinalizado).toBe(true);
  });

  it('acertar depois não apaga o sinal', () => {
    // Quem decide que a carta voltou ao normal é o professor, na aula, e não
    // uma resposta certa isolada, que pode ser sorte.
    let estado = agendamentoNovo(HOJE);
    for (let i = 0; i < LAPSOS_PARA_SINALIZAR; i += 1) {
      estado = agendar(estado, 'errei', HOJE);
    }

    estado = agendar(estado, 'facil', HOJE);
    expect(estado.sinalizado).toBe(true);
  });
});

describe('pureza', () => {
  it('não altera o estado que recebeu', () => {
    const original = agendamentoNovo(HOJE);
    const copia = { ...original };

    agendar(original, 'bom', HOJE);

    expect(original).toEqual(copia);
  });

  it('mesmas entradas produzem exatamente a mesma saída', () => {
    // É esta propriedade que permite o app e o servidor chegarem ao mesmo
    // resultado sem se falarem.
    const entrada = estudar(['bom', 'dificil', 'bom']);

    expect(agendar(entrada, 'bom', HOJE)).toEqual(agendar(entrada, 'bom', HOJE));
  });
});

describe('reconstruir a partir do histórico', () => {
  it('reproduzir as revisões chega ao mesmo estado', () => {
    // O banco guarda o agendamento pronto porque "o que vence hoje" roda a cada
    // abertura do app. Mas as revisões são append-only, então o estado sempre
    // pode ser recalculado, e se os dois divergirem, algo escreveu no
    // agendamento sem passar pela regra.
    const avaliacoes: Avaliacao[] = ['bom', 'errei', 'bom', 'facil', 'dificil', 'bom'];

    let materializado = agendamentoNovo(HOJE);
    let dia = HOJE;
    const historico = [];

    for (const avaliacao of avaliacoes) {
      historico.push({ avaliacao, dia });
      materializado = agendar(materializado, avaliacao, dia);
      dia = materializado.venceEm;
    }

    expect(reconstruir(historico, HOJE)).toEqual(materializado);
  });

  it('histórico vazio devolve o estado inicial', () => {
    expect(reconstruir([], HOJE)).toEqual(agendamentoNovo(HOJE));
  });
});
