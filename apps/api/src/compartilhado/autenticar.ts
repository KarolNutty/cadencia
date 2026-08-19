import type { FastifyRequest } from 'fastify';
import type { Papel } from '@cadencia/contrato';
import type { Emissor } from '../funcionalidades/autenticacao/tokens';
import { naoAutenticado, semPermissao } from './erros';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo `exigirEntrada`. Ausente significa rota pública. */
    usuario?: { id: string; papel: Papel };
  }

  interface FastifyInstance {
    /** Registrado em `servidor.ts`, para as rotas usarem como `preHandler`. */
    exigirEntrada: (requisicao: FastifyRequest) => Promise<void>;
  }
}

function lerTokenDoCabecalho(cabecalho: string | undefined): string {
  if (!cabecalho?.startsWith('Bearer ')) {
    throw naoAutenticado();
  }

  const token = cabecalho.slice('Bearer '.length).trim();
  if (!token) throw naoAutenticado();

  return token;
}

/**
 * Exige um token de acesso válido.
 *
 * O papel sai **do token**, nunca do corpo ou da query. Aceitar o papel vindo
 * do cliente seria deixar qualquer aluno se declarar professor.
 */
export function criarExigirEntrada(emissor: Emissor) {
  return async function exigirEntrada(requisicao: FastifyRequest): Promise<void> {
    const token = lerTokenDoCabecalho(requisicao.headers.authorization);

    try {
      requisicao.usuario = await (async () => {
        const dados = await emissor.lerAcesso(token);
        return { id: dados.usuarioId, papel: dados.papel };
      })();
    } catch {
      // A causa exata não vai para a resposta: dizer "expirado" e "assinatura
      // inválida" separadamente ajuda quem está testando token forjado.
      throw naoAutenticado();
    }
  };
}

/**
 * Exige um papel específico.
 *
 * Responde 403 porque não revela nada sobre um recurso: é o próprio perfil que
 * não permite a ação. Já o acesso a um recurso alheio responde 404, ver
 * `naoEncontrado` em `erros.ts`.
 */
export function exigirPapel(papel: Papel) {
  return async function verificar(requisicao: FastifyRequest): Promise<void> {
    if (!requisicao.usuario) throw naoAutenticado();
    if (requisicao.usuario.papel !== papel) throw semPermissao();
  };
}

/** Atalho para rotas que precisam do usuário e não aceitam ausência. */
export function usuarioDaRequisicao(requisicao: FastifyRequest): {
  id: string;
  papel: Papel;
} {
  if (!requisicao.usuario) throw naoAutenticado();
  return requisicao.usuario;
}
