import { ErroDaApi } from '../../compartilhado/erros';
import { erroDoProvedor } from '../../compartilhado/provedor-de-ia';
import { CRITERIOS, type AnaliseDaIa, type Criterio } from '@cadencia/dominio';

/**
 * O provedor de análise.
 *
 * Interface antes de implementação, e por um motivo prático: o projeto roda
 * **por completo sem chave de API**. Quem clonar o repositório vê a correção
 * funcionando com o provedor simulado, e não uma tela de erro pedindo
 * credencial. Isso também é o que permite testar o caminho todo sem gastar
 * cota nem depender de rede.
 */

export interface PedidoDeAnalise {
  texto: string;
  nivel: string;
  tema: string;
  idioma: string;
}

export interface ProvedorDeAnalise {
  readonly nome: string;
  analisar(pedido: PedidoDeAnalise): Promise<AnaliseDaIa>;
}

/**
 * O que o modelo recebe.
 *
 * Três decisões dentro deste texto:
 *
 * 1. **Ele não conta palavras nem dá nota.** O código conta e o professor
 *    avalia. Pedir contagem a um modelo de linguagem devolve números errados
 *    ditos com confiança total.
 * 2. **Todo apontamento cita o trecho exato.** É o que torna a análise
 *    verificável: o servidor confere depois se o trecho existe mesmo no texto.
 * 3. **O tom é de professor, não de corretor automático.** Explicar por que
 *    está errado ensina; listar erros só constrange.
 */
function montarInstrucao(pedido: PedidoDeAnalise): string {
  return [
    `Você ajuda um professor de ${pedido.idioma} a corrigir a redação de um aluno de nível ${pedido.nivel}.`,
    `Tema proposto: ${pedido.tema}`,
    '',
    'Analise o texto e devolve APENAS um objeto JSON, sem cercas de código, no formato:',
    '{"resumo": "duas frases sobre o texto", "apontamentos": [{"criterio": "gramatica|vocabulario|coesao|adequacao", "trecho": "o trecho EXATO copiado do texto do aluno", "sugestao": "como ficaria melhor", "explicacao": "por que, em português, em uma frase"}]}',
    '',
    'Regras:',
    '- O campo "trecho" precisa ser copiado LITERALMENTE do texto do aluno, sem parafrasear.',
    '- No máximo 8 apontamentos. Priorize o que mais atrapalha a compreensão.',
    '- Não conte palavras. Não dê nota. Não avalie o esforço do aluno.',
    '- Explique por que está errado, como faria um professor. Não liste apenas o que corrigir.',
    '- Se o texto estiver correto, devolva "apontamentos": [].',
    '',
    'Texto do aluno:',
    pedido.texto,
  ].join('\n');
}

/**
 * Lê a resposta do modelo.
 *
 * Modelos devolvem JSON embrulhado em cercas de código com frequência, mesmo
 * quando instruídos a não fazer isso. Tratar esse caso aqui é mais barato do
 * que insistir na instrução.
 *
 * Qualquer campo fora do formato é **descartado, não corrigido**: aceitar um
 * critério inventado faria a tela agrupar por uma chave que não existe.
 */
export function interpretarResposta(bruto: string): AnaliseDaIa {
  const semCercas = bruto
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  /*
   * JSON quebrado vira erro que explica, e não `SyntaxError`.
   *
   * A mensagem original fala de posição e coluna, o que manda quem investiga
   * procurar defeito no leitor. O problema é outro: o modelo devolveu algo que
   * não é JSON válido, e o que importa saber é isso.
   */
  let dados: { resumo?: unknown; apontamentos?: unknown };

  try {
    dados = JSON.parse(semCercas) as typeof dados;
  } catch {
    throw new ErroDaApi(
      'servico_indisponivel',
      'A análise da IA veio em formato inesperado.',
      [{ campo: 'provedor', motivo: `começo do que veio: ${semCercas.slice(0, 120)}` }],
    );
  }

  const apontamentos = Array.isArray(dados.apontamentos) ? dados.apontamentos : [];

  return {
    resumo: typeof dados.resumo === 'string' ? dados.resumo : '',
    apontamentos: apontamentos
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .filter((item) => CRITERIOS.includes(item.criterio as Criterio))
      .filter((item) => typeof item.trecho === 'string' && item.trecho.trim().length > 0)
      .slice(0, 8)
      .map((item) => ({
        criterio: item.criterio as Criterio,
        trecho: String(item.trecho),
        sugestao: typeof item.sugestao === 'string' ? item.sugestao : '',
        explicacao: typeof item.explicacao === 'string' ? item.explicacao : '',
      })),
  };
}

/**
 * O provedor real, via Gemini.
 *
 * A chave nunca chega ao navegador: a chamada sai do servidor. Um cliente que
 * falasse direto com o modelo exporia a credencial no primeiro carregamento da
 * página, e a conta seria consumida por qualquer pessoa.
 */
export function criarProvedorGemini(
  chave: string,
  modelo: string,
  buscar: typeof fetch = fetch,
): ProvedorDeAnalise {
  return {
    nome: 'gemini',

    async analisar(pedido) {
      const resposta = await buscar(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': chave,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: montarInstrucao(pedido) }] }],
            generationConfig: {
              // Correção precisa ser reproduzível: o mesmo texto não pode
              // receber apontamentos diferentes a cada tentativa.
              temperature: 0.2,
              // Folgado: modelos recentes gastam parte do orçamento raciocinando
              // antes de escrever, e uma análise cortada estoura na leitura do
              // JSON com um erro que fala de sintaxe.
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!resposta.ok) throw await erroDoProvedor(resposta, chave);

      const dados = (await resposta.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
      };

      const candidato = dados.candidates?.[0];
      const texto = candidato?.content?.parts?.[0]?.text;

      if (candidato?.finishReason === 'MAX_TOKENS') {
        throw new ErroDaApi(
          'servico_indisponivel',
          'A análise da IA foi cortada por limite de tamanho.',
          [{ campo: 'provedor', motivo: 'finishReason: MAX_TOKENS' }],
        );
      }

      if (!texto) {
        throw new ErroDaApi('servico_indisponivel', 'A IA não devolveu conteúdo.', [
          {
            campo: 'provedor',
            motivo: `finishReason: ${candidato?.finishReason ?? 'ausente'}`,
          },
        ]);
      }

      return interpretarResposta(texto);
    },
  };
}

/**
 * O provedor simulado.
 *
 * Reconhece alguns erros clássicos de quem fala português aprendendo inglês.
 * Não é inteligência, é uma lista, e está identificado como tal na resposta,
 * para ninguém confundir a demonstração com o produto.
 */
const ERROS_CONHECIDOS: {
  procurar: RegExp;
  criterio: Criterio;
  sugestao: string;
  explicacao: string;
}[] = [
  {
    procurar: /\bi am agree\b/i,
    criterio: 'gramatica',
    sugestao: 'I agree',
    explicacao: 'Em inglês "agree" já é o verbo, não se usa o verbo "to be" antes dele.',
  },
  {
    procurar: /\bi have \d+ years?\b/i,
    criterio: 'gramatica',
    sugestao: 'I am … years old',
    explicacao: 'Idade em inglês usa o verbo "to be", diferente do português.',
  },
  {
    procurar: /\bpretend to\b/i,
    criterio: 'vocabulario',
    sugestao: 'intend to',
    explicacao: '"Pretend" significa fingir. Para "pretender", use "intend" ou "plan".',
  },
  {
    procurar: /\bpush\b/i,
    criterio: 'vocabulario',
    sugestao: 'pull',
    explicacao: 'Confira o sentido: "push" é empurrar, "pull" é puxar.',
  },
  {
    procurar: /\bmake a question\b/i,
    criterio: 'vocabulario',
    sugestao: 'ask a question',
    explicacao: 'Pergunta em inglês se "faz" com o verbo "ask".',
  },
  {
    procurar: /\bactually\b/i,
    criterio: 'vocabulario',
    sugestao: 'currently',
    explicacao: '"Actually" quer dizer "na verdade". Para "atualmente", use "currently".',
  },
  {
    procurar: /\bmore better\b/i,
    criterio: 'gramatica',
    sugestao: 'better',
    explicacao: '"Better" já é comparativo; não precisa de "more" antes.',
  },
];

export function criarProvedorSimulado(): ProvedorDeAnalise {
  return {
    nome: 'simulado',

    async analisar(pedido) {
      const apontamentos = ERROS_CONHECIDOS.flatMap((erro) => {
        const encontrado = pedido.texto.match(erro.procurar);
        if (!encontrado) return [];

        return [
          {
            criterio: erro.criterio,
            // O trecho é o que foi realmente casado no texto, nunca o padrão.
            trecho: encontrado[0],
            sugestao: erro.sugestao,
            explicacao: erro.explicacao,
          },
        ];
      });

      return {
        resumo:
          apontamentos.length === 0
            ? 'Análise simulada: nenhum dos erros que este modo reconhece apareceu no texto.'
            : `Análise simulada: ${apontamentos.length} ${apontamentos.length === 1 ? 'ponto encontrado' : 'pontos encontrados'}. Configure GEMINI_API_KEY para a análise completa.`,
        apontamentos,
      };
    },
  };
}

/** Escolhe o provedor conforme o ambiente. */
export function escolherProvedor(
  chave: string | undefined,
  modelo: string,
): ProvedorDeAnalise {
  return chave ? criarProvedorGemini(chave, modelo) : criarProvedorSimulado();
}
