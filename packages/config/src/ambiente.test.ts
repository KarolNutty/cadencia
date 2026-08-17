import { describe, expect, it } from 'vitest';
import { AmbienteInvalido, carregarAmbiente } from './ambiente';

const SEGREDO_A = 'y0Xk9Qw2Lp7ZmT4vB8nR3sF6hJ1dC5gA';
const SEGREDO_B = 'q8Wz3Nv6Ty1Uk4Ri7Op0As5Df2Gh9Jl3';

function ambiente(
  ajustes: Record<string, string> = {},
  remover: readonly string[] = [],
): NodeJS.ProcessEnv {
  const base: Record<string, string> = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://cadencia:senha@localhost:5432/cadencia',
    SEGREDO_ACESSO: SEGREDO_A,
    SEGREDO_RENOVACAO: SEGREDO_B,
    ...ajustes,
  };

  // Apagar a chave, e não atribuir undefined: é o que acontece de verdade
  // quando a variável simplesmente não existe no ambiente.
  for (const chave of remover) delete base[chave];

  return base;
}

describe('ambiente válido', () => {
  it('carrega e aplica os padrões', () => {
    const carregado = carregarAmbiente(ambiente());

    expect(carregado.PORTA).toBe(3333);
    expect(carregado.producao).toBe(false);
  });

  it('converte a porta que chega como texto', () => {
    expect(carregarAmbiente(ambiente({ PORTA: '8080' })).PORTA).toBe(8080);
  });

  it('quebra a lista de origens e ignora espaço sobrando', () => {
    const carregado = carregarAmbiente(
      ambiente({ ORIGENS_PERMITIDAS: 'https://a.com , https://b.com' }),
    );

    expect(carregado.ORIGENS_PERMITIDAS).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('a aplicação recusa subir', () => {
  it('sem segredo de acesso', () => {
    // O modo mais comum de vazamento não é o segredo commitado — é o segredo
    // ausente que vira `?? 'dev'` em algum lugar e passa meses despercebido.
    expect(() => carregarAmbiente(ambiente({}, ['SEGREDO_ACESSO']))).toThrow(
      AmbienteInvalido,
    );
  });

  it('com segredo curto demais', () => {
    expect(() => carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'curto' }))).toThrow(
      /32 caracteres/,
    );
  });

  it('com segredo copiado de exemplo, mesmo esticado até o tamanho mínimo', () => {
    // O caso real não é alguém usar exatamente "changeme" — é pegar "changeme"
    // e completar até passar na regra de tamanho.
    expect(() =>
      carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'changeme'.repeat(5) })),
    ).toThrow(/copiado de um exemplo/);

    expect(() =>
      carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'troque-este-valor-aqui-por-favor-ok' })),
    ).toThrow(/copiado de um exemplo/);
  });

  it('com segredo longo mas sem entropia', () => {
    // Passa no tamanho e não protege nada.
    expect(() => carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'a'.repeat(60) }))).toThrow(
      /repetição demais/,
    );

    expect(() => carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'ab'.repeat(30) }))).toThrow(
      /repetição demais/,
    );
  });

  it('aceita um segredo gerado de verdade', () => {
    // Saída típica de `openssl rand -base64 48`.
    const gerado = 'kZ8vQ2mN7pR4tY6wA1sD3fG5hJ9lX0cB2nM4qW6eR8tY0uI2oP4aS6dF8gH1jK3l';
    expect(() => carregarAmbiente(ambiente({ SEGREDO_ACESSO: gerado }))).not.toThrow();
  });

  it('quando os dois segredos são iguais', () => {
    // Com o mesmo valor, um token de renovação vazado é aceito como token de
    // acesso: a assinatura confere, e o servidor não tem como distinguir.
    expect(() => carregarAmbiente(ambiente({ SEGREDO_RENOVACAO: SEGREDO_A }))).toThrow(
      /precisam ser diferentes/,
    );
  });

  it('com banco que não é Postgres', () => {
    expect(() =>
      carregarAmbiente(ambiente({ DATABASE_URL: 'mysql://localhost:3306/x' })),
    ).toThrow();
  });

  it('com DATABASE_URL que não é URL', () => {
    expect(() => carregarAmbiente(ambiente({ DATABASE_URL: 'localhost' }))).toThrow();
  });
});

describe('regras que só valem em produção', () => {
  const producao = (ajustes: Record<string, string> = {}) =>
    ambiente({
      NODE_ENV: 'production',
      ORIGENS_PERMITIDAS: 'https://app.escola.br',
      ...ajustes,
    });

  it('aceita configuração completa', () => {
    expect(carregarAmbiente(producao()).producao).toBe(true);
  });

  it('recusa sem lista de origens', () => {
    // Sem a lista, o CORS ficaria aberto para qualquer site.
    expect(() => carregarAmbiente(ambiente({ NODE_ENV: 'production' }))).toThrow(
      /ORIGENS_PERMITIDAS/,
    );
  });

  it('recusa origem sem HTTPS', () => {
    // O cookie de renovação vai com Secure e simplesmente não seria enviado.
    expect(() =>
      carregarAmbiente(producao({ ORIGENS_PERMITIDAS: 'http://app.escola.br' })),
    ).toThrow(/HTTPS/);
  });

  it('em desenvolvimento, http é permitido', () => {
    expect(() =>
      carregarAmbiente(ambiente({ ORIGENS_PERMITIDAS: 'http://localhost:5173' })),
    ).not.toThrow();
  });
});

describe('mensagem de erro', () => {
  it('lista todos os problemas de uma vez', () => {
    // Quem está configurando resolve tudo numa passada, em vez de descobrir um
    // problema por execução.
    try {
      carregarAmbiente({ NODE_ENV: 'development' });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(AmbienteInvalido);
      expect((erro as AmbienteInvalido).problemas.length).toBeGreaterThan(1);
    }
  });

  it('ensina como gerar um segredo bom', () => {
    try {
      carregarAmbiente(ambiente({ SEGREDO_ACESSO: 'x' }));
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect((erro as AmbienteInvalido).message).toContain('openssl rand');
    }
  });
});
