import { useState } from 'react';
import { Estrutura } from '@/componentes/Estrutura';
import { type Secao, secaoInicialDe } from '@/config/secoes';
import { TelaEntrar } from '@/funcionalidades/autenticacao/TelaEntrar';
import { TelaAula } from '@/funcionalidades/turma/TelaAula';
import { TelaAlunos } from '@/funcionalidades/turma/TelaAlunos';
import { TelaPalavras } from '@/funcionalidades/conteudo/TelaPalavras';
import { TelaTurmas } from '@/funcionalidades/turma/TelaTurmas';
import { TelaEstudar } from '@/funcionalidades/estudo/TelaEstudar';
import { TelaNivelamento } from '@/funcionalidades/nivelamento/TelaNivelamento';
import { TelaProgresso } from '@/funcionalidades/estudo/TelaProgresso';
import { TelaAulas } from '@/funcionalidades/diario/TelaAulas';
import { TelaConversa } from '@/funcionalidades/conversa/TelaConversa';
import { TelaDiario } from '@/funcionalidades/diario/TelaDiario';
import { TelaCorrecoes } from '@/funcionalidades/redacao/TelaCorrecoes';
import { TelaRanking } from '@/funcionalidades/pontuacao/TelaRanking';
import { TelaRedacao } from '@/funcionalidades/redacao/TelaRedacao';
import { PainelDoAluno } from '@/funcionalidades/turma/TelaDoAluno';
import { useSessao } from '@/provedores/sessao';

export function App() {
  const { usuario, carregando } = useSessao();
  const [secao, setSecao] = useState<Secao | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<string | null>(null);

  /*
   * Enquanto a sessão está sendo retomada, nem entrada nem portal.
   *
   * Mostrar a tela de entrada aqui faria ela piscar a cada recarregamento para
   * quem já está autenticado, e alguém chegaria a começar a digitar antes de
   * ser jogado para dentro.
   */
  if (carregando) {
    return (
      <div className="carregando" role="status" aria-live="polite">
        <span className="carregando__ponto" />
        <span className="carregando__ponto" />
        <span className="carregando__ponto" />
        <span className="sr-apenas">Carregando</span>
      </div>
    );
  }

  if (!usuario) return <TelaEntrar />;

  const atual = secao ?? secaoInicialDe(usuario.papel);

  /**
   * As telas do professor não existem para o aluno, e vice-versa.
   *
   * **Isto é navegação, não segurança.** Quem quiser é só chamar a rota da API
   * direto, e é lá que a proteção mora: cada consulta confere o papel no token
   * e a posse do recurso, com testes de integração provando os dois. O que este
   * mapa evita é um aluno entrar e encontrar a interface do professor pela
   * frente, cheia de botões que só devolvem erro.
   */
  const telas: Record<Secao, JSX.Element> =
    usuario.papel === 'professor'
      ? {
          aula: <TelaAula aoAbrirAluno={setAlunoAberto} />,
          alunos: <TelaAlunos aoAbrirAluno={setAlunoAberto} />,
          palavras: <TelaPalavras />,
          turmas: <TelaTurmas />,
          estudar: <TelaEstudar />,
          progresso: <TelaProgresso />,
          nivelamento: <TelaNivelamento />,
          ranking: <TelaRanking />,
          correcoes: <TelaCorrecoes />,
          redacao: <TelaRedacao />,
          conversa: <TelaConversa />,
          diario: <TelaDiario />,
          aulas: <TelaAulas />,
        }
      : {
          estudar: <TelaEstudar />,
          progresso: <TelaProgresso />,
          nivelamento: <TelaNivelamento />,
          ranking: <TelaRanking />,
          redacao: <TelaRedacao />,
          conversa: <TelaConversa />,
          aulas: <TelaAulas />,
          diario: <TelaAulas />,
          aula: <TelaEstudar />,
          alunos: <TelaEstudar />,
          palavras: <TelaEstudar />,
          turmas: <TelaEstudar />,
          correcoes: <TelaRedacao />,
        };

  return (
    <Estrutura
      secao={atual}
      aoTrocarSecao={(nova) => {
        setSecao(nova);
        setAlunoAberto(null);
      }}
    >
      {alunoAberto && usuario.papel === 'professor' ? (
        <PainelDoAluno alunoId={alunoAberto} aoVoltar={() => setAlunoAberto(null)} />
      ) : (
        telas[atual]
      )}
    </Estrutura>
  );
}
