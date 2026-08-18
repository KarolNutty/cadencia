import { useQuery } from '@tanstack/react-query';
import type { SessaoSaida } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { fusoDoNavegador } from '@/config/dominio';
import { buscarSessao } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

export function TelaProgresso() {
  const { cliente } = useSessao();
  const { turma } = useTurma();

  const dia = diaDeEstudoDe(new Date(), fusoDoNavegador());

  const consulta = useQuery({
    queryKey: ['sessao', turma?.id, dia],
    queryFn: () => buscarSessao(cliente, turma!.id, dia),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Progresso" titulo="Você ainda não está em uma turma" />
        <p className="aviso">
          Assim que a escola matricular você, seu progresso aparece aqui.
        </p>
      </>
    );
  }

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const dados = consulta.data as SessaoSaida;
  const estudadas = dados.resumo.total - dados.resumo.vencendoHoje;
  const proporcao = dados.resumo.total === 0 ? 0 : estudadas / dados.resumo.total;

  return (
    <>
      <Cabecalho
        olho="Progresso"
        titulo={
          dados.sequenciaDeDias === 0
            ? 'Comece hoje a sua sequência'
            : `${dados.sequenciaDeDias} ${dados.sequenciaDeDias === 1 ? 'dia' : 'dias'} seguidos`
        }
        nota={
          dados.sequenciaDeDias === 0
            ? 'Estudar todo dia por pouco tempo funciona melhor que uma maratona por semana.'
            : 'Estudar hoje mantém a sequência. Faltar um dia zera.'
        }
      />

      <div className="bloco" style={{ maxWidth: 620 }}>
        <p className="bloco__titulo">Em {turma.nome}</p>

        <div className="barra" aria-label={`${Math.round(proporcao * 100)}% em dia`}>
          <div
            className="barra__cheia"
            style={{ width: `${Math.round(proporcao * 100)}%` }}
          />
        </div>

        <p className="lista__apoio" style={{ marginTop: 10 }}>
          {estudadas} de {dados.resumo.total} palavras em dia
        </p>
      </div>

      <div className="fichas">
        <div className="ficha">
          <span className="ficha__valor">{dados.resumo.vencendoHoje}</span>
          <span className="ficha__rotulo">para revisar</span>
        </div>
        <div className="ficha">
          <span className="ficha__valor">{dados.resumo.emDia}</span>
          <span className="ficha__rotulo">em dia</span>
        </div>
        <div className="ficha">
          <span className="ficha__valor">{dados.resumo.sinalizadas}</span>
          <span className="ficha__rotulo">com o professor</span>
        </div>
      </div>

      {dados.resumo.sinalizadas > 0 && (
        <div className="retorno retorno--atencao" style={{ maxWidth: 620 }}>
          {dados.resumo.sinalizadas === 1
            ? 'Uma palavra saiu da sua revisão porque você errou várias vezes. Ela volta depois que vocês virem em aula.'
            : `${dados.resumo.sinalizadas} palavras saíram da sua revisão porque você errou várias vezes. Elas voltam depois que vocês virem em aula.`}
        </div>
      )}
    </>
  );
}
