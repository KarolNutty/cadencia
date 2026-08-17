import { carregarAmbiente, carregarArquivoDeAmbiente } from '@cadencia/config';
import { conectar, migrar } from './banco';

/**
 * Aplica as migrações pendentes.
 *
 *   npm run migrar
 */
async function principal(): Promise<void> {
  // Precisa vir antes: o Node não carrega o .env sozinho, e sem isto o
  // ambiente chega vazio mesmo com o arquivo preenchido na raiz.
  const arquivo = carregarArquivoDeAmbiente();
  if (arquivo) console.warn(`ambiente lido de ${arquivo}`);

  const ambiente = carregarAmbiente();
  const sql = conectar({ url: ambiente.DATABASE_URL, maximoDeConexoes: 1 });

  try {
    const aplicadas = await migrar(sql, (nome) => console.warn(`aplicada: ${nome}`));

    console.warn(
      aplicadas.length === 0
        ? 'Nada a aplicar: o banco já está atualizado.'
        : `${aplicadas.length} migração(ões) aplicada(s).`,
    );
  } finally {
    await sql.end();
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
