import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorDeSessao } from '../funcionalidades/autenticacao/contexto';
import { cores } from '../compartilhado/tema';

export default function Layout() {
  const [fontesProntas] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    DMSerifDisplay_400Regular,
  });

  const clienteDeConsultas = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Um minuto: a sessão do dia não muda sozinha enquanto o aluno
            // estuda, e refazer a consulta a cada foco gastaria dados de quem
            // está no celular.
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
    [],
  );

  if (!fontesProntas) {
    // A tela nativa de abertura continua visível até aqui. Renderizar o app com
    // fonte de sistema e trocar depois faria o texto pular na frente da pessoa.
    return (
      <View style={{ flex: 1, backgroundColor: cores.tinta, justifyContent: 'center' }}>
        <ActivityIndicator color={cores.textoClaro} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={clienteDeConsultas}>
        <ProvedorDeSessao>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: cores.papel },
            }}
          />
        </ProvedorDeSessao>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
