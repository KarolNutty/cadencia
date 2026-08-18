import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Escolha } from '@/components/Escolha';
import { Cabecalho, useTurma } from '@/components/Estrutura';
import { useSessao } from '@/providers/sessao';
import { arquivarTurma, criarTurma } from '@/lib/api';

const IDIOMAS = ['inglês', 'espanhol', 'francês', 'alemão', 'italiano', 'japonês'];

export function TelaTurmas() {
  const { cliente } = useSessao();
  const { turmas, escolherTurma } = useTurma();
  const consultas = useQueryClient();

  const [nome, setNome] = useState('');
  const [idioma, setIdioma] = useState(IDIOMAS[0]!);

  const nova = useMutation({
    mutationFn: () => criarTurma(cliente, nome.trim(), idioma),
    onSuccess: (turma) => {
      setNome('');
      escolherTurma(turma.id);
      void consultas.invalidateQueries({ queryKey: ['turmas'] });
    },
  });

  const arquivar = useMutation({
    mutationFn: (turmaId: string) => arquivarTurma(cliente, turmaId),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['turmas'] }),
  });

  return (
    <>
      <Cabecalho
        olho="Turmas"
        titulo="Suas turmas"
        nota="Arquivar tira a turma da lista sem apagar o histórico de estudo de ninguém."
      />

      <div className="bloco">
        <p className="bloco__titulo">Nova turma</p>
        <div className="linha-de-campos">
          <label className="campo">
            <span className="campo__rotulo">Nome</span>
            <input
              className="campo__entrada"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Inglês · Intermediário 2"
            />
          </label>

          <div style={{ flex: '0 0 160px', minWidth: 160 }}>
            <Escolha
              rotulo="Idioma"
              valor={idioma}
              opcoes={IDIOMAS.map((opcao) => ({ valor: opcao, rotulo: opcao }))}
              aoEscolher={setIdioma}
            />
          </div>

          <button
            className="botao botao--pequeno"
            disabled={nome.trim().length < 2 || nova.isPending}
            onClick={() => nova.mutate()}
          >
            {nova.isPending ? 'Criando…' : 'Criar turma'}
          </button>
        </div>
      </div>

      <div className="bloco">
        <p className="bloco__titulo">Ativas</p>

        {turmas.length === 0 && (
          <p className="aviso" style={{ padding: '12px 0' }}>
            Nenhuma turma ainda. Crie a primeira acima.
          </p>
        )}

        <ul className="lista">
          {turmas.map((turma) => (
            <li className="lista__item" key={turma.id}>
              <div>
                <p className="lista__principal">{turma.nome}</p>
                <p className="lista__apoio">{turma.idioma}</p>
              </div>
              <button
                className="perigo"
                onClick={() => {
                  if (
                    confirm(
                      `Arquivar "${turma.nome}"? Ela some da sua lista e da dos alunos. O histórico fica guardado.`,
                    )
                  ) {
                    arquivar.mutate(turma.id);
                  }
                }}
              >
                Arquivar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
