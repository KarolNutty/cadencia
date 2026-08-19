import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Papel } from '@cadencia/contrato';

/**
 * Tokens.
 *
 * Duas decisões carregam a segurança daqui:
 *
 * **O algoritmo é fixado na verificação.** Um JWT declara no próprio cabeçalho
 * com que algoritmo foi assinado, e uma biblioteca que confia nessa declaração
 * aceita `alg: none`, token sem assinatura nenhuma. É uma falha antiga e que
 * ainda aparece em produção. Aqui a lista de algoritmos aceitos é constante.
 *
 * **Acesso e renovação usam segredos diferentes e carregam o próprio tipo.**
 * Com o mesmo segredo, um token de renovação vazado seria aceito como token de
 * acesso: a assinatura confere, e o servidor não teria como distinguir. O campo
 * `tipo` é a segunda barreira, para o caso de alguém reaproveitar segredo.
 */

const ALGORITMO = 'HS256';
const EMISSOR = 'cadencia';

/**
 * O tipo do token é um literal sem acento, porque viaja dentro do JWT. A
 * mensagem de erro é lida por gente, então usa o português de verdade.
 */
const ROTULO_DO_TIPO = {
  acesso: 'acesso',
  renovacao: 'renovação',
} as const;

/** Curto de propósito: é o que limita a janela de um token vazado. */
export const VIDA_DO_ACESSO_EM_SEGUNDOS = 15 * 60;
export const VIDA_DA_RENOVACAO_EM_SEGUNDOS = 30 * 24 * 60 * 60;

export interface DadosDoAcesso {
  usuarioId: string;
  papel: Papel;
}

export interface DadosDaRenovacao {
  usuarioId: string;
  /**
   * Identificador da família de tokens.
   *
   * Cada entrada cria uma família. Renovar emite um token novo na mesma
   * família e invalida o anterior. Se um token já usado reaparecer, a família
   * inteira cai, ver `deteccao-de-reuso` no serviço.
   */
  familiaId: string;
  /** Identificador deste token. É o que o banco marca como usado. */
  tokenId: string;
}

export class TokenInvalido extends Error {
  constructor(readonly motivo: string) {
    super(`Token inválido: ${motivo}`);
    this.name = 'TokenInvalido';
  }
}

interface Segredos {
  acesso: string;
  renovacao: string;
}

function chave(segredo: string): Uint8Array {
  return new TextEncoder().encode(segredo);
}

export function criarEmissor(segredos: Segredos) {
  const chaveAcesso = chave(segredos.acesso);
  const chaveRenovacao = chave(segredos.renovacao);

  async function assinar(
    conteudo: JWTPayload,
    chaveDeAssinatura: Uint8Array,
    vidaEmSegundos: number,
  ): Promise<string> {
    const agora = Math.floor(Date.now() / 1000);

    return new SignJWT(conteudo)
      .setProtectedHeader({ alg: ALGORITMO })
      .setIssuer(EMISSOR)
      .setIssuedAt(agora)
      .setExpirationTime(agora + vidaEmSegundos)
      .sign(chaveDeAssinatura);
  }

  async function conferir(
    token: string,
    chaveDeAssinatura: Uint8Array,
    tipoEsperado: 'acesso' | 'renovacao',
  ): Promise<JWTPayload> {
    let conteudo: JWTPayload;

    try {
      const resultado = await jwtVerify(token, chaveDeAssinatura, {
        // A lista fixa é o que impede `alg: none` e a troca de algoritmo.
        algorithms: [ALGORITMO],
        issuer: EMISSOR,
      });
      conteudo = resultado.payload;
    } catch (erro) {
      throw new TokenInvalido(erro instanceof Error ? erro.message : 'não pôde ser lido');
    }

    if (conteudo.tipo !== tipoEsperado) {
      throw new TokenInvalido(`esperava um token de ${ROTULO_DO_TIPO[tipoEsperado]}`);
    }

    return conteudo;
  }

  return {
    emitirAcesso: (dados: DadosDoAcesso) =>
      assinar(
        { sub: dados.usuarioId, papel: dados.papel, tipo: 'acesso' },
        chaveAcesso,
        VIDA_DO_ACESSO_EM_SEGUNDOS,
      ),

    emitirRenovacao: (dados: DadosDaRenovacao) =>
      assinar(
        {
          sub: dados.usuarioId,
          familiaId: dados.familiaId,
          tokenId: dados.tokenId,
          tipo: 'renovacao',
        },
        chaveRenovacao,
        VIDA_DA_RENOVACAO_EM_SEGUNDOS,
      ),

    async lerAcesso(token: string): Promise<DadosDoAcesso> {
      const conteudo = await conferir(token, chaveAcesso, 'acesso');

      if (typeof conteudo.sub !== 'string' || typeof conteudo.papel !== 'string') {
        throw new TokenInvalido('conteúdo incompleto');
      }

      return { usuarioId: conteudo.sub, papel: conteudo.papel as Papel };
    },

    async lerRenovacao(token: string): Promise<DadosDaRenovacao> {
      const conteudo = await conferir(token, chaveRenovacao, 'renovacao');

      if (
        typeof conteudo.sub !== 'string' ||
        typeof conteudo.familiaId !== 'string' ||
        typeof conteudo.tokenId !== 'string'
      ) {
        throw new TokenInvalido('conteúdo incompleto');
      }

      return {
        usuarioId: conteudo.sub,
        familiaId: conteudo.familiaId,
        tokenId: conteudo.tokenId,
      };
    },
  };
}

export type Emissor = ReturnType<typeof criarEmissor>;
