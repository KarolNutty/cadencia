import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carregarArquivoDeAmbiente } from './arquivo-de-ambiente';

let pasta: string;

/**
 * As variáveis são apagadas uma a uma, e não com `process.env = {...}`.
 *
 * Reatribuir o objeto inteiro funciona em Node puro, mas o Vitest substitui
 * `process.env` por um proxy para isolar ambiente entre testes — e a
 * reatribuição não chega ao valor real. O resultado é um teste que passa
 * sozinho e falha quando roda depois de outro, que é o pior tipo de teste
 * instável: parece bug do código.
 */
const VARIAVEIS_DO_TESTE = ['VALOR_DE_TESTE'];

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'cadencia-'));
  for (const nome of VARIAVEIS_DO_TESTE) delete process.env[nome];
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
  for (const nome of VARIAVEIS_DO_TESTE) delete process.env[nome];
});

describe('carregarArquivoDeAmbiente', () => {
  it('põe as variáveis do arquivo em process.env', () => {
    writeFileSync(join(pasta, '.env'), 'VALOR_DE_TESTE=abc\n');

    carregarArquivoDeAmbiente({ partida: pasta });

    expect(process.env.VALOR_DE_TESTE).toBe('abc');
  });

  it('encontra o arquivo em um diretório acima', () => {
    // É o caso do monorepo: `npm run migrar -w @cadencia/api` executa dentro de
    // apps/api, e o .env fica na raiz. Procurar só em "./" daria arquivo não
    // encontrado com o arquivo existindo dois níveis acima.
    writeFileSync(join(pasta, '.env'), 'VALOR_DE_TESTE=da-raiz\n');
    const fundo = join(pasta, 'apps', 'api');
    mkdirSync(fundo, { recursive: true });

    const caminho = carregarArquivoDeAmbiente({ partida: fundo });

    expect(caminho).toBe(join(pasta, '.env'));
    expect(process.env.VALOR_DE_TESTE).toBe('da-raiz');
  });

  it('devolve nulo quando não existe, sem estourar', () => {
    // Em produção as variáveis vêm do orquestrador e arquivo nenhum deveria
    // existir. Quem cobra o que falta é o carregarAmbiente.
    expect(carregarArquivoDeAmbiente({ partida: pasta })).toBeNull();
  });

  it('estoura quando o arquivo é declarado obrigatório', () => {
    expect(() => carregarArquivoDeAmbiente({ partida: pasta, obrigatorio: true })).toThrow(
      /não encontrado/,
    );
  });

  it('aceita outro nome de arquivo', () => {
    writeFileSync(join(pasta, '.env.teste'), 'VALOR_DE_TESTE=do-teste\n');

    carregarArquivoDeAmbiente({ nome: '.env.teste', partida: pasta });

    expect(process.env.VALOR_DE_TESTE).toBe('do-teste');
  });

  it('não sobrescreve variável já definida no ambiente', () => {
    // É assim que se troca um valor pontualmente, sem editar o .env.
    process.env.VALOR_DE_TESTE = 'veio-do-sistema';
    writeFileSync(join(pasta, '.env'), 'VALOR_DE_TESTE=veio-do-arquivo\n');

    carregarArquivoDeAmbiente({ partida: pasta });

    expect(process.env.VALOR_DE_TESTE).toBe('veio-do-sistema');
  });
});
