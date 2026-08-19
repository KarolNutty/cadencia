# Arquitetura

## A regra que organiza tudo

```
apps/          o que sobe em produção
packages/      o que é compartilhado entre eles
```

Dentro de `apps`, cada aplicação se organiza **por funcionalidade**, não por
tipo de arquivo. `components/`, `services/` e `hooks/` no topo funcionam com
cinco telas e viram caos com cinquenta: para mexer em login você abre quatro
pastas distantes, e ninguém sabe o que pode apagar.

Por funcionalidade, o teste é simples: **apaga a pasta e o resto continua de
pé.**

```
apps/mobile/src/
├── app/              providers, navegação, tema
├── componentes/      genéricos, sem regra de negócio
├── funcionalidades/
│   ├── autenticacao/
│   │   ├── api/          chamadas deste domínio
│   │   ├── componentes/  só desta funcionalidade
│   │   ├── ganchos/      useEntrar, useSessao
│   │   ├── telas/
│   │   └── index.ts      ← a fronteira pública
│   └── estudo/
│       ├── api/
│       ├── componentes/
│       ├── ganchos/
│       └── telas/
└── compartilhado/    o que passou por duas funcionalidades
```

### O `index.ts` é uma fronteira, não um atalho

Cada funcionalidade exporta pelo `index.ts` só o que as outras precisam. Nada de
`import { algo } from '../estudo/componentes/CartaInterna'`.

E isso não depende de disciplina, há regra de ESLint que quebra o build no
import cruzado, do mesmo jeito que a regra que impede o domínio de conhecer
framework.

### Pasta nasce quando há conteúdo

Um arquivo solto na raiz do pacote é melhor que uma pasta com um arquivo dentro.
`packages/dominio` tem três arquivos e nenhuma subpasta, criar `regras/`,
`tipos/` e `utilitarios/` para três arquivos parece organização e só adiciona
cliques.

E pasta vazia é pior que desorganização: ela promete conteúdo que não existe, e
a próxima pessoa perde tempo procurando. Já aconteceu aqui, `apps/api/src/compartilhado/`
foi criada "para depois" e removida assim que percebi.

A estrutura por funcionalidade descrita acima vale para as **aplicações**, que
crescem para dezenas de telas. Um pacote de domínio com três arquivos não é o
mesmo problema, e resolver os dois do mesmo jeito é aplicar receita sem ler o
caso.

### Quando algo vira compartilhado

Só depois de a **segunda** funcionalidade precisar. Mover cedo demais produz uma
abstração desenhada para um caso só, que a segunda não encaixa, e aí ela ganha
um parâmetro, depois outro, até virar aquela função com sete opções booleanas.

---

## O que fica em `packages`

| Pacote     | O que é                                         | Quem importa           |
| ---------- | ----------------------------------------------- | ---------------------- |
| `dominio`  | Repetição espaçada, dia de estudo, sessão. Puro | `api` e `mobile`       |
| `contrato` | Schemas zod, tipos e erros                      | `api`, `web`, `mobile` |
| `config`   | Validação de ambiente, tsconfig e eslint comuns | todos                  |

**`dominio` não importa nada.** Nem contrato, nem zod, nem framework. É o que
permite testá-lo em Node puro, sem infraestrutura, e é o que faz o mesmo código
rodar no servidor e dentro do app.

A regra está no ESLint:

```js
files: ['packages/dominio/src/**/*.ts'],
'no-restricted-imports': [/* @cadencia/*, zod, fastify, pg, react* */]
```

Regra que depende só de boa vontade acaba quebrada na primeira sexta-feira
apertada.

---

## Por que não Turborepo agora

Workspaces do npm bastam enquanto o build é rápido. Turborepo resolve **cache e
paralelismo**, e um projeto com dois pacotes não tem esse problema, adotá-lo
antes é configuração que ninguém sabe explicar em entrevista.

Entra quando `npm run verificar` passar de uns 30 segundos. Se entrar antes, é
enfeite.

---

## Estado no cliente

Componente cuida de apresentação. Requisição e cache ficam em **TanStack Query**,
dentro de `funcionalidades/*/api` e `ganchos`.

A escolha não é sobre gosto: dado de servidor tem invalidação, revalidação e
estado de carregando/erro por natureza. Reimplementar isso com `useState` e
`useEffect` é reescrever o TanStack Query pior, e é onde nasce o bug de tela
mostrando dado velho depois de salvar.

---

## Onde o dia de estudo é decidido

O **cliente** informa o dia da revisão; o servidor confere e grava.

Parece contraintuitivo, normalmente o servidor manda no tempo. Mas só o
cliente sabe em que fuso o aluno está e se já passou das 4h da manhã. Servidor
calculando faria quem estuda à 1h aparecer no dia seguinte e perder a sequência
por estar estudando.

O servidor não confia cegamente: recusa dia muito no futuro ou muito no passado.
Confiança limitada, não ausente.
