import { describe, expect, it } from 'vitest';
import {
  SenhaFraca,
  TAMANHO_MINIMO_DA_SENHA,
  conferirSenha,
  criarHashDeSenha,
  gastarTempoDeVerificacao,
} from './senha';

const SENHA = 'uma-senha-de-verdade-2026';

describe('hash', () => {
  it('confere a senha correta', async () => {
    const hash = await criarHashDeSenha(SENHA);
    expect(await conferirSenha(hash, SENHA)).toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await criarHashDeSenha(SENHA);
    expect(await conferirSenha(hash, 'outra-senha-qualquer')).toBe(false);
  });

  it('usa Argon2id, e não outra variante', async () => {
    // A variante importa: argon2d é vulnerável a ataque de canal lateral, e
    // argon2i é mais fraco contra GPU. O "id" combina as defesas dos dois.
    expect(await criarHashDeSenha(SENHA)).toMatch(/^\$argon2id\$/);
  });

  it('gera hash diferente para a mesma senha', async () => {
    // O sal é aleatório por hash. Sem isso, duas pessoas com a mesma senha
    // teriam o mesmo registro no banco — e uma tabela pronta quebraria as duas.
    const [primeiro, segundo] = await Promise.all([
      criarHashDeSenha(SENHA),
      criarHashDeSenha(SENHA),
    ]);

    expect(primeiro).not.toBe(segundo);
    expect(await conferirSenha(primeiro, SENHA)).toBe(true);
    expect(await conferirSenha(segundo, SENHA)).toBe(true);
  });

  it('não devolve a senha em lugar nenhum do hash', async () => {
    expect(await criarHashDeSenha(SENHA)).not.toContain(SENHA);
  });
});

describe('política de senha', () => {
  it('recusa senha curta', async () => {
    await expect(criarHashDeSenha('curta123')).rejects.toThrow(SenhaFraca);
  });

  it('aceita exatamente o mínimo', async () => {
    const minima = 'a'.repeat(TAMANHO_MINIMO_DA_SENHA);
    await expect(criarHashDeSenha(minima)).resolves.toBeDefined();
  });

  it('não exige símbolo nem maiúscula', async () => {
    // Exigir composição produz "Senha@123", que atende a todas as regras e
    // está em qualquer lista de senhas vazadas. Tamanho é o que pesa.
    await expect(criarHashDeSenha('cavalo bateria grampo correto')).resolves.toBeDefined();
  });
});

describe('robustez', () => {
  it('hash corrompido devolve false em vez de estourar', async () => {
    // Deixar a exceção subir viraria 500 — e um 500 diferente do 401 conta ao
    // atacante que aquele registro existe e está com problema.
    expect(await conferirSenha('não é um hash', SENHA)).toBe(false);
    expect(await conferirSenha('', SENHA)).toBe(false);
    expect(await conferirSenha('$argon2id$v=19$lixo', SENHA)).toBe(false);
  });

  it('senha vazia não confere com hash nenhum', async () => {
    const hash = await criarHashDeSenha(SENHA);
    expect(await conferirSenha(hash, '')).toBe(false);
  });
});

describe('tempo constante no login', () => {
  it('e-mail inexistente custa o mesmo que senha errada', async () => {
    // Sem isso, o login responde na hora para e-mail inexistente e demora
    // ~200 ms para senha errada. A diferença é medível de fora e entrega quais
    // e-mails estão cadastrados.
    const hash = await criarHashDeSenha(SENHA);

    const inicioSenhaErrada = performance.now();
    await conferirSenha(hash, 'senha-errada-mas-existe');
    const custoSenhaErrada = performance.now() - inicioSenhaErrada;

    const inicioSemUsuario = performance.now();
    await gastarTempoDeVerificacao();
    const custoSemUsuario = performance.now() - inicioSemUsuario;

    const proporcao = custoSemUsuario / custoSenhaErrada;

    // A folga é larga de propósito: o teste protege contra a diferença de
    // ordem de grandeza (1 ms contra 200 ms), não contra ruído de agendamento
    // do sistema operacional, que tornaria o teste instável.
    expect(proporcao).toBeGreaterThan(0.3);
    expect(proporcao).toBeLessThan(3);
  });
});
