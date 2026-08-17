import { useState } from 'react';
import { Estrutura, type Secao } from './compartilhado/Estrutura';
import { useSessao } from './compartilhado/sessao';
import { TelaEntrar } from './funcionalidades/autenticacao/TelaEntrar';
import { TelaAlunos } from './funcionalidades/gestao/TelaAlunos';
import { TelaPalavras } from './funcionalidades/gestao/TelaPalavras';
import { TelaTurmas } from './funcionalidades/gestao/TelaTurmas';
import { PainelDoAluno } from './funcionalidades/turma/PainelDoAluno';
import { TelaAula } from './funcionalidades/turma/TelaAula';

export function App() {
  const { usuario } = useSessao();
  const [secao, setSecao] = useState<Secao>('aula');
  const [alunoAberto, setAlunoAberto] = useState<string | null>(null);

  if (!usuario) return <TelaEntrar />;

  /**
   * Sem roteador.
   *
   * São quatro seções e um detalhe, e a navegação é por estado. Um roteador
   * entra quando fizer falta — ao compartilhar link de aluno específico, por
   * exemplo. Adicioná-lo agora seria configuração para um problema que não
   * existe.
   */
  function abrirAluno(alunoId: string) {
    setAlunoAberto(alunoId);
  }

  return (
    <Estrutura
      secao={secao}
      aoTrocarSecao={(nova) => {
        setSecao(nova);
        setAlunoAberto(null);
      }}
    >
      {alunoAberto ? (
        <PainelDoAluno alunoId={alunoAberto} aoVoltar={() => setAlunoAberto(null)} />
      ) : (
        {
          aula: <TelaAula aoAbrirAluno={abrirAluno} />,
          alunos: <TelaAlunos aoAbrirAluno={abrirAluno} />,
          palavras: <TelaPalavras />,
          turmas: <TelaTurmas />,
        }[secao]
      )}
    </Estrutura>
  );
}
