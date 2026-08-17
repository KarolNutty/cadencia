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

/** ------------------------------------------------------------- gestão */

export const nivelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export const criarTurmaEntradaSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à turma.').max(120),
  idioma: z.string().trim().min(2).max(40),
});

/**
 * Matrícula por e-mail, e não por id.
 *
 * O professor conhece o e-mail do aluno; o id ele nunca viu. Pedir id obrigaria
 * a uma tela de busca antes da matrícula — e a pessoa pode nem ter conta ainda,
 * caso em que o convite fica pendente até ela entrar.
 */
export const matricularEntradaSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
});

export const matricularSaidaSchema = z.object({
  situacao: z.enum(['matriculado', 'convidado', 'ja_estava']),
  aluno: usuarioSchema.nullable(),
});

export const criarBaralhoEntradaSchema = z.object({
  titulo: z.string().trim().min(2, 'Dê um título ao baralho.').max(120),
  nivel: nivelSchema.nullable().optional(),
});

/** O texto colado inteiro. Quem entende o formato é o servidor. */
export const importarPalavrasEntradaSchema = z.object({
  texto: z.string().min(1, 'Cole a lista de palavras.').max(100_000),
});

export const importarPalavrasSaidaSchema = z.object({
  criadas: z.number().int().min(0),
  /** Já existiam no baralho: ignoradas, não duplicadas. */
  jaExistiam: z.number().int().min(0),
  problemas: z.array(
    z.object({ linha: z.number().int(), texto: z.string(), motivo: z.string() }),
  ),
  repetidas: z.array(
    z.object({ linha: z.number().int(), texto: z.string(), motivo: z.string() }),
  ),
});

export const baralhoComContagemSchema = z.object({
  id: identificadorSchema,
  titulo: z.string(),
  nivel: nivelSchema.nullable(),
  palavras: z.number().int().min(0),
});

export const baralhosSaidaSchema = z.object({
  baralhos: z.array(baralhoComContagemSchema),
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

/**
 * As palavras travadas da turma inteira, agrupadas por palavra.
 *
 * É a virada de perspectiva do painel: o professor prepara **uma aula**, não
 * trinta atendimentos individuais. Agrupar por aluno responde "como vai fulano";
 * agrupar por palavra responde "o que eu ensino na segunda-feira".
 */
export const palavrasTravadasSaidaSchema = z.object({
  palavras: z.array(
    z.object({
      cartao: cartaoSchema,
      /** Quantos alunos travaram nesta palavra. */
      alunos: z.number().int().min(1),
      /** Soma dos erros de todos eles. */
      errosTotais: z.number().int().min(0),
      nomes: z.array(z.string()),
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
export type Nivel = z.infer<typeof nivelSchema>;
export type CriarTurmaEntrada = z.infer<typeof criarTurmaEntradaSchema>;
export type MatricularEntrada = z.infer<typeof matricularEntradaSchema>;
export type MatricularSaida = z.infer<typeof matricularSaidaSchema>;
export type CriarBaralhoEntrada = z.infer<typeof criarBaralhoEntradaSchema>;
export type ImportarPalavrasEntrada = z.infer<typeof importarPalavrasEntradaSchema>;
export type ImportarPalavrasSaida = z.infer<typeof importarPalavrasSaidaSchema>;
export type BaralhoComContagem = z.infer<typeof baralhoComContagemSchema>;
export type BaralhosSaida = z.infer<typeof baralhosSaidaSchema>;
export type EntrarEntrada = z.infer<typeof entrarEntradaSchema>;
export type EntrarSaida = z.infer<typeof entrarSaidaSchema>;
export type SessaoEntrada = z.infer<typeof sessaoEntradaSchema>;
export type SessaoSaida = z.infer<typeof sessaoSaidaSchema>;
export type EnviarRevisoesEntrada = z.infer<typeof enviarRevisoesEntradaSchema>;
export type EnviarRevisoesSaida = z.infer<typeof enviarRevisoesSaidaSchema>;
export type TurmaDoProfessor = z.infer<typeof turmaDoProfessorSchema>;
export type CartasSinalizadasSaida = z.infer<typeof cartasSinalizadasSaidaSchema>;
export type PalavrasTravadasSaida = z.infer<typeof palavrasTravadasSaidaSchema>;
export type CodigoDeErro = z.infer<typeof codigoDeErroSchema>;
export type Erro = z.infer<typeof erroSchema>;
