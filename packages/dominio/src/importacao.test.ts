import { describe, expect, it } from 'vitest';
import { EXEMPLO_DE_LISTA, lerLista } from './importacao';

describe('separadores', () => {
  it('lê tabulação, que é o que sai de planilha', () => {
    const { palavras } = lerLista('though\tembora');
    expect(palavras).toEqual([{ frente: 'though', verso: 'embora', dica: null }]);
  });

  it('lê travessão, hífen com espaços, ponto e vírgula e igual', () => {
    const texto = ['a — um', 'b - dois', 'c; três', 'd = quatro'].join('\n');
    const { palavras } = lerLista(texto);

    expect(palavras.map((p) => p.verso)).toEqual(['um', 'dois', 'três', 'quatro']);
  });

  it('não quebra a tradução na vírgula', () => {
    // "olá, tudo bem?" é tradução plausível. Quebrar aqui produziria lixo em
    // silêncio, que é pior do que recusar a linha.
    const { palavras } = lerLista('hello — olá, tudo bem?');

    expect(palavras[0]?.verso).toBe('olá, tudo bem?');
  });

  it('não quebra em hífen sem espaço, que faz parte da palavra', () => {
    const { palavras } = lerLista('e-mail — correio eletrônico');

    expect(palavras[0]?.frente).toBe('e-mail');
  });

  it('lê a dica quando há um segundo separador', () => {
    const { palavras } = lerLista('though — embora — parece "through"');

    expect(palavras[0]).toEqual({
      frente: 'though',
      verso: 'embora',
      dica: 'parece "through"',
    });
  });
});

describe('linhas que não são palavras', () => {
  it('ignora linha vazia', () => {
    const { palavras, problemas } = lerLista('a — um\n\n\nb — dois');

    expect(palavras).toHaveLength(2);
    expect(problemas).toHaveLength(0);
  });

  it('ignora comentário, que é como se organiza lista por tema', () => {
    const { palavras } = lerLista('# verbos\na — um\n# adjetivos\nb — dois');

    expect(palavras).toHaveLength(2);
  });
});

describe('problemas', () => {
  it('devolve a linha e o motivo, em vez de descartar em silêncio', () => {
    // Recusar o lote inteiro faria o professor procurar a agulha sozinho.
    const { palavras, problemas } = lerLista('a — um\npalavra solta\nb — dois');

    expect(palavras).toHaveLength(2);
    expect(problemas).toEqual([
      {
        linha: 2,
        texto: 'palavra solta',
        motivo: 'Não achei a separação entre a palavra e a tradução.',
      },
    ]);
  });

  it('recusa lado vazio', () => {
    const { problemas } = lerLista('a — \n — um');
    expect(problemas).toHaveLength(2);
  });

  it('recusa texto longo demais', () => {
    const { problemas } = lerLista(`${'x'.repeat(300)} — algo`);
    expect(problemas[0]?.motivo).toContain('200 caracteres');
  });

  it('a numeração das linhas conta as ignoradas', () => {
    // Senão o professor procura o erro na linha errada do texto dele.
    const { problemas } = lerLista('# tema\n\na — um\nquebrada');
    expect(problemas[0]?.linha).toBe(4);
  });
});

describe('repetição', () => {
  it('separa as repetidas em vez de duplicar a carta', () => {
    // Colar lista com repetição é o caso comum. Sem isto, o aluno veria a
    // mesma palavra duas vezes na sessão sem entender por quê.
    const { palavras, repetidas } = lerLista('though — embora\nthough — apesar de');

    expect(palavras).toHaveLength(1);
    expect(repetidas[0]?.motivo).toContain('já aparece antes');
  });

  it('a comparação ignora maiúsculas', () => {
    const { repetidas } = lerLista('Though — embora\nthough — apesar');
    expect(repetidas).toHaveLength(1);
  });
});

describe('o exemplo mostrado na tela', () => {
  it('é lido sem nenhum problema', () => {
    // Se o exemplo falhasse, ele ensinaria o formato errado.
    const { palavras, problemas } = lerLista(EXEMPLO_DE_LISTA);

    expect(problemas).toHaveLength(0);
    expect(palavras).toHaveLength(4);
    expect(palavras[0]?.dica).toBe('parece "through", mas não é');
  });
});
