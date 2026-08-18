import { describe, expect, it } from 'vitest';
import {
  FALAS_NA_JANELA,
  MAXIMO_DE_FALAS,
  correcoesValidas,
  falasRestantes,
  janelaDeContexto,
  podeContinuar,
  type Fala,
} from './conversa';

function conversa(quantidade: number): Fala[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    autor: i % 2 === 0 ? ('aluno' as const) : ('assistente' as const),
    texto: `fala ${i}`,
  }));
}

describe('janela de contexto', () => {
  it('conversa curta vai inteira', () => {
    expect(janelaDeContexto(conversa(4))).toHaveLength(4);
  });

  it('conversa longa é cortada', () => {
    // Cada palavra reenviada é cobrada de novo, e o custo cresce em progressão.
    expect(janelaDeContexto(conversa(60)).length).toBeLessThanOrEqual(FALAS_NA_JANELA);
  });

  it('a janela sempre começa por uma fala do aluno', () => {
    /**
     * Cortar no meio de um par pergunta e resposta faz o modelo responder a
     * uma fala dele mesmo, e a conversa perde o fio.
     */
    for (let tamanho = 2; tamanho < 40; tamanho += 1) {
      const janela = janelaDeContexto(conversa(tamanho));
      if (janela.length > 0) {
        expect(janela[0]?.autor).toBe('aluno');
      }
    }
  });

  it('conversa vazia devolve janela vazia', () => {
    expect(janelaDeContexto([])).toEqual([]);
  });
});

describe('limite da conversa', () => {
  it('permite continuar dentro do limite', () => {
    expect(podeContinuar({ falasDoAluno: 5, encerrada: false })).toBe(true);
  });

  it('para ao chegar no limite', () => {
    expect(podeContinuar({ falasDoAluno: MAXIMO_DE_FALAS, encerrada: false })).toBe(false);
  });

  it('conversa encerrada não continua', () => {
    expect(podeContinuar({ falasDoAluno: 1, encerrada: true })).toBe(false);
  });

  it('informa quantas falas ainda cabem', () => {
    // A tela avisa antes do fim: uma conversa que simplesmente para de
    // responder parece defeito.
    expect(falasRestantes({ falasDoAluno: MAXIMO_DE_FALAS - 3, encerrada: false })).toBe(3);
  });

  it('o restante nunca fica negativo', () => {
    expect(falasRestantes({ falasDoAluno: 999, encerrada: false })).toBe(0);
  });
});

describe('correções da conversa', () => {
  it('mantém a correção cujo trecho existe na fala', () => {
    const validas = correcoesValidas(
      [{ trecho: 'I am agree', sugestao: 'I agree' }],
      'Yes, I am agree with you.',
    );

    expect(validas).toHaveLength(1);
  });

  it('descarta a correção que cita trecho inexistente', () => {
    // Numa conversa não há professor para julgar depois. Mostrar ao aluno uma
    // correção que ele não localiza só atrapalha.
    const validas = correcoesValidas(
      [{ trecho: 'I are agree', sugestao: 'I agree' }],
      'Yes, I am agree with you.',
    );

    expect(validas).toHaveLength(0);
  });

  it('descarta correção que não muda nada', () => {
    // Acontece quando o modelo "corrige" algo já correto.
    const validas = correcoesValidas(
      [{ trecho: 'I agree', sugestao: 'I agree' }],
      'I agree with you.',
    );

    expect(validas).toHaveLength(0);
  });

  it('descarta correção com campo vazio', () => {
    const validas = correcoesValidas(
      [
        { trecho: '', sugestao: 'algo' },
        { trecho: 'algo', sugestao: '' },
      ],
      'algo aqui',
    );

    expect(validas).toHaveLength(0);
  });

  it('ignora diferença de maiúsculas e espaçamento', () => {
    const validas = correcoesValidas(
      [{ trecho: 'I  AM   agree', sugestao: 'I agree' }],
      'well, i am agree.',
    );

    expect(validas).toHaveLength(1);
  });
});
