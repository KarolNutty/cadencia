import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_PERGUNTAS,
  MINIMO_DE_PERGUNTAS,
  NIVEL_INICIAL,
  type EstadoDoTeste,
  type Pergunta,
  iniciarTeste,
  proximaPergunta,
  responder,
  resultado,
  terminou,
} from './nivelamento';

/** Aplica uma sequência de acertos e erros. */
function testar(respostas: readonly boolean[]): EstadoDoTeste {
  return respostas.reduce((estado, acertou) => responder(estado, acertou), iniciarTeste());
}

/** Responde como alguém cujo nível real é este: acerta abaixo, erra acima. */
function alunoDeNivel(nivelReal: number, quantidade = MAXIMO_DE_PERGUNTAS): EstadoDoTeste {
  const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let estado = iniciarTeste();

  for (let i = 0; i < quantidade && !terminou(estado); i += 1) {
    const atual = NIVEIS.indexOf(estado.nivelAtual);
    estado = responder(estado, atual <= nivelReal);
  }

  return estado;
}

describe('começo', () => {
  it('começa no meio da escala, sem supor nada', () => {
    const estado = iniciarTeste();

    expect(estado.nivelAtual).toBe(NIVEL_INICIAL);
    expect(estado.respostas).toHaveLength(0);
  });
});

describe('caminhada pela escala', () => {
  it('acertar sobe um nível', () => {
    expect(testar([true]).nivelAtual).toBe('B2');
  });

  it('errar desce um nível', () => {
    expect(testar([false]).nivelAtual).toBe('A2');
  });

  it('nunca pula mais de um nível por resposta', () => {
    // Saltar dois por causa de um chute põe a pessoa numa turma onde ela não
    // entende nada, e ela desiste antes da segunda aula.
    const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    let estado = iniciarTeste();

    for (let i = 0; i < 10; i += 1) {
      const antes = NIVEIS.indexOf(estado.nivelAtual);
      estado = responder(estado, i % 2 === 0);
      const depois = NIVEIS.indexOf(estado.nivelAtual);

      expect(Math.abs(depois - antes)).toBeLessThanOrEqual(1);
    }
  });

  it('não passa do topo nem do fundo da escala', () => {
    expect(testar(Array(12).fill(true)).nivelAtual).toBe('C2');
    expect(testar(Array(12).fill(false)).nivelAtual).toBe('A1');
  });

  it('acertar elimina os níveis abaixo do intervalo', () => {
    const estado = testar([true]);
    expect(estado.menor).toBeGreaterThanOrEqual(2);
  });

  it('errar elimina os níveis acima', () => {
    const estado = testar([false]);
    expect(estado.maior).toBeLessThanOrEqual(2);
  });
});

describe('quando o teste acaba', () => {
  it('não acaba antes do mínimo de perguntas', () => {
    // Um intervalo pode fechar cedo por sorte, e ninguém deve ser nivelado com
    // três respostas.
    const estado = testar(Array(MINIMO_DE_PERGUNTAS - 1).fill(false));
    expect(terminou(estado)).toBe(false);
  });

  it('acaba no limite máximo, mesmo sem convergir', () => {
    // Alternar acerto e erro nunca fecha o intervalo. O limite existe para o
    // teste não virar infinito.
    const alternado = Array.from({ length: MAXIMO_DE_PERGUNTAS }, (_, i) => i % 2 === 0);
    expect(terminou(testar(alternado))).toBe(true);
  });

  it('converge antes do máximo para quem responde de forma coerente', () => {
    const estado = alunoDeNivel(1);

    expect(terminou(estado)).toBe(true);
    expect(estado.respostas.length).toBeLessThan(MAXIMO_DE_PERGUNTAS);
  });
});

describe('resultado', () => {
  it('encontra o nível de um aluno A2', () => {
    expect(resultado(alunoDeNivel(1)).nivel).toBe('A2');
  });

  it('encontra o nível de um aluno B2', () => {
    expect(resultado(alunoDeNivel(3)).nivel).toBe('B2');
  });

  it('encontra o nível de um aluno C2', () => {
    expect(resultado(alunoDeNivel(5)).nivel).toBe('C2');
  });

  it('quem erra tudo fica em A1', () => {
    // Mandar para A2 quem não acertou nada seria pior que mandar para A1.
    expect(resultado(testar(Array(10).fill(false))).nivel).toBe('A1');
  });

  it('usa o teto de acertos, e não a média', () => {
    // Média puxaria para baixo quem errou uma difícil no começo. O teste procura
    // o teto, não a nota.
    const estado = testar([false, true, true, true, true, true, true, true]);
    const teto = resultado(estado);

    expect(teto.nivel).not.toBe('A1');
    expect(teto.acertos).toBe(7);
  });

  it('quem responde ao acaso recebe confiança baixa', () => {
    // O intervalo pode fechar por sorte. Sem medir coerência, o professor
    // confiaria num número que não mede nada.
    const coerente = resultado(alunoDeNivel(2));
    const chutando = resultado(
      testar([true, false, true, false, true, false, true, false]),
    );

    expect(chutando.incoerencias).toBeGreaterThan(0);
    expect(chutando.confianca).toBeLessThan(coerente.confianca);
  });

  it('quem responde de forma coerente não acumula incoerência', () => {
    expect(resultado(alunoDeNivel(3)).incoerencias).toBe(0);
  });

  it('a confiança cresce conforme o intervalo fecha', () => {
    const cedo = resultado(testar([true]));
    const convergido = resultado(alunoDeNivel(2));

    expect(convergido.confianca).toBeGreaterThan(cedo.confianca);
    expect(convergido.confianca).toBeLessThanOrEqual(1);
  });
});

describe('escolha da próxima pergunta', () => {
  const banco: Pergunta[] = [
    { id: 'a1', nivel: 'A1', enunciado: '', alternativas: [], correta: 0 },
    { id: 'b1', nivel: 'B1', enunciado: '', alternativas: [], correta: 0 },
    { id: 'c1', nivel: 'C1', enunciado: '', alternativas: [], correta: 0 },
  ];

  it('escolhe a do nível atual', () => {
    const escolhida = proximaPergunta(banco, iniciarTeste(), new Set());
    expect(escolhida?.id).toBe('b1');
  });

  it('não repete pergunta já vista', () => {
    // Repetir invalidaria a medida: a pessoa lembra da resposta anterior.
    const escolhida = proximaPergunta(banco, iniciarTeste(), new Set(['b1']));
    expect(escolhida?.id).not.toBe('b1');
  });

  it('cai para a mais próxima quando acabam as do nível', () => {
    const estado = { ...iniciarTeste(), nivelAtual: 'B2' as const };
    const escolhida = proximaPergunta(banco, estado, new Set(['b1']));

    expect(escolhida?.id).toBe('c1');
  });

  it('devolve nulo quando o banco acabou', () => {
    expect(proximaPergunta(banco, iniciarTeste(), new Set(['a1', 'b1', 'c1']))).toBeNull();
  });
});

describe('pureza', () => {
  it('não altera o estado recebido', () => {
    const inicial = iniciarTeste();
    const copia = { ...inicial, respostas: [...inicial.respostas] };

    responder(inicial, true);

    expect(inicial).toEqual(copia);
  });
});
