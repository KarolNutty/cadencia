import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Avaliacao } from '@cadencia/dominio';
import { Batidas } from '../componentes/batidas';
import { Botao } from '../componentes/botao';
import { avaliacoes, cores, espaco, fontes, raio } from '../compartilhado/tema';
import { useSessao } from '../funcionalidades/autenticacao/contexto';
import { buscarSessao, enviarRevisoes, novoLoteId } from '../funcionalidades/estudo/api';
import { paraEstudar } from '../funcionalidades/estudo/conversao';
import {
  avaliar,
  cartaAtual,
  iniciarSessao,
  loteParaEnvio,
  progresso,
  quandoVolta,
  resumir,
  revelar,
  terminou,
  type EstadoDaSessao,
} from '../funcionalidades/estudo/sessao';

export default function TelaSessao() {
  const { usuario, cliente, hoje } = useSessao();
  const margens = useSafeAreaInsets();
  const navegador = useRouter();
  const consultas = useQueryClient();

  // A turma vem pela navegação: quem escolheu foi a tela anterior. Buscar de
  // novo aqui abriria a chance de a sessão ser de uma turma diferente da que a
  // pessoa tocou.
  const { turmaId } = useLocalSearchParams<{ turmaId: string }>();

  const dia = hoje();

  const consulta = useQuery({
    queryKey: ['sessao', turmaId, dia],
    queryFn: () => buscarSessao(cliente, turmaId, dia),
    enabled: Boolean(usuario) && Boolean(turmaId),
  });

  const [estado, setEstado] = useState<EstadoDaSessao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falhaNoEnvio, setFalhaNoEnvio] = useState(false);

  /**
   * O identificador do lote nasce com a sessão e não muda.
   *
   * Se ele fosse gerado a cada tentativa de envio, o reenvio pareceria um lote
   * novo para o servidor — e a proteção contra duplicata não valeria nada
   * justamente quando é necessária, que é quando a primeira resposta se perdeu.
   */
  const loteId = useRef(novoLoteId());

  const inicial = useMemo(() => {
    if (!consulta.data) return null;
    return iniciarSessao(consulta.data.cartas.map(paraEstudar), dia);
  }, [consulta.data, dia]);

  const atual = estado ?? inicial;

  if (!usuario) return <Redirect href="/entrar" />;

  if (consulta.isPending || !atual) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.tinta, justifyContent: 'center' }}>
        <ActivityIndicator color={cores.textoClaro} />
      </View>
    );
  }

  async function enviar(estadoFinal: EstadoDaSessao) {
    setEnviando(true);
    setFalhaNoEnvio(false);

    try {
      await enviarRevisoes(cliente, turmaId, loteId.current, loteParaEnvio(estadoFinal));
      await consultas.invalidateQueries({ queryKey: ['sessao'] });
      navegador.back();
    } catch {
      // O estudo não é perdido: o estado continua na tela e o mesmo lote pode
      // ser reenviado com o mesmo identificador. Voltar agora é que jogaria
      // fora o trabalho da pessoa.
      setFalhaNoEnvio(true);
      setEnviando(false);
    }
  }

  if (terminou(atual)) {
    const resumo = resumir(atual);

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: cores.tinta,
          padding: espaco.grande,
          paddingTop: margens.top + espaco.enorme,
          paddingBottom: margens.bottom + espaco.grande,
        }}
      >
        <Text style={{ fontFamily: fontes.palavra, fontSize: 40, color: cores.textoClaro }}>
          Sessão fechada
        </Text>
        <Text
          style={{
            fontFamily: fontes.texto,
            fontSize: 16,
            color: cores.textoClaroMedio,
            marginTop: espaco.pequeno,
          }}
        >
          {resumo.acertos} de {resumo.total} de primeira
          {resumo.voltamAmanha > 0 && ` · ${resumo.voltamAmanha} voltam amanhã`}
        </Text>

        <View style={{ flex: 1 }} />

        {falhaNoEnvio && (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: fontes.texto,
              fontSize: 14,
              color: cores.dificil,
              marginBottom: espaco.medio,
              lineHeight: 20,
            }}
          >
            Não deu para enviar agora. Seu estudo não foi perdido — toque de novo quando
            tiver conexão.
          </Text>
        )}

        <Botao
          titulo={falhaNoEnvio ? 'Tentar enviar de novo' : 'Salvar e voltar'}
          aoTocar={() => void enviar(atual)}
          ocupado={enviando}
        />
      </View>
    );
  }

  const carta = cartaAtual(atual)!;
  const andamento = progresso(atual);
  const ultima = atual.revisoes.at(-1);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: cores.tinta,
        paddingTop: margens.top + espaco.medio,
        paddingBottom: margens.bottom + espaco.medio,
      }}
    >
      <View style={{ paddingHorizontal: espaco.grande }}>
        <Batidas feitas={andamento.feitas} total={andamento.total} />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: espaco.pequeno,
          }}
        >
          <Text
            style={{ fontFamily: fontes.texto, fontSize: 12, color: cores.textoClaroMedio }}
          >
            {andamento.restantes} restantes
          </Text>
          {ultima && (
            <Text
              style={{
                fontFamily: fontes.texto,
                fontSize: 12,
                color: cores.textoClaroMedio,
              }}
            >
              anterior volta {quandoVolta(ultima.agendamento)}
            </Text>
          )}
        </View>
      </View>

      {/* A palavra ocupa o centro e o resto recua. Um app de idioma cuja tela
          principal é dominada por botões ensina a olhar para os botões. */}
      <Pressable
        onPress={() => setEstado(revelar(atual))}
        disabled={atual.revelada}
        accessibilityRole="button"
        accessibilityLabel={
          atual.revelada
            ? carta.cartao.frente
            : `${carta.cartao.frente}. Toque para revelar.`
        }
        style={{
          flex: 1,
          // Ligeiramente acima do centro geométrico. O olho lê o centro de uma
          // tela como um ponto um pouco mais alto que a metade exata, e um
          // bloco no meio matemático parece afundado — que é como ficava, com o
          // vazio abaixo chamando mais atenção que a palavra.
          justifyContent: 'center',
          paddingBottom: espaco.enorme * 2,
          alignItems: 'center',
          paddingHorizontal: espaco.grande,
        }}
      >
        <Text
          style={{
            fontFamily: fontes.palavra,
            fontSize: 44,
            lineHeight: 54,
            color: cores.textoClaro,
            textAlign: 'center',
          }}
        >
          {carta.cartao.frente}
        </Text>

        {atual.revelada ? (
          <>
            <View
              style={{
                height: 1,
                width: 48,
                backgroundColor: cores.linhaEscura,
                marginVertical: espaco.grande,
              }}
            />
            <Text
              style={{
                fontFamily: fontes.texto,
                fontSize: 24,
                color: cores.textoClaroMedio,
                textAlign: 'center',
              }}
            >
              {carta.cartao.verso}
            </Text>
          </>
        ) : (
          <Text
            style={{
              fontFamily: fontes.texto,
              fontSize: 14,
              color: cores.textoClaroMedio,
              marginTop: espaco.enorme,
            }}
          >
            {carta.cartao.dica ?? 'toque para ver'}
          </Text>
        )}
      </Pressable>

      <View style={{ paddingHorizontal: espaco.grande }}>
        {atual.revelada ? (
          <View style={{ flexDirection: 'row', gap: espaco.pequeno }}>
            {avaliacoes.map((opcao) => (
              <Pressable
                key={opcao.valor}
                onPress={() => setEstado(avaliar(atual, opcao.valor as Avaliacao))}
                accessibilityRole="button"
                accessibilityLabel={opcao.rotulo}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: raio.medio,
                  backgroundColor: opcao.cor,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{ fontFamily: fontes.textoForte, fontSize: 14, color: '#FFFFFF' }}
                >
                  {opcao.rotulo}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Botao
            titulo="Ver resposta"
            aoTocar={() => setEstado(revelar(atual))}
            cor={cores.tintaSuave}
            corDoTexto={cores.textoClaro}
          />
        )}
      </View>
    </View>
  );
}
