import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { MatricularSaida, TurmaDoProfessor } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { FalhaDaApi } from '@cadencia/cliente-api';
import { Cabecalho, useTurma } from '../../compartilhado/Estrutura';
import { useSessao } from '../../compartilhado/sessao';
import {
  desdeQuando,
  ordenarPorPrioridade,
  situacaoDo,
  type Situacao,
} from '../turma/leitura';
import { desmatricular, matricular } from './api';

const ROTULO: Record<Situacao, string> = {
  travado: 'travado',
  sumido: 'sumido',
  atrasado: 'atrasado',
  em_dia: 'em dia',
};

const RECADO: Record<MatricularSaida['situacao'], (nome: string) => string> = {
  matriculado: (nome) => `${nome} entrou na turma.`,
  // A distinção importa: o professor precisa saber que tem de avisar a pessoa.
  convidado: () => 'Convite guardado. A pessoa entra na turma assim que criar a conta.',
  ja_estava: (nome) => `${nome} já estava na turma.`,
};

export function TelaAlunos({ aoAbrirAluno }: { aoAbrirAluno: (alunoId: string) => void }) {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const consultas = useQueryClient();

  const [email, setEmail] = useState('');
  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = diaDeEstudoDe(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  const painel = useQuery({
    queryKey: ['painel', turma?.id],
    queryFn: () => cliente.chamar<TurmaDoProfessor>(`/turmas/${turma!.id}/alunos`),
    enabled: Boolean(turma),
  });

  const adicionar = useMutation({
    mutationFn: () => matricular(cliente, turma!.id, email.trim()),
    onSuccess: (saida) => {
      setRecado(RECADO[saida.situacao](saida.aluno?.nome ?? email.trim()));
      setErro(null);
      setEmail('');
      void consultas.invalidateQueries({ queryKey: ['painel'] });
    },
    onError: (causa) => {
      setRecado(null);
      setErro(
        causa instanceof FalhaDaApi ? causa.corpo.mensagem : 'Não deu para matricular.',
      );
    },
  });

  const remover = useMutation({
    mutationFn: (alunoId: string) => desmatricular(cliente, turma!.id, alunoId),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['painel'] }),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Alunos" titulo="Crie uma turma antes" />
        <p className="aviso">Alunos são matriculados numa turma.</p>
      </>
    );
  }

  const alunos = painel.data?.alunos ?? [];

  return (
    <>
      <Cabecalho
        olho="Alunos"
        titulo={`${alunos.length} ${alunos.length === 1 ? 'aluno' : 'alunos'} em ${turma.nome}`}
        nota="Quem ainda não tem conta fica convidado, e entra sozinho ao se cadastrar com o mesmo e-mail."
      />

      <div className="bloco">
        <p className="bloco__titulo">Matricular</p>
        <div className="linha-de-campos">
          <label className="campo">
            <span className="campo__rotulo">E-mail do aluno</span>
            <input
              className="campo__entrada"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="aluno@escola.com.br"
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && email.includes('@')) adicionar.mutate();
              }}
            />
          </label>
          <button
            className="botao botao--pequeno"
            disabled={!email.includes('@') || adicionar.isPending}
            onClick={() => adicionar.mutate()}
          >
            {adicionar.isPending ? 'Matriculando…' : 'Matricular'}
          </button>
        </div>

        {recado && <div className="retorno retorno--bom">{recado}</div>}
        {erro && <div className="retorno retorno--ruim">{erro}</div>}
      </div>

      <div className="bloco">
        <p className="bloco__titulo">Na turma</p>

        {painel.isPending && <p className="aviso">Carregando…</p>}

        {painel.isSuccess && alunos.length === 0 && (
          <p className="aviso" style={{ padding: '12px 0' }}>
            Ninguém matriculado ainda. Use o campo acima.
          </p>
        )}

        <ul className="lista">
          {ordenarPorPrioridade(alunos, hoje).map((aluno) => {
            const situacao = situacaoDo(aluno, hoje);

            return (
              <li className="lista__item" key={aluno.usuario.id}>
                <div>
                  <button
                    className="turma__nome"
                    style={{ fontSize: 15 }}
                    onClick={() => aoAbrirAluno(aluno.usuario.id)}
                  >
                    {aluno.usuario.nome}
                  </button>
                  <p className="lista__apoio">
                    {aluno.usuario.email} · estudou {desdeQuando(aluno.ultimoEstudo, hoje)}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className={`turma__estado turma__estado--${situacao}`}>
                    {ROTULO[situacao]}
                    {situacao === 'travado' && ` · ${aluno.sinalizadas}`}
                  </span>
                  <button
                    className="perigo"
                    onClick={() => {
                      if (confirm(`Tirar ${aluno.usuario.nome} da turma?`)) {
                        remover.mutate(aluno.usuario.id);
                      }
                    }}
                  >
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
