import { z } from 'zod';

/**
 * Os tipos base que todo o resto reaproveita.
 *
 * Um schema zod serve para três coisas ao mesmo tempo: validar a entrada na
 * API, tipar a resposta no cliente e gerar o tipo TypeScript. Uma fonte, três
 * usos, e, principalmente, sem o tipo poder divergir da validação, que é o
 * jeito mais comum de um contrato apodrecer.
 */

export const identificadorSchema = z.string().uuid({ message: 'Identificador inválido.' });

/**
 * O mesmo formato usado pelo domínio: data de negócio, não instante.
 *
 * O regex sozinho não basta, `2026-02-31` passaria nele. O `refine` confere
 * contra o calendário de verdade.
 */
export const diaDeEstudoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
  .refine((valor) => {
    // O `Number.isNaN` vem antes do `toISOString` de propósito: em data
    // inválida o `toISOString` LANÇA em vez de devolver algo comparável, e uma
    // exceção aqui viraria 500 na API, o servidor quebrando por causa de
    // entrada malformada, que é exatamente o que o validador existe para evitar.
    //
    // Pior ainda: o zod roda o refine mesmo quando o regex já falhou, então
    // qualquer texto chega até aqui.
    const data = new Date(`${valor}T00:00:00.000Z`);
    if (Number.isNaN(data.getTime())) return false;

    return data.toISOString().slice(0, 10) === valor;
  }, 'Data inexistente no calendário.');

/**
 * Fuso IANA, validado contra a tabela do próprio ambiente.
 *
 * Aceitar qualquer texto aqui faria o servidor guardar `"Brasilia"` e quebrar
 * meses depois, na primeira vez que alguém calculasse o dia de estudo daquele
 * aluno. Erro de cadastro é barato; erro de cálculo silencioso, não.
 */
export const fusoSchema = z.string().refine((valor) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}, 'Fuso horário desconhecido.');

export const papelSchema = z.enum(['aluno', 'professor']);
export const avaliacaoSchema = z.enum(['errei', 'dificil', 'bom', 'facil']);

export type Identificador = z.infer<typeof identificadorSchema>;
export type Papel = z.infer<typeof papelSchema>;
export type Avaliacao = z.infer<typeof avaliacaoSchema>;
