import { describe, expect, it, vi } from 'vitest';
import {
  criarProvedorGemini,
  criarProvedorSimulado,
  escolherProvedor,
  interpretarResposta,
} from './provedor';

describe('leitura da resposta', () => {
  it('lê resposta e correções', () => {
    const lida = interpretarResposta(
      '{"resposta":"Nice! Where did you go?","correcoes":[{"trecho":"I am agree","sugestao":"I agree"}]}',
    );

    expect(lida.resposta).toBe('Nice! Where did you go?');
    expect(lida.correcoes).toHaveLength(1);
  });

  it('remove cercas de código', () => {
    const lida = interpretarResposta('```json\n{"resposta":"Hi","correcoes":[]}\n```');
    expect(lida.resposta).toBe('Hi');
  });

  it('limita a duas correções por fala', () => {
    // Corrigir tudo de uma vez trava quem está aprendendo a conversar.
    const muitas = Array.from({ length: 8 }, (_, i) => ({
      trecho: `t${i}`,
      sugestao: `s${i}`,
    }));

    const lida = interpretarResposta(JSON.stringify({ resposta: 'ok', correcoes: muitas }));

    expect(lida.correcoes).toHaveLength(2);
  });

  it('aguenta resposta sem correções', () => {
    expect(interpretarResposta('{"resposta":"Hello"}').correcoes).toEqual([]);
  });
});

describe('parceiro simulado', () => {
  it('abre a conversa se identificando como simulado', async () => {
    const fala = await criarProvedorSimulado().conversar({
      cenario: 'pedindo um café',
      nivel: 'A2',
      idioma: 'inglês',
      janela: [],
      mensagem: 'Hi',
    });

    expect(fala.resposta.toLowerCase()).toContain('simulado');
  });

  it('corrige erro clássico e devolve o trecho como escrito', async () => {
    const fala = await criarProvedorSimulado().conversar({
      cenario: 'x',
      nivel: 'B1',
      idioma: 'inglês',
      janela: [{ autor: 'aluno', texto: 'oi' }],
      mensagem: 'Yes, I AM AGREE with that.',
    });

    expect(fala.correcoes[0]?.trecho).toBe('I AM AGREE');
    expect(fala.correcoes[0]?.sugestao).toBe('I agree');
  });

  it('sempre devolve alguma resposta, para a conversa não travar', async () => {
    const fala = await criarProvedorSimulado().conversar({
      cenario: 'x',
      nivel: 'B1',
      idioma: 'inglês',
      janela: [{ autor: 'aluno', texto: 'oi' }],
      mensagem: 'The weather is nice.',
    });

    expect(fala.resposta.length).toBeGreaterThan(0);
  });
});

describe('parceiro Gemini', () => {
  it('manda o histórico como turnos, e não como texto grudado', async () => {
    /**
     * Enfiar a conversa numa string faz o modelo tratar as falas anteriores
     * como parte da instrução, e ele passa a responder ao enunciado em vez de
     * ao aluno.
     */
    const buscar = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: '{"resposta":"ok","correcoes":[]}' }] } },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    await criarProvedorGemini('chave', buscar).conversar({
      cenario: 'no aeroporto',
      nivel: 'B1',
      idioma: 'inglês',
      janela: [
        { autor: 'aluno', texto: 'Hello' },
        { autor: 'assistente', texto: 'Hi there' },
      ],
      mensagem: 'Where is the gate?',
    });

    const [, opcoes] = (buscar as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    const corpo = JSON.parse(String(opcoes.body)) as {
      contents: { role: string; parts: { text: string }[] }[];
    };

    expect(corpo.contents).toHaveLength(3);
    expect(corpo.contents[0]?.role).toBe('user');
    expect(corpo.contents[1]?.role).toBe('model');
    expect(corpo.contents[2]?.parts[0]?.text).toBe('Where is the gate?');
  });

  it('a chave vai no cabeçalho, nunca na URL', async () => {
    // Query string vaza em log de servidor e histórico de proxy.
    const buscar = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"resposta":"ok"}' }] } }],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    await criarProvedorGemini('segredo', buscar).conversar({
      cenario: 'x',
      nivel: 'A1',
      idioma: 'inglês',
      janela: [],
      mensagem: 'oi',
    });

    const [url, opcoes] = (
      buscar as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]!;

    expect(url).not.toContain('segredo');
    expect((opcoes.headers as Record<string, string>)['x-goog-api-key']).toBe('segredo');
  });
});

describe('escolha do parceiro', () => {
  it('sem chave, usa o simulado', () => {
    expect(escolherProvedor(undefined).nome).toBe('simulado');
  });

  it('com chave, usa o Gemini', () => {
    expect(escolherProvedor('uma-chave-qualquer').nome).toBe('gemini');
  });
});
