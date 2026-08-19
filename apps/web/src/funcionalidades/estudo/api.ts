import type { EnviarRevisoesSaida, SessaoSaida } from '@cadencia/contrato';
import type { Avaliacao, DiaDeEstudo } from '@cadencia/dominio';
import type { Cliente } from '@cadencia/cliente-api';

/** ------------------------------------------------------------- estudo */

export const buscarSessao = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<SessaoSaida>(
    `/estudo/sessao?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );

/**
 * Sobe o lote inteiro ao fim da sessão.
 *
 * Vinte requisições numa conexão instável é o caminho para metade se perder. O
 * `loteId` torna o reenvio seguro: se a resposta se perder na volta, a segunda
 * tentativa manda o mesmo identificador e o servidor reconhece que já
 * processou, em vez de duplicar o histórico.
 */
export const enviarRevisoes = (
  cliente: Cliente,
  turmaId: string,
  loteId: string,
  revisoes: readonly { cartaoId: string; avaliacao: Avaliacao; dia: DiaDeEstudo }[],
) =>
  cliente.chamar<EnviarRevisoesSaida>('/estudo/revisoes', {
    metodo: 'POST',
    corpo: { turmaId, loteId, revisoes },
  });

/** `crypto.randomUUID` é padrão do navegador desde 2021; não precisa de pacote. */
export const novoLoteId = (): string => crypto.randomUUID();
