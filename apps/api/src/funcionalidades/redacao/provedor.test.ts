import { describe, expect, it, vi } from 'vitest';
import {
  criarProvedorGemini,
  criarProvedorSimulado,
  escolherProvedor,
  interpretarResposta,
} from './provedor';

const MODELO = 'gemini-3.6-flash';

describe('leitura da resposta do modelo', () => {
  it('lê JSON limpo', () => {
    const analise = interpretarResposta(
      '{"resumo":"bom","apontamentos":[{"criterio":"gramatica","trecho":"I am agree","sugestao":"I agree","explicacao":"porque"}]}',
    );

    expect(analise.resumo).toBe('bom');
    expect(analise.apontamentos).toHaveLength(1);
  });

  it('remove as cercas de código', () => {
    // Modelos embrulham em ```json com frequência, mesmo instruídos a não fazer.
    const analise = interpretarResposta('```json\n{"resumo":"ok","apontamentos":[]}\n```');

    expect(analise.resumo).toBe('ok');
  });

  it('descarta apontamento com critério inventado', () => {
    // Aceitar faria a tela agrupar por uma chave que não existe.
    const analise = interpretarResposta(
      '{"resumo":"","apontamentos":[{"criterio":"estilo","trecho":"x","sugestao":"","explicacao":""}]}',
    );

    expect(analise.apontamentos).toHaveLength(0);
  });

  it('descarta apontamento sem trecho', () => {
    // Sem trecho não há como verificar contra o texto do aluno.
    const analise = interpretarResposta(
      '{"resumo":"","apontamentos":[{"criterio":"gramatica","trecho":"   ","sugestao":"a","explicacao":"b"}]}',
    );

    expect(analise.apontamentos).toHaveLength(0);
  });

  it('limita a oito apontamentos', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({
      criterio: 'gramatica',
      trecho: `t${i}`,
      sugestao: '',
      explicacao: '',
    }));

    const analise = interpretarResposta(
      JSON.stringify({ resumo: '', apontamentos: muitos }),
    );

    expect(analise.apontamentos).toHaveLength(8);
  });

  it('aguenta resposta sem a lista de apontamentos', () => {
    expect(interpretarResposta('{"resumo":"ok"}').apontamentos).toEqual([]);
  });

  it('lança em JSON quebrado, para virar erro tratado acima', () => {
    expect(() => interpretarResposta('não é json')).toThrow();
  });
});

describe('provedor simulado', () => {
  it('reconhece erro clássico de quem fala português', async () => {
    const analise = await criarProvedorSimulado().analisar({
      texto: 'Yes, I am agree with your opinion.',
      nivel: 'B1',
      tema: 'opinião',
      idioma: 'inglês',
    });

    expect(analise.apontamentos[0]?.sugestao).toBe('I agree');
  });

  it('devolve o trecho como aparece no texto, e não o padrão de busca', async () => {
    // Senão a verificação contra o texto original falharia sempre.
    const analise = await criarProvedorSimulado().analisar({
      texto: 'Well, I AM AGREE with that.',
      nivel: 'B1',
      tema: 'x',
      idioma: 'inglês',
    });

    expect(analise.apontamentos[0]?.trecho).toBe('I AM AGREE');
  });

  it('diz que é simulado, para ninguém confundir com o produto', async () => {
    const analise = await criarProvedorSimulado().analisar({
      texto: 'I am agree.',
      nivel: 'B1',
      tema: 'x',
      idioma: 'inglês',
    });

    expect(analise.resumo.toLowerCase()).toContain('simulada');
  });

  it('texto sem erro conhecido não inventa apontamento', async () => {
    const analise = await criarProvedorSimulado().analisar({
      texto: 'The weather is nice today.',
      nivel: 'B1',
      tema: 'x',
      idioma: 'inglês',
    });

    expect(analise.apontamentos).toEqual([]);
  });
});

describe('escolha do provedor', () => {
  it('sem chave, usa o simulado', () => {
    // O projeto roda por completo sem credencial: quem clona vê funcionando.
    expect(escolherProvedor(undefined, MODELO).nome).toBe('simulado');
  });

  it('com chave, usa o Gemini', () => {
    expect(escolherProvedor('uma-chave', MODELO).nome).toBe('gemini');
  });
});

describe('provedor Gemini', () => {
  it('manda a chave no cabeçalho, nunca na URL', async () => {
    // Chave em query string vaza em log de servidor e histórico de proxy.
    const buscar = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: '{"resumo":"ok","apontamentos":[]}' }] } },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    await criarProvedorGemini('segredo', MODELO, buscar).analisar({
      texto: 'x',
      nivel: 'B1',
      tema: 'y',
      idioma: 'inglês',
    });

    const [url, opcoes] = (
      buscar as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;

    expect(url).not.toContain('segredo');
    expect((opcoes.headers as Record<string, string>)['x-goog-api-key']).toBe('segredo');
  });

  it('erro do provedor vira exceção, e não análise vazia', async () => {
    // Análise vazia seria lida pelo aluno como "seu texto está perfeito".
    const buscar = (async () =>
      new Response('erro', { status: 500 })) as unknown as typeof fetch;

    await expect(
      criarProvedorGemini('chave', MODELO, buscar).analisar({
        texto: 'x',
        nivel: 'B1',
        tema: 'y',
        idioma: 'inglês',
      }),
    ).rejects.toThrow();
  });
});
