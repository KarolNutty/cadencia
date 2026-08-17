import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Botao } from '../componentes/botao';
import { FalhaDaApi, SemRede } from '@cadencia/cliente-api';
import { cores, espaco, fontes, raio } from '../compartilhado/tema';
import { useSessao } from '../funcionalidades/autenticacao/contexto';

export default function TelaEntrar() {
  const { usuario, entrar } = useSessao();
  const margens = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (usuario) return <Redirect href="/" />;

  async function tentarEntrar() {
    setOcupado(true);
    setErro(null);

    try {
      await entrar(email.trim(), senha);
    } catch (causa) {
      // A mensagem vem do servidor quando ele explicou o motivo; problema de
      // rede recebe um texto próprio, porque "E-mail ou senha incorretos" seria
      // mentira e faria a pessoa tentar outra senha à toa.
      if (causa instanceof SemRede) {
        setErro('Sem conexão. Verifique a internet e tente de novo.');
      } else if (causa instanceof FalhaDaApi) {
        setErro(causa.corpo.mensagem);
      } else {
        setErro('Não foi possível entrar agora.');
      }
      setOcupado(false);
    }
  }

  const podeEnviar = email.trim().length > 3 && senha.length >= 8;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: cores.papel }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: espaco.grande,
          paddingTop: margens.top + espaco.enorme,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontFamily: fontes.palavra, fontSize: 44, color: cores.texto }}>
          Cadência
        </Text>
        <Text
          style={{
            fontFamily: fontes.texto,
            fontSize: 16,
            color: cores.textoMedio,
            marginTop: espaco.pequeno,
            marginBottom: espaco.enorme,
          }}
        >
          Seu ritmo de estudo, entre uma aula e outra.
        </Text>

        <Campo
          rotulo="E-mail"
          valor={email}
          aoMudar={setEmail}
          tipo="email"
          aoEnviar={() => undefined}
        />

        <View style={{ height: espaco.medio }} />

        <Campo
          rotulo="Senha"
          valor={senha}
          aoMudar={setSenha}
          tipo="senha"
          aoEnviar={() => podeEnviar && void tentarEntrar()}
        />

        {erro !== null && (
          <Text
            // Anunciado pelo leitor de tela assim que aparece: sem isto, quem
            // não enxerga toca o botão de novo sem saber o que houve.
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: fontes.texto,
              fontSize: 14,
              color: cores.errei,
              marginTop: espaco.medio,
            }}
          >
            {erro}
          </Text>
        )}

        <Botao
          titulo="Entrar"
          aoTocar={() => void tentarEntrar()}
          ocupado={ocupado}
          desabilitado={!podeEnviar}
          estilo={{ marginTop: espaco.grande }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface PropsDoCampo {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  tipo: 'email' | 'senha';
  aoEnviar: () => void;
}

function Campo({ rotulo, valor, aoMudar, tipo, aoEnviar }: PropsDoCampo) {
  const [focado, setFocado] = useState(false);

  return (
    <View>
      <Text
        style={{
          fontFamily: fontes.textoMedio,
          fontSize: 13,
          color: cores.textoMedio,
          marginBottom: espaco.pequeno,
        }}
      >
        {rotulo}
      </Text>
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        onSubmitEditing={aoEnviar}
        accessibilityLabel={rotulo}
        secureTextEntry={tipo === 'senha'}
        autoCapitalize="none"
        autoCorrect={false}
        // `emailAddress` e `password` ligam o preenchimento do gerenciador de
        // senhas do sistema. Sem isso, quem usa senha longa e única — que é o
        // que a política do servidor incentiva — precisa digitar tudo à mão.
        autoComplete={tipo === 'email' ? 'email' : 'current-password'}
        textContentType={tipo === 'email' ? 'emailAddress' : 'password'}
        keyboardType={tipo === 'email' ? 'email-address' : 'default'}
        returnKeyType={tipo === 'email' ? 'next' : 'go'}
        style={{
          fontFamily: fontes.texto,
          fontSize: 16,
          color: cores.texto,
          backgroundColor: cores.superficie,
          borderWidth: focado ? 2 : 1,
          borderColor: focado ? cores.marca : cores.linha,
          borderRadius: raio.medio,
          paddingHorizontal: espaco.medio,
          paddingVertical: 14,
        }}
      />
    </View>
  );
}
