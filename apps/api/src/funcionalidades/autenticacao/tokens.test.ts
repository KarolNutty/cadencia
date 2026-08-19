import { describe, expect, it, vi } from 'vitest';
import { criarEmissor, TokenInvalido, VIDA_DO_ACESSO_EM_SEGUNDOS } from './tokens';

const SEGREDOS = {
  acesso: 'kZ8vQ2mN7pR4tY6wA1sD3fG5hJ9lX0cB',
  renovacao: 'q8Wz3Nv6Ty1Uk4Ri7Op0As5Df2Gh9Jl3',
};

const emissor = criarEmissor(SEGREDOS);
const outroEmissor = criarEmissor({
  acesso: 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH',
  renovacao: 'iiiiJJJJkkkkLLLLmmmmNNNNooooPPPP',
});

const USUARIO = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('token de acesso', () => {
  it('emite e lê de volta', async () => {
    const token = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });
    const dados = await emissor.lerAcesso(token);

    expect(dados).toEqual({ usuarioId: USUARIO, papel: 'aluno' });
  });

  it('carrega o papel, que é o que autoriza as rotas', async () => {
    const token = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'professor' });
    expect((await emissor.lerAcesso(token)).papel).toBe('professor');
  });
});

describe('assinatura', () => {
  it('recusa token assinado com outro segredo', async () => {
    const token = await outroEmissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });

    await expect(emissor.lerAcesso(token)).rejects.toThrow(TokenInvalido);
  });

  it('recusa token com o conteúdo adulterado', async () => {
    // Trocar "aluno" por "professor" no corpo quebra a assinatura.
    const token = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });
    const [cabecalho, corpo, assinatura] = token.split('.');

    const conteudo = JSON.parse(Buffer.from(corpo!, 'base64url').toString());
    conteudo.papel = 'professor';

    const corpoAdulterado = Buffer.from(JSON.stringify(conteudo)).toString('base64url');
    const adulterado = `${cabecalho}.${corpoAdulterado}.${assinatura}`;

    await expect(emissor.lerAcesso(adulterado)).rejects.toThrow(TokenInvalido);
  });

  it('recusa token sem assinatura, com alg none', async () => {
    // A falha clássica: biblioteca que confia no algoritmo declarado pelo
    // próprio token aceita um token que ninguém assinou.
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const corpo = Buffer.from(
      JSON.stringify({
        sub: USUARIO,
        papel: 'professor',
        tipo: 'acesso',
        iss: 'cadencia',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');

    await expect(emissor.lerAcesso(`${cabecalho}.${corpo}.`)).rejects.toThrow(
      TokenInvalido,
    );
  });

  it('recusa texto que não é um token', async () => {
    await expect(emissor.lerAcesso('nao-e-token')).rejects.toThrow(TokenInvalido);
    await expect(emissor.lerAcesso('')).rejects.toThrow(TokenInvalido);
  });
});

describe('separação entre acesso e renovação', () => {
  /**
   * São duas barreiras independentes, e vale testar cada uma sozinha, senão a
   * primeira mascara a segunda e ninguém percebe quando a segunda quebra.
   */

  it('barreira 1 · segredos diferentes: renovação não passa como acesso', async () => {
    const renovacao = await emissor.emitirRenovacao({
      usuarioId: USUARIO,
      familiaId: 'familia-1',
      tokenId: 'token-1',
    });

    // Aqui a assinatura já reprova, antes mesmo de olhar o conteúdo.
    await expect(emissor.lerAcesso(renovacao)).rejects.toThrow(/signature/i);
  });

  it('barreira 1 · acesso não passa como renovação', async () => {
    const acesso = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });

    await expect(emissor.lerRenovacao(acesso)).rejects.toThrow(TokenInvalido);
  });

  it('barreira 2 · mesmo com segredo reaproveitado, o tipo reprova', async () => {
    // O cenário que a barreira 2 cobre: alguém configura o mesmo segredo nos
    // dois. A assinatura passa a conferir, e sem o campo "tipo" o servidor
    // aceitaria um token de renovação vazado como se fosse de acesso.
    //
    // `carregarAmbiente` recusa subir com segredos iguais, mas defesa em
    // profundidade existe justamente para quando a primeira camada falha.
    const mesmoSegredo = criarEmissor({
      acesso: SEGREDOS.acesso,
      renovacao: SEGREDOS.acesso,
    });

    const renovacao = await mesmoSegredo.emitirRenovacao({
      usuarioId: USUARIO,
      familiaId: 'familia-1',
      tokenId: 'token-1',
    });

    await expect(mesmoSegredo.lerAcesso(renovacao)).rejects.toThrow(
      /esperava um token de acesso/,
    );
  });

  it('barreira 2 · e o contrário também', async () => {
    const mesmoSegredo = criarEmissor({
      acesso: SEGREDOS.acesso,
      renovacao: SEGREDOS.acesso,
    });

    const acesso = await mesmoSegredo.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });

    await expect(mesmoSegredo.lerRenovacao(acesso)).rejects.toThrow(
      /esperava um token de renovação/,
    );
  });
});

describe('validade', () => {
  it('recusa token expirado', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));

    const token = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });

    // Um segundo depois do fim da validade.
    vi.setSystemTime(new Date(Date.now() + (VIDA_DO_ACESSO_EM_SEGUNDOS + 1) * 1000));

    await expect(emissor.lerAcesso(token)).rejects.toThrow(TokenInvalido);
    vi.useRealTimers();
  });

  it('aceita token dentro da validade', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));

    const token = await emissor.emitirAcesso({ usuarioId: USUARIO, papel: 'aluno' });
    vi.setSystemTime(new Date(Date.now() + 60 * 1000));

    await expect(emissor.lerAcesso(token)).resolves.toBeDefined();
    vi.useRealTimers();
  });
});

describe('token de renovação', () => {
  it('carrega família e identificador próprio', async () => {
    // A família permite derrubar todas as sessões daquele login de uma vez; o
    // identificador é o que o banco marca como usado.
    const token = await emissor.emitirRenovacao({
      usuarioId: USUARIO,
      familiaId: 'familia-7',
      tokenId: 'token-3',
    });

    expect(await emissor.lerRenovacao(token)).toEqual({
      usuarioId: USUARIO,
      familiaId: 'familia-7',
      tokenId: 'token-3',
    });
  });

  it('recusa renovação de outro emissor', async () => {
    const token = await outroEmissor.emitirRenovacao({
      usuarioId: USUARIO,
      familiaId: 'f',
      tokenId: 't',
    });

    await expect(emissor.lerRenovacao(token)).rejects.toThrow(TokenInvalido);
  });
});
