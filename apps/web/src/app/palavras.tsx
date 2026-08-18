import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ImportarPalavrasSaida, Nivel } from '@cadencia/contrato';
import { EXEMPLO_DE_LISTA } from '@cadencia/dominio';
import { Escolha } from '@/components/Escolha';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { useSessao } from '@/providers/sessao';
import { apagarBaralho, buscarBaralhos, criarBaralho, importarPalavras } from '@/lib/api';

const NIVEIS: Nivel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function TelaPalavras() {
  const { cliente } = useSessao();
  const { turma } = useTurma();
  const consultas = useQueryClient();

  const [baralhoAberto, setBaralhoAberto] = useState<string | null>(null);

  const baralhos = useQuery({
    queryKey: ['baralhos', turma?.id],
    queryFn: () => buscarBaralhos(cliente, turma!.id),
    enabled: Boolean(turma),
  });

  const novo = useMutation({
    mutationFn: ({ titulo, nivel }: { titulo: string; nivel: Nivel | null }) =>
      criarBaralho(cliente, turma!.id, titulo, nivel),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['baralhos'] }),
  });

  const remover = useMutation({
    mutationFn: (baralhoId: string) => apagarBaralho(cliente, baralhoId),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['baralhos'] }),
  });

  const [titulo, setTitulo] = useState('');
  const [nivel, setNivel] = useState<Nivel | ''>('');

  if (!turma) {
    return (
      <>
        <Cabecalho olho="Palavras" titulo="Crie uma turma antes" />
        <p className="aviso">
          As palavras pertencem a um baralho, e o baralho pertence a uma turma.
        </p>
      </>
    );
  }

  const lista = baralhos.data?.baralhos ?? [];

  return (
    <>
      <Cabecalho
        olho="Palavras"
        titulo="O conteúdo da turma"
        nota="Cada baralho reúne as palavras de uma etapa do curso. Os alunos revisam tudo que estiver aqui."
      />

      <div className="bloco">
        <p className="bloco__titulo">Novo baralho</p>
        <div className="linha-de-campos">
          <label className="campo">
            <span className="campo__rotulo">Título</span>
            <input
              className="campo__entrada"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              placeholder="Verbos do dia a dia"
            />
          </label>

          <div style={{ flex: '0 0 130px', minWidth: 130 }}>
            <Escolha
              rotulo="Nível"
              valor={nivel}
              opcoes={[
                { valor: '', rotulo: 'Sem nível' },
                ...NIVEIS.map((opcao) => ({ valor: opcao, rotulo: opcao })),
              ]}
              aoEscolher={(escolhido) => setNivel(escolhido as Nivel | '')}
            />
          </div>

          <button
            className="botao botao--pequeno"
            disabled={titulo.trim().length < 2 || novo.isPending}
            onClick={() => {
              novo.mutate(
                { titulo: titulo.trim(), nivel: nivel === '' ? null : nivel },
                { onSuccess: () => setTitulo('') },
              );
            }}
          >
            {novo.isPending ? 'Criando…' : 'Criar baralho'}
          </button>
        </div>
      </div>

      {baralhos.isPending && <p className="aviso">Carregando…</p>}

      {baralhos.isSuccess && lista.length === 0 && (
        <p className="aviso">
          Nenhum baralho ainda. Crie o primeiro acima e cole sua lista de palavras — aceita
          a que você já tem no caderno ou na planilha.
        </p>
      )}

      {lista.map((baralho) => (
        <div className="bloco" key={baralho.id}>
          <div className="lista__item" style={{ borderBottom: 'none', padding: 0 }}>
            <div>
              <p className="lista__principal">
                {baralho.titulo}
                {baralho.nivel && (
                  <span
                    className="turma__estado turma__estado--atrasado"
                    style={{ marginLeft: 8 }}
                  >
                    {baralho.nivel}
                  </span>
                )}
              </p>
              <p className="lista__apoio">
                {baralho.palavras} {baralho.palavras === 1 ? 'palavra' : 'palavras'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <button
                className="botao botao--pequeno botao--secundario"
                onClick={() =>
                  setBaralhoAberto(baralhoAberto === baralho.id ? null : baralho.id)
                }
              >
                {baralhoAberto === baralho.id ? 'Fechar' : 'Colar palavras'}
              </button>
              <button
                className="perigo"
                onClick={() => {
                  if (
                    confirm(
                      `Apagar "${baralho.titulo}" e as ${baralho.palavras} palavras dele? O histórico de estudo dos alunos vai junto.`,
                    )
                  ) {
                    remover.mutate(baralho.id);
                  }
                }}
              >
                Apagar
              </button>
            </div>
          </div>

          {baralhoAberto === baralho.id && (
            <Importacao baralhoId={baralho.id} aoTerminar={() => setBaralhoAberto(null)} />
          )}
        </div>
      ))}
    </>
  );
}

/**
 * A caixa de colar.
 *
 * A entrada é o texto que o professor já tem, e o trabalho de entender o
 * formato é do software. O exemplo fica visível antes de ele colar qualquer
 * coisa: explicar o formato em prosa custa um parágrafo que ninguém lê.
 */
function Importacao({
  baralhoId,
  aoTerminar,
}: {
  baralhoId: string;
  aoTerminar: () => void;
}) {
  const { cliente } = useSessao();
  const consultas = useQueryClient();
  const [texto, setTexto] = useState('');

  const enviar = useMutation({
    mutationFn: () => importarPalavras(cliente, baralhoId, texto),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['baralhos'] }),
  });

  const resultado = enviar.data;

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--pauta)', paddingTop: 20 }}>
      <label className="campo">
        <span className="campo__rotulo">Uma palavra por linha</span>
        <textarea
          className="area"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder={EXEMPLO_DE_LISTA}
          spellCheck={false}
        />
      </label>

      <p className="lista__apoio" style={{ marginBottom: 14 }}>
        Separe com travessão, ponto e vírgula, tabulação ou sinal de igual. Um segundo
        separador vira dica. O que já existir no baralho é ignorado.
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="botao botao--pequeno"
          disabled={texto.trim().length === 0 || enviar.isPending}
          onClick={() => enviar.mutate()}
        >
          {enviar.isPending ? 'Importando…' : 'Importar'}
        </button>

        {resultado && (
          <button
            className="botao botao--pequeno botao--secundario"
            onClick={() => {
              setTexto('');
              enviar.reset();
              aoTerminar();
            }}
          >
            Terminei
          </button>
        )}
      </div>

      {enviar.isError && (
        <div className="retorno retorno--ruim">Não deu para importar agora.</div>
      )}

      {resultado && <Retorno resultado={resultado} />}
    </div>
  );
}

/**
 * O que aconteceu com a lista.
 *
 * As linhas problemáticas voltam com número e motivo. Dizer só "3 palavras
 * importadas" deixaria o professor procurando sozinho o que faltou — e ele
 * provavelmente colaria tudo de novo.
 */
function Retorno({ resultado }: { resultado: ImportarPalavrasSaida }) {
  const problemas = [...resultado.problemas, ...resultado.repetidas];

  return (
    <>
      <div
        className={`retorno ${resultado.criadas > 0 ? 'retorno--bom' : 'retorno--atencao'}`}
      >
        {resultado.criadas === 0
          ? 'Nenhuma palavra nova entrou.'
          : `${resultado.criadas} ${resultado.criadas === 1 ? 'palavra entrou' : 'palavras entraram'}.`}
        {resultado.jaExistiam > 0 &&
          ` ${resultado.jaExistiam} já estavam no baralho e foram ignoradas.`}
      </div>

      {problemas.length > 0 && (
        <div className="retorno retorno--atencao">
          {problemas.length === 1
            ? 'Uma linha ficou de fora:'
            : `${problemas.length} linhas ficaram de fora:`}
          <ul className="retorno__lista">
            {problemas.slice(0, 8).map((problema) => (
              <li key={problema.linha}>
                <strong>linha {problema.linha}</strong> · {problema.motivo}
              </li>
            ))}
          </ul>
          {problemas.length > 8 && (
            <p style={{ margin: '8px 0 0' }}>e mais {problemas.length - 8}.</p>
          )}
        </div>
      )}
    </>
  );
}
