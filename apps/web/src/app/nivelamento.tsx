import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ResultadoDoNivelamento } from '@cadencia/contrato';
import { Cabecalho } from '@/components/Estrutura';
import { buscarProximaPergunta, responderNivelamento } from '@/lib/api';
import { useSessao } from '@/providers/sessao';

/**
 * O teste de nivelamento.
 *
 * A escolha da próxima pergunta acontece **no servidor**, e não aqui. Parece
 * mais lento e é o certo: com a lógica no navegador, o gabarito viajaria junto
 * com a pergunta, e qualquer pessoa com o console aberto veria a resposta antes
 * de escolher. O que chega ao cliente é só o enunciado e as alternativas.
 */
export function TelaNivelamento() {
  const { cliente } = useSessao();
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState<ResultadoDoNivelamento | null>(null);

  const pergunta = useQuery({
    queryKey: ['nivelamento', tentativa],
    queryFn: () => buscarProximaPergunta(cliente),
    enabled: resultado === null,
  });

  const responder = useMutation({
    mutationFn: (escolha: number) =>
      responderNivelamento(cliente, pergunta.data!.pergunta!.id, escolha),
    onSuccess: (saida) => {
      if (saida.resultado) setResultado(saida.resultado);
      else setTentativa((atual) => atual + 1);
    },
  });

  if (resultado) return <Resultado resultado={resultado} />;

  if (pergunta.isPending) return <p className="aviso">Preparando…</p>;

  const atual = pergunta.data?.pergunta;

  if (!atual) {
    return (
      <>
        <Cabecalho olho="Nivelamento" titulo="Sem perguntas disponíveis" />
        <p className="aviso">A escola ainda não cadastrou o banco de perguntas.</p>
      </>
    );
  }

  const respondidas = pergunta.data?.respondidas ?? 0;

  return (
    <>
      <Cabecalho
        olho={`Pergunta ${respondidas + 1}`}
        titulo="Escolha a alternativa correta"
        nota="O teste se ajusta ao que você responde. Acertando, as perguntas ficam mais difíceis."
      />

      <div className="bloco" style={{ maxWidth: 640 }}>
        <p className="enunciado">{atual.enunciado}</p>

        <ul className="alternativas">
          {atual.alternativas.map((texto, indice) => (
            <li key={texto}>
              <button
                className="alternativa"
                disabled={responder.isPending}
                onClick={() => responder.mutate(indice)}
              >
                <span className="alternativa__letra">
                  {String.fromCharCode(97 + indice)}
                </span>
                {texto}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Resultado({ resultado }: { resultado: ResultadoDoNivelamento }) {
  const confiavel = resultado.confianca >= 0.6;

  return (
    <>
      <Cabecalho
        olho="Resultado"
        titulo={`Seu nível é ${resultado.nivel}`}
        nota={
          confiavel
            ? `Acertou ${resultado.acertos} de ${resultado.total}. O professor confirma o nível antes de te colocar numa turma.`
            : // Dizer o nível sem dizer que a medida ficou fraca seria dar uma
              // certeza que o teste não tem.
              `Acertou ${resultado.acertos} de ${resultado.total}, mas as respostas ficaram inconsistentes — o resultado é uma estimativa. Vale refazer com calma.`
        }
      />

      <div className="fichas">
        <div className="ficha ficha--destaque">
          <span className="ficha__valor">{resultado.nivel}</span>
          <span className="ficha__rotulo">nível estimado</span>
        </div>
        <div className="ficha">
          <span className="ficha__valor">{Math.round(resultado.confianca * 100)}%</span>
          <span className="ficha__rotulo">confiança</span>
        </div>
        <div className="ficha">
          <span className="ficha__valor">{resultado.total}</span>
          <span className="ficha__rotulo">perguntas</span>
        </div>
      </div>
    </>
  );
}
