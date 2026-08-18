import {
  REGISTRO_POR_NIVEL,
  type Fala,
  type Nivel,
  type RespostaDaConversa,
} from '@cadencia/dominio';

/**
 * O parceiro de conversa.
 *
 * Mesma estrutura da correção de redação: interface, provedor real e simulado.
 * O projeto continua rodando por completo sem chave de API, e quem clona o
 * repositório vê a conversa funcionando.
 */

export interface PedidoDeConversa {
  cenario: string;
  nivel: Nivel;
  idioma: string;
  janela: readonly Fala[];
  mensagem: string;
}

export interface ProvedorDeConversa {
  readonly nome: string;
  conversar(pedido: PedidoDeConversa): Promise<RespostaDaConversa>;
}

/**
 * A instrução que define o parceiro.
 *
 * Três decisões dentro dela:
 *
 * 1. Responde **na língua estudada**, no registro do nível. Um aluno de A1 que
 *    recebe resposta de C1 não pratica, ele desiste.
 * 2. Corrige **sem interromper a conversa**. A correção vem em campo separado,
 *    e a resposta segue o assunto. Um parceiro que só corrige não conversa.
 * 3. Cita o trecho exato do que o aluno escreveu, para o servidor poder
 *    verificar depois.
 */
function montarInstrucao(pedido: PedidoDeConversa): string {
  return [
    `Você conversa em ${pedido.idioma} com um aluno de nível ${pedido.nivel}.`,
    `Situação: ${pedido.cenario}`,
    `Fale assim: ${REGISTRO_POR_NIVEL[pedido.nivel]}.`,
    '',
    'Devolva APENAS um objeto JSON, sem cercas de código:',
    '{"resposta": "sua fala em ' +
      pedido.idioma +
      '", "correcoes": [{"trecho": "o que o aluno escreveu, copiado LITERALMENTE", "sugestao": "como ficaria melhor"}]}',
    '',
    'Regras:',
    '- A resposta continua a conversa. Não corrija dentro dela.',
    '- Faça uma pergunta na maioria das vezes, para o aluno ter o que responder.',
    '- Corrija no máximo 2 pontos por vez, os que mais atrapalham a compreensão.',
    '- O campo "trecho" precisa ser copiado literalmente da mensagem do aluno.',
    '- Se a mensagem estiver correta, devolva "correcoes": [].',
    '- Responda com 1 a 3 frases. Conversa é troca, não monólogo.',
  ].join('\n');
}

export function interpretarResposta(bruto: string): RespostaDaConversa {
  const semCercas = bruto
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const dados = JSON.parse(semCercas) as { resposta?: unknown; correcoes?: unknown };

  const correcoes = Array.isArray(dados.correcoes) ? dados.correcoes : [];

  return {
    resposta: typeof dados.resposta === 'string' ? dados.resposta.trim() : '',
    correcoes: correcoes
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .filter(
        (item) => typeof item.trecho === 'string' && typeof item.sugestao === 'string',
      )
      .slice(0, 2)
      .map((item) => ({ trecho: String(item.trecho), sugestao: String(item.sugestao) })),
  };
}

export function criarProvedorGemini(
  chave: string,
  buscar: typeof fetch = fetch,
): ProvedorDeConversa {
  return {
    nome: 'gemini',

    async conversar(pedido) {
      /*
       * O histórico vira turnos de verdade, e não um texto grudado.
       *
       * Enfiar a conversa toda numa string faz o modelo tratar as falas
       * anteriores como parte da instrução, e ele começa a responder ao
       * enunciado em vez de ao aluno.
       */
      const conteudos = [
        ...pedido.janela.map((fala) => ({
          role: fala.autor === 'aluno' ? 'user' : 'model',
          parts: [{ text: fala.texto }],
        })),
        { role: 'user', parts: [{ text: pedido.mensagem }] },
      ];

      const resposta = await buscar(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
          body: JSON.stringify({
            contents: conteudos,
            systemInstruction: { parts: [{ text: montarInstrucao(pedido) }] },
            generationConfig: {
              // Mais alta que na redação: conversa repetitiva desanima, e aqui
              // variar é qualidade, não risco.
              temperature: 0.8,
              maxOutputTokens: 400,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!resposta.ok) throw new Error(`Gemini respondeu ${resposta.status}`);

      const dados = (await resposta.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) throw new Error('Gemini não devolveu conteúdo.');

      return interpretarResposta(texto);
    },
  };
}

/**
 * O parceiro simulado.
 *
 * Não tenta parecer inteligente: devolve continuações plausíveis do cenário e
 * corrige os mesmos erros clássicos que o simulado da redação reconhece. Serve
 * para o fluxo inteiro funcionar sem chave, e se identifica na primeira fala.
 */
const RESPOSTAS_SIMULADAS = [
  'That sounds interesting. Can you tell me more about it?',
  'I see. And how did you feel about that?',
  'Nice. What did you do next?',
  'Really? Why do you think that happened?',
  'Got it. Would you do it again?',
];

const CORRECOES_SIMULADAS: { procurar: RegExp; sugestao: string }[] = [
  { procurar: /\bi am agree\b/i, sugestao: 'I agree' },
  { procurar: /\bi have \d+ years\b/i, sugestao: 'I am … years old' },
  { procurar: /\bmake a question\b/i, sugestao: 'ask a question' },
  { procurar: /\bmore better\b/i, sugestao: 'better' },
];

export function criarProvedorSimulado(): ProvedorDeConversa {
  return {
    nome: 'simulado',

    async conversar(pedido) {
      const correcoes = CORRECOES_SIMULADAS.flatMap((erro) => {
        const achado = pedido.mensagem.match(erro.procurar);
        return achado ? [{ trecho: achado[0], sugestao: erro.sugestao }] : [];
      }).slice(0, 2);

      const indice = pedido.janela.length % RESPOSTAS_SIMULADAS.length;

      return {
        resposta:
          pedido.janela.length === 0
            ? `(modo simulado) Hi! Let's talk about ${pedido.cenario}. How are you today?`
            : RESPOSTAS_SIMULADAS[indice]!,
        correcoes,
      };
    },
  };
}

export function escolherProvedor(chave: string | undefined): ProvedorDeConversa {
  return chave ? criarProvedorGemini(chave) : criarProvedorSimulado();
}
