import { useQuery } from '@tanstack/react-query';
import type { MinhasAulasSaida } from '@cadencia/contrato';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { buscarMinhasAulas } from '@/funcionalidades/diario/api';
import { useSessao } from '@/provedores/sessao';

const ROTULO = {
  presente: 'presente',
  ausente: 'faltou',
  justificada: 'justificada',
} as const;

export function TelaAulas() {
  const { cliente } = useSessao();
  const { turma } = useTurma();

  const consulta = useQuery({
    queryKey: ['minhas-aulas', turma?.id],
    queryFn: () => buscarMinhasAulas(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Aulas" titulo="Você ainda não está em uma turma" />
        <p className="aviso">As aulas e o dever de casa aparecem aqui.</p>
      </>
    );
  }

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const dados = consulta.data as MinhasAulasSaida;
  const comDever = dados.aulas.filter((aula) => aula.dever);

  return (
    <>
      <Cabecalho
        olho="Aulas"
        titulo={
          dados.aulas.length === 0
            ? 'Nenhuma aula registrada ainda'
            : `${Math.round(dados.frequencia.taxa * 100)}% de presença`
        }
        nota={
          dados.emRisco
            ? 'Sua frequência está abaixo do mínimo. Fale com o professor.'
            : dados.aulas.length > 0
              ? `Você veio a ${dados.frequencia.presentes} de ${dados.frequencia.presentes + dados.frequencia.ausentes} aulas.`
              : undefined
        }
      />

      {comDever.length > 0 && (
        <div className="bloco">
          {/* O dever da última aula vem primeiro: é o que o aluno abriu a tela
              para ver, e não o histórico. */}
          <p className="bloco__titulo">Dever mais recente</p>
          <p className="parecer__texto">{comDever[0]!.dever}</p>
          <p className="lista__apoio lista__apoio--apos-barra">
            passado na aula de {comDever[0]!.dia}
          </p>
        </div>
      )}

      <div className="bloco">
        <p className="bloco__titulo">Histórico</p>

        {dados.aulas.length === 0 && (
          <p className="aviso aviso--interno">
            O professor ainda não registrou nenhuma aula.
          </p>
        )}

        <ul className="lista">
          {dados.aulas.map((aula) => (
            <li className="lista__item" key={aula.id}>
              <div>
                <p className="lista__principal">{aula.conteudo}</p>
                <p className="lista__apoio">
                  {aula.dia}
                  {aula.dever && ` · dever: ${aula.dever}`}
                </p>
                {aula.encontro && (
                  <a
                    className="lista__apoio"
                    href={aula.encontro}
                    target="_blank"
                    rel="noreferrer"
                  >
                    link do encontro
                  </a>
                )}
              </div>

              {aula.situacao && (
                <span
                  className={`turma__estado turma__estado--${
                    aula.situacao === 'presente'
                      ? 'em_dia'
                      : aula.situacao === 'justificada'
                        ? 'atrasado'
                        : 'travado'
                  }`}
                >
                  {ROTULO[aula.situacao]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
