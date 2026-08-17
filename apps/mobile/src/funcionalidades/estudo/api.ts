import { randomUUID } from 'expo-crypto';
import type {
  EnviarRevisoesSaida,
  MinhasTurmasSaida,
  SessaoSaida,
} from '@cadencia/contrato';
import type { Avaliacao, DiaDeEstudo } from '@cadencia/dominio';
import type { Cliente } from '@cadencia/cliente-api';

export interface RevisaoParaEnviar {
  cartaoId: string;
  avaliacao: Avaliacao;
  dia: DiaDeEstudo;
}

/**
 * As turmas de quem está logado.
 *
 * A rota não recebe id de usuário: o servidor usa o do token. Por isso o app
 * também não tem como pedir a lista de outra pessoa, nem por engano.
 */
export function buscarTurmas(cliente: Cliente): Promise<MinhasTurmasSaida> {
  return cliente.chamar<MinhasTurmasSaida>('/turmas');
}

export function buscarSessao(
  cliente: Cliente,
  turmaId: string,
  dia: DiaDeEstudo,
): Promise<SessaoSaida> {
  return cliente.chamar<SessaoSaida>(
    `/estudo/sessao?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );
}

/**
 * Sobe o lote inteiro de uma vez, ao fim da sessão.
 *
 * Trinta requisições no metrô, com sinal ruim, é o caminho para metade se
 * perder. E o `loteId` gerado aqui torna o reenvio seguro: se a resposta se
 * perder na volta, a segunda tentativa manda o mesmo identificador e o servidor
 * reconhece que já processou, em vez de duplicar o histórico.
 *
 * O identificador é gerado **uma vez por sessão**, e não a cada tentativa —
 * senão cada reenvio pareceria um lote novo e a proteção não valeria nada.
 */
export function enviarRevisoes(
  cliente: Cliente,
  turmaId: string,
  loteId: string,
  revisoes: readonly RevisaoParaEnviar[],
): Promise<EnviarRevisoesSaida> {
  return cliente.chamar<EnviarRevisoesSaida>('/estudo/revisoes', {
    metodo: 'POST',
    corpo: { turmaId, loteId, revisoes },
  });
}

export function novoLoteId(): string {
  return randomUUID();
}
