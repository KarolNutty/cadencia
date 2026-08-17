import * as ArmazenamentoSeguro from 'expo-secure-store';
import type { Tokens } from '@cadencia/cliente-api';

/**
 * Onde a sessão é guardada no aparelho.
 *
 * `expo-secure-store` usa o Keychain no iOS e o Keystore no Android — o
 * armazenamento cifrado do próprio sistema, protegido de outros aplicativos.
 *
 * `AsyncStorage` seria mais simples e está errado aqui: ele grava em texto
 * puro numa pasta que qualquer app com acesso ao disco lê, e um aparelho
 * perdido entrega a sessão inteira.
 *
 * Note que a decisão é **diferente da web**, onde o token vive em cookie
 * `httpOnly`. As duas plataformas enfrentam ameaças diferentes — no navegador o
 * risco é script injetado, no celular é acesso ao disco — e copiar a mesma
 * solução para as duas seria o erro.
 */

const CHAVE = 'cadencia.sessao';

export async function lerTokens(): Promise<Tokens | null> {
  try {
    const bruto = await ArmazenamentoSeguro.getItemAsync(CHAVE);
    if (!bruto) return null;

    const dados = JSON.parse(bruto) as Partial<Tokens>;
    if (!dados.acesso || !dados.renovacao) return null;

    return { acesso: dados.acesso, renovacao: dados.renovacao };
  } catch {
    // Conteúdo corrompido: tratar como "sem sessão" e pedir para entrar de
    // novo é melhor do que deixar o app quebrar na abertura.
    return null;
  }
}

export async function salvarTokens(tokens: Tokens): Promise<void> {
  await ArmazenamentoSeguro.setItemAsync(CHAVE, JSON.stringify(tokens), {
    // Sem o aparelho desbloqueado, nada é lido. Também impede que a chave saia
    // no backup para outro dispositivo.
    keychainAccessible: ArmazenamentoSeguro.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function apagarTokens(): Promise<void> {
  await ArmazenamentoSeguro.deleteItemAsync(CHAVE);
}
