import type { PontuacaoSaida, RankingSaida } from '@cadencia/contrato';
import type { DiaDeEstudo } from '@cadencia/dominio';
import type { Cliente } from '@cadencia/cliente-api';

export const buscarPontuacao = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<PontuacaoSaida>(
    `/pontuacao?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );

export const buscarRanking = (cliente: Cliente, turmaId: string, dia: DiaDeEstudo) =>
  cliente.chamar<RankingSaida>(
    `/pontuacao/ranking?turmaId=${encodeURIComponent(turmaId)}&dia=${dia}`,
  );

/** ------------------------------------------------------------ redação */
