import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Barreira de erro.
 *
 * Sem ela, um componente que quebra derruba a árvore inteira e a pessoa vê uma
 * tela preta, sem explicação e sem saída. Foi o que aconteceu quando o avatar
 * recebeu um nome vazio: um detalhe de canto apagou o aplicativo.
 *
 * Precisa ser classe porque `componentDidCatch` não tem equivalente em hook.
 * É a única classe do projeto, e o motivo está aqui.
 */
interface Estado {
  erro: Error | null;
}

export class BarreiraDeErro extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    // O console é o que existe hoje. Num deploy de verdade isto vira envio para
    // um coletor, e o comentário fica como lembrete de que a peça falta.
    console.error('Erro não capturado na interface:', erro, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="quebrou" role="alert">
        <h1 className="quebrou__titulo">Algo quebrou nesta tela</h1>

        <p className="quebrou__texto">
          O erro foi registrado. Recarregar costuma resolver, e nada do que você fez foi
          perdido.
        </p>

        <button className="botao botao--medida" onClick={() => window.location.reload()}>
          Recarregar
        </button>

        {/*
          O detalhe técnico fica recolhido: importa para quem desenvolve e não
          ajuda quem só queria estudar. Escondido de vez, obrigaria a abrir o
          console para saber o que houve.
        */}
        <details className="quebrou__detalhe">
          <summary>Detalhe técnico</summary>
          <p>{this.state.erro.message}</p>
        </details>
      </div>
    );
  }
}
