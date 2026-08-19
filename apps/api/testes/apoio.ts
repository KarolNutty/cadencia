import { randomUUID } from 'node:crypto';
import { carregarAmbiente, carregarArquivoDeAmbiente } from '@cadencia/config';
import type { FastifyInstance } from 'fastify';
import { conectar, recriarParaTeste, type Banco } from '../src/infra/banco';
import { criarHashDeSenha } from '../src/funcionalidades/autenticacao/senha';
import { construirServidor } from '../src/servidor';

/**
 * Apoio dos testes de integração.
 *
 * Roda contra o **Postgres de verdade**, o mesmo motor de produção, subido pelo
 * `docker compose`. Banco falso não pega constraint violada, índice único nem
 * transação que não fecha, e é exatamente aí que os bugs de persistência
 * moram.
 */

export const SENHA_PADRAO = 'senha-de-teste-2026';

let bancoCompartilhado: Banco | null = null;

export function ambienteDeTeste() {
  // `obrigatorio` porque aqui o arquivo é a única fonte esperada. Sem ele, o
  // erro seria "DATABASE_URL: Required", que faz procurar problema de
  // configuração quando o que falta é copiar um arquivo.
  try {
    carregarArquivoDeAmbiente({ nome: '.env.teste', obrigatorio: true });
  } catch {
    throw new Error(
      'Arquivo .env.teste não encontrado. Rode:  cp .env.teste.example .env.teste',
    );
  }

  return carregarAmbiente();
}

export async function prepararBanco(): Promise<Banco> {
  if (bancoCompartilhado) return bancoCompartilhado;

  const ambiente = ambienteDeTeste();

  /**
   * Uma conexão só, e isso é uma escolha de teste, não economia.
   *
   * Além de impedir que dois casos disputem conexão e produzam falha que não se
   * reproduz, o pool de 1 **transforma em travamento imediato** um erro que em
   * produção só apareceria sob carga: usar a conexão de fora enquanto uma
   * transação está aberta. Com pool grande isso passa despercebido por meses e
   * um dia derruba tudo junto.
   *
   * Foi assim que apareceu aqui: a emissão do token novo durante a rotação
   * usava a conexão externa e ficava esperando a conexão que a própria
   * transação segurava.
   */
  const sql = conectar({ url: ambiente.DATABASE_URL, maximoDeConexoes: 1 });

  // `recriarParaTeste` recusa qualquer banco cujo nome não contenha "teste".
  // Um DATABASE_URL esquecido apontando para produção é como se apaga um banco
  // de verdade.
  await recriarParaTeste(sql, ambiente.DATABASE_URL);

  bancoCompartilhado = sql;
  return sql;
}

export async function limparDados(sql: Banco): Promise<void> {
  // TRUNCATE com CASCADE em vez de DELETE por tabela: dispensa acertar a ordem
  // das chaves estrangeiras e reinicia as sequências.
  await sql`
    TRUNCATE eventos_de_autenticacao, tokens_de_renovacao, revisoes,
             agendamentos, cartoes, baralhos, matriculas, turmas, usuarios
    RESTART IDENTITY CASCADE
  `;
}

export async function encerrarBanco(): Promise<void> {
  await bancoCompartilhado?.end();
  bancoCompartilhado = null;
}

export interface UsuarioDeTeste {
  id: string;
  email: string;
  senha: string;
  papel: 'aluno' | 'professor';
}

export interface DadosDoUsuarioDeTeste {
  nome?: string;
  email?: string;
  senha?: string;
  papel?: 'aluno' | 'professor';
  fuso?: string;
}

export async function criarUsuario(
  sql: Banco,
  dados: DadosDoUsuarioDeTeste = {},
): Promise<UsuarioDeTeste> {
  const {
    nome = 'Ana Beatriz',
    email = `ana-${randomUUID()}@escola.com.br`,
    senha = SENHA_PADRAO,
    papel = 'aluno',
    fuso = 'America/Sao_Paulo',
  } = dados;
  const senhaHash = await criarHashDeSenha(senha);

  const [linha] = await sql<{ id: string }[]>`
    INSERT INTO usuarios ${sql({
      nome,
      email: email.toLowerCase(),
      senha_hash: senhaHash,
      papel,
      fuso,
    })}
    RETURNING id
  `;

  return { id: linha!.id, email: email.toLowerCase(), senha, papel };
}

export async function construirApp(sql: Banco): Promise<FastifyInstance> {
  const { app } = await construirServidor({ ambiente: ambienteDeTeste(), banco: sql });
  await app.ready();
  return app;
}

/** Entra e devolve o que a resposta trouxe, incluindo os cookies. */
export async function entrar(
  app: FastifyInstance,
  usuario: UsuarioDeTeste,
  plataforma: 'web' | 'mobile' = 'mobile',
) {
  const resposta = await app.inject({
    method: 'POST',
    url: '/sessoes',
    headers: { 'x-plataforma': plataforma },
    payload: { email: usuario.email, senha: usuario.senha },
  });

  return {
    status: resposta.statusCode,
    corpo: resposta.json(),
    cookies: resposta.cookies,
  };
}
