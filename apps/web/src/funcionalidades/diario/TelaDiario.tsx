import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  AulasDaTurmaSaida,
  SituacaoDePresenca,
  TurmaDoProfessor,
} from '@cadencia/contrato';
import { chamadaInicial, diaDeEstudoDe } from '@cadencia/dominio';
import { FalhaDaApi } from '@cadencia/cliente-api';
import { Avatar } from '@/componentes/Avatar';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { fusoDoNavegador } from '@/config/dominio';
import { buscarAulas, buscarFrequencia, registrarAula } from '@/funcionalidades/diario/api';
import { useSessao } from '@/provedores/sessao';

const SITUACOES: { valor: SituacaoDePresenca; rotulo: string }[] = [
  { valor: 'presente', rotulo: 'Presente' },
  { valor: 'ausente', rotulo: 'Faltou' },
  { valor: 'justificada', rotulo: 'Justificada' },
];

export function TelaDiario() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const [registrando, setRegistrando] = useState(false);

  const aulas = useQuery({
    queryKey: ['aulas', turma?.id],
    queryFn: () => buscarAulas(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  const frequencia = useQuery({
    queryKey: ['frequencia', turma?.id],
    queryFn: () => buscarFrequencia(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Diário" titulo="Crie uma turma antes" />
        <p className="aviso">O diário registra as aulas de uma turma.</p>
      </>
    );
  }

  if (registrando) {
    return <RegistrarAula turmaId={turma.id} aoVoltar={() => setRegistrando(false)} />;
  }

  const lista = aulas.data?.aulas ?? [];
  const emRisco = (frequencia.data?.alunos ?? []).filter((aluno) => aluno.emRisco);

  return (
    <>
      <Cabecalho
        olho="Diário de classe"
        titulo={
          lista.length === 0
            ? 'Nenhuma aula registrada'
            : `${lista.length} ${lista.length === 1 ? 'aula registrada' : 'aulas registradas'}`
        }
        nota="Registre o que foi dado, quem veio e o dever de casa."
        acao={
          <button className="botao botao--pequeno" onClick={() => setRegistrando(true)}>
            Registrar aula
          </button>
        }
      />

      {emRisco.length > 0 && (
        <div className="retorno retorno--ruim medida">
          {emRisco.length === 1
            ? `${emRisco[0]!.nome} está com frequência abaixo do mínimo.`
            : `${emRisco.length} alunos estão com frequência abaixo do mínimo: ${emRisco
                .map((aluno) => aluno.nome.split(' ')[0])
                .join(', ')}.`}
        </div>
      )}

      {/* Estado vazio que diz o que fazer, e não só que não há nada. Um bloco
          com "nenhum registro" deixa a pessoa procurando onde começar. */}
      {lista.length === 0 && (
        <div className="vazio">
          <p className="vazio__titulo">O diário começa na primeira aula</p>
          <p className="vazio__texto">
            Registre o conteúdo dado, quem veio e o dever de casa. A frequência da turma sai
            daí, e o aluno passa a ver o próprio histórico.
          </p>
          <button className="botao botao--pequeno" onClick={() => setRegistrando(true)}>
            Registrar a primeira aula
          </button>
        </div>
      )}

      <div className="grade">
        {frequencia.data && frequencia.data.alunos.length > 0 && (
          <div className="bloco">
            <p className="bloco__titulo">Frequência</p>
            <ul className="lista">
              {frequencia.data.alunos.map((aluno) => (
                <li className="lista__item" key={aluno.alunoId}>
                  <div className="com-avatar">
                    <Avatar nome={aluno.nome} tamanho={32} />
                    <div>
                      <p className="lista__principal">{aluno.nome}</p>
                      <p className="lista__apoio">
                        {aluno.presentes} de {aluno.presentes + aluno.ausentes} aulas
                        {aluno.justificadas > 0 &&
                          `, ${aluno.justificadas} ${aluno.justificadas === 1 ? 'falta justificada' : 'faltas justificadas'}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`turma__estado turma__estado--${aluno.emRisco ? 'travado' : 'em_dia'}`}
                  >
                    {Math.round(aluno.taxa * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lista.length > 0 && <Aulas aulas={lista} />}
      </div>
    </>
  );
}

function Aulas({ aulas }: { aulas: AulasDaTurmaSaida['aulas'] }) {
  return (
    <div className="bloco">
      <p className="bloco__titulo">Aulas</p>
      <ul className="lista">
        {aulas.map((aula) => (
          <li className="lista__item" key={aula.id}>
            <div>
              <p className="lista__principal">{formatarDia(aula.dia)}</p>
              <p className="lista__apoio">{aula.conteudo}</p>
              {aula.dever && <p className="lista__apoio">dever: {aula.dever}</p>}
            </div>
            <span className="lista__apoio lista__apoio--inteiro">
              {aula.presentes} vieram
              {aula.ausentes > 0 && `, ${aula.ausentes} faltaram`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegistrarAula({ turmaId, aoVoltar }: { turmaId: string; aoVoltar: () => void }) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();

  const hoje = diaDeEstudoDe(new Date(), fusoDoNavegador());

  const painel = useQuery({
    queryKey: ['painel', turmaId],
    queryFn: () => cliente.chamar<TurmaDoProfessor>(`/turmas/${turmaId}/alunos`),
  });

  const [dia, setDia] = useState<string>(hoje);
  const [conteudo, setConteudo] = useState('');
  const [dever, setDever] = useState('');
  const [encontro, setEncontro] = useState('');
  const [chamada, setChamada] = useState<Record<string, SituacaoDePresenca>>({});

  const alunos = painel.data?.alunos ?? [];

  /*
   * A chamada nasce com todos presentes, e o professor marca as exceções.
   * Começar com todos ausentes obrigaria a marcar trinta pessoas numa aula
   * normal, e o esquecimento produziria falta em quem estava lá.
   */
  const situacaoDe = (alunoId: string): SituacaoDePresenca =>
    chamada[alunoId] ?? 'presente';

  const salvar = useMutation({
    mutationFn: () =>
      registrarAula(cliente, turmaId, {
        dia,
        conteudo: conteudo.trim(),
        dever: dever.trim() === '' ? null : dever.trim(),
        encontro: encontro.trim() === '' ? null : encontro.trim(),
        presencas: chamadaInicial(alunos.map((aluno) => aluno.usuario.id)).map(
          (registro) => ({
            alunoId: registro.alunoId,
            situacao: situacaoDe(registro.alunoId),
          }),
        ),
      }),
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['aulas'] });
      void consultas.invalidateQueries({ queryKey: ['frequencia'] });
      aoVoltar();
    },
  });

  return (
    <>
      <button className="discreto discreto--voltar" onClick={aoVoltar}>
        ← Voltar
      </button>

      <Cabecalho
        olho="Diário"
        titulo="Registrar aula"
        nota="Registrar o mesmo dia de novo substitui o registro anterior."
      />

      <div className="bloco">
        <p className="bloco__titulo">A aula</p>

        <div className="linha-de-campos">
          <label className="campo linha-de-campos__estreito">
            <span className="campo__rotulo">Dia</span>
            <input
              className="campo__entrada"
              type="date"
              value={dia}
              onChange={(evento) => setDia(evento.target.value)}
            />
          </label>

          <label className="campo">
            <span className="campo__rotulo">Link do encontro (opcional)</span>
            <input
              className="campo__entrada"
              value={encontro}
              onChange={(evento) => setEncontro(evento.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>

        <label className="campo campo--espacado">
          <span className="campo__rotulo">O que foi dado</span>
          <textarea
            className="area area--baixa"
            value={conteudo}
            onChange={(evento) => setConteudo(evento.target.value)}
            placeholder="Past simple, verbos irregulares mais comuns."
          />
        </label>

        <label className="campo">
          <span className="campo__rotulo">Dever de casa (opcional)</span>
          <textarea
            className="area area--baixa"
            value={dever}
            onChange={(evento) => setDever(evento.target.value)}
            placeholder="Exercícios 4 a 9, página 32."
          />
        </label>
      </div>

      <div className="bloco">
        <p className="bloco__titulo">Chamada</p>

        {alunos.length === 0 && (
          <p className="aviso aviso--interno">Ninguém matriculado nesta turma ainda.</p>
        )}

        <ul className="lista">
          {alunos.map((aluno) => (
            <li className="lista__item" key={aluno.usuario.id}>
              <span className="com-avatar">
                <Avatar nome={aluno.usuario.nome} tamanho={32} />
                <span className="lista__principal">{aluno.usuario.nome}</span>
              </span>

              <div className="chamada__opcoes" role="group" aria-label={aluno.usuario.nome}>
                {SITUACOES.map((opcao) => (
                  <button
                    key={opcao.valor}
                    className={`chamada__opcao${
                      situacaoDe(aluno.usuario.id) === opcao.valor
                        ? ` chamada__opcao--${opcao.valor}`
                        : ''
                    }`}
                    aria-pressed={situacaoDe(aluno.usuario.id) === opcao.valor}
                    onClick={() =>
                      setChamada((atual) => ({
                        ...atual,
                        [aluno.usuario.id]: opcao.valor,
                      }))
                    }
                  >
                    {opcao.rotulo}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {salvar.isError && (
        <div className="retorno retorno--ruim">
          {salvar.error instanceof FalhaDaApi
            ? salvar.error.corpo.mensagem
            : 'Não deu para registrar agora.'}
        </div>
      )}

      <button
        className="botao botao--medida"
        disabled={conteudo.trim().length < 3 || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? 'Registrando…' : 'Registrar aula'}
      </button>
    </>
  );
}

/** Data por extenso: "12 de agosto" diz mais que "2026-08-12" numa lista. */
function formatarDia(dia: string): string {
  const [ano, mes, data] = dia.split('-').map(Number);
  const nomes = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];

  return `${data} de ${nomes[(mes ?? 1) - 1]} de ${ano}`;
}
