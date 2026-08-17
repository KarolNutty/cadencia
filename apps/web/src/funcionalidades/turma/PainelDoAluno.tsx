import { useQuery } from '@tanstack/react-query';
import type { CartasSinalizadasSaida } from '@cadencia/contrato';
import { diaDeEstudoDe } from '@cadencia/dominio';
import { cores, fontes } from '../../compartilhado/estilos';
import { useSessao } from '../../compartilhado/sessao';
import { desdeQuando } from './leitura';
import type { Aluno } from './TelaTurma';

/**
 * O que levar para a aula deste aluno.
 *
 * É a tela que justifica o painel inteiro. O professor não quer um gráfico de
 * engajamento — quer a lista de palavras que ele precisa explicar de novo na
 * segunda-feira.
 */
export function PainelDoAluno({
  turmaId,
  aluno,
  aoVoltar,
}: {
  turmaId: string;
  aluno: Aluno;
  aoVoltar: () => void;
}) {
  const { cliente } = useSessao();
  const hoje = diaDeEstudoDe(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  const consulta = useQuery({
    queryKey: ['sinalizadas', turmaId, aluno.usuario.id],
    queryFn: () =>
      cliente.chamar<CartasSinalizadasSaida>(
        `/turmas/${turmaId}/alunos/${aluno.usuario.id}/sinalizadas`,
      ),
  });

  const cartas = consulta.data?.cartas ?? [];

  return (
    <div style={{ minHeight: '100vh', background: cores.fundo }}>
      <header
        style={{ borderBottom: `1px solid ${cores.linha}`, background: cores.superficie }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 24px' }}>
          <button onClick={aoVoltar} style={voltar}>
            ← Turma
          </button>
          <h1 style={{ fontFamily: fontes.titulo, fontSize: 26, margin: '10px 0 0' }}>
            {aluno.usuario.nome}
          </h1>
          <p
            style={{
              fontFamily: fontes.texto,
              fontSize: 13.5,
              color: cores.textoFraco,
              margin: '4px 0 0',
            }}
          >
            estudou {desdeQuando(aluno.ultimoEstudo, hoje)} · sequência de{' '}
            {aluno.sequenciaDeDias} {aluno.sequenciaDeDias === 1 ? 'dia' : 'dias'}
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h2 style={{ fontFamily: fontes.texto, fontSize: 15, color: cores.textoMedio }}>
          Palavras travadas
        </h2>

        {consulta.isPending && (
          <p style={{ fontFamily: fontes.texto, color: cores.textoMedio }}>Carregando…</p>
        )}

        {consulta.isSuccess && cartas.length === 0 && (
          <p style={{ fontFamily: fontes.texto, color: cores.textoMedio, lineHeight: 1.6 }}>
            Nenhuma palavra travou. O que este aluno erra, ele recupera sozinho revisando —
            não precisa de aula sobre isso.
          </p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
          {cartas.map((carta) => (
            <li
              key={carta.cartao.id}
              style={{
                background: cores.superficie,
                border: `1px solid ${cores.linha}`,
                borderRadius: 12,
                padding: 18,
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: fontes.titulo,
                    fontSize: 22,
                    color: cores.texto,
                    margin: 0,
                  }}
                >
                  {carta.cartao.frente}
                </p>
                <p
                  style={{
                    fontFamily: fontes.texto,
                    fontSize: 14.5,
                    color: cores.textoMedio,
                    margin: '2px 0 0',
                  }}
                >
                  {carta.cartao.verso}
                </p>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p
                  style={{
                    fontFamily: fontes.texto,
                    fontSize: 15,
                    fontWeight: 700,
                    color: cores.atencao,
                    margin: 0,
                  }}
                >
                  {carta.lapsos} erros
                </p>
                <p
                  style={{
                    fontFamily: fontes.texto,
                    fontSize: 12.5,
                    color: cores.textoFraco,
                    margin: '2px 0 0',
                  }}
                >
                  {desdeQuando(carta.ultimaRevisao, hoje)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

const voltar: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: fontes.texto,
  fontSize: 14,
  color: cores.marca,
  cursor: 'pointer',
};
