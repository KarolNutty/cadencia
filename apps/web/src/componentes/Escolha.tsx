import { useEffect, useId, useRef, useState } from 'react';

/**
 * Um seletor construído à mão.
 *
 * O `<select>` nativo é melhor em quase tudo, teclado, toque, leitor de tela, * e por isso continua sendo a escolha certa na maioria dos casos. O que ele não
 * permite é estilizar a **lista aberta**: nenhum navegador expõe isso, e o
 * resultado é um menu do sistema operacional caindo no meio de uma interface
 * que não se parece com ele.
 *
 * Construir significa reimplementar o que o nativo dava de graça, e é o que
 * está aqui: setas para navegar, Enter e Espaço para escolher, Escape para
 * fechar, clique fora fechando, e os papéis anunciados para o leitor de tela.
 * Trocar o nativo sem isso é trocar acessibilidade por aparência.
 */

export interface Opcao {
  valor: string;
  rotulo: string;
}

export function Escolha({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: readonly Opcao[];
  valor: string;
  aoEscolher: (valor: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [emFoco, setEmFoco] = useState(0);

  const caixa = useRef<HTMLDivElement>(null);
  const identificador = useId();

  const escolhida = opcoes.find((opcao) => opcao.valor === valor) ?? opcoes[0];

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    }

    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') {
      setAberto(false);
      return;
    }

    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();

      if (!aberto) {
        setAberto(true);
        setEmFoco(opcoes.findIndex((opcao) => opcao.valor === valor));
        return;
      }

      const passo = evento.key === 'ArrowDown' ? 1 : -1;
      setEmFoco((atual) => (atual + passo + opcoes.length) % opcoes.length);
      return;
    }

    if (aberto && (evento.key === 'Enter' || evento.key === ' ')) {
      evento.preventDefault();
      const alvo = opcoes[emFoco];
      if (alvo) {
        aoEscolher(alvo.valor);
        setAberto(false);
      }
    }
  }

  return (
    <div className="escolha" ref={caixa}>
      <span className="escolha__rotulo" id={`${identificador}-rotulo`}>
        {rotulo}
      </span>

      <button
        type="button"
        className={`escolha__gatilho${aberto ? ' escolha__gatilho--aberto' : ''}`}
        onClick={() => {
          setAberto((estava) => !estava);
          setEmFoco(opcoes.findIndex((opcao) => opcao.valor === valor));
        }}
        onKeyDown={aoTeclar}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        /*
         * Aponta para o rótulo **e** para o valor.
         *
         * Só o rótulo faria o leitor de tela anunciar "Turma, botão", sem
         * dizer qual turma está escolhida, porque `aria-labelledby` substitui
         * o conteúdo do elemento em vez de somar a ele. O `select` nativo
         * anuncia os dois, e trocar por um componente próprio não pode custar
         * isso.
         */
        aria-labelledby={`${identificador}-rotulo ${identificador}-valor`}
      >
        <span className="escolha__valor" id={`${identificador}-valor`}>
          {escolhida?.rotulo ?? ','}
        </span>
        <span
          className={`escolha__seta${aberto ? ' escolha__seta--aberta' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {aberto && (
        <ul
          className="escolha__lista"
          role="listbox"
          aria-labelledby={`${identificador}-rotulo`}
        >
          {opcoes.map((opcao, indice) => (
            <li key={opcao.valor} role="none">
              <button
                type="button"
                role="option"
                aria-selected={opcao.valor === valor}
                className={`escolha__opcao${indice === emFoco ? ' escolha__opcao--focada' : ''}${
                  opcao.valor === valor ? ' escolha__opcao--escolhida' : ''
                }`}
                onMouseEnter={() => setEmFoco(indice)}
                onClick={() => {
                  aoEscolher(opcao.valor);
                  setAberto(false);
                }}
              >
                {opcao.rotulo}
                {opcao.valor === valor && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
