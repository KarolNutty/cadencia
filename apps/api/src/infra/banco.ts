import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Conexão com o Postgres.
 *
 * A biblioteca é a `postgres` (tagged template) e não um construtor de queries.
 * O motivo é de segurança: aqui
 *
 *   sql`SELECT * FROM usuarios WHERE id = ${id}`
 *
 * **não é interpolação de texto.** O valor vira parâmetro, sempre, e não existe
 * jeito acidental de concatenar, para montar SQL dinâmico é preciso pedir
 * explicitamente. Com string comum, um `${}` distraído numa cláusula WHERE é
 * injeção, e ele passa despercebido em revisão porque parece igual ao código
 * ao lado.
 */
export type Banco = postgres.Sql;

/**
 * Quem executa uma consulta: a conexão comum ou uma transação em andamento.
 *
 * Existe para que uma função possa ser chamada dentro ou fora de transação sem
 * duplicação. E, principalmente, para tornar impossível o engano de usar a
 * conexão de fora enquanto uma transação está aberta, que, com pool pequeno,
 * trava esperando a conexão que ela mesma segura.
 */
export type Executor = postgres.Sql | postgres.TransactionSql;

export interface OpcoesDeConexao {
  url: string;
  /** Teto do pool. Em teste, 1 evita concorrência entre casos. */
  maximoDeConexoes?: number;
}

export function conectar({ url, maximoDeConexoes = 10 }: OpcoesDeConexao): Banco {
  return postgres(url, {
    max: maximoDeConexoes,
    // Sem isto, a aplicação fica pendurada esperando um banco que não responde
    // em vez de falhar e deixar o orquestrador reiniciá-la.
    connect_timeout: 10,
    idle_timeout: 20,
    // O log padrão imprime a query com os valores já substituídos, e isso
    // colocaria hash de senha e e-mail no stdout do servidor.
    onnotice: () => {},
    transform: { undefined: null },
  });
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_DE_MIGRACOES = join(AQUI, 'migracoes');

/**
 * Aplica as migrações pendentes, em ordem, uma transação por arquivo.
 *
 * Uma transação por migração, e não uma para todas: se a terceira falhar, as
 * duas primeiras continuam aplicadas e registradas. Reverter tudo faria a
 * próxima execução tentar de novo desde o começo, e migração que roda duas
 * vezes costuma quebrar de um jeito pior que a falha original.
 */
export async function migrar(
  sql: Banco,
  aoAplicar?: (nome: string) => void,
): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS migracoes (
      nome        TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const arquivos = (await readdir(PASTA_DE_MIGRACOES))
    .filter((nome) => nome.endsWith('.sql'))
    // Ordem alfabética funciona porque os arquivos são numerados com zero à
    // esquerda: sem isso, "10_" viria antes de "2_".
    .sort();

  const jaAplicadas = new Set(
    (await sql<{ nome: string }[]>`SELECT nome FROM migracoes`).map((linha) => linha.nome),
  );

  const aplicadas: string[] = [];

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;

    const conteudo = await readFile(join(PASTA_DE_MIGRACOES, arquivo), 'utf8');

    await sql.begin(async (transacao) => {
      await transacao.unsafe(conteudo);
      await transacao`INSERT INTO migracoes ${transacao({ nome: arquivo })}`;
    });

    aplicadas.push(arquivo);
    aoAplicar?.(arquivo);
  }

  return aplicadas;
}

/**
 * Apaga tudo e reaplica. **Só o banco de teste.**
 *
 * A checagem no nome não é paranoia: um `DATABASE_URL` apontando para produção
 * numa variável de ambiente esquecida é como se apaga um banco de verdade.
 */
export async function recriarParaTeste(sql: Banco, url: string): Promise<void> {
  if (!url.includes('teste')) {
    throw new Error(
      `Recusando recriar um banco cujo nome não contém "teste". URL: ${url.replace(/:[^:@]+@/, ':***@')}`,
    );
  }

  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrar(sql);
}
