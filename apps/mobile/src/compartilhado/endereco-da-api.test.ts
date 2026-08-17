import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `expo-constants` não existe fora do aparelho, então o módulo é substituído.
 * O que está sob teste é a **regra de descoberta**, não a biblioteca.
 */
/**
 * `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo: sem isso, a
 * fábrica tentaria ler `constantes` antes da declaração. É o que permite manter
 * o import estático e dispensar `await` no topo do módulo.
 */
const constantes = vi.hoisted(() => ({
  expoConfig: null as Record<string, unknown> | null,
  expoGoConfig: null as Record<string, unknown> | null,
}));

vi.mock('expo-constants', () => ({ default: constantes }));

import { descobrirEnderecoDaApi } from './endereco-da-api';

afterEach(() => {
  constantes.expoConfig = null;
  constantes.expoGoConfig = null;
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('descoberta do endereço', () => {
  it('usa a variável de ambiente quando existe', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.cadencia.com.br';

    expect(descobrirEnderecoDaApi()).toBe('https://api.cadencia.com.br');
  });

  it('remove a barra do fim, para não gerar caminho com duas', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.cadencia.com.br/';

    expect(descobrirEnderecoDaApi()).toBe('https://api.cadencia.com.br');
  });

  it('deriva o endereço do servidor de desenvolvimento', () => {
    // O Expo já carregou o app por este IP, então ele é o da máquina certa.
    // Só a porta muda.
    constantes.expoConfig = { hostUri: '192.168.0.5:8081' };

    expect(descobrirEnderecoDaApi()).toBe('http://192.168.0.5:3333');
  });

  it('lida com caminho depois da porta', () => {
    constantes.expoConfig = { hostUri: '192.168.0.5:8081/--/algo' };

    expect(descobrirEnderecoDaApi()).toBe('http://192.168.0.5:3333');
  });

  it('aceita o formato antigo do Expo Go', () => {
    constantes.expoGoConfig = { debuggerHost: '10.0.0.7:19000' };

    expect(descobrirEnderecoDaApi()).toBe('http://10.0.0.7:3333');
  });

  it('cai para localhost quando não há servidor de desenvolvimento', () => {
    expect(descobrirEnderecoDaApi()).toBe('http://localhost:3333');
  });

  it('a variável de ambiente tem prioridade sobre a descoberta', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.cadencia.com.br';
    constantes.expoConfig = { hostUri: '192.168.0.5:8081' };

    expect(descobrirEnderecoDaApi()).toBe('https://api.cadencia.com.br');
  });
});
