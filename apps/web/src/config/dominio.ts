import type { Nivel } from '@cadencia/contrato';

/**
 * Valores fixos do domínio, num lugar só.
 *
 * Espalhados pelas telas, viram três listas de níveis que divergem na primeira
 * vez que alguém acrescenta um — e a divergência só aparece quando o professor
 * cadastra um baralho que some do filtro.
 */

export const NIVEIS: readonly Nivel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const IDIOMAS = [
  'inglês',
  'espanhol',
  'francês',
  'alemão',
  'italiano',
  'japonês',
] as const;

/** Onde a API está. Em produção vem da variável de ambiente da compilação. */
export const URL_DA_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

/** O fuso do navegador: é onde a pessoa está que define quando o dia vira. */
export function fusoDoNavegador(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
