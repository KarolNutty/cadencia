import { z } from 'zod';
import { identificadorSchema } from '@cadencia/contrato';
import type { FastifyRequest } from 'fastify';

/**
 * Identificadores vindos da URL.
 *
 * Sem validar, um `/turmas/nao-e-uuid/alunos` chega ao Postgres e volta como
 * erro de sintaxe de tipo. O cliente recebe **500**, como se o servidor
 * tivesse quebrado, quando a entrada é que estava errada. E o log enche de
 * "erro não tratado" para uma requisição que nunca teve chance de funcionar.
 *
 * Validar antes também poupa uma ida ao banco por requisição malformada, que é
 * o caminho mais barato de derrubar um serviço.
 */
export function idsDaRota<C extends readonly string[]>(
  requisicao: FastifyRequest,
  ...nomes: C
): Record<C[number], string> {
  const schema = z.object(
    Object.fromEntries(nomes.map((nome) => [nome, identificadorSchema])),
  );

  return schema.parse(requisicao.params) as Record<C[number], string>;
}
