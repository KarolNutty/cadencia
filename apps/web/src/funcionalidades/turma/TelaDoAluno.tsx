import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartasSinalizadasSaida, TurmaDoProfessor } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { useSessao } from '@/provedores/sessao';
import { destravarPalavra } from '@/funcionalidades/turma/api';
import { desdeQuando } from '@/funcionalidades/turma/leitura';

/**
 * O que travou para um aluno específico.
 *
 * A tela da aula responde "o que ensino hoje". Esta responde "e a Marina, como
 * está?", a pergunta que vem quando o professor repara em alguém.
 */
export function PainelDoAluno({
  alunoId,
  aoVoltar,
}: {
  alunoId: string;
  aoVoltar: () => void;
}) {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const consultas = useQueryClient();

  const hoje = diaDeEstudoDe(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  const painel = useQuery({
    queryKey: ['painel', turma?.id],
    queryFn: () => cliente.chamar<TurmaDoProfessor>(`/turmas/${turma!.id}/alunos`),
    enabled: Boolean(turma),
  });

  const travadas = useQuery({
    queryKey: ['sinalizadas', turma?.id, alunoId],
    queryFn: () =>
      cliente.chamar<CartasSinalizadasSaida>(
        `/turmas/${turma!.id}/alunos/${alunoId}/sinalizadas`,
      ),
    enabled: Boolean(turma),
  });

  const destravar = useMutation({
    mutationFn: (cartaoId: string) =>
      destravarPalavra(cliente, turma!.id, alunoId, cartaoId),
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['sinalizadas'] });
      void consultas.invalidateQueries({ queryKey: ['palavras'] });
      void consultas.invalidateQueries({ queryKey: ['painel'] });
    },
  });

  const aluno = painel.data?.alunos.find((candidato) => candidato.usuario.id === alunoId);
  const cartas = travadas.data?.cartas ?? [];

  return (
    <>
      <button className="discreto discreto--voltar" onClick={aoVoltar}>
        ← Voltar
      </button>

      <Cabecalho
        olho="Aluno"
        titulo={aluno?.usuario.nome ?? 'Carregando…'}
        nota={
          aluno
            ? `Estudou ${desdeQuando(aluno.ultimoEstudo, hoje)} · sequência de ${aluno.sequenciaDeDias} ${aluno.sequenciaDeDias === 1 ? 'dia' : 'dias'} · ${aluno.vencendoHoje} ${aluno.vencendoHoje === 1 ? 'palavra' : 'palavras'} para revisar hoje`
            : undefined
        }
      />

      {travadas.isPending && <p className="aviso">Carregando…</p>}

      {travadas.isSuccess && cartas.length === 0 && (
        <p className="aviso">
          Nada travou. O que este aluno erra, ele recupera sozinho revisando, não precisa de
          aula sobre isso.
        </p>
      )}

      <ul className="verbetes" aria-label="Palavras travadas deste aluno">
        {cartas.map((carta, ordem) => (
          <li
            className="verbete"
            key={carta.cartao.id}
            style={{ '--ordem': ordem } as React.CSSProperties}
          >
            <p className="verbete__palavra">{carta.cartao.frente}</p>
            <span className="verbete__contagem verbete__contagem--critica">
              {carta.lapsos} {carta.lapsos === 1 ? 'erro' : 'erros'}
            </span>
            <p className="verbete__traducao">{carta.cartao.verso}</p>
            {carta.cartao.dica && <p className="verbete__dica">{carta.cartao.dica}</p>}

            <div className="verbete__rodape">
              <span className="verbete__quem">
                última revisão {desdeQuando(carta.ultimaRevisao, hoje)}
              </span>

              {/* Fecha o ciclo: o professor explica em aula e devolve a palavra
                  ao estudo. Sem isto ela sumiria da vida do aluno para sempre. */}
              <button
                className="botao botao--pequeno botao--secundario"
                disabled={destravar.isPending}
                onClick={() => destravar.mutate(carta.cartao.id)}
              >
                Revisamos em aula
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
