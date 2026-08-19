import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FilaDeRedacoesSaida, Nivel, RedacaoSaida } from '@cadencia/contrato';
import { NOME_DO_CRITERIO } from '@cadencia/dominio';
import { Escolha } from '@/componentes/Escolha';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { NIVEIS } from '@/config/dominio';
import {
  buscarFilaDeRedacoes,
  buscarRedacao,
  criarTema,
  enviarParecer,
} from '@/funcionalidades/redacao/api';
import { useSessao } from '@/provedores/sessao';

type NaFila = FilaDeRedacoesSaida['redacoes'][number];

export function TelaCorrecoes() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const [aberta, setAberta] = useState<NaFila | null>(null);

  const fila = useQuery({
    queryKey: ['fila-redacoes', turma?.id],
    queryFn: () => buscarFilaDeRedacoes(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Redações" titulo="Crie uma turma antes" />
        <p className="aviso">Os temas de redação pertencem a uma turma.</p>
      </>
    );
  }

  if (aberta) return <Corrigir redacao={aberta} aoVoltar={() => setAberta(null)} />;

  const lista = fila.data?.redacoes ?? [];
  const pendentes = lista.filter((item) => !item.corrigida);

  return (
    <>
      <Cabecalho
        olho="Redações"
        titulo={
          pendentes.length === 0
            ? 'Nenhuma redação esperando'
            : `${pendentes.length} ${pendentes.length === 1 ? 'redação espera' : 'redações esperam'} seu parecer`
        }
        nota="A análise automática já apontou o que dá para ver sozinho. O que falta é o seu comentário."
      />

      <div className="grade">
        <NovoTema turmaId={turma.id} />

        {lista.length > 0 && (
          <div className="bloco">
            <p className="bloco__titulo">Entregues</p>
            <ul className="lista">
              {lista.map((item) => (
                <li className="lista__item" key={item.id}>
                  <div>
                    <p className="lista__principal">{item.nome}</p>
                    <p className="lista__apoio">
                      {item.tema} · {item.palavras} palavras
                    </p>
                  </div>
                  <div className="acoes">
                    {item.corrigida && (
                      <span className="turma__estado turma__estado--em_dia">corrigida</span>
                    )}
                    <button
                      className="botao botao--pequeno botao--secundario"
                      onClick={() => setAberta(item)}
                    >
                      {item.corrigida ? 'Rever' : 'Corrigir'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function NovoTema({ turmaId }: { turmaId: string }) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();

  const [titulo, setTitulo] = useState('');
  const [enunciado, setEnunciado] = useState('');
  const [nivel, setNivel] = useState<Nivel>('B1');

  const criar = useMutation({
    mutationFn: () => criarTema(cliente, turmaId, titulo.trim(), enunciado.trim(), nivel),
    onSuccess: () => {
      setTitulo('');
      setEnunciado('');
      void consultas.invalidateQueries({ queryKey: ['fila-redacoes'] });
    },
  });

  return (
    <div className="bloco">
      <p className="bloco__titulo">Propor tema</p>

      <div className="linha-de-campos">
        <label className="campo">
          <span className="campo__rotulo">Título</span>
          <input
            className="campo__entrada"
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            placeholder="Um dia inesquecível"
          />
        </label>

        <div className="linha-de-campos__estreito">
          <Escolha
            rotulo="Nível"
            valor={nivel}
            opcoes={NIVEIS.map((opcao) => ({ valor: opcao, rotulo: opcao }))}
            aoEscolher={(escolhido) => setNivel(escolhido as Nivel)}
          />
        </div>
      </div>

      <label className="campo campo--espacado">
        <span className="campo__rotulo">O que o aluno deve escrever</span>
        <textarea
          className="area area--baixa"
          value={enunciado}
          onChange={(evento) => setEnunciado(evento.target.value)}
          placeholder="Descreva um dia que você não esquece. Use o passado."
        />
      </label>

      <button
        className="botao botao--pequeno"
        disabled={
          titulo.trim().length < 3 || enunciado.trim().length < 10 || criar.isPending
        }
        onClick={() => criar.mutate()}
      >
        {criar.isPending ? 'Criando…' : 'Propor tema'}
      </button>
    </div>
  );
}

function Corrigir({ redacao, aoVoltar }: { redacao: NaFila; aoVoltar: () => void }) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();

  const [parecer, setParecer] = useState('');
  const [nota, setNota] = useState<string>('');

  const consulta = useQuery({
    queryKey: ['redacao-professor', redacao.id],
    queryFn: () => buscarRedacao(cliente, redacao.id),
  });

  const enviar = useMutation({
    mutationFn: () =>
      enviarParecer(cliente, redacao.id, parecer.trim(), nota === '' ? null : Number(nota)),
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['fila-redacoes'] });
      aoVoltar();
    },
  });

  if (consulta.isPending) return <p className="aviso">Carregando…</p>;

  const dados = consulta.data as RedacaoSaida & { aluno?: string; enunciado?: string };
  const validos = dados.apontamentos.filter((a) => a.encontrado);

  return (
    <>
      <button className="discreto discreto--voltar" onClick={aoVoltar}>
        ← Voltar
      </button>

      <Cabecalho
        olho={redacao.tema}
        titulo={redacao.nome}
        nota={`${dados.tamanho.palavras} palavras${dados.tamanho.situacao === 'curto' ? ` · abaixo do esperado para o nível (${dados.tamanho.minimo}+)` : ''}`}
      />

      <div className="bloco">
        <p className="bloco__titulo">O texto</p>
        <p className="texto-do-aluno">{dados.texto}</p>
      </div>

      {validos.length > 0 && (
        <div className="bloco">
          <p className="bloco__titulo">O que a análise apontou · confira antes de usar</p>
          <ul className="apontamentos">
            {validos.map((apontamento, indice) => (
              <li className="apontamento" key={indice}>
                <span className="apontamento__criterio">
                  {NOME_DO_CRITERIO[apontamento.criterio]}
                </span>
                <p className="apontamento__troca">
                  <span className="apontamento__antes">{apontamento.trecho}</span>
                  <span className="apontamento__seta">→</span>
                  <span className="apontamento__depois">{apontamento.sugestao}</span>
                </p>
                <p className="apontamento__explicacao">{apontamento.explicacao}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bloco">
        <p className="bloco__titulo">Seu parecer</p>

        <textarea
          className="area area--media"
          value={parecer}
          onChange={(evento) => setParecer(evento.target.value)}
          placeholder="O que o aluno fez bem, e o que trabalhar na próxima."
        />

        <div className="linha-de-campos linha-de-campos--espacada">
          <label className="campo linha-de-campos__estreito">
            <span className="campo__rotulo">Nota (opcional)</span>
            <input
              className="campo__entrada"
              type="number"
              min={0}
              max={10}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
            />
          </label>

          <button
            className="botao botao--pequeno"
            disabled={parecer.trim().length === 0 || enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            {enviar.isPending ? 'Enviando…' : 'Enviar parecer'}
          </button>
        </div>
      </div>
    </>
  );
}
