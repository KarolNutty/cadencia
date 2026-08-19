import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Põe o conteúdo do `.env` dentro de `process.env`.
 *
 * O Node **não faz isso sozinho**, `process.env` só tem o que o sistema
 * operacional passou. Sem esta chamada, `carregarAmbiente` encontra tudo vazio
 * e a aplicação recusa subir mesmo com o arquivo preenchido do lado.
 *
 * Usa `process.loadEnvFile`, que existe no Node desde a 20.12 e dispensa
 * dependência: o `dotenv` resolve exatamente isto e nada mais.
 */

/**
 * Procura o arquivo subindo a partir do diretório atual.
 *
 * Num monorepo, `npm run migrar -w @cadencia/api` executa com o diretório de
 * trabalho em `apps/api`, e o `.env` fica na raiz. Procurar só em `./` daria
 * "arquivo não encontrado" com o arquivo existindo dois níveis acima, e o erro
 * pareceria problema de configuração.
 */
function procurarAcima(nome: string, partida: string): string | null {
  let atual = resolve(partida);
  let acima = dirname(atual);

  // Para quando `dirname` devolve o próprio caminho, que é como a raiz do
  // disco se anuncia, em qualquer sistema operacional.
  while (atual !== acima) {
    const candidato = join(atual, nome);
    if (existsSync(candidato)) return candidato;

    atual = acima;
    acima = dirname(atual);
  }

  // A própria raiz ainda não foi olhada.
  const naRaiz = join(atual, nome);
  return existsSync(naRaiz) ? naRaiz : null;
}

export interface OpcoesDoArquivo {
  /** Nome do arquivo. Em teste, `.env.teste`. */
  nome?: string;
  /** De onde começar a procurar. */
  partida?: string;
  /** Falha se o arquivo não existir. Padrão: seguir em silêncio. */
  obrigatorio?: boolean;
}

/**
 * Devolve o caminho carregado, ou `null` quando não achou.
 *
 * Não achar não é erro por padrão: em produção as variáveis vêm do orquestrador
 * e arquivo nenhum deveria existir. Quem valida se está tudo lá é o
 * `carregarAmbiente`, e ele valida do mesmo jeito, venha de onde vier.
 */
export function carregarArquivoDeAmbiente(opcoes: OpcoesDoArquivo = {}): string | null {
  const { nome = '.env', partida = process.cwd(), obrigatorio = false } = opcoes;

  const caminho = procurarAcima(nome, partida);

  if (caminho === null) {
    if (obrigatorio) {
      throw new Error(`Arquivo ${nome} não encontrado a partir de ${partida}.`);
    }
    return null;
  }

  // Variável já definida no ambiente tem precedência sobre o arquivo: é assim
  // que se sobrescreve um valor pontualmente sem editar o .env.
  process.loadEnvFile(caminho);

  return caminho;
}
