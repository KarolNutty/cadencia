# Cadência

App de estudo de idiomas para escola, com painel do professor.

O nome vem do que o produto faz: não é sobre quantas palavras o aluno vê, é
sobre **em que ritmo** ele revê cada uma.

```bash
npm install
npm run verificar          # tipos + lint + formatação + testes + build do painel

# Para mexer no banco:
cp .env.example .env       # e preencha os dois segredos
npm run banco:subir        # Postgres via Docker
npm run migrar

npm run test:integracao    # testes contra o Postgres real
```

As duas suítes são separadas de propósito. `npm test` roda em qualquer máquina,
em segundos, sem Docker. Misturar as duas faria alguém sem Docker ver falha
vermelha num código correto — e o hábito que nasce daí é ignorar teste vermelho.

Os segredos se geram com `openssl rand -base64 48`. A aplicação **recusa subir**
sem eles.

> **Estado atual: fatia 4 de 5.** Domínio, contrato, API, app do aluno e painel
> do professor. Falta o acabamento: prints, testes de ponta a ponta e o README
> final.

### Rodando tudo

```bash
npm install
cp .env.example .env          # e preencha os dois segredos
npm run banco:subir
npm run migrar
npm run semear                # cria a turma e 48 palavras de inglês

npm run api                   # em um terminal
npm run app                   # o app do aluno
npm run web                   # o painel do professor
```

Entre no app com a **aluna** e no painel com a **professora** — as rotas de cada
área recusam o papel errado, de propósito.

O `semear` imprime as credenciais. O app descobre a turma sozinho, pelo endpoint
`GET /turmas` — que não recebe id de usuário nenhum: o servidor usa o do token.
Não oferecer o parâmetro é mais forte do que oferecê-lo e conferir depois.

> **O app descobre o endereço da API sozinho.** Dentro do celular ou do
> emulador, `localhost` aponta para o próprio aparelho — e o resultado é um "Sem
> conexão" que faz procurar problema no Wi-Fi. Como o Expo já carregou o app
> pelo IP certo da máquina, o app reaproveita esse endereço e só troca a porta.
> Em produção, `EXPO_PUBLIC_API_URL` tem prioridade.

---

## O problema

Uma escola de idiomas quer que o aluno estude entre as aulas — e o professor
quer saber quem estudou e **o que está travando**, antes da próxima aula.

São duas necessidades, de duas pessoas diferentes. É isso que torna o projeto
naturalmente web + mobile, sem forçar.

## A tese técnica

> **O mesmo código de agendamento roda no app e no servidor.**

Quando o aluno avalia uma carta, o app calcula na hora quando ela volta e mostra
"volta em 3 dias" sem esperar rede. O servidor recalcula com o **mesmo módulo**
ao receber a revisão, e a resposta dele é a autoridade.

Isso resolve três coisas de uma vez:

- **Resposta instantânea.** O aluno avalia trinta cartas seguidas; esperar
  200 ms por carta destrói o ritmo do estudo.
- **Zero divergência** entre o que o app mostrou e o que o servidor gravou. Não
  é a mesma regra escrita duas vezes — é o mesmo arquivo importado nos dois.
- **É o que justifica React Native aqui.** Com Flutter, esse módulo existiria em
  Dart no app e em TypeScript no servidor, e a coerência dependeria de
  disciplina. Aqui é garantida pelo compilador.

---

## O domínio: repetição espaçada

Base no SM-2, o algoritmo do Anki. O que vale não é copiá-lo — é o que muda por
causa do domínio _escola_.

### Adaptação 1 · teto de 120 dias

O SM-2 puro manda uma carta bem sabida para daqui a três anos. Num curso de seis
meses isso equivale a apagá-la: o aluno chega na prova sem ter revisto. O teto
existe porque o calendário da escola existe.

### Adaptação 2 · errar não destrói a facilidade

O SM-2 deixa a facilidade cair até a carta voltar todo dia, para sempre. Numa
turma real isso vira um punhado de cartas que o aluno odeia e que dominam toda
sessão — e ele para de estudar.

O piso mais alto garante que **sempre exista caminho de volta**. E, passando de
quatro erros, a carta é **sinalizada para o professor** em vez de continuar
martelando o aluno: o software admite que aquilo não é problema de agendamento.

### Adaptação 3 · o dia vira às 4h da manhã, no fuso do aluno

Quem senta para estudar à uma da manhã ainda está no dia dele. Se o corte fosse
à meia-noite, esse aluno **perderia a sequência por estar estudando** — o pior
incentivo possível.

```ts
diaDeEstudoDe(instante, 'America/Sao_Paulo'); // 01:00 → ainda é ontem
diaDeEstudoDe(instante, 'Europe/Lisbon'); // mesmo instante → já é hoje
```

Data de estudo é **data de negócio, não data de relógio**. Os dois quase sempre
coincidem, e é por isso que a diferença passa despercebida até quebrar.

### A curva que isso produz

| Aluno              | Intervalos                              |
| ------------------ | --------------------------------------- |
| Sempre acerta      | 1 → 3 → 8 → 20 → 50 → 120 (bate o teto) |
| Acha difícil       | 1 → 3 → 6 → 11 → 19 → 30 → 48           |
| Erra no meio       | volta a 1 dia e reconstrói              |
| Carta problemática | fica em 1 dia e é sinalizada no 4º erro |

A linha "acha difícil" é o que valida o piso: mesmo no mínimo, o intervalo
continua crescendo. Sem o piso, ela seria `1d` para sempre.

---

## O contrato

Um schema zod serve para três coisas ao mesmo tempo: **validar a entrada na API,
tipar a resposta no cliente e gerar o tipo TypeScript.** Uma fonte, três usos —
e, principalmente, sem o tipo poder divergir da validação, que é o jeito mais
comum de um contrato apodrecer.

Duas decisões que valem explicar:

**O dia da revisão é informado pelo app, não calculado pelo servidor.** Só o app
sabe em que fuso o aluno está e se já passou das 4h.

**As revisões sobem em lote, com identificador de lote.** O aluno avalia trinta
cartas em três minutos; trinta requisições no metrô é o caminho para metade se
perder. E se a resposta se perder na volta, o app reenvia o mesmo lote — o
servidor reconhece que já processou, em vez de duplicar o histórico.

---

### Ícone e abertura

O ícone é a **mesma marca de compasso que aparece dentro do app**: quatro traços
de alturas crescentes, com o último em índigo como acento. Ele não inventa um
símbolo — mostra o elemento que o aluno já vê no topo da sessão.

Nada de letra inicial nem de globo com bandeirinha: um "C" num quadrado não diz
nada, e globo diz "idioma" do jeito mais genérico possível. Testado em 96, 72,
48 e 32 px; o acento sobrevive até o menor.

## Arquitetura

```
apps/
├── api/        Fastify + Postgres + JWT
├── mobile/     React Native + Expo — o aluno
└── web/        React + Vite — o professor
packages/
├── dominio/      repetição espaçada e dia de estudo. Puro, sem I/O
├── contrato/     schemas zod, tipos e erros — a fonte única da API
├── cliente-api/  o cliente HTTP, compartilhado pelo app e pelo painel
└── config/       validação de ambiente e configuração comum
```

O `cliente-api` é o exemplo mais direto do que um monorepo compra. O que ele
compartilha não é "montar um fetch" — é a **fila única de renovação de token**,
sem a qual várias chamadas expirando juntas derrubam a sessão. O que muda entre
as plataformas (token no corpo para o app, cookie `httpOnly` no navegador) é
injetado; só a coordenação fica no pacote.

**`dominio` não importa nada.** Nem contrato, nem zod, nem framework — e há uma
regra de ESLint que quebra o build se alguém tentar. É isso que permite testá-lo
em Node puro e rodar o mesmo arquivo no servidor e dentro do app.

Dentro de cada aplicação, a organização é **por funcionalidade**, e não por tipo
de arquivo. O teste é simples: apaga a pasta da funcionalidade e o resto
continua de pé.

Detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).

## Segurança

O sistema **não é impenetrável** — nenhum é, e anunciar isso costuma ser sinal
de que ninguém auditou. O que existe é um modelo de ameaças, um controle para
cada uma e um **teste provando que o controle funciona**.

O documento também registra onde a defesa termina, porque conhecer o limite faz
parte do controle: [`docs/seguranca.md`](docs/seguranca.md).

Nenhum segredo mora no repositório. A aplicação valida o ambiente na partida e
**recusa subir** com segredo ausente, curto, copiado de exemplo ou sem entropia
— o modo mais comum de vazamento não é o segredo commitado, é o ausente virando
`?? 'dev'` e passando meses assinando token sem ninguém notar.

---

## Testes

**131 testes**, todos em Node puro. Sem banco, sem rede, sem mock.

| Onde            | O que garante                                                                             |
| --------------- | ----------------------------------------------------------------------------------------- |
| `dia-de-estudo` | Virada às 4h, três fusos diferentes, horário de verão, virada de mês e de ano             |
| `agendamento`   | As três adaptações, pureza da função, e que reproduzir o histórico chega ao mesmo estado  |
| `sessao`        | Ordem por atraso, desempate estável, cartas sinalizadas fora da sessão, sequência de dias |
| `contrato`      | O que a API precisa **recusar** antes de tocar no banco                                   |

### O erro que o app quase criou sozinho

A rotação de token do servidor invalida o token de renovação a cada uso, e reúso
derruba a família. Um cliente ingênuo, ao receber 401 em três chamadas paralelas,
dispararia **três renovações com o mesmo token** — que é exatamente a assinatura
de um token roubado. O aluno seria expulso no meio do estudo, com um bug que
ninguém consegue reproduzir.

O recurso de segurança e o cliente ingênuo se combinam para produzir o defeito.
A defesa é uma fila única de renovação — uma linha de código — e um teste com
três chamadas simultâneas conferindo que só uma renovação sai.

### O bug que só aparece à noite

O painel do professor calculava "hoje" **uma vez, no fuso do servidor**, e
comparava com o dia que cada aluno reportou. Rodando às onze da noite no Brasil
— já dia seguinte em UTC — a regra das 4h jogava o dia do servidor para trás, e
o aluno que tinha acabado de estudar aparecia com sequência zero.

O comentário do código dizia, com todas as letras, que a sequência usava o fuso
do aluno. Não usava.

Hoje o "hoje" é calculado por aluno: em JavaScript para a sequência, e dentro do
próprio SQL para a contagem do que vence —
`(timezone(u.fuso, now()) - interval '4 hours')::date`, avaliado por linha.

O teste tinha o mesmo defeito, e por isso não pegava: ele usava o dia em UTC
cru, e não o dia que o app calcularia. Passava de manhã, falhava à noite.

### Quatro erros que os testes pegaram

**O validador estourava em vez de recusar.** O `refine` do dia de estudo chamava
`.toISOString()` numa data inválida, e isso **lança** `RangeError` em vez de
devolver algo comparável. Numa API viraria **500 no lugar de 400** — o servidor
quebrando por causa de entrada malformada, que é o oposto do que um validador
existe para fazer.

Detalhe que agravava: o zod roda o `refine` **mesmo quando o regex já falhou**,
então qualquer texto chegava até lá.

**Lógica de data duplicada.** O `sequenciaDeDias` reimplementava a subtração de
um dia em vez de reusar `somarDias`. Os testes passavam; o typecheck é que
pegou. Data calculada em dois lugares é onde bug de calendário nasce — um lado é
corrigido e o outro fica para trás.

**Um teste medindo a camada errada.** Eu afirmava que o campo `tipo` impedia
usar token de renovação como acesso — mas o teste passava porque a _assinatura_
já reprovava antes, já que os segredos são diferentes. A segunda barreira nunca
era exercitada, e se ela quebrasse ninguém saberia. Hoje cada uma tem seu teste,
e a da barreira 2 constrói de propósito o cenário do segredo reaproveitado.

**Uma verificação de segurança que nunca disparava.** A lista de segredos óbvios
comparava por igualdade exata — e como todos os itens têm menos de 32
caracteres, a regra de tamanho já os barrava antes. Era código morto se
passando por controle. O caso real não é alguém usar exatamente `changeme`, é
pegar `changeme` e completar até passar no mínimo; hoje a comparação é por
substring, com um piso de entropia junto.

---

## Próximas fatias

| #   | O que                          | O que prova                     |
| --- | ------------------------------ | ------------------------------- |
| 2   | API + Postgres + autenticação  | Backend real, com dois papéis   |
| 3   | App RN: entrar e estudar       | O fluxo do aluno, ponta a ponta |
| 4   | Web: painel do professor       | O outro lado, no mesmo contrato |
| 5   | README final, CI, prints e GIF | O que faz alguém abrir          |

E dois testes que amarram o projeto:

**App e API, dada a mesma revisão, produzem o mesmo próximo agendamento.** Quem
quebrar isso, quebra o build.

**Um aluno não lê o progresso de outro.** É o furo mais comum em sistema real —
trocar o id na URL — e o mais fácil de reintroduzir numa refatoração de rota.

## Convenções

Como escrevo os commits e por quê: [`docs/commits.md`](docs/commits.md).

## Licença

MIT
