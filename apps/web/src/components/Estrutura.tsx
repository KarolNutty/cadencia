import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Turma } from '@cadencia/contrato';
import { Escolha } from '@/components/Escolha';
import { type Secao, secoesDe } from '@/config/secoes';
import { buscarTurmas } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

/**
 * A estrutura do portal.
 *
 * Barra lateral persistente com quatro seções, e não uma página que rola. Cada
 * seção é uma tarefa diferente do professor, e misturar "o que ensino hoje" com
 * "cadastrar conteúdo" na mesma tela embaralha o urgente com o administrativo.
 *
 * O que a barra **não** tem é uma fileira de cartões de métrica no topo. Total
 * de alunos e média de nota são números de vaidade: bonitos, e nenhum deles
 * muda o que o professor faz depois de ler.
 */

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

  const consulta = useQuery({
    queryKey: ['turmas'],
    queryFn: () => buscarTurmas(cliente),
  });

  const turmas = consulta.data?.turmas ?? [];
  const turma = turmas.find((candidata) => candidata.id === escolhida) ?? turmas[0] ?? null;

  return (
    <ContextoDaTurma.Provider
      value={{ turma, turmas, carregando: consulta.isPending, escolherTurma: setEscolhida }}
    >
      <div className="painel">
        <nav className="lateral" aria-label="Seções do painel">
          <div>
            <div className="lateral__marca">
              <span className="lateral__nome">Cadência</span>
            </div>
            <span className="lateral__papel">
              {usuario?.papel === 'professor' ? 'painel do professor' : 'área do aluno'}
            </span>
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
            {secoesDe(usuario?.papel ?? 'aluno').map((item) => (
              <li key={item.chave}>
                <button
                  className={`menu__item${secao === item.chave ? ' menu__item--ativo' : ''}`}
                  onClick={() => aoTrocarSecao(item.chave)}
                  aria-current={secao === item.chave ? 'page' : undefined}
                >
                  <span className="menu__rotulo">{item.rotulo}</span>
                  <span className="menu__descricao">{item.descricao}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="lateral__rodape">
            <p className="lateral__quem">{usuario?.nome}</p>
            <button className="discreto" onClick={() => void sair()}>
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
  /**
   * `| undefined` explícito por causa do `exactOptionalPropertyTypes`: quem
   * chama passa `condicao ? texto : undefined`, e o tipo precisa aceitar isso.
   */
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
