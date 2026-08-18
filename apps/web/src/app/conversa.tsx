import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ConversaSaida, Nivel } from '@cadencia/contrato';
import { MAXIMO_DA_MENSAGEM } from '@cadencia/dominio';
import { FalhaDaApi } from '@cadencia/cliente-api';
import { Escolha } from '@/components/Escolha';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { NIVEIS } from '@/config/dominio';
import { buscarConversa, buscarConversas, comecarConversa, falar } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

const CENARIOS = [
  'pedindo um café',
  'no aeroporto',
  'primeira conversa com um colega novo',
  'contando o fim de semana',
  'marcando uma consulta',
  'devolvendo uma compra',
];

export function TelaConversa() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const anteriores = useQuery({
    queryKey: ['conversas', turma?.id],
    queryFn: () => buscarConversas(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Conversação" titulo="Você ainda não está em uma turma" />
        <p className="aviso">A prática de conversa acontece dentro de uma turma.</p>
      </>
    );
  }

  if (abertaId) return <Conversa id={abertaId} aoVoltar={() => setAbertaId(null)} />;

  const lista = anteriores.data?.conversas ?? [];

  return (
    <>
      <Cabecalho
        olho="Conversação"
        titulo="Pratique conversando"
        nota="Você escreve, recebe resposta e correções junto. Errar aqui é de graça, que é o ponto."
      />

      <Comecar turmaId={turma.id} aoComecar={setAbertaId} />

      {lista.length > 0 && (
        <div className="bloco">
          <p className="bloco__titulo">Suas conversas</p>
          <ul className="lista">
            {lista.map((item) => (
              <li className="lista__item" key={item.id}>
                <div>
                  <p className="lista__principal">{item.cenario}</p>
                  <p className="lista__apoio">
                    nível {item.nivel}, {item.falas}{' '}
                    {item.falas === 1 ? 'fala sua' : 'falas suas'}
                    {item.encerrada ? ', encerrada' : ''}
                  </p>
                </div>
                <button
                  className="botao botao--pequeno botao--secundario"
                  onClick={() => setAbertaId(item.id)}
                >
                  {item.encerrada ? 'Rever' : 'Continuar'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Comecar({
  turmaId,
  aoComecar,
}: {
  turmaId: string;
  aoComecar: (id: string) => void;
}) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();

  const [cenario, setCenario] = useState(CENARIOS[0]!);
  const [nivel, setNivel] = useState<Nivel>('B1');

  const nova = useMutation({
    mutationFn: () => comecarConversa(cliente, turmaId, cenario, nivel),
    onSuccess: (conversa) => {
      void consultas.invalidateQueries({ queryKey: ['conversas'] });
      aoComecar(conversa.id);
    },
  });

  return (
    <div className="bloco">
      <p className="bloco__titulo">Nova conversa</p>

      <div className="linha-de-campos">
        <div style={{ flex: 1, minWidth: 220 }}>
          <Escolha
            rotulo="Situação"
            valor={cenario}
            opcoes={CENARIOS.map((opcao) => ({ valor: opcao, rotulo: opcao }))}
            aoEscolher={setCenario}
          />
        </div>

        <div style={{ flex: '0 0 130px', minWidth: 130 }}>
          <Escolha
            rotulo="Nível"
            valor={nivel}
            opcoes={NIVEIS.map((opcao) => ({ valor: opcao, rotulo: opcao }))}
            aoEscolher={(escolhido) => setNivel(escolhido as Nivel)}
          />
        </div>

        <button
          className="botao botao--pequeno"
          disabled={nova.isPending}
          onClick={() => nova.mutate()}
        >
          {nova.isPending ? 'Abrindo…' : 'Começar'}
        </button>
      </div>
    </div>
  );
}

function Conversa({ id, aoVoltar }: { id: string; aoVoltar: () => void }) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const consulta = useQuery({
    queryKey: ['conversa', id],
    queryFn: () => buscarConversa(cliente, id),
  });

  const enviar = useMutation({
    mutationFn: () => falar(cliente, id, texto.trim()),
    onSuccess: () => {
      setTexto('');
      void consultas.invalidateQueries({ queryKey: ['conversa', id] });
      void consultas.invalidateQueries({ queryKey: ['conversas'] });
    },
  });

  // Rolar para a última fala: numa conversa longa, ficar no topo esconde
  // justamente o que acabou de chegar.
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consulta.data?.falas.length, enviar.isPending]);

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const conversa = consulta.data as ConversaSaida;
  const acabou = conversa.restantes === 0;

  return (
    <>
      <button className="discreto" onClick={aoVoltar} style={{ marginBottom: 16 }}>
        ← Voltar
      </button>

      <Cabecalho
        olho={`Nível ${conversa.nivel}`}
        titulo={conversa.cenario}
        nota={
          acabou
            ? 'Esta conversa chegou ao fim. Comece outra para continuar praticando.'
            : conversa.restantes <= 5
              ? `Faltam ${conversa.restantes} falas para esta conversa encerrar.`
              : undefined
        }
      />

      <div className="conversa">
        {conversa.falas.map((fala, indice) => (
          <div key={indice} className={`fala fala--${fala.autor}`}>
            <p className="fala__texto">{fala.texto}</p>

            {/* As correções ficam presas à fala que as gerou, e fora do fio da
                conversa. Corrigir dentro da resposta quebraria o assunto. */}
            {fala.correcoes.length > 0 && (
              <ul className="fala__correcoes">
                {fala.correcoes.map((correcao, posicao) => (
                  <li key={posicao}>
                    <span className="apontamento__antes">{correcao.trecho}</span>
                    <span className="apontamento__seta">→</span>
                    <span className="apontamento__depois">{correcao.sugestao}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {enviar.isPending && (
          <div className="fala fala--assistente fala--pensando">
            <span className="ponto" />
            <span className="ponto" />
            <span className="ponto" />
          </div>
        )}

        <div ref={fim} />
      </div>

      {enviar.isError && (
        <div className="retorno retorno--ruim">
          {enviar.error instanceof FalhaDaApi
            ? enviar.error.corpo.mensagem
            : 'Não deu para enviar agora.'}
        </div>
      )}

      {!acabou && (
        <div className="escrever">
          <input
            className="campo__entrada"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && texto.trim() && !enviar.isPending) {
                enviar.mutate();
              }
            }}
            placeholder="Escreva em inglês…"
            maxLength={MAXIMO_DA_MENSAGEM}
          />
          <button
            className="botao botao--pequeno"
            disabled={texto.trim().length === 0 || enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            Enviar
          </button>
        </div>
      )}
    </>
  );
}
