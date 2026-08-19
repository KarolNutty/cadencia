import { z } from 'zod';
import {
  avaliacaoSchema,
  diaDeEstudoSchema,
  fusoSchema,
  identificadorSchema,
  papelSchema,
} from './comuns';

export const usuarioSchema = z.object({
  id: identificadorSchema,
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  papel: papelSchema,
  fuso: fusoSchema,
});

export const turmaSchema = z.object({
  id: identificadorSchema,
  nome: z.string().min(2).max(120),
  idioma: z.string().min(2).max(40),
});

export const cartaoSchema = z.object({
  id: identificadorSchema,
  frente: z.string().min(1).max(200),
  verso: z.string().min(1).max(400),
  dica: z.string().max(200).nullable(),
});

export const agendamentoSchema = z.object({
  intervaloDias: z.number().int().min(0),
  facilidade: z.number().min(1).max(3),
  repeticoes: z.number().int().min(0),
  lapsos: z.number().int().min(0),
  venceEm: diaDeEstudoSchema,
  sinalizado: z.boolean(),
});

/** Uma carta pronta para estudar: o conteúdo e o estado daquele aluno nela. */
export const cartaDaSessaoSchema = z.object({
  cartao: cartaoSchema,
  agendamento: agendamentoSchema,
});

export const revisaoSchema = z.object({
  cartaoId: identificadorSchema,
  avaliacao: avaliacaoSchema,
  /**
   * O dia é informado pelo APP, não calculado pelo servidor.
   *
   * Só o app sabe em que fuso o aluno está e se já passou das 4h da manhã.
   * Deixar o servidor decidir faria quem estuda à 1h aparecer como tendo
   * estudado no dia seguinte, e perder a sequência por estar estudando.
   */
  dia: diaDeEstudoSchema,
});

export type Usuario = z.infer<typeof usuarioSchema>;
export type Turma = z.infer<typeof turmaSchema>;
export type Cartao = z.infer<typeof cartaoSchema>;
export type Agendamento = z.infer<typeof agendamentoSchema>;
export type CartaDaSessao = z.infer<typeof cartaDaSessaoSchema>;
export type Revisao = z.infer<typeof revisaoSchema>;
