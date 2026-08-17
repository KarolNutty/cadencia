import { z } from 'zod';
import { diaDeEstudoSchema, identificadorSchema } from './comuns';
import {
  agendamentoSchema,
  cartaDaSessaoSchema,
  cartaoSchema,
  revisaoSchema,
  turmaSchema,
  usuarioSchema,
} from './modelos';

/** ---------------------------------------------------------------- entrar */

export const entrarEntradaSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres.'),
});

export const entrarSaidaSchema = z.object({
  usuario: usuarioSchema,
  acesso: z.string(),
  /** Expiração em segundos, para o cliente renovar antes de falhar. */
  expiraEm: z.number().int().positive(),
  /**
   * Só vai preenchido para o app.
   *
   * No navegador o token de renovação viaja em cookie `httpOnly`, e por isso
   * **não** aparece no corpo: devolvê-lo ali permitiria que um script injetado
   * o lesse da resposta. O app não tem cookie, então recebe no corpo e guarda
   * no armazenamento seguro do sistema.
   */
  renovacao: z.string().optional(),
});

/**
 * Qual cliente está falando com a API.
 *
 * Determina onde o token de renovação é entregue. É explícito de propósito:
 * adivinhar pelo `User-Agent` erraria, e errar aqui significa ou o app sem
 * token, ou o navegador com um token legível por script.
 */
export const plataformaSchema = z.enum(['web', 'mobile']);
export type Plataforma = z.infer<typeof plataformaSchema>;

/** ---------------------------------------------------------------- turmas */

/**
 * As turmas de quem está pedindo.
 *
 * Não recebe id de usuário: o servidor usa o do token. Aceitar um id aqui seria
 * abrir a porta para pedir a lista de outra pessoa.
 */
export const minhasTurmasSaidaSchema = z.object({
  turmas: z.array(turmaSchema),
});

/** -------------------------------------------------- sessão de estudo */

export const sessaoEntradaSchema = z.object({
  turmaId: identificadorSchema,
  dia: diaDeEstudoSchema,
  limite: z.coerce.number().int().min(1).max(60).optional(),
});

export const sessaoSaidaSchema = z.object({
  cartas: z.array(cartaDaSessaoSchema),
  resumo: z.object({
    vencendoHoje: z.number().int().min(0),
    sinalizadas: z.number().int().min(0),
    emDia: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  sequenciaDeDias: z.number().int().min(0),
});

/** -------------------------------------------------- enviar revisões */

/**
 * Um lote, e não uma revisão por requisição.
 *
 * O aluno avalia trinta cartas em três minutos. Trinta requisições no metrô,
 * com sinal ruim, é o caminho para metade se perder. O lote sobe quando a
 * sessão termina — e, se falhar, ele é reenviado inteiro.
 */
export const enviarRevisoesEntradaSchema = z.object({
  turmaId: identificadorSchema,
  revisoes: z.array(revisaoSchema).min(1).max(200),
  /**
   * Identificador do lote, gerado pelo app.
   *
   * Se a resposta se perder na volta, o app reenvia o mesmo lote e o servidor
   * reconhece que já processou. Sem isso, uma conexão instável faria o aluno
   * revisar a mesma carta duas vezes no histórico.
   */
  loteId: identificadorSchema,
});

export const enviarRevisoesSaidaSchema = z.object({
  /** O agendamento recalculado pelo servidor, que é a autoridade. */
  agendamentos: z.array(
    z.object({ cartaoId: identificadorSchema, agendamento: agendamentoSchema }),
  ),
  jaProcessado: z.boolean(),
});

/** ------------------------------------------------ painel do professor */

export const turmaDoProfessorSchema = turmaSchema.extend({
  alunos: z.array(
    z.object({
      usuario: usuarioSchema,
      ultimoEstudo: diaDeEstudoSchema.nullable(),
      sequenciaDeDias: z.number().int().min(0),
      vencendoHoje: z.number().int().min(0),
      sinalizadas: z.number().int().min(0),
    }),
  ),
});

export const cartasSinalizadasSaidaSchema = z.object({
  aluno: usuarioSchema,
  cartas: z.array(
    z.object({
      cartao: cartaoSchema,
      lapsos: z.number().int().min(0),
      ultimaRevisao: diaDeEstudoSchema.nullable(),
    }),
  ),
});

/** ---------------------------------------------------------------- erros */

export const codigoDeErroSchema = z.enum([
  'nao_autenticado',
  'sem_permissao',
  'nao_encontrado',
  'entrada_invalida',
  'credenciais_invalidas',
  'conflito',
]);

export const erroSchema = z.object({
  codigo: codigoDeErroSchema,
  mensagem: z.string(),
  /** Preenchido só em `entrada_invalida`: o campo e o motivo. */
  campos: z.array(z.object({ campo: z.string(), motivo: z.string() })).optional(),
});

export type MinhasTurmasSaida = z.infer<typeof minhasTurmasSaidaSchema>;
export type EntrarEntrada = z.infer<typeof entrarEntradaSchema>;
export type EntrarSaida = z.infer<typeof entrarSaidaSchema>;
export type SessaoEntrada = z.infer<typeof sessaoEntradaSchema>;
export type SessaoSaida = z.infer<typeof sessaoSaidaSchema>;
export type EnviarRevisoesEntrada = z.infer<typeof enviarRevisoesEntradaSchema>;
export type EnviarRevisoesSaida = z.infer<typeof enviarRevisoesSaidaSchema>;
export type TurmaDoProfessor = z.infer<typeof turmaDoProfessorSchema>;
export type CartasSinalizadasSaida = z.infer<typeof cartasSinalizadasSaidaSchema>;
export type CodigoDeErro = z.infer<typeof codigoDeErroSchema>;
export type Erro = z.infer<typeof erroSchema>;
