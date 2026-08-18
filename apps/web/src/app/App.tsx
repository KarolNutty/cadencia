import { useState } from 'react';
import { Estrutura } from '@/components/Estrutura';
import { type Secao, secaoInicialDe } from '@/config/secoes';
import { TelaEntrar } from '@/app/entrar';
import { TelaAula } from '@/app/aula';
import { TelaAlunos } from '@/app/alunos';
import { TelaPalavras } from '@/app/palavras';
import { TelaTurmas } from '@/app/turmas';
import { TelaEstudar } from '@/app/estudar';
import { TelaNivelamento } from '@/app/nivelamento';
import { TelaProgresso } from '@/app/progresso';
import { TelaRanking } from '@/app/ranking';
import { PainelDoAluno } from '@/app/aluno';
import { useSessao } from '@/providers/sessao';

export function App() {
  const { usuario } = useSessao();
  const [secao, setSecao] = useState<Secao | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<string | null>(null);

  if (!usuario) return <TelaEntrar />;

  const atual = secao ?? secaoInicialDe(usuario.papel);

  /**
   * As telas do professor não existem para o aluno, e vice-versa.
   *
   * **Isto é navegação, não segurança.** Quem quiser é só chamar a rota da API
   * direto — e é lá que a proteção mora: cada consulta confere o papel no token
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
        }
      : {
          estudar: <TelaEstudar />,
          progresso: <TelaProgresso />,
          nivelamento: <TelaNivelamento />,
          ranking: <TelaRanking />,
          aula: <TelaEstudar />,
          alunos: <TelaEstudar />,
          palavras: <TelaEstudar />,
          turmas: <TelaEstudar />,
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
