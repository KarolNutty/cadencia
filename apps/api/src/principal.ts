import { carregarAmbiente, carregarArquivoDeAmbiente } from '@cadencia/config';
import { prepararHashDeReferencia } from './funcionalidades/autenticacao/senha';
import { construirServidor } from './servidor';

async function principal(): Promise<void> {
  carregarArquivoDeAmbiente();

  const ambiente = carregarAmbiente();
  const { app, sql } = await construirServidor({ ambiente });

  // Prepara o hash descartável antes de aceitar tráfego. Deixar para a
  // primeira tentativa de login faria justamente ela custar diferente das
  // outras, que é exatamente a diferença de tempo que se quer eliminar.
  await prepararHashDeReferencia();

  const encerrar = async (sinal: string): Promise<void> => {
    app.log.info(`recebido ${sinal}, encerrando`);
    await app.close();
    await sql.end();
    process.exit(0);
  };

  // Sem isto, um deploy derruba requisições no meio: o processo morre antes de
  // terminar o que já estava respondendo.
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));

  await app.listen({ port: ambiente.PORTA, host: '0.0.0.0' });
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
