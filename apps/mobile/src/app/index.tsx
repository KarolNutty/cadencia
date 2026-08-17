import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Botao } from '../componentes/botao';
import { SemRede } from '@cadencia/cliente-api';
import { cores, espaco, fontes, raio } from '../compartilhado/tema';
import { useSessao } from '../funcionalidades/autenticacao/contexto';
import { buscarSessao, buscarTurmas } from '../funcionalidades/estudo/api';

export default function TelaHoje() {
  const { usuario, carregando, cliente, hoje, sair } = useSessao();
  const margens = useSafeAreaInsets();
  const navegador = useRouter();

  const dia = hoje();

  const turmas = useQuery({
    queryKey: ['turmas'],
    queryFn: () => buscarTurmas(cliente),
    enabled: Boolean(usuario),
    // A matrícula não muda enquanto o aluno estuda; refazer esta consulta a
    // cada foco só gastaria dados de quem está no celular.
    staleTime: 10 * 60_000,
  });

  // Enquanto existe uma turma só, ela é a escolhida. O seletor entra quando
  // houver aluno em duas — antes disso seria uma tela com um item.
  const turma = turmas.data?.turmas[0] ?? null;

  const consulta = useQuery({
    queryKey: ['sessao', turma?.id, dia],
    queryFn: () => buscarSessao(cliente, turma!.id, dia),
    enabled: Boolean(usuario) && Boolean(turma),
  });

  if (carregando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: cores.papel }}>
        <ActivityIndicator color={cores.marca} />
      </View>
    );
  }

  if (!usuario) return <Redirect href="/entrar" />;

  const dados = consulta.data;
  const vencendo = dados?.resumo.vencendoHoje ?? 0;

  return (
    <ScrollView
      style={{ backgroundColor: cores.papel }}
      contentContainerStyle={{
        padding: espaco.grande,
        paddingTop: margens.top + espaco.grande,
        paddingBottom: margens.bottom + espaco.enorme,
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl
          refreshing={consulta.isRefetching}
          onRefresh={() => void consulta.refetch()}
          tintColor={cores.marca}
        />
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: fontes.texto, fontSize: 15, color: cores.textoMedio }}>
            {primeiroNome(usuario.nome)}
          </Text>
          {turma && (
            <Text
              style={{ fontFamily: fontes.texto, fontSize: 12, color: cores.textoFraco }}
            >
              {turma.nome}
            </Text>
          )}
        </View>
        <Pressable onPress={() => void sair()} accessibilityRole="button">
          <Text
            style={{ fontFamily: fontes.textoMedio, fontSize: 14, color: cores.textoFraco }}
          >
            Sair
          </Text>
        </Pressable>
      </View>

      {(turmas.isPending || (consulta.isPending && turma !== null)) && (
        <View style={{ paddingVertical: espaco.enorme * 2 }}>
          <ActivityIndicator color={cores.marca} />
        </View>
      )}

      {(consulta.isError || turmas.isError) && (
        <Aviso
          titulo={
            consulta.error instanceof SemRede ? 'Sem conexão' : 'Não foi possível carregar'
          }
          detalhe={
            consulta.error instanceof SemRede
              ? 'O que você já estudou está salvo. Puxe para tentar de novo.'
              : 'Puxe a tela para baixo para tentar de novo.'
          }
        />
      )}

      {turmas.isSuccess && turma === null && (
        <Aviso
          titulo="Você ainda não está em uma turma"
          detalhe="Assim que a escola matricular você, as palavras aparecem aqui."
        />
      )}

      {dados && (
        <>
          <View style={{ marginTop: espaco.enorme }}>
            <Text
              style={{
                fontFamily: fontes.palavra,
                // O número é o herói da tela: é a única coisa que a pessoa
                // veio saber ao abrir o app.
                fontSize: 84,
                lineHeight: 92,
                color: vencendo > 0 ? cores.texto : cores.textoFraco,
              }}
            >
              {vencendo}
            </Text>
            <Text
              style={{ fontFamily: fontes.texto, fontSize: 17, color: cores.textoMedio }}
            >
              {vencendo === 0
                ? 'nada para revisar agora'
                : vencendo === 1
                  ? 'palavra esperando por você'
                  : 'palavras esperando por você'}
            </Text>
          </View>

          <View
            style={{ flexDirection: 'row', gap: espaco.pequeno, marginTop: espaco.grande }}
          >
            <Ficha rotulo="Sequência" valor={diasSeguidos(dados.sequenciaDeDias)} />
            <Ficha rotulo="Em dia" valor={String(dados.resumo.emDia)} />
            {dados.resumo.sinalizadas > 0 && (
              <Ficha
                rotulo="Com o professor"
                valor={String(dados.resumo.sinalizadas)}
                cor={cores.dificil}
              />
            )}
          </View>

          <View style={{ flex: 1 }} />

          {vencendo > 0 ? (
            <Botao
              titulo="Começar"
              aoTocar={() =>
                navegador.push({ pathname: '/sessao', params: { turmaId: turma!.id } })
              }
              estilo={{ marginTop: espaco.enorme }}
            />
          ) : (
            <Text
              style={{
                fontFamily: fontes.texto,
                fontSize: 15,
                color: cores.textoFraco,
                marginTop: espaco.enorme,
                lineHeight: 22,
              }}
            >
              Você já revisou tudo que vencia hoje. Voltar amanhã vale mais do que estudar
              duas vezes seguidas.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Ficha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: cores.superficie,
        borderRadius: raio.medio,
        borderWidth: 1,
        borderColor: cores.linha,
        padding: espaco.medio,
      }}
    >
      <Text
        style={{ fontFamily: fontes.textoForte, fontSize: 20, color: cor ?? cores.texto }}
      >
        {valor}
      </Text>
      <Text style={{ fontFamily: fontes.texto, fontSize: 12, color: cores.textoFraco }}>
        {rotulo}
      </Text>
    </View>
  );
}

function Aviso({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <View
      style={{
        marginTop: espaco.grande,
        padding: espaco.medio,
        borderRadius: raio.medio,
        backgroundColor: cores.marcaFraca,
      }}
    >
      <Text style={{ fontFamily: fontes.textoForte, fontSize: 15, color: cores.texto }}>
        {titulo}
      </Text>
      <Text
        style={{
          fontFamily: fontes.texto,
          fontSize: 14,
          color: cores.textoMedio,
          marginTop: espaco.minimo,
          lineHeight: 20,
        }}
      >
        {detalhe}
      </Text>
    </View>
  );
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function diasSeguidos(dias: number): string {
  return dias === 1 ? '1 dia' : `${dias} dias`;
}
