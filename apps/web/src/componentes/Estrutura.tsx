import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Turma } from '@cadencia/contrato';
import { Avatar } from '@/componentes/Avatar';
import { BotaoDeTema } from '@/componentes/BotaoDeTema';
import { Escolha } from '@/componentes/Escolha';
import { type Secao, secoesDe } from '@/config/secoes';
import { buscarTurmas } from '@/funcionalidades/turma/api';
import { useSessao } from '@/provedores/sessao';

export type { Secao };

interface Contexto {
  turma: Turma | null;
  turmas: Turma[];
  carregando: boolean;
  escolherTurma: (turmaId: string) => void;
}

const ContextoDaTurma = createContext<Contexto | null>(null);

export function useTurma(): Contexto {
  const contexto = useContext(ContextoDaTurma);
  if (!contexto) throw new Error('useTurma precisa estar dentro de Estrutura.');
  return contexto;
}

/**
 * A estrutura do portal.
 *
 * Em tela larga, a navegação é uma coluna fixa. Em tela estreita ela vira uma
 * gaveta, e não uma pilha acima do conteúdo: empilhar obrigaria a rolar por
 * seis itens de menu toda vez que a pessoa abre o aplicativo no celular.
 */
export function Estrutura({
  secao,
  aoTrocarSecao,
  children,
}: {
  secao: Secao;
  aoTrocarSecao: (secao: Secao) => void;
  children: ReactNode;
}) {
  const { usuario, cliente, sair } = useSessao();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  const abrirGaveta = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLElement>(null);

  const consulta = useQuery({
    queryKey: ['turmas'],
    queryFn: () => buscarTurmas(cliente),
  });

  const turmas = consulta.data?.turmas ?? [];
  const turma = turmas.find((candidata) => candidata.id === escolhida) ?? turmas[0] ?? null;

  const secoes = secoesDe(usuario?.papel ?? 'aluno');
  const atual = secoes.find((item) => item.chave === secao);

  /**
   * Enquanto a gaveta está aberta, o resto não rola e o Escape fecha.
   *
   * Sem travar a rolagem, arrastar sobre a gaveta move a página atrás dela, e a
   * pessoa perde o lugar onde estava. O Escape é o que todo mundo tenta antes
   * de procurar o botão de fechar.
   */
  useEffect(() => {
    if (!gavetaAberta) return;

    const rolagemOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setGavetaAberta(false);
    }

    document.addEventListener('keydown', aoTeclar);

    // O foco entra na gaveta: sem isso, quem navega por teclado continua preso
    // no conteúdo atrás dela.
    gaveta.current?.focus();

    return () => {
      document.body.style.overflow = rolagemOriginal;
      document.removeEventListener('keydown', aoTeclar);
      // E volta para o botão que a abriu, que é onde a pessoa estava.
      abrirGaveta.current?.focus();
    };
  }, [gavetaAberta]);

  function irPara(nova: Secao) {
    aoTrocarSecao(nova);
    setGavetaAberta(false);
  }

  return (
    <ContextoDaTurma.Provider
      value={{ turma, turmas, carregando: consulta.isPending, escolherTurma: setEscolhida }}
    >
      <div className="painel">
        {/* Barra superior, só em tela estreita. Mostra onde a pessoa está, que
            é o que a lateral fazia e a gaveta fechada não pode fazer. */}
        <header className="barra">
          <button
            className="barra__menu"
            ref={abrirGaveta}
            onClick={() => setGavetaAberta(true)}
            aria-expanded={gavetaAberta}
            aria-controls="navegacao"
            aria-label="Abrir navegação"
          >
            <span className="barra__tracos" aria-hidden />
          </button>

          <div className="barra__onde">
            <span className="barra__secao">{atual?.rotulo ?? 'Cadência'}</span>
            {turma && <span className="barra__turma">{turma.nome}</span>}
          </div>

          {usuario && <Avatar nome={usuario.nome} tamanho={32} />}
        </header>

        {/*
          A cortina é atalho de mouse, e por isso fica fora da árvore de
          acessibilidade. Anunciá-la daria dois botões com o mesmo nome, já que
          a gaveta tem o próprio botão de fechar, e quem usa teclado fecha com
          Escape.
        */}
        {gavetaAberta && (
          <div className="cortina" onClick={() => setGavetaAberta(false)} aria-hidden />
        )}

        <nav
          className={`lateral${gavetaAberta ? ' lateral--aberta' : ''}`}
          id="navegacao"
          ref={gaveta}
          tabIndex={-1}
          aria-label="Seções do portal"
        >
          <div className="lateral__topo">
            <div>
              <span className="lateral__nome">Cadência</span>
              <span className="lateral__papel">
                {usuario?.papel === 'professor' ? 'painel do professor' : 'área do aluno'}
              </span>
            </div>

            <button
              className="lateral__fechar"
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar navegação"
            >
              ✕
            </button>
          </div>

          {turmas.length > 1 && (
            <Escolha
              rotulo="Turma"
              valor={turma?.id ?? ''}
              opcoes={turmas.map((candidata) => ({
                valor: candidata.id,
                rotulo: candidata.nome,
              }))}
              aoEscolher={setEscolhida}
            />
          )}

          <ul className="menu" aria-label="Seções">
            {secoes.map((item) => (
              <li key={item.chave}>
                <button
                  className={`menu__item${secao === item.chave ? ' menu__item--ativo' : ''}`}
                  onClick={() => irPara(item.chave)}
                  aria-current={secao === item.chave ? 'page' : undefined}
                >
                  <span className="menu__rotulo">{item.rotulo}</span>
                  <span className="menu__descricao">{item.descricao}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="lateral__tema">
            <BotaoDeTema />
          </div>

          <div className="lateral__rodape">
            {usuario && <Avatar nome={usuario.nome} tamanho={32} />}
            <p className="lateral__quem">{usuario?.nome}</p>
            <button className="discreto discreto--lateral" onClick={() => void sair()}>
              Sair
            </button>
          </div>
        </nav>

        <main className="conteudo">{children}</main>
      </div>
    </ContextoDaTurma.Provider>
  );
}

/** Cabeçalho de seção: olho, título e uma linha do que a tela resolve. */
export function Cabecalho({
  olho,
  titulo,
  nota,
  acao,
}: {
  olho: string;
  titulo: string;
  nota?: string | undefined;
  acao?: ReactNode | undefined;
}) {
  return (
    <header className="cabecalho">
      <div>
        <p className="olho">{olho}</p>
        <h1 className="cabecalho__titulo">{titulo}</h1>
        {nota && <p className="cabecalho__nota">{nota}</p>}
      </div>
      {acao}
    </header>
  );
}
