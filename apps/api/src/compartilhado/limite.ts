import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

/**
 * Chaves de limite de requisição.
 *
 * Existe como módulo, e não como decisão repetida em cada rota, porque a
 * escolha errada já foi feita duas vezes neste projeto: uma no login e outra na
 * redação. Corrigir uma ocorrência não cria a regra, e a terceira rota com
 * limite repetiria o erro de novo.
 */

/**
 * Limite por conta.
 *
 * O que se quer conter é o consumo de uma pessoa: chamada paga a serviço
 * externo, envio repetido, laço no console. Por endereço, uma escola inteira
 * atrás do mesmo IP divide a mesma cota, e a última pessoa a usar é bloqueada
 * pelos colegas.
 *
 * Sem token, cai para o endereço: é o melhor que dá para fazer quando não há
 * conta para responsabilizar.
 *
 * O token é resumido antes de virar chave. Guardar credencial em memória, mesmo
 * como índice de um mapa, é guardar credencial.
 */
export function porConta(requisicao: FastifyRequest): string {
  const autorizacao = requisicao.headers.authorization;
  if (!autorizacao) return requisicao.ip;

  return createHash('sha256').update(autorizacao).digest('hex').slice(0, 32);
}

/**
 * Limite por endereço e conta informada.
 *
 * Para rotas **públicas** onde a conta ainda não existe na requisição, como o
 * login: ali a chave junta o IP e o e-mail tentado, para que cinco tentativas
 * erradas numa conta não bloqueiem as outras do mesmo lugar.
 */
export function porEnderecoEConta(campo: string) {
  return (requisicao: FastifyRequest): string => {
    const corpo = requisicao.body as Record<string, unknown> | undefined;
    const valor = typeof corpo?.[campo] === 'string' ? String(corpo[campo]) : '';

    return `${requisicao.ip}:${valor.trim().toLowerCase()}`;
  };
}
