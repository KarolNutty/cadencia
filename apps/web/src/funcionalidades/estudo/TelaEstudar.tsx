import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import type { EnviarRevisoesSaida, SessaoSaida } from '@cadencia/contrato';
import { type Avaliacao, diaDeEstudoDe } from '@cadencia/dominio';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { fusoDoNavegador } from '@/config/dominio';
import { buscarSessao, enviarRevisoes, novoLoteId } from '@/funcionalidades/estudo/api';
import { buscarPontuacao } from '@/funcionalidades/pontuacao/api';
import {
  avaliar,
  cartaAtual,
  iniciarSessao,
  loteParaEnvio,
  paraEstudar,
  progresso,
  quandoVolta,
  resumir,
  revelar,
  terminou,
  type EstadoDaSessao,
} from '@/funcionalidades/estudo/sessao';
import { useSessao } from '@/provedores/sessao';

const AVALIACOES: { valor: Avaliacao; rotulo: string; classe: string }[] = [
  { valor: 'errei', rotulo: 'Errei', classe: 'errei' },
  { valor: 'dificil', rotulo: 'Difícil', classe: 'dificil' },
  { valor: 'bom', rotulo: 'Bom', classe: 'bom' },
  { valor: 'facil', rotulo: 'Fácil', classe: 'facil' },
];

export function TelaEstudar() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const consultas = useQueryClient();

  const dia = diaDeEstudoDe(new Date(), fusoDoNavegador());

  const [sessao, setSessao] = useState<EstadoDaSessao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  /**
   * O identificador do lote nasce com a sessão e não muda.
   *
   * Gerado a cada tentativa de envio, o reenvio pareceria um lote novo para o
   * servidor, e a proteção contra duplicata falharia justamente quando é
   * necessária, que é quando a primeira resposta se perdeu.
   */
  const lote = useRef(novoLoteId());

  const consulta = useQuery({
    queryKey: ['sessao', turma?.id, dia],
    queryFn: () => buscarSessao(cliente, turma!.id, dia),
    enabled: Boolean(turma),
  });

  const pontuacao = useQuery({
    queryKey: ['pontuacao', turma?.id, dia],
    queryFn: () => buscarPontuacao(cliente, turma!.id, dia),
    enabled: Boolean(turma),
  });

  const inicial = useMemo(
    () =>
      consulta.data ? iniciarSessao(consulta.data.cartas.map(paraEstudar), dia) : null,
    [consulta.data, dia],
  );

  const enviar = useMutation({
    mutationFn: (estado: EstadoDaSessao) =>
      enviarRevisoes(cliente, turma!.id, lote.current, loteParaEnvio(estado)),
    onSuccess: (_: EnviarRevisoesSaida) => {
      lote.current = novoLoteId();
      setSessao(null);
      setFalhou(false);
      void consultas.invalidateQueries({ queryKey: ['sessao'] });
      void consultas.invalidateQueries({ queryKey: ['pontuacao'] });
      void consultas.invalidateQueries({ queryKey: ['ranking'] });
    },
    onError: () => setFalhou(true),
    onSettled: () => setEnviando(false),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Estudar" titulo="Você ainda não está em uma turma" />
        <p className="aviso">
          Assim que a escola matricular você, as palavras aparecem aqui.
        </p>
      </>
    );
  }

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const dados = consulta.data as SessaoSaida;
  const emAndamento = sessao ?? null;

  // Fim da sessão: resumo antes de subir o lote.
  if (emAndamento && terminou(emAndamento)) {
    const resumo = resumir(emAndamento);

    return (
      <>
        <Cabecalho
          olho="Sessão fechada"
          titulo={`${resumo.acertos} de ${resumo.total} de primeira`}
          nota={
            resumo.voltamAmanha > 0
              ? `${resumo.voltamAmanha} ${resumo.voltamAmanha === 1 ? 'palavra volta' : 'palavras voltam'} amanhã.`
              : 'Nada volta amanhã, todas ficaram para depois.'
          }
        />

        {falhou && (
          <div className="retorno retorno--ruim">
            Não deu para enviar agora. Seu estudo não foi perdido, toque de novo quando
            tiver conexão.
          </div>
        )}

        <button
          className="botao botao--medida"
          disabled={enviando}
          onClick={() => {
            setEnviando(true);
            enviar.mutate(emAndamento);
          }}
        >
          {enviando ? 'Salvando…' : falhou ? 'Tentar de novo' : 'Salvar e voltar'}
        </button>
      </>
    );
  }

  // Sessão em andamento.
  if (emAndamento) {
    const carta = cartaAtual(emAndamento)!;
    const andamento = progresso(emAndamento);
    const ultima = emAndamento.revisoes.at(-1);

    return (
      <div className="estudo">
        <div className="estudo__topo">
          <div className="batidas" aria-label={`${andamento.feitas} de ${andamento.total}`}>
            {Array.from({ length: andamento.total }, (_, indice) => (
              <span
                key={indice}
                className={`batida${indice < andamento.feitas ? ' batida--feita' : ''}`}
              />
            ))}
          </div>
          <div className="estudo__medidas">
            <span>{andamento.restantes} restantes</span>
            {ultima && <span>anterior volta {quandoVolta(ultima.agendamento)}</span>}
          </div>
        </div>

        <button
          className="carta"
          onClick={() => !emAndamento.revelada && setSessao(revelar(emAndamento))}
          disabled={emAndamento.revelada}
          aria-label={
            emAndamento.revelada
              ? carta.cartao.frente
              : `${carta.cartao.frente}. Clique para ver a resposta.`
          }
        >
          <span className="carta__palavra">{carta.cartao.frente}</span>

          {emAndamento.revelada ? (
            <span className="carta__verso">{carta.cartao.verso}</span>
          ) : (
            <span className="carta__dica">{carta.cartao.dica ?? 'clique para ver'}</span>
          )}
        </button>

        {emAndamento.revelada ? (
          <div className="avaliacoes">
            {AVALIACOES.map((opcao) => (
              <button
                key={opcao.valor}
                className={`avaliacao avaliacao--${opcao.classe}`}
                onClick={() => setSessao(avaliar(emAndamento, opcao.valor))}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        ) : (
          <button
            className="botao botao--medida botao--centrado"
            onClick={() => setSessao(revelar(emAndamento))}
          >
            Ver resposta
          </button>
        )}
      </div>
    );
  }

  // Antes de começar.
  const vencendo = dados.resumo.vencendoHoje;

  return (
    <>
      <Cabecalho
        olho="Estudar"
        titulo={
          vencendo === 0
            ? 'Nada para revisar agora'
            : `${vencendo} ${vencendo === 1 ? 'palavra espera' : 'palavras esperam'} por você`
        }
        nota={
          vencendo === 0
            ? 'Você já revisou tudo que vencia hoje. Voltar amanhã vale mais que estudar duas vezes seguidas.'
            : 'Cada palavra volta num intervalo diferente, conforme você acerta. Leva uns cinco minutos.'
        }
      />

      {/* O aviso de ofensiva em risco vem antes de tudo: é a informação que
          faz a pessoa estudar hoje em vez de amanhã. */}
      {pontuacao.data?.ofensiva.emRisco && (
        <div className="retorno retorno--atencao medida">
          Sua ofensiva de {pontuacao.data.ofensiva.dias}{' '}
          {pontuacao.data.ofensiva.dias === 1 ? 'dia' : 'dias'} termina hoje se você não
          estudar.
        </div>
      )}

      <div className="fichas">
        <Ficha
          valor={String(pontuacao.data?.ofensiva.dias ?? dados.sequenciaDeDias)}
          rotulo="dias seguidos"
          destaque
        />
        <Ficha valor={`${pontuacao.data?.xpTotal ?? 0}`} rotulo="XP total" />
        <Ficha valor={`nível ${pontuacao.data?.nivel ?? 1}`} rotulo="seu nível" />
        <Ficha valor={String(dados.resumo.emDia)} rotulo="em dia" />
      </div>

      {pontuacao.data && (
        <div className="nivel">
          <div className="nivel__cabecalho">
            <span>nível {pontuacao.data.nivel}</span>
            <span>
              {pontuacao.data.atual} / {pontuacao.data.proximo} XP
            </span>
          </div>
          <div className="barra">
            <div
              className="barra__cheia"
              style={{
                width: `${Math.round((pontuacao.data.atual / pontuacao.data.proximo) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {vencendo > 0 && inicial && (
        <button className="botao botao--medida" onClick={() => setSessao(inicial)}>
          Começar
        </button>
      )}
    </>
  );
}

function Ficha({
  valor,
  rotulo,
  destaque,
}: {
  valor: string;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div className={`ficha${destaque ? ' ficha--destaque' : ''}`}>
      <span className="ficha__valor">{valor}</span>
      <span className="ficha__rotulo">{rotulo}</span>
    </div>
  );
}
