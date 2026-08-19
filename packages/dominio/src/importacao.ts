/**
 * Cadastro de palavras em lote.
 *
 * Professor de idioma já tem a lista pronta, no caderno, num documento, numa
 * planilha. Obrigá-lo a digitar cinquenta palavras num formulário de duas
 * caixas por vez é o motivo mais comum de uma ferramenta boa não ser usada.
 *
 * Então a entrada é **texto colado**, e o trabalho de entender o formato é do
 * software. As regras aqui são puras: dá para testá-las sem banco, sem tela e
 * sem servidor.
 */

export interface PalavraImportada {
  frente: string;
  verso: string;
  dica: string | null;
}

export interface ProblemaNaLinha {
  linha: number;
  texto: string;
  motivo: string;
}

export interface ResultadoDaImportacao {
  palavras: PalavraImportada[];
  problemas: ProblemaNaLinha[];
  /** Linhas que repetiam uma palavra já presente no texto colado. */
  repetidas: ProblemaNaLinha[];
}

/**
 * Separadores aceitos, em ordem de prioridade.
 *
 * Tabulação primeiro porque é o que sai de planilha, e é o único que nunca
 * aparece dentro do próprio conteúdo. O ponto e vírgula vem antes da vírgula
 * porque "olá, tudo bem?" é uma tradução plausível, e quebrar essa linha na
 * vírgula produziria lixo em silêncio.
 */
/*
 * O travessão está aqui como DADO, não como texto de interface.
 *
 * É o separador que professor de idioma usa na lista dele, e reconhecê-lo é
 * requisito. A vírgula, de propósito, não entra: "olá, tudo bem?" é tradução
 * plausível, e quebrar ali produziria lixo em silêncio.
 */
const SEPARADORES = ['\t', ' \u2014 ', ' \u2013 ', ';', ' - ', '='] as const;

const TAMANHO_MAXIMO = 200;

function separar(linha: string): [string, string, string?] | null {
  for (const separador of SEPARADORES) {
    const indice = linha.indexOf(separador);
    if (indice === -1) continue;

    const frente = linha.slice(0, indice).trim();
    const resto = linha.slice(indice + separador.length).trim();
    if (!frente || !resto) return null;

    // O segundo separador, quando existe, marca a dica.
    for (const outro of SEPARADORES) {
      const segundo = resto.indexOf(outro);
      if (segundo !== -1) {
        const verso = resto.slice(0, segundo).trim();
        const dica = resto.slice(segundo + outro.length).trim();
        if (verso && dica) return [frente, verso, dica];
      }
    }

    return [frente, resto];
  }

  return null;
}

/**
 * Lê o texto colado e devolve o que deu certo, o que não deu e o que repetiu.
 *
 * Nunca lança e nunca descarta em silêncio: cada linha problemática volta com o
 * número e o motivo, para a tela mostrar exatamente onde consertar. Recusar o
 * lote inteiro por causa de uma linha faria o professor procurar a agulha
 * sozinho.
 */
export function lerLista(texto: string): ResultadoDaImportacao {
  const palavras: PalavraImportada[] = [];
  const problemas: ProblemaNaLinha[] = [];
  const repetidas: ProblemaNaLinha[] = [];

  const vistas = new Set<string>();

  texto.split(/\r?\n/).forEach((bruta, indice) => {
    const linha = indice + 1;
    const conteudo = bruta.trim();

    // Linha vazia é separador visual da lista de alguém, não erro.
    if (!conteudo) return;
    // Linha começada por # é comentário, quem organiza a lista por tema usa.
    if (conteudo.startsWith('#')) return;

    const partes = separar(conteudo);

    if (!partes) {
      problemas.push({
        linha,
        texto: conteudo,
        motivo: 'Não achei a separação entre a palavra e a tradução.',
      });
      return;
    }

    const [frente, verso, dica] = partes;

    if (frente.length > TAMANHO_MAXIMO || verso.length > TAMANHO_MAXIMO) {
      problemas.push({
        linha,
        texto: conteudo,
        motivo: `Passa de ${TAMANHO_MAXIMO} caracteres.`,
      });
      return;
    }

    const chave = frente.toLowerCase();

    if (vistas.has(chave)) {
      repetidas.push({
        linha,
        texto: conteudo,
        motivo: `"${frente}" já aparece antes na lista.`,
      });
      return;
    }

    vistas.add(chave);
    palavras.push({ frente, verso, dica: dica ?? null });
  });

  return { palavras, problemas, repetidas };
}

/**
 * Um exemplo para a tela mostrar antes de a pessoa colar qualquer coisa.
 *
 * Explicar o formato em prosa custa um parágrafo que ninguém lê. O exemplo
 * mostra os três separadores funcionando e a dica opcional.
 */
export const EXEMPLO_DE_LISTA = [
  'though \u2014 embora \u2014 parece "through", mas não é',
  'to gather; reunir, juntar',
  'awkward = constrangedor',
  '',
  '# as linhas em branco e as que começam com # são ignoradas',
  'to afford \u2014 ter condições de pagar',
].join('\n');
