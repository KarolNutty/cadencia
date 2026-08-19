import { describe, expect, it } from 'vitest';
import { erroDoProvedor, esconderSegredos } from './provedor-de-ia';

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status });
}

describe('erros do provedor de IA', () => {
  it('chave recusada aponta para a configuração', async () => {
    // Quem configurou a chave errada precisa saber que é a chave, e não ficar
    // tentando de novo achando que é instabilidade.
    const erro = await erroDoProvedor(
      resposta(400, { error: { message: 'API key not valid' } }),
    );

    expect(erro.message).toContain('GEMINI_API_KEY');
  });

  it('modelo inexistente diz que é o modelo', async () => {
    const erro = await erroDoProvedor(
      resposta(404, { error: { message: 'models/x is not found' } }),
    );

    expect(erro.message).toContain('modelo');
  });

  it('cota esgotada convida a tentar mais tarde', async () => {
    const erro = await erroDoProvedor(
      resposta(429, { error: { message: 'Quota exceeded' } }),
    );

    expect(erro.message).toContain('cota');
  });

  it('apaga o formato antigo de chave', async () => {
    const erro = await erroDoProvedor(
      resposta(400, {
        error: { message: 'Invalid key AIzaSyD-EXEMPLO-1234567890 in request' },
      }),
    );

    const inteiro = JSON.stringify(erro.paraResposta());

    expect(inteiro).not.toContain('AIzaSyD-EXEMPLO-1234567890');
    expect(inteiro).toContain('[chave]');
  });

  it('apaga o formato novo, com prefixo AQ.', async () => {
    /**
     * O AI Studio passou a emitir chaves neste formato. Um filtro que só
     * conhece o formato antigo deixa o novo vazar, e foi o que aconteceu aqui
     * antes deste teste existir.
     */
    const erro = await erroDoProvedor(
      resposta(400, {
        error: { message: 'Invalid key AQ.Ab8RN6L81eSIq6mPS-Ut2R2yaI4Rwgm in request' },
      }),
    );

    const inteiro = JSON.stringify(erro.paraResposta());

    expect(inteiro).not.toContain('AQ.Ab8RN6L81eSIq6mPS');
    expect(inteiro).toContain('[chave]');
  });

  it('apaga a chave em uso mesmo em formato desconhecido', async () => {
    /**
     * A barreira que continua valendo quando o provedor inventar o próximo
     * prefixo. Reconhecer formato é frágil por natureza: o formato seguinte
     * nunca está na lista.
     */
    const chave = 'zzz-formato-que-ainda-nao-existe-999';

    const erro = await erroDoProvedor(
      resposta(400, { error: { message: `Invalid key ${chave} in request` } }),
      chave,
    );

    const inteiro = JSON.stringify(erro.paraResposta());

    expect(inteiro).not.toContain(chave);
    expect(inteiro).toContain('[chave]');
  });

  it('não confunde texto curto com chave', () => {
    // Apagar toda palavra parecida deixaria a mensagem ilegível.
    expect(esconderSegredos('erro no campo AQ', 'abc')).toBe('erro no campo AQ');
  });

  it('o detalhe é cortado, para não virar despejo de log na tela', async () => {
    const erro = await erroDoProvedor(
      resposta(500, { error: { message: 'x'.repeat(5000) } }),
    );

    const motivo = erro.campos?.[0]?.motivo ?? '';
    expect(motivo.length).toBeLessThanOrEqual(200);
  });

  it('resposta sem JSON ainda vira erro legível', async () => {
    const erro = await erroDoProvedor(new Response('<html>502</html>', { status: 502 }));

    expect(erro.message.length).toBeGreaterThan(0);
    expect(erro.campos?.[0]?.motivo).toContain('502');
  });

  it('o código é o de serviço externo, e não de erro do cliente', async () => {
    // 502 diz que o servidor funcionou e quem falhou foi o serviço atrás dele.
    // Devolver 400 faria parecer que a entrada do aluno estava errada.
    const erro = await erroDoProvedor(resposta(403, { error: { message: 'denied' } }));

    expect(erro.codigo).toBe('servico_indisponivel');
  });
});
