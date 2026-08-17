const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro precisa enxergar a raiz do monorepo.
 *
 * Por padrão ele só observa a pasta do app — e aí `@cadencia/dominio`, que vive
 * em `packages/`, não é encontrado. É a configuração que todo monorepo com
 * React Native precisa e que ninguém descobre sozinho.
 *
 * O que NÃO está aqui é tão importante quanto o que está: `disableHierarchical
 * Lookup` costuma aparecer em receitas de monorepo, e com npm ele quebra tudo.
 * O npm iça as dependências para a raiz, e desligar a busca hierárquica impede
 * o Node de subir os diretórios até encontrá-las. O sintoma é um pacote do
 * próprio Expo "não encontrado" — que faz procurar erro na instalação.
 */
const pastaDoApp = __dirname;
const raiz = path.resolve(pastaDoApp, '../..');

/**
 * O Expo Router precisa desta variável no processo do Babel.
 *
 * Ele descobre a pasta de rotas sozinho e anuncia no log — mas, em monorepo, o
 * valor não chega aos processos que transformam o código, e o build falha com
 * "First argument of `require.context` should be a string". A mensagem fala de
 * `require.context` e não tem nada a ver com o código escrito, o que faz
 * procurar no lugar errado.
 *
 * Definir aqui funciona porque este arquivo roda no processo principal, antes
 * de o Metro criar os trabalhadores — e eles herdam o ambiente.
 */
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(pastaDoApp, 'src/app');

const config = getDefaultConfig(pastaDoApp);

config.watchFolders = [raiz];
config.resolver.nodeModulesPaths = [
  path.resolve(pastaDoApp, 'node_modules'),
  path.resolve(raiz, 'node_modules'),
];

module.exports = config;
