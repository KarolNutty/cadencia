import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MinhasTurmasSaida, TurmaDoProfessor } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { cores, fontes } from '../../compartilhado/estilos';
import { useSessao } from '../../compartilhado/sessao';
import { PainelDoAluno } from './PainelDoAluno';
import { desdeQuando, ordenarPorPrioridade, resumirTurma, situacaoDo } from './leitura';

type Aluno = TurmaDoProfessor['alunos'][number];

const APARENCIA = {
  travado: { rotulo: 'Travado', cor: cores.atencao, fundo: cores.atencaoFraca },
  sumido: { rotulo: 'Sumido', cor: cores.erro, fundo: '#FCECEE' },
  atrasado: { rotulo: 'Atrasado', cor: cores.marca, fundo: cores.marcaFraca },
  em_dia: { rotulo: 'Em dia', cor: cores.positivo, fundo: '#EAF4EF' },
} as const;

export function TelaTurma() {
  const { usuario, cliente, sair } = useSessao();
  const [alunoAberto, setAlunoAberto] = useState<Aluno | null>(null);

  const hoje = diaDeEstudoDe(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  const turmas = useQuery({
    queryKey: ['turmas'],
    queryFn: () => cliente.chamar<MinhasTurmasSaida>('/turmas'),
  });

  const turma = turmas.data?.turmas[0] ?? null;

  const painel = useQuery({
    queryKey: ['painel', turma?.id],
    queryFn: () => cliente.chamar<TurmaDoProfessor>(`/turmas/${turma!.id}/alunos`),
    enabled: Boolean(turma),
  });

  if (alunoAberto && turma) {
    return (
      <PainelDoAluno
        turmaId={turma.id}
        aluno={alunoAberto}
        aoVoltar={() => setAlunoAberto(null)}
      />
    );
  }

  const alunos = painel.data?.alunos ?? [];
  const ordenados = ordenarPorPrioridade(alunos, hoje);
  const resumo = resumirTurma(alunos, hoje);

  return (
    <div style={{ minHeight: '100vh', background: cores.fundo }}>
      <header
        style={{
          borderBottom: `1px solid ${cores.linha}`,
          background: cores.superficie,
        }}
      >
        <div style={faixa}>
          <div>
            <h1 style={{ fontFamily: fontes.titulo, fontSize: 24, margin: 0 }}>
              {turma?.nome ?? 'Cadência'}
            </h1>
            <p
              style={{
                fontFamily: fontes.texto,
                fontSize: 13,
                color: cores.textoFraco,
                margin: '2px 0 0',
              }}
            >
              {usuario?.nome}
            </p>
          </div>
          <button onClick={() => void sair()} style={botaoDiscreto}>
            Sair
          </button>
        </div>
      </header>

      <main style={{ ...faixa, display: 'block', paddingTop: 32, paddingBottom: 64 }}>
        {painel.isPending && <Mensagem texto="Carregando a turma…" />}

        {painel.isError && (
          <Mensagem texto="Não foi possível carregar a turma agora." tom="erro" />
        )}

        {painel.isSuccess && alunos.length === 0 && (
          <Mensagem texto="Nenhum aluno matriculado nesta turma ainda." />
        )}

        {painel.isSuccess && alunos.length > 0 && (
          <>
            {/* O número que abre a tela é o de alunos travados, e não o total
                de matriculados. Total é dado de cadastro; travado é o que muda
                o que o professor vai fazer na aula. */}
            <p
              style={{
                fontFamily: fontes.titulo,
                fontSize: 40,
                color: resumo.travados > 0 ? cores.texto : cores.textoFraco,
                margin: 0,
              }}
            >
              {resumo.travados}
            </p>
            <p
              style={{
                fontFamily: fontes.texto,
                color: cores.textoMedio,
                margin: '4px 0 28px',
              }}
            >
              {resumo.travados === 1
                ? 'aluno com palavra travada'
                : 'alunos com palavra travada'}
              {resumo.sumidos > 0 && ` · ${resumo.sumidos} sem estudar há uma semana`}
            </p>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: cores.superficie,
                border: `1px solid ${cores.linha}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {/* Tabela de verdade, e não uma pilha de divs: o leitor de tela
                  anuncia coluna e linha, e o teclado navega célula a célula. */}
              <caption style={{ position: 'absolute', left: -9999 }}>
                Alunos da turma, do mais urgente para o menos
              </caption>
              <thead>
                <tr>
                  {['Aluno', 'Situação', 'Último estudo', 'Sequência', 'Vencendo'].map(
                    (titulo) => (
                      <th key={titulo} scope="col" style={cabecalho}>
                        {titulo}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {ordenados.map((aluno) => {
                  const situacao = situacaoDo(aluno, hoje);
                  const aparencia = APARENCIA[situacao];

                  return (
                    <tr key={aluno.usuario.id}>
                      <td style={celula}>
                        <button
                          onClick={() => setAlunoAberto(aluno)}
                          style={{
                            ...botaoDiscreto,
                            color: cores.texto,
                            fontWeight: 600,
                            padding: 0,
                          }}
                        >
                          {aluno.usuario.nome}
                        </button>
                      </td>
                      <td style={celula}>
                        <span
                          style={{
                            fontFamily: fontes.texto,
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: aparencia.cor,
                            background: aparencia.fundo,
                            padding: '3px 9px',
                            borderRadius: 6,
                          }}
                        >
                          {aparencia.rotulo}
                          {situacao === 'travado' && ` · ${aluno.sinalizadas}`}
                        </span>
                      </td>
                      <td style={{ ...celula, color: cores.textoMedio }}>
                        {desdeQuando(aluno.ultimoEstudo, hoje)}
                      </td>
                      <td style={{ ...celula, color: cores.textoMedio }}>
                        {aluno.sequenciaDeDias === 1
                          ? '1 dia'
                          : `${aluno.sequenciaDeDias} dias`}
                      </td>
                      <td style={{ ...celula, color: cores.textoMedio }}>
                        {aluno.vencendoHoje}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </main>
    </div>
  );
}

function Mensagem({ texto, tom }: { texto: string; tom?: 'erro' }) {
  return (
    <p
      style={{
        fontFamily: fontes.texto,
        color: tom === 'erro' ? cores.erro : cores.textoMedio,
        padding: '32px 0',
      }}
    >
      {texto}
    </p>
  );
}

const faixa: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '16px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const botaoDiscreto: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: fontes.texto,
  fontSize: 14,
  color: cores.textoFraco,
  cursor: 'pointer',
};

const cabecalho: React.CSSProperties = {
  textAlign: 'left',
  fontFamily: fontes.texto,
  fontSize: 12,
  fontWeight: 600,
  color: cores.textoFraco,
  padding: '12px 16px',
  borderBottom: `1px solid ${cores.linha}`,
};

const celula: React.CSSProperties = {
  fontFamily: fontes.texto,
  fontSize: 14.5,
  color: cores.texto,
  padding: '14px 16px',
  borderBottom: `1px solid ${cores.linha}`,
};

export type { Aluno };
