import { useSessao } from './compartilhado/sessao';
import { TelaEntrar } from './funcionalidades/autenticacao/TelaEntrar';
import { TelaTurma } from './funcionalidades/turma/TelaTurma';

export function App() {
  const { usuario } = useSessao();

  // Sem roteador: o painel tem duas telas e a segunda é um detalhe da primeira.
  // Adicionar rotas agora seria configuração para um problema que não existe.
  return usuario ? <TelaTurma /> : <TelaEntrar />;
}
