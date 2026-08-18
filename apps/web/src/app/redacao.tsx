import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Apontamento, RedacaoSaida, TemaDeRedacao } from '@cadencia/contrato';
import { NOME_DO_CRITERIO, contarPalavras } from '@cadencia/dominio';
import { FalhaDaApi } from '@cadencia/cliente-api';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { buscarMinhaRedacao, buscarTemas, enviarRedacao } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

export function TelaRedacao() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const [temaAberto, setTemaAberto] = useState<TemaDeRedacao | null>(null);

  const temas = useQuery({
    queryKey: ['temas', turma?.id],
    queryFn: () => buscarTemas(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Redação" titulo="Você ainda não está em uma turma" />
        <p className="aviso">Os temas de redação são propostos pelo professor da turma.</p>
      </>
    );
  }

  if (temaAberto) {
    return <Escrever tema={temaAberto} aoVoltar={() => setTemaAberto(null)} />;
  }

  const lista = temas.data?.temas ?? [];

  return (
    <>
      <Cabecalho
        olho="Redação"
        titulo={lista.length === 0 ? 'Nenhum tema proposto ainda' : 'Escolha um tema'}
        nota="Você escreve, recebe uma análise na hora e o professor comenta depois."
      />

      {temas.isPending && <p className="aviso">Carregando…</p>}

      <ul className="lista">
        {lista.map((tema) => (
          <li className="lista__item" key={tema.id}>
            <div>
              <p className="lista__principal">{tema.titulo}</p>
              <p className="lista__apoio">
                nível {tema.nivel}
                {tema.corrigida
                  ? ' · corrigida pelo professor'
                  : tema.entregue
                    ? ' · entregue, aguardando o professor'
                    : ''}
              </p>
            </div>
            <button
              className="botao botao--pequeno botao--secundario"
              onClick={() => setTemaAberto(tema)}
            >
              {tema.entregue ? 'Ver' : 'Escrever'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Escrever({ tema, aoVoltar }: { tema: TemaDeRedacao; aoVoltar: () => void }) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  const [texto, setTexto] = useState('');

  const existente = useQuery({
    queryKey: ['redacao', tema.id],
    queryFn: () => buscarMinhaRedacao(cliente, tema.id),
    enabled: tema.entregue,
    retry: false,
  });

  const enviar = useMutation({
    mutationFn: () => enviarRedacao(cliente, tema.id, texto),
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['temas'] });
      void consultas.invalidateQueries({ queryKey: ['redacao'] });
    },
  });

  const resultado = enviar.data ?? existente.data ?? null;
  const palavras = contarPalavras(texto);

  return (
    <>
      <button className="discreto" onClick={aoVoltar} style={{ marginBottom: 16 }}>
        ← Voltar
      </button>

      <Cabecalho olho={`Nível ${tema.nivel}`} titulo={tema.titulo} nota={tema.enunciado} />

      {resultado ? (
        <Correcao redacao={resultado} aoReescrever={() => enviar.reset()} />
      ) : (
        <>
          <textarea
            className="area"
            style={{ minHeight: 320 }}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Escreva aqui, em inglês…"
          />

          <div className="escrita__rodape">
            {/* A contagem é feita aqui e no servidor, pelo mesmo módulo. O
                modelo de linguagem nunca conta — ele erra número com confiança
                total, e um número errado mina a confiança no resto. */}
            <span className="lista__apoio">
              {palavras} {palavras === 1 ? 'palavra' : 'palavras'}
            </span>

            <button
              className="botao botao--pequeno"
              disabled={palavras === 0 || enviar.isPending}
              onClick={() => enviar.mutate()}
            >
              {enviar.isPending ? 'Analisando…' : 'Enviar'}
            </button>
          </div>

          {enviar.isError && (
            <div className="retorno retorno--ruim">
              {enviar.error instanceof FalhaDaApi
                ? enviar.error.corpo.mensagem
                : 'Não deu para enviar agora.'}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Correcao({
  redacao,
  aoReescrever,
}: {
  redacao: RedacaoSaida;
  aoReescrever: () => void;
}) {
  const validos = redacao.apontamentos.filter((a) => a.encontrado);
  const duvidosos = redacao.apontamentos.filter((a) => !a.encontrado);

  return (
    <>
      {redacao.parecer && (
        <div className="parecer">
          <p className="bloco__titulo">O que o professor disse</p>
          <p className="parecer__texto">{redacao.parecer}</p>
          {redacao.nota !== null && redacao.nota !== undefined && (
            <p className="parecer__nota">nota {redacao.nota}</p>
          )}
        </div>
      )}

      <div className="fichas">
        <div
          className={`ficha${redacao.tamanho.situacao === 'no_alvo' ? ' ficha--destaque' : ''}`}
        >
          <span className="ficha__valor">{redacao.tamanho.palavras}</span>
          <span className="ficha__rotulo">
            {redacao.tamanho.situacao === 'curto'
              ? `palavras · esperado ${redacao.tamanho.minimo}+`
              : 'palavras'}
          </span>
        </div>
        <div className="ficha">
          <span className="ficha__valor">{validos.length}</span>
          <span className="ficha__rotulo">pontos a revisar</span>
        </div>
      </div>

      {redacao.resumo && (
        <div className="retorno retorno--bom" style={{ maxWidth: 680 }}>
          {redacao.resumo}
        </div>
      )}

      {validos.length === 0 && redacao.analisadaPorIa && (
        <p className="aviso">A análise não encontrou pontos a corrigir.</p>
      )}

      {!redacao.analisadaPorIa && (
        <div className="retorno retorno--atencao" style={{ maxWidth: 680 }}>
          Seu texto foi salvo, mas a análise automática não funcionou desta vez. O professor
          vai corrigir mesmo assim.
        </div>
      )}

      <ul className="apontamentos">
        {validos.map((apontamento, indice) => (
          <ItemDeApontamento key={indice} apontamento={apontamento} />
        ))}
      </ul>

      {duvidosos.length > 0 && (
        <details className="duvidosos">
          {/* Não são escondidos: o professor precisa poder ver o modelo errando. */}
          <summary>
            {duvidosos.length} {duvidosos.length === 1 ? 'observação' : 'observações'} que
            não localizamos no seu texto
          </summary>
          <ul className="apontamentos">
            {duvidosos.map((apontamento, indice) => (
              <ItemDeApontamento key={indice} apontamento={apontamento} />
            ))}
          </ul>
        </details>
      )}

      {!redacao.corrigida && (
        <button className="botao botao--pequeno botao--secundario" onClick={aoReescrever}>
          Reescrever
        </button>
      )}
    </>
  );
}

function ItemDeApontamento({ apontamento }: { apontamento: Apontamento }) {
  return (
    <li className="apontamento">
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
  );
}
