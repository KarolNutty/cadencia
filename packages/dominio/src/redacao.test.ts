import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_PALAVRAS,
  avaliarTamanho,
  contarPalavras,
  contarPorCriterio,
  verificarAnalise,
  type AnaliseDaIa,
} from './redacao';

describe('contagem de palavras', () => {
  it('conta palavras separadas por espaço', () => {
    expect(contarPalavras('I went to the beach')).toBe(5);
  });

  it('ignora espaços repetidos e quebras de linha', () => {
    expect(contarPalavras('I  went\n\nto   the\tbeach')).toBe(5);
  });

  it('não conta pontuação solta como palavra', () => {
    expect(contarPalavras('Hello , world !')).toBe(2);
  });

  it('conta contração como uma palavra', () => {
    expect(contarPalavras("I don't know")).toBe(3);
  });

  it('texto vazio conta zero', () => {
    expect(contarPalavras('   \n  ')).toBe(0);
  });

  it('aceita aspas tipográficas sem quebrar', () => {
    // Texto colado do Word vem com aspas curvas.
    expect(contarPalavras('I don\u2019t know')).toBe(3);
  });
});

describe('tamanho esperado por nível', () => {
  it('marca como curto o que não chega ao mínimo', () => {
    const avaliacao = avaliarTamanho('I like cats', 'B1');

    expect(avaliacao.situacao).toBe('curto');
    expect(avaliacao.palavras).toBe(3);
  });

  it('marca como no alvo quem alcança o ideal', () => {
    const texto = Array(160).fill('word').join(' ');
    expect(avaliarTamanho(texto, 'B1').situacao).toBe('no_alvo');
  });

  it('o esperado cresce com o nível', () => {
    const texto = Array(110).fill('word').join(' ');

    expect(avaliarTamanho(texto, 'A2').situacao).toBe('no_alvo');
    expect(avaliarTamanho(texto, 'C1').situacao).toBe('curto');
  });
});

describe('verificação da análise', () => {
  function analise(trechos: string[]): AnaliseDaIa {
    return {
      resumo: 'texto bom',
      apontamentos: trechos.map((trecho) => ({
        criterio: 'gramatica' as const,
        trecho,
        sugestao: 'algo',
        explicacao: 'porque sim',
      })),
    };
  }

  it('marca como encontrado o trecho que existe no texto', () => {
    const verificados = verificarAnalise(
      analise(['I am agree']),
      'Yes, I am agree with you.',
    );

    expect(verificados[0]?.encontrado).toBe(true);
  });

  it('marca como não encontrado o trecho inventado', () => {
    /**
     * Modelo de linguagem parafraseia sem perceber. Um apontamento que cita
     * trecho inexistente faz o aluno procurar no próprio texto e não achar —
     * e desconfiar do resto da correção.
     */
    const verificados = verificarAnalise(
      analise(['I are agree']),
      'Yes, I am agree with you.',
    );

    expect(verificados[0]?.encontrado).toBe(false);
  });

  it('ignora diferença de maiúsculas e de espaçamento', () => {
    const verificados = verificarAnalise(
      analise(['I  AM   agree']),
      'Yes, i am agree with you.',
    );

    expect(verificados[0]?.encontrado).toBe(true);
  });

  it('aceita aspas curvas contra aspas retas', () => {
    const verificados = verificarAnalise(
      analise(["I don't know"]),
      'Well, I don\u2019t know what to say.',
    );

    expect(verificados[0]?.encontrado).toBe(true);
  });

  it('não descarta o apontamento inválido, só o marca', () => {
    // Esconder tiraria do professor a chance de perceber que o modelo alucinou.
    const verificados = verificarAnalise(analise(['existe', 'não existe']), 'existe aqui');

    expect(verificados).toHaveLength(2);
  });
});

describe('contagem por critério', () => {
  it('conta só os apontamentos verificados', () => {
    const contagem = contarPorCriterio([
      {
        criterio: 'gramatica',
        trecho: 'a',
        sugestao: '',
        explicacao: '',
        encontrado: true,
      },
      {
        criterio: 'gramatica',
        trecho: 'b',
        sugestao: '',
        explicacao: '',
        encontrado: false,
      },
      { criterio: 'coesao', trecho: 'c', sugestao: '', explicacao: '', encontrado: true },
    ]);

    expect(contagem.gramatica).toBe(1);
    expect(contagem.coesao).toBe(1);
    expect(contagem.vocabulario).toBe(0);
  });
});

describe('limite de tamanho', () => {
  it('existe um teto de palavras aceitas', () => {
    // Sem limite, um texto colado de trinta páginas estoura a janela do modelo
    // e devolve erro sem explicação para o aluno.
    expect(MAXIMO_DE_PALAVRAS).toBeGreaterThan(300);
    expect(MAXIMO_DE_PALAVRAS).toBeLessThan(2000);
  });
});
