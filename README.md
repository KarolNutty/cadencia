# Cadência

**Um app de estudo de idiomas para escolas, com painel do professor.** O aluno
revisa vocabulário no celular; o professor vê no navegador quem estudou e —
principalmente — **qual palavra travou**, antes da próxima aula.

Monorepo TypeScript com três aplicações e um domínio compartilhado.

<!-- Prints em docs/: app.png e painel.png -->

|                   |                                                 |
| ----------------- | ----------------------------------------------- |
| **App**           | React Native · Expo · TanStack Query            |
| **Painel**        | React · Vite                                    |
| **API**           | Fastify · PostgreSQL · JWT com rotação de token |
| **Compartilhado** | Domínio puro, contratos em Zod, cliente HTTP    |
| **Qualidade**     | 197 testes · TypeScript estrito · CI completo   |

```bash
npm install
cp .env.example .env          # e gere os dois segredos
npm run banco:subir           # Postgres via Docker
npm run migrar && npm run semear

npm run api      # a API
npm run web      # o painel do professor
npm run app      # o app do aluno
```

O `semear` cria uma turma com 48 palavras de inglês e imprime as credenciais.

---

## A decisão que organiza o projeto

> **O mesmo código de agendamento roda no aplicativo e no servidor.**

Quando o aluno avalia uma carta, o próximo intervalo é calculado **no aparelho**,
chamando o mesmo módulo que o servidor chama. A tela responde na hora — quem
avalia trinta cartas em três minutos não pode esperar a rede a cada uma. O
servidor recalcula ao receber o lote, e a resposta dele é a autoridade.

Como é o mesmo arquivo importado, e não a mesma regra escrita duas vezes, os
dois não têm como divergir. Há um teste que compara os resultados e quebra o
build se alguém reimplementar a regra "só no app, para ser mais rápido".

É também a resposta para _"por que React Native e não Flutter aqui?"_. Com duas
linguagens, esse módulo existiria em duplicata e a coerência dependeria de
disciplina. Aqui ela é garantida pelo compilador.

```
apps/
├── api/          Fastify + Postgres + JWT
├── mobile/       React Native + Expo — o aluno
└── web/          React + Vite — o professor
packages/
├── dominio/      repetição espaçada e dia de estudo · puro, sem I/O
├── contrato/     schemas Zod: validam na API e tipam nos clientes
├── cliente-api/  cliente HTTP com renovação de token coordenada
└── config/       validação de ambiente
```

O `dominio` não importa nada — nem contrato, nem framework, nem Zod. Uma regra
de ESLint quebra o build se alguém tentar. É o que permite testá-lo em Node puro
e rodar o mesmo arquivo nos dois lados.

---

## Três decisões de produto

### O dia vira às 4 da manhã, no fuso do aluno

Quem senta para estudar à uma da manhã ainda está no dia dele. Com o corte à
meia-noite, esse aluno **perderia a sequência por estar estudando** — o pior
incentivo possível.

Dia de estudo é data de negócio, não data de relógio. Os dois quase sempre
coincidem, e é justamente por isso que a diferença passa despercebida até
quebrar.

### O algoritmo cede ao calendário da escola

A base é o SM-2, do Anki. O que vale não é copiá-lo — é o que muda por causa do
domínio:

**Teto de 120 dias.** O SM-2 puro manda uma carta bem sabida para daqui a três
anos. Num curso de seis meses isso equivale a apagá-la.

**Errar não destrói a facilidade.** Sem um piso, um punhado de cartas difíceis
passa a dominar toda sessão e o aluno desiste. Passando de quatro erros, a carta
é **sinalizada para o professor** — o software admite que aquilo não é problema
de agendamento.

| Aluno         | Intervalos                               |
| ------------- | ---------------------------------------- |
| Sempre acerta | 1 → 3 → 8 → 20 → 50 → 120                |
| Acha difícil  | 1 → 3 → 6 → 11 → 19 → 30 → 48            |
| Carta travada | fica em 1 dia e sai da sessão no 4º erro |

### XP não se ganha por volume

Parece decisão de produto e é decisão de engenharia. Dar ponto por carta
avaliada faz o aluno marcar "fácil" trinta vezes, liderar o ranking sem ter
estudado e — pior — aprender o comportamento que **destrói o próprio
agendamento**, porque marcar fácil no que não se sabe manda a carta para daqui
a dois meses.

O sistema de pontos não pode premiar o que o produto existe para evitar. Então:

| Regra                            | Por quê                                                |
| -------------------------------- | ------------------------------------------------------ |
| Só carta **vencida** rende ponto | Senão bastaria reabrir o baralho toda hora             |
| Errar não desconta               | Punir o erro empurra a marcar "bom" no que não se sabe |
| Teto diário de 200 XP            | Sem ele o ranking mede tempo livre, não constância     |
| Ranking **da semana**            | Acumulado trava: quem entra depois nunca alcança       |

O XP é apurado no servidor, a partir do agendamento gravado **antes** da
revisão. O cliente não informa quanto ganhou.

### O painel é uma fila de urgência, não um cadastro

Quem tem palavra travada aparece primeiro, depois quem sumiu, depois quem está
atrasado. Ordem alfabética seria mais simples e responderia a pergunta errada.

O número que abre a tela é o de alunos travados, e não o de matriculados: total
é dado de cadastro; travado muda o que o professor faz na segunda-feira.

---

## Segurança

O sistema **não é impenetrável** — nenhum é, e anunciar isso costuma indicar que
ninguém auditou. O que existe é um modelo de ameaças, um controle para cada uma
e **um teste provando que o controle funciona**. O documento também registra
onde a defesa termina: [`docs/seguranca.md`](docs/seguranca.md).

Os que valem destacar:

**Autorização por recurso, não só por papel.** O aluno troca o id na URL e vê o
progresso do colega — não exige ferramenta nenhuma, e o endpoint "funciona", por
isso não aparece em revisão apressada. Toda consulta filtra pelo id **do token**.
E recurso alheio responde **404, não 403**: um 403 confirmaria que aquele
registro existe, permitindo mapear a base variando o id.

**Renovação rotativa com detecção de reúso.** Cada token de renovação vale uma
vez. Se um já usado reaparece, ou vazou ou houve corrida — nos dois casos a
família inteira cai. Isso transforma um roubo silencioso de trinta dias num
logout que a pessoa percebe.

**Armazenamento diferente em cada plataforma, porque a ameaça é diferente.** No
navegador, cookie `httpOnly` — lá o risco é script injetado. No celular,
Keychain e Keystore — aqui o risco é acesso ao disco. Copiar a mesma solução
para os dois seria o erro.

**Nenhum segredo no repositório.** A aplicação valida o ambiente na partida e
recusa subir com segredo ausente, curto, copiado de exemplo ou sem entropia. O
modo mais comum de vazamento não é o segredo commitado — é o ausente virando
`?? 'dev'` e passando meses assinando token sem ninguém notar.

---

## Testes

**197 testes**, mais 41 de integração contra Postgres real.

| Camada     | Como                                                                |
| ---------- | ------------------------------------------------------------------- |
| `dominio`  | Node puro. O valor esperado é calculado fora do código testado      |
| `contrato` | O que a API precisa **recusar** antes de tocar no banco             |
| `api`      | Postgres de verdade em Docker, o mesmo motor de produção            |
| `web`      | Testing Library: ordem da lista, rótulos, navegação, acessibilidade |
| `mobile`   | Máquina de estado da sessão, sem renderizar tela                    |

Duas suítes separadas: `npm test` roda em segundos sem Docker;
`npm run test:integracao` exige o banco. Misturar faria quem não tem Docker ver
vermelho num código correto — e o hábito que nasce daí é ignorar teste vermelho.

### Quatro erros que os testes encontraram

Ficam aqui porque são a parte mais útil deste documento.

**Uma verificação de segurança que nunca disparava.** A lista de segredos óbvios
comparava por igualdade exata — e como todos os itens têm menos de 32
caracteres, a regra de tamanho já os barrava antes. Era código morto se passando
por controle. O caso real não é usar exatamente `changeme`, é pegar `changeme` e
completar até passar no mínimo.

**Um teste medindo a camada errada.** Eu afirmava que o campo `tipo` impedia
usar um token de renovação como acesso. O teste passava — mas porque a
_assinatura_ já reprovava antes, já que os segredos são diferentes. A segunda
barreira nunca era exercitada, e se quebrasse ninguém saberia. Hoje cada uma tem
seu teste, e a da segunda monta de propósito o cenário do segredo reaproveitado.

**Um limite de tentativas que degenerou em silêncio.** A chave juntava IP e
e-mail, mas era calculada antes de o corpo da requisição ser lido: virava só o
IP. Cinco tentativas erradas de uma pessoa bloqueariam o login de todos atrás do
mesmo endereço — numa escola com rede compartilhada, a turma inteira. O teste
que existia contava tentativas de uma conta só, e passaria mesmo com o defeito.

**Um bug que só aparecia à noite.** O painel calculava "hoje" uma vez, no fuso do
servidor. Rodando às onze da noite no Brasil — já dia seguinte em UTC — a regra
das 4h jogava o dia para trás, e quem tinha acabado de estudar aparecia com
sequência zero. Hoje o dia é calculado por aluno, inclusive dentro do SQL:
`(timezone(u.fuso, now()) - interval '4 hours')::date`.

O padrão dos quatro é o mesmo, e é a lição que eu levo do projeto:

> **Comentário não é executável.** Nos quatro casos existia um comentário
> afirmando uma garantia que o código não entregava. Toda afirmação de garantia
> precisa de um teste que falharia sem ela — e o teste precisa ser capaz de
> falhar pelo motivo certo.

---

## O que o pipeline barra

Roda a cada push e pull request, e **impede o merge** em qualquer destes casos:

| Barra quando                                    | Passo                      |
| ----------------------------------------------- | -------------------------- |
| Um tipo não fecha em qualquer dos três projetos | `typecheck`                |
| Qualquer regra de lint quebra, inclusive aviso  | `lint --max-warnings 0`    |
| Um arquivo sai do padrão de formatação          | `format:check`             |
| Um teste falha, com ou sem banco                | `test` e `test:integracao` |
| O painel não compila                            | `build:web`                |
| Um segredo aparece no código ou no histórico    | `gitleaks`                 |
| Há vulnerabilidade alta ou crítica              | `npm audit`                |

O Postgres sobe como serviço do próprio job. Sem isso, os testes que provam a
autorização por recurso, a rotação de token e o tratamento de injeção não
rodariam — e um pull request que quebrasse qualquer um deles passaria verde.
**Teste que só roda na máquina de quem escreveu não protege nada.**

O `gitleaks` varre o histórico completo, e não só o último commit: segredo que
já entrou no passado não sai com um commit de remoção.

## Documentos

- [`docs/arquitetura.md`](docs/arquitetura.md) — organização por funcionalidade e o que fica compartilhado
- [`docs/seguranca.md`](docs/seguranca.md) — modelo de ameaças, controles e limites
- [`docs/commits.md`](docs/commits.md) — convenção de commits

## Licença

MIT
