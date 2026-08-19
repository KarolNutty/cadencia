import type { CodigoDeErro, Erro } from '@cadencia/contrato';

/**
 * Erro que a API sabe transformar em resposta.
 *
 * O código vem do contrato, o cliente trata cada um de um jeito, e um código
 * novo que ninguém trata vira tela branca. Por isso a lista é fechada e
 * validada pelo próprio schema.
 */
export class ErroDaApi extends Error {
  constructor(
    readonly codigo: CodigoDeErro,
    mensagem: string,
    readonly campos?: Erro['campos'],
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }

  get status(): number {
    return STATUS_POR_CODIGO[this.codigo];
  }

  paraResposta(): Erro {
    return {
      codigo: this.codigo,
      mensagem: this.message,
      ...(this.campos ? { campos: this.campos } : {}),
    };
  }
}

const STATUS_POR_CODIGO: Record<CodigoDeErro, number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  nao_encontrado: 404,
  entrada_invalida: 400,
  credenciais_invalidas: 401,
  conflito: 409,
  // 502: o servidor funcionou, quem falhou foi o serviço atrás dele.
  servico_indisponivel: 502,
};

/**
 * Recurso alheio responde 404, e não 403.
 *
 * Um 403 confirma que aquele registro existe, e isso permite mapear a base
 * inteira só variando o id na URL. O 404 não distingue "não existe" de "não é
 * seu", que é exatamente o que se quer.
 *
 * O 403 fica reservado para o caso em que o próprio papel não permite a ação,
 * sem revelar nada sobre um recurso específico.
 */
export function naoEncontrado(oQue = 'Recurso'): ErroDaApi {
  return new ErroDaApi('nao_encontrado', `${oQue} não encontrado.`);
}

export function semPermissao(mensagem = 'Seu perfil não permite esta ação.'): ErroDaApi {
  return new ErroDaApi('sem_permissao', mensagem);
}

export function naoAutenticado(mensagem = 'Entre para continuar.'): ErroDaApi {
  return new ErroDaApi('nao_autenticado', mensagem);
}

/**
 * Mensagem única para e-mail inexistente e senha errada.
 *
 * Dizer "e-mail não cadastrado" é entregar quais endereços existem na base, o
 * que já é meio caminho para um ataque direcionado.
 */
export function credenciaisInvalidas(): ErroDaApi {
  return new ErroDaApi('credenciais_invalidas', 'E-mail ou senha incorretos.');
}
