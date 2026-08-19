import { z } from 'zod';

/**
 * Validação do ambiente, na partida.
 *
 * Segredo não mora no código, mas "não estar no código" não basta. O modo mais
 * comum de vazamento não é o segredo commitado: é o **segredo ausente** que vira
 * um valor padrão fraco. Alguém escreve `process.env.JWT_SECRET ?? 'dev'`, o
 * deploy sobe sem a variável, e a aplicação passa meses assinando token com a
 * palavra "dev" sem ninguém perceber.
 *
 * Aqui a aplicação **recusa a subir**. Falhar na partida é barulhento e
 * acontece uma vez; assinar token com segredo fraco é silencioso e acontece
 * sempre.
 */

/** Entropia mínima do segredo de assinatura. 32 bytes em base64. */
const TAMANHO_MINIMO_DO_SEGREDO = 32;

/**
 * Trechos que denunciam segredo copiado de exemplo.
 *
 * A checagem é por **substring**, e não por igualdade: o caso real não é alguém
 * usar exatamente `changeme`, é alguém pegar `changeme` e completar até passar
 * no tamanho mínimo. Comparação exata nunca pegaria isso, e, como todos estes
 * valores têm menos de 32 caracteres, a regra de tamanho já os barraria antes.
 * Seria uma verificação que nunca dispara.
 *
 * Os trechos são longos o suficiente para não acusar um segredo aleatório de
 * verdade por acaso.
 */
const TRECHOS_SUSPEITOS = [
  'changeme',
  'troque-este',
  'seu-segredo',
  'password',
  'senha123',
  '12345678',
  'segredo',
  'exemplo',
];

/**
 * Quantos caracteres distintos um segredo precisa ter.
 *
 * Pega `aaaa...` e `abababab...`, que passam no tamanho e não têm entropia
 * nenhuma. Não é medida de força, é piso de sanidade.
 */
const CARACTERES_DISTINTOS_MINIMOS = 12;

const segredoSchema = z
  .string()
  .min(
    TAMANHO_MINIMO_DO_SEGREDO,
    `O segredo precisa de ao menos ${TAMANHO_MINIMO_DO_SEGREDO} caracteres. Gere com: openssl rand -base64 48`,
  )
  .refine((valor) => {
    const minusculo = valor.toLowerCase();
    return !TRECHOS_SUSPEITOS.some((trecho) => minusculo.includes(trecho));
  }, 'Este segredo parece copiado de um exemplo. Gere um novo com: openssl rand -base64 48')
  .refine(
    (valor) => new Set(valor).size >= CARACTERES_DISTINTOS_MINIMOS,
    `O segredo tem repetição demais. Use ao menos ${CARACTERES_DISTINTOS_MINIMOS} caracteres distintos.`,
  );

const ambienteSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().int().min(1).max(65_535).default(3333),

  /**
   * Chave do Gemini, para a correção de redação.
   *
   * Opcional de propósito: sem ela, a correção usa o provedor simulado e o
   * projeto roda por completo. Exigir a chave transformaria "clonar e rodar" em
   * "clonar, criar conta no Google, gerar chave, e então rodar", e a maioria
   * das pessoas desiste no segundo passo.
   */
  GEMINI_API_KEY: z.string().min(20).optional(),

  /**
   * O modelo do Gemini.
   *
   * Configurável porque provedores aposentam modelo sem aviso, e quando isso
   * acontece a correção não deveria exigir mexer no código, abrir pull request
   * e publicar de novo. O padrão é o mais recente conhecido; trocar é editar
   * uma linha do ambiente.
   */
  GEMINI_MODELO: z.string().min(3).default('gemini-3.6-flash'),

  /** String de conexão completa. Nunca usuário e senha em variáveis separadas. */
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL precisa ser uma URL de conexão válida.')
    .refine(
      (valor) => valor.startsWith('postgres://') || valor.startsWith('postgresql://'),
      'Só Postgres é suportado.',
    ),

  /** Assina o token de acesso, de vida curta. */
  SEGREDO_ACESSO: segredoSchema,
  /**
   * Assina o token de renovação. **Precisa ser diferente do de acesso.**
   *
   * Com o mesmo segredo nos dois, um token de renovação vazado pode ser
   * apresentado como token de acesso, e o servidor aceita: a assinatura confere.
   */
  SEGREDO_RENOVACAO: segredoSchema,

  /** Origens autorizadas a chamar a API, separadas por vírgula. */
  ORIGENS_PERMITIDAS: z
    .string()
    .default('')
    .transform((valor) =>
      valor
        .split(',')
        .map((origem) => origem.trim())
        .filter(Boolean),
    ),
});

export type Ambiente = z.infer<typeof ambienteSchema> & { producao: boolean };

export class AmbienteInvalido extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(
      `A aplicação não pode subir com este ambiente:\n${problemas.map((p) => `  · ${p}`).join('\n')}`,
    );
    this.name = 'AmbienteInvalido';
  }
}

/**
 * Lê e valida o ambiente. Lança `AmbienteInvalido` com a lista completa de
 * problemas, e não só o primeiro, para quem está configurando resolver tudo
 * de uma vez em vez de descobrir um por execução.
 */
export function carregarAmbiente(fonte: NodeJS.ProcessEnv = process.env): Ambiente {
  const resultado = ambienteSchema.safeParse(fonte);

  if (!resultado.success) {
    throw new AmbienteInvalido(
      resultado.error.issues.map(
        (problema) => `${problema.path.join('.') || '(raiz)'}: ${problema.message}`,
      ),
    );
  }

  const dados = resultado.data;

  if (dados.SEGREDO_ACESSO === dados.SEGREDO_RENOVACAO) {
    throw new AmbienteInvalido([
      'SEGREDO_ACESSO e SEGREDO_RENOVACAO precisam ser diferentes. Com o mesmo valor, um token de renovação vazado é aceito como token de acesso.',
    ]);
  }

  const producao = dados.NODE_ENV === 'production';

  if (producao && dados.ORIGENS_PERMITIDAS.length === 0) {
    throw new AmbienteInvalido([
      'ORIGENS_PERMITIDAS é obrigatório em produção. Sem a lista, o CORS ficaria aberto para qualquer site.',
    ]);
  }

  if (producao && dados.ORIGENS_PERMITIDAS.some((origem) => origem.startsWith('http://'))) {
    throw new AmbienteInvalido([
      'Origem sem HTTPS em produção. O cookie de renovação vai com Secure e não seria enviado.',
    ]);
  }

  return { ...dados, producao };
}
