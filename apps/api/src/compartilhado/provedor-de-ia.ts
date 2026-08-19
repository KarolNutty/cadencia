import { ErroDaApi } from './erros';

/**
 * Erros de provedor de IA, traduzidos.
 *
 * "Algo deu errado" transforma todo problema em adivinhação: quem configurou a
 * chave errada, quem estourou a cota e quem está sem internet recebem a mesma
 * frase e não têm como saber qual é o caso.
 *
 * O que a mensagem NÃO pode conter é a chave, nem trecho dela. Provedores
 * costumam devolver a credencial dentro do corpo do erro, e repassar isso ao
 * cliente publicaria o segredo na tela.
 */
export async function erroDoProvedor(
  resposta: Response,
  chave?: string,
): Promise<ErroDaApi> {
  const detalhe = await lerDetalhe(resposta, chave);

  if (resposta.status === 400 || resposta.status === 401 || resposta.status === 403) {
    return new ErroDaApi(
      'servico_indisponivel',
      'A chave da IA foi recusada pelo provedor. Confira GEMINI_API_KEY no arquivo de ambiente.',
      [{ campo: 'provedor', motivo: detalhe }],
    );
  }

  if (resposta.status === 404) {
    return new ErroDaApi(
      'servico_indisponivel',
      'O modelo configurado não existe mais no provedor.',
      [{ campo: 'provedor', motivo: detalhe }],
    );
  }

  if (resposta.status === 429) {
    return new ErroDaApi(
      'servico_indisponivel',
      'A cota da IA acabou por enquanto. Tente daqui a pouco.',
      [{ campo: 'provedor', motivo: detalhe }],
    );
  }

  return new ErroDaApi('servico_indisponivel', 'A IA não respondeu agora. Tente de novo.', [
    { campo: 'provedor', motivo: detalhe },
  ]);
}

/**
 * Formatos de chave que o Google já emitiu.
 *
 * `AIza` é o formato antigo, e `AQ.` é o que o AI Studio passou a emitir. Os
 * dois estão aqui porque contas criadas em épocas diferentes carregam formatos
 * diferentes, e um filtro que só conhece um deles deixa o outro vazar.
 *
 * Reconhecer formato é frágil por natureza: o próximo formato não vai estar
 * nesta lista. Por isso o filtro seguinte não depende dela.
 */
const FORMATOS_DE_CHAVE = [/AIza[\w-]{20,}/g, /AQ\.[\w.-]{20,}/g];

/**
 * Lê o motivo que o provedor deu, sem carregar segredo junto.
 *
 * O corpo do erro do Google traz a requisição inteira em alguns casos, com a
 * chave dentro. São duas barreiras, porque uma só falha quando o formato muda:
 *
 * 1. Os formatos conhecidos são apagados.
 * 2. **A própria chave em uso é apagada**, qualquer que seja o formato dela.
 *
 * A segunda é a que continua valendo quando o Google inventar o próximo
 * prefixo, e é a que fez falta aqui: a lista de formatos ficou desatualizada e
 * eu só descobri porque a chave apareceu na tela de alguém.
 */
async function lerDetalhe(resposta: Response, chave?: string): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { error?: { message?: unknown } };
    const mensagem = corpo.error?.message;

    if (typeof mensagem !== 'string') return `resposta ${resposta.status}`;

    return esconderSegredos(mensagem, chave).slice(0, 200);
  } catch {
    return `resposta ${resposta.status}`;
  }
}

export function esconderSegredos(texto: string, chave?: string): string {
  let limpo = texto;

  // A chave em uso, primeiro: não depende de reconhecer formato nenhum.
  if (chave && chave.length >= 12) {
    limpo = limpo.split(chave).join('[chave]');
  }

  for (const formato of FORMATOS_DE_CHAVE) {
    limpo = limpo.replace(formato, '[chave]');
  }

  return limpo;
}
