import { hash, verify } from '@node-rs/argon2';

/**
 * Senha em repouso.
 *
 * Argon2id, vencedor do Password Hashing Competition. A diferença que importa
 * em relação ao bcrypt é o **custo de memória**: bcrypt usa pouca RAM, e por
 * isso uma GPU consegue testar milhões de candidatos em paralelo. Argon2id
 * obriga cada tentativa a alocar memória, o que derruba o paralelismo e torna o
 * ataque caro em hardware dedicado.
 */

/**
 * Parâmetros de custo.
 *
 * 19 MiB e 2 iterações são a recomendação da OWASP para Argon2id. O ajuste
 * certo depende do servidor: o alvo é a verificação levar entre 100 e 500 ms.
 * Muito rápido barateia o ataque; muito lento vira porta de negação de serviço,
 * já que quem ataca o login faz o servidor gastar CPU de graça.
 */
const PARAMETROS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Tamanho mínimo da senha no cadastro.
 *
 * Doze, e não oito. Tamanho é a única propriedade que realmente pesa contra
 * força bruta, exigir maiúscula, número e símbolo produz `Senha@123`, que
 * atende a todas as regras e está em qualquer lista de senhas vazadas.
 */
export const TAMANHO_MINIMO_DA_SENHA = 12;

export class SenhaFraca extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SenhaFraca';
  }
}

export async function criarHashDeSenha(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
    throw new SenhaFraca(
      `A senha precisa de ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`,
    );
  }

  return hash(senha, PARAMETROS);
}

export async function conferirSenha(
  hashArmazenado: string,
  senha: string,
): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, PARAMETROS);
  } catch {
    // Hash corrompido ou em formato desconhecido. Devolver `false` é o certo:
    // deixar a exceção subir viraria 500 e diria ao atacante que aquele
    // registro existe e está com problema.
    return false;
  }
}

/**
 * Hash descartável, usado quando o e-mail não existe.
 *
 * Sem isto, o login responde na hora para e-mail inexistente e demora 200 ms
 * para senha errada. Essa diferença é medível de fora e entrega **quais
 * e-mails estão cadastrados**, que é meio caminho para um ataque direcionado.
 *
 * Conferir contra um hash falso faz os dois caminhos custarem o mesmo.
 */
let hashDeReferencia: string | null = null;

export async function prepararHashDeReferencia(): Promise<void> {
  hashDeReferencia ??= await hash('senha-que-nao-pertence-a-ninguem', PARAMETROS);
}

export async function gastarTempoDeVerificacao(): Promise<void> {
  await prepararHashDeReferencia();
  await conferirSenha(hashDeReferencia!, 'tentativa-qualquer');
}
