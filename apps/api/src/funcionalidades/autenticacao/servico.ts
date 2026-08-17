import { createHash, randomUUID } from 'node:crypto';
import type { Usuario } from '@cadencia/contrato';
import type { Banco, Executor } from '../../infra/banco';
import { ErroDaApi, credenciaisInvalidas, naoAutenticado } from '../../compartilhado/erros';
import { conferirSenha, gastarTempoDeVerificacao } from './senha';
import {
  type Emissor,
  VIDA_DA_RENOVACAO_EM_SEGUNDOS,
  VIDA_DO_ACESSO_EM_SEGUNDOS,
  TokenInvalido,
} from './tokens';

export interface SessaoCriada {
  usuario: Usuario;
  acesso: string;
  renovacao: string;
  expiraEm: number;
}

interface LinhaDeUsuario {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: 'aluno' | 'professor';
  fuso: string;
}

/**
 * O token guardado é o **hash**, nunca o token.
 *
 * Quem conseguisse ler a tabela poderia se passar por qualquer aluno até a
 * expiração. SHA-256 basta aqui — diferente de senha, o token tem entropia
 * alta e não é adivinhável por dicionário, então o custo de memória do Argon2
 * não compra nada e só deixaria cada renovação lenta.
 */
function digerir(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function paraUsuario(linha: LinhaDeUsuario): Usuario {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel,
    fuso: linha.fuso,
  };
}

export interface EventoDeAutenticacao {
  tipo: string;
  /**
   * `undefined` é aceito além de `null` por causa do `exactOptionalPropertyTypes`,
   * que distingue "a chave não existe" de "existe e vale undefined". Quem chama
   * repassa `contexto.ip`, que pode ser qualquer um dos dois.
   */
  usuarioId?: string | null | undefined;
  ip?: string | null | undefined;
  detalhe?: string | undefined;
}

export interface RegistradorDeEvento {
  (evento: EventoDeAutenticacao): Promise<void>;
}

export function criarServicoDeAutenticacao(sql: Banco, emissor: Emissor) {
  /** Registra o evento sem nunca guardar token nem senha. */
  const registrar: RegistradorDeEvento = async ({ tipo, usuarioId, ip, detalhe }) => {
    await sql`
      INSERT INTO eventos_de_autenticacao ${sql({
        tipo,
        usuario_id: usuarioId ?? null,
        ip: ip ?? null,
        detalhe: detalhe ?? null,
      })}
    `;
  };

  /**
   * O executor é parâmetro, e não a conexão capturada.
   *
   * Chamada de dentro de `sql.begin` usando a conexão de fora, esta função
   * espera para sempre pela conexão que a própria transação segura — e o
   * INSERT do token novo ficaria fora da transação, quebrando a atomicidade
   * que a rotação depende.
   */
  async function emitirParFamiliar(
    executor: Executor,
    usuarioId: string,
    familiaId: string,
  ): Promise<{ acesso: string; renovacao: string; papel: 'aluno' | 'professor' }> {
    const [linha] = await executor<Pick<LinhaDeUsuario, 'papel'>[]>`
      SELECT papel FROM usuarios WHERE id = ${usuarioId}
    `;

    if (!linha) throw naoAutenticado();

    const tokenId = randomUUID();

    const [acesso, renovacao] = await Promise.all([
      emissor.emitirAcesso({ usuarioId, papel: linha.papel }),
      emissor.emitirRenovacao({ usuarioId, familiaId, tokenId }),
    ]);

    const expiraEm = new Date(Date.now() + VIDA_DA_RENOVACAO_EM_SEGUNDOS * 1000);

    await executor`
      INSERT INTO tokens_de_renovacao ${executor({
        id: tokenId,
        usuario_id: usuarioId,
        familia_id: familiaId,
        token_hash: digerir(renovacao),
        expira_em: expiraEm,
      })}
    `;

    return { acesso, renovacao, papel: linha.papel };
  }

  return {
    async entrar(
      email: string,
      senha: string,
      contexto: { ip?: string | null } = {},
    ): Promise<SessaoCriada> {
      const [linha] = await sql<LinhaDeUsuario[]>`
        SELECT id, nome, email, senha_hash, papel, fuso
        FROM usuarios
        WHERE email = ${email.trim().toLowerCase()}
      `;

      if (!linha) {
        // Gasta o mesmo tempo de uma verificação real. Sem isto, e-mail
        // inexistente responde na hora e senha errada demora ~200 ms — e essa
        // diferença, medida de fora, entrega quais e-mails estão cadastrados.
        await gastarTempoDeVerificacao();
        await registrar({ tipo: 'entrada_recusada', ip: contexto.ip, detalhe: 'email' });
        throw credenciaisInvalidas();
      }

      if (!(await conferirSenha(linha.senha_hash, senha))) {
        await registrar({
          tipo: 'entrada_recusada',
          usuarioId: linha.id,
          ip: contexto.ip,
          detalhe: 'senha',
        });
        throw credenciaisInvalidas();
      }

      // Cada entrada abre uma família nova. Assim, derrubar uma sessão
      // comprometida não desloga a pessoa nos outros aparelhos.
      const familiaId = randomUUID();
      const { acesso, renovacao } = await emitirParFamiliar(sql, linha.id, familiaId);

      await registrar({ tipo: 'entrada', usuarioId: linha.id, ip: contexto.ip });

      return {
        usuario: paraUsuario(linha),
        acesso,
        renovacao,
        expiraEm: VIDA_DO_ACESSO_EM_SEGUNDOS,
      };
    },

    /**
     * Troca um token de renovação por um par novo.
     *
     * O token usado é marcado e não vale mais. Se um token **já usado**
     * reaparecer, só há duas explicações: ou ele vazou, ou houve corrida. Nos
     * dois casos a resposta é a mesma — a família inteira cai e a pessoa entra
     * de novo.
     *
     * É o que transforma um roubo de token silencioso, que duraria trinta
     * dias, num logout que a pessoa percebe.
     */
    async renovar(
      tokenApresentado: string,
      contexto: { ip?: string | null } = {},
    ): Promise<SessaoCriada> {
      let dados;
      try {
        dados = await emissor.lerRenovacao(tokenApresentado);
      } catch (erro) {
        if (erro instanceof TokenInvalido) throw naoAutenticado('Sessão inválida.');
        throw erro;
      }

      const hash = digerir(tokenApresentado);

      const [guardado] = await sql<
        { id: string; usado_em: Date | null; expira_em: Date }[]
      >`
        SELECT id, usado_em, expira_em
        FROM tokens_de_renovacao
        WHERE token_hash = ${hash} AND familia_id = ${dados.familiaId}
      `;

      if (!guardado) {
        // Assinatura válida e nenhum registro: o token foi revogado, ou a
        // família já caiu. De qualquer forma não vale mais.
        await registrar({
          tipo: 'renovacao_recusada',
          usuarioId: dados.usuarioId,
          ip: contexto.ip,
          detalhe: 'desconhecido',
        });
        throw naoAutenticado('Sessão inválida.');
      }

      if (guardado.usado_em !== null) {
        await sql`DELETE FROM tokens_de_renovacao WHERE familia_id = ${dados.familiaId}`;

        await registrar({
          tipo: 'reuso_detectado',
          usuarioId: dados.usuarioId,
          ip: contexto.ip,
          detalhe: `familia ${dados.familiaId}`,
        });

        throw new ErroDaApi(
          'nao_autenticado',
          'Sua sessão foi encerrada por segurança. Entre novamente.',
        );
      }

      if (guardado.expira_em.getTime() < Date.now()) {
        await registrar({
          tipo: 'renovacao_recusada',
          usuarioId: dados.usuarioId,
          ip: contexto.ip,
          detalhe: 'expirado',
        });
        throw naoAutenticado('Sessão expirada.');
      }

      const [linha] = await sql<LinhaDeUsuario[]>`
        SELECT id, nome, email, senha_hash, papel, fuso
        FROM usuarios WHERE id = ${dados.usuarioId}
      `;

      if (!linha) throw naoAutenticado('Sessão inválida.');

      // Marcar e emitir na mesma transação: se o processo cair no meio, ou o
      // token antigo continua válido, ou o novo existe. Nunca os dois inválidos,
      // que deslogaria a pessoa sem motivo.
      const par = await sql.begin(async (transacao) => {
        await transacao`
          UPDATE tokens_de_renovacao SET usado_em = now() WHERE id = ${guardado.id}
        `;
        return emitirParFamiliar(transacao, dados.usuarioId, dados.familiaId);
      });

      await registrar({ tipo: 'renovacao', usuarioId: linha.id, ip: contexto.ip });

      return {
        usuario: paraUsuario(linha),
        acesso: par.acesso,
        renovacao: par.renovacao,
        expiraEm: VIDA_DO_ACESSO_EM_SEGUNDOS,
      };
    },

    /** Encerra a sessão daquele aparelho, e só dele. */
    async sair(
      tokenApresentado: string,
      contexto: { ip?: string | null } = {},
    ): Promise<void> {
      try {
        const dados = await emissor.lerRenovacao(tokenApresentado);

        await sql`DELETE FROM tokens_de_renovacao WHERE familia_id = ${dados.familiaId}`;
        await registrar({ tipo: 'saida', usuarioId: dados.usuarioId, ip: contexto.ip });
      } catch (erro) {
        // Sair com token inválido não é erro: o objetivo do usuário já está
        // cumprido, e responder 401 aqui só o deixaria preso numa tela.
        if (!(erro instanceof TokenInvalido)) throw erro;
      }
    },

    /** Limpa tokens vencidos. Roda barato e evita a tabela crescer para sempre. */
    async limparExpirados(): Promise<number> {
      const apagados = await sql`
        DELETE FROM tokens_de_renovacao WHERE expira_em < now()
      `;
      return apagados.count;
    },
  };
}

export type ServicoDeAutenticacao = ReturnType<typeof criarServicoDeAutenticacao>;
