import { useQuery } from '@tanstack/react-query';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { fusoDoNavegador } from '@/config/dominio';
import { buscarRanking } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

export function TelaRanking() {
  const { usuario, cliente } = useSessao();
  const { turma } = useTurma();

  const dia = diaDeEstudoDe(new Date(), fusoDoNavegador());

  const consulta = useQuery({
    queryKey: ['ranking', turma?.id, dia],
    queryFn: () => buscarRanking(cliente, turma!.id, dia),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Ranking" titulo="Você ainda não está em uma turma" />
        <p className="aviso">O ranking compara você com os colegas da sua turma.</p>
      </>
    );
  }

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const linhas = consulta.data?.ranking ?? [];
  const minha = linhas.find((linha) => linha.alunoId === usuario?.id);

  return (
    <>
      <Cabecalho
        olho="Esta semana"
        titulo={
          minha && minha.xpNaSemana > 0
            ? `Você está em ${minha.posicao}º`
            : 'A semana está começando'
        }
        // Explicar que zera toda semana é o que impede o ranking desanimar:
        // sem isso, quem está atrás acha que nunca vai alcançar.
        nota="O ranking recomeça toda segunda. Quem estudou pouco esta semana ainda tem chance de virar."
      />

      <ol className="ranking">
        {linhas.map((linha) => {
          const eu = linha.alunoId === usuario?.id;

          return (
            <li
              key={linha.alunoId}
              className={`ranking__linha${eu ? ' ranking__linha--eu' : ''}`}
            >
              <span
                className={`ranking__posicao${linha.posicao <= 3 ? ' ranking__posicao--topo' : ''}`}
              >
                {linha.posicao}
              </span>

              <div className="ranking__quem">
                <span className="ranking__nome">
                  {eu ? 'Você' : primeiroNome(linha.nome)}
                </span>
                {linha.ofensiva > 0 && (
                  <span className="ranking__ofensiva">
                    {linha.ofensiva}{' '}
                    {linha.ofensiva === 1 ? 'dia seguido' : 'dias seguidos'}
                  </span>
                )}
              </div>

              <span className="ranking__xp">{linha.xpNaSemana} XP</span>
            </li>
          );
        })}
      </ol>

      {linhas.every((linha) => linha.xpNaSemana === 0) && (
        <p className="aviso">
          Ninguém pontuou ainda esta semana. Quem estudar primeiro abre a lista.
        </p>
      )}
    </>
  );
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
