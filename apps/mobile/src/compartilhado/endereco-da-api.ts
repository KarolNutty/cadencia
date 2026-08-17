import Constantes from 'expo-constants';

/**
 * Onde a API está, do ponto de vista **deste aparelho**.
 *
 * `localhost` não serve: dentro do celular ou do emulador, ele aponta para o
 * próprio aparelho, e não para a máquina onde o servidor roda. É o erro que
 * todo mundo comete uma vez e que aparece como "Sem conexão" — uma mensagem
 * que faz procurar problema no Wi-Fi.
 *
 * A descoberta segue esta ordem:
 *
 * 1. `EXPO_PUBLIC_API_URL`, se alguém definiu — em produção é o único caminho.
 * 2. O endereço do próprio servidor de desenvolvimento do Expo. Ele já está no
 *    IP certo da máquina, porque foi por ele que o app foi carregado; basta
 *    trocar a porta.
 * 3. `localhost`, para quando o app roda na mesma máquina (web ou desktop).
 */

const PORTA_DA_API = 3333;

function doServidorDeDesenvolvimento(): string | null {
  // Ex.: "192.168.0.5:8081" ou "192.168.0.5:8081/algo"
  const enderecoDoExpo =
    Constantes.expoConfig?.hostUri ??
    (Constantes.expoGoConfig?.debuggerHost as string | undefined);

  if (!enderecoDoExpo) return null;

  const maquina = enderecoDoExpo.split('/')[0]?.split(':')[0];
  if (!maquina) return null;

  return `http://${maquina}:${PORTA_DA_API}`;
}

export function descobrirEnderecoDaApi(): string {
  const definido = process.env.EXPO_PUBLIC_API_URL;
  if (definido) return definido.replace(/\/$/, '');

  return doServidorDeDesenvolvimento() ?? `http://localhost:${PORTA_DA_API}`;
}
