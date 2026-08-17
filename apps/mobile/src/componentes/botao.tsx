import { ActivityIndicator, Pressable, Text, type ViewStyle } from 'react-native';
import { cores, espaco, fontes, raio } from '../compartilhado/tema';

interface Props {
  titulo: string;
  aoTocar: () => void;
  cor?: string;
  corDoTexto?: string;
  ocupado?: boolean;
  desabilitado?: boolean;
  estilo?: ViewStyle;
}

export function Botao({
  titulo,
  aoTocar,
  cor = cores.marca,
  corDoTexto = '#FFFFFF',
  ocupado = false,
  desabilitado = false,
  estilo,
}: Props) {
  const inativo = ocupado || desabilitado;

  /**
   * Desabilitado vira cinza, e não a cor de marca esmaecida.
   *
   * Uma cor forte a 50% de opacidade não lê como "inativo" — lê como uma
   * variação clara da própria marca, e a pessoa toca esperando que funcione.
   * Cinza neutro diz o que é.
   *
   * Enquanto está ocupado, a cor original permanece: ali o botão **está**
   * respondendo, e apagá-lo sugeriria o contrário.
   */
  const corDoFundo = desabilitado && !ocupado ? cores.inativo : cor;
  const corDoRotulo = desabilitado && !ocupado ? cores.textoInativo : corDoTexto;

  return (
    <Pressable
      onPress={aoTocar}
      disabled={inativo}
      // Papel e estado anunciados para o leitor de tela: sem isto, um botão
      // desabilitado é lido como se pudesse ser tocado.
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: ocupado }}
      style={({ pressed }) => [
        {
          backgroundColor: corDoFundo,
          opacity: pressed && !inativo ? 0.85 : 1,
          paddingVertical: 16,
          paddingHorizontal: espaco.grande,
          borderRadius: raio.medio,
          alignItems: 'center',
          justifyContent: 'center',
          // Abaixo de 48 o erro de toque cresce — e aqui a pessoa toca trinta
          // vezes seguidas.
          minHeight: 52,
        },
        estilo,
      ]}
    >
      {ocupado ? (
        <ActivityIndicator color={corDoTexto} />
      ) : (
        <Text style={{ color: corDoRotulo, fontFamily: fontes.textoForte, fontSize: 16 }}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}
