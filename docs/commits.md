# Commits

## O que um commit precisa responder

O título diz **o que mudou**. O corpo, quando existe, diz **por quê**, que é a
única parte que o `git diff` não consegue mostrar sozinho.

Se o corpo apenas repete o título em outras palavras, ele não precisava existir.

## Formato

```
tipo: descrição no imperativo, minúscula, sem ponto final

Contexto de por que a mudança foi necessária, se não for evidente pelo
diff. Uma ou duas frases resolvem quase sempre.
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

Imperativo porque o commit completa a frase _"ao aplicar, este commit vai…"_:
`adiciona`, não `adicionado` nem `adicionando`.

## Regras práticas

**Um commit, uma mudança.** Se o título precisa de "e", provavelmente são dois
commits. `fix: corrige fuso e adiciona busca` é um pedido para o revisor ler as
duas coisas juntas.

**Formatação e lógica não andam juntas.** Rodar o formatador em quarenta
arquivos junto com uma correção esconde a correção no meio do ruído. Formatação
vai sozinha, em `chore`.

**O commit compila e os testes passam.** Cada ponto do histórico precisa ser um
lugar onde dá para voltar. Commit quebrado transforma `git bisect`, a
ferramenta que encontra qual mudança introduziu um bug, em algo inútil.

**Referencie o teste que prova.** Quando a mudança é sutil, dizer qual teste a
cobre poupa a próxima pessoa de procurar.

## Exemplos deste projeto

Bons, com o motivo no corpo:

```
fix: recusa data inválida em vez de estourar no validador

O refine do dia de estudo chamava toISOString numa data inválida, e isso
lança RangeError em vez de devolver false. Na API viraria 500 no lugar de
400, o servidor caindo por causa de entrada malformada.

Agravante: o zod roda o refine mesmo quando o regex já falhou, então
qualquer texto chegava até lá.
```

```
fix: compara segredo por substring, não por igualdade

A lista de valores óbvios nunca disparava: todos os itens têm menos de 32
caracteres, então a regra de tamanho já os barrava antes. O caso real é
alguém pegar "changeme" e completar até passar no mínimo.
```

```
refactor: reusa somarDias em vez de repetir a conta de data

sequenciaDeDias tinha a própria subtração de um dia. Data calculada em
dois lugares é onde bug de calendário nasce: um lado é corrigido e o
outro fica para trás. O typecheck pegou, os testes não.
```

Bons e curtos, quando o diff se explica:

```
test: cobre virada do dia às 4h em três fusos
chore: move pacotes para apps e packages
docs: registra o modelo de ameaças
```

Ruins, e por quê:

| Commit                                                                     | Problema                             |
| -------------------------------------------------------------------------- | ------------------------------------ |
| `atualizações`                                                             | Não diz o que mudou nem por quê      |
| `fix bug`                                                                  | Qual bug?                            |
| `wip`                                                                      | Não deveria estar no histórico       |
| `feat: adiciona login, corrige fuso e formata`                             | Três commits em um                   |
| `fix: muda linha 42 do ambiente.ts`                                        | Descreve o diff, que o Git já mostra |
| `feat: implementa a funcionalidade de autenticação de usuários no sistema` | Longo sem informar mais              |

## Sobre o histórico

Antes de abrir um PR, o histórico local pode ser reescrito à vontade, `rebase -i` para juntar os "ajusta teste" e "corrige typo" no commit a que
pertencem.

Depois de publicado em branch compartilhada, não se reescreve.

E o corpo do commit é para explicar o **porquê**, não para narrar o processo.
"Tentei X, não deu, então fiz Y" é conversa de PR. O histórico é lido por quem
está investigando um bug daqui a dois anos, e essa pessoa quer saber a decisão,
não o caminho até ela.
