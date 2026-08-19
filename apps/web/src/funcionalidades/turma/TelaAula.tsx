import { useQuery } from '@tanstack/react-query';
import type { PalavrasTravadasSaida, TurmaDoProfessor } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { Avatar } from '@/componentes/Avatar';
import { Cabecalho, useTurma } from '@/componentes/Estrutura';
import { useSessao } from '@/provedores/sessao';
import {
  desdeQuando,
  ordenarPorPrioridade,
  situacaoDo,
  type Situacao,
} from '@/funcionalidades/turma/leitura';

export type Aluno = TurmaDoProfessor['alunos'][number];
type Palavra = PalavrasTravadasSaida['palavras'][number];

const ROTULO: Record<Situacao, string> = {
  travado: 'travado',
  sumido: 'sumido',
  atrasado: 'atrasado',
  em_dia: 'em dia',
};

/** A partir de quantos alunos a palavra vira assunto da turma inteira. */
const MUITOS_ALUNOS = 3;

export function TelaAula({ aoAbrirAluno }: { aoAbrirAluno: (alunoId: string) => void }) {
  const { cliente } = useSessao();
  const { turma } = useTurma();

  const hoje = diaDeEstudoDe(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  const palavras = useQuery({
    queryKey: ['palavras', turma?.id],
    queryFn: () =>
      cliente.chamar<PalavrasTravadasSaida>(`/turmas/${turma!.id}/palavras-travadas`),
    enabled: Boolean(turma),
  });

  const painel = useQuery({
    queryKey: ['painel', turma?.id],
    queryFn: () => cliente.chamar<TurmaDoProfessor>(`/turmas/${turma!.id}/alunos`),
    enabled: Boolean(turma),
  });

  const lista = palavras.data?.palavras ?? [];
  const alunos = painel.data?.alunos ?? [];

  return (
    <>
      <Cabecalho olho="Para a próxima aula" titulo={titulo(lista)} nota={nota(lista)} />

      <div className="duas-colunas">
        <main>
          {palavras.isPending && <p className="aviso">Procurando o que travou…</p>}

          {palavras.isError && (
            <p className="aviso aviso--erro">
              Não deu para carregar agora. Atualize a página para tentar de novo.
            </p>
          )}

          {palavras.isSuccess && lista.length === 0 && (
            <p className="aviso">
              Ninguém empacou em nada até agora. Quando uma palavra for errada quatro vezes
              pelo mesmo aluno, ela aparece aqui, e sai da revisão dele até vocês verem
              juntos.
            </p>
          )}

          <ul className="verbetes" aria-label="Palavras travadas da turma">
            {lista.map((palavra, ordem) => (
              <Verbete key={palavra.cartao.id} palavra={palavra} ordem={ordem} />
            ))}
          </ul>
        </main>

        <aside>
          <p className="lateral__titulo">A turma</p>

          {painel.isPending && <p className="aviso">Carregando…</p>}

          {painel.isSuccess && alunos.length === 0 && (
            <p className="aviso">Ninguém matriculado ainda.</p>
          )}

          <ul className="turma" aria-label="Alunos da turma">
            {ordenarPorPrioridade(alunos, hoje).map((aluno) => {
              const situacao = situacaoDo(aluno, hoje);

              return (
                <li className="turma__aluno" key={aluno.usuario.id}>
                  <button
                    className="turma__nome com-avatar"
                    onClick={() => aoAbrirAluno(aluno.usuario.id)}
                  >
                    <Avatar nome={aluno.usuario.nome} tamanho={34} />
                    <span className="com-avatar__texto">
                      {aluno.usuario.nome}
                      <span className="turma__quando">
                        {desdeQuando(aluno.ultimoEstudo, hoje)}
                      </span>
                    </span>
                  </button>
                  <span className={`turma__estado turma__estado--${situacao}`}>
                    {ROTULO[situacao]}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </>
  );
}

/**
 * O verbete.
 *
 * A espinha à esquerda engrossa conforme mais alunos travam na mesma palavra, * quatro pixels por aluno, com teto. É o que permite varrer a coluna e achar o
 * assunto da aula sem ler nenhum número.
 */
function Verbete({ palavra, ordem }: { palavra: Palavra; ordem: number }) {
  const critico = palavra.alunos >= MUITOS_ALUNOS;

  return (
    <li
      className={`verbete${critico ? ' verbete--critico' : ''}`}
      style={{ '--ordem': ordem } as React.CSSProperties}
    >
      <p className="verbete__palavra">{palavra.cartao.frente}</p>
      <p className="verbete__traducao">{palavra.cartao.verso}</p>
      {palavra.cartao.dica && <p className="verbete__dica">{palavra.cartao.dica}</p>}

      <div className="verbete__rodape">
        <span className="verbete__quem">{quemTravou(palavra.nomes)}</span>
        <span
          className={`verbete__contagem${critico ? ' verbete__contagem--critica' : ''}`}
        >
          {palavra.errosTotais} erros
        </span>
      </div>
    </li>
  );
}

/**
 * Nomes por extenso até três; daí em diante, resumo.
 *
 * "Ana, Bruno e mais 4" cabe na linha e diz o que importa. A lista completa de
 * quinze nomes empurraria a próxima palavra para fora da tela.
 */
function quemTravou(nomes: readonly string[]): string {
  const primeiros = nomes.map((nome) => nome.split(' ')[0] ?? nome);

  if (primeiros.length === 1) return `${primeiros[0]} travou aqui`;
  if (primeiros.length === 2) return `${primeiros[0]} e ${primeiros[1]}`;
  if (primeiros.length === 3) {
    return `${primeiros[0]}, ${primeiros[1]} e ${primeiros[2]}`;
  }

  return `${primeiros[0]}, ${primeiros[1]} e mais ${primeiros.length - 2}`;
}

function titulo(palavras: readonly Palavra[]): string {
  if (palavras.length === 0) return 'Nada travado por enquanto';

  const primeira = palavras[0]!;

  if (primeira.alunos >= MUITOS_ALUNOS) {
    return `${primeira.alunos} alunos empacaram em “${primeira.cartao.frente}”`;
  }

  return palavras.length === 1
    ? 'Uma palavra para revisar'
    : `${palavras.length} palavras para revisar`;
}

function nota(palavras: readonly Palavra[]): string {
  if (palavras.length === 0) {
    return 'A turma está dando conta sozinha. Volte depois da próxima rodada de estudo.';
  }

  const alunos = new Set(palavras.flatMap((palavra) => palavra.nomes)).size;

  return `Estas palavras saíram da revisão de ${alunos} ${
    alunos === 1 ? 'aluno' : 'alunos'
  } porque erraram demais. Elas voltam quando vocês virem juntos em aula.`;
}
