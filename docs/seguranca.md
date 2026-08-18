# Segurança

## Primeiro, o que este documento não afirma

Este sistema **não é impenetrável**, e nenhum é. Software que se anuncia como
inviolável costuma ser o que ninguém auditou.

O que existe aqui é outra coisa: um conjunto de ameaças que eu escolhi tratar,
um controle para cada uma, e um **teste que prova que o controle funciona**.
Controle sem teste é intenção — e intenção não sobrevive à quarta refatoração.

O que está fora do meu alcance também está escrito, na última seção. Saber onde
a defesa termina vale tanto quanto a defesa.

---

## Modelo de ameaças

Quem eu considero que pode atacar, e o que quer:

| Quem                      | O que quer                              | Por onde                    |
| ------------------------- | --------------------------------------- | --------------------------- |
| Aluno curioso             | Ver a nota e o progresso de outro aluno | Trocar o id na URL da API   |
| Aluno curioso             | Virar professor                         | Adulterar o papel no token  |
| Ex-aluno                  | Continuar entrando depois de desligado  | Token antigo que ainda vale |
| Script automatizado       | Descobrir senha por tentativa           | Repetir chamadas no login   |
| Site malicioso            | Usar a sessão do professor logado       | Requisição de outra origem  |
| Script injetado na página | Roubar o token do navegador             | XSS lendo o armazenamento   |
| Quem acha o celular       | Ler a sessão no disco do aparelho       | Armazenamento sem proteção  |
| Quem clona o repositório  | Achar credencial commitada              | Histórico do Git            |

Não considero no escopo: atacante com acesso ao servidor de produção, ataque
físico ao banco, e adversário estatal. Sistema de escola não é modelado para
isso, e fingir que é seria teatro.

---

## Controles, e onde cada um é provado

### 1 · Autorização por recurso, não só por papel

**A ameaça mais provável de todas, e a mais ignorada.** O aluno não precisa de
nenhuma ferramenta: ele troca o id na URL e vê o progresso do colega. É a
categoria que lidera as listas de vulnerabilidade real (IDOR), e ela não aparece
em teste de rota nem em revisão apressada, porque o endpoint "funciona".

Ter papel de aluno não basta — cada consulta filtra pelo id **do token**, nunca
pelo id que veio no caminho da URL.

Detalhe deliberado: quando o recurso existe mas não é seu, a resposta é **404 e
não 403**. Um 403 confirma que aquele aluno existe, e isso permite mapear a base
inteira só variando o id.

> Testes: aluno não lê a sessão de outra turma · **turma alheia e turma
> inexistente devolvem respostas indistinguíveis** · aluno não grava revisão em
> turma alheia · carta de outra turma dentro do lote derruba o lote inteiro ·
> professor não acessa a área do aluno.

O segundo teste é o que importa. Não basta responder 404 na turma alheia: se a
resposta for diferente da de uma turma inexistente, ainda dá para varrer ids e
descobrir quais turmas existem. As duas precisam ser iguais até no corpo.

### 2 · Papel vem do token, e o token é verificado

O papel viaja assinado. Adulterar o corpo invalida a assinatura.

E a verificação usa a chave do servidor com o algoritmo **fixado**: aceitar o
algoritmo que o próprio token declara é como aceitar `alg: none`, que é um
clássico que ainda aparece em produção.

> Testes: token com papel trocado é recusado · token assinado com outra chave é
> recusado · token com `alg: none` é recusado.

### 3 · Token curto e renovação rotativa, com detecção de reúso

Acesso de 15 minutos, renovação de 30 dias. **A renovação é de uso único**: cada
uso emite uma nova e invalida a anterior.

Se um token de renovação for usado duas vezes, só há duas explicações — ou ele
vazou, ou houve corrida. Nos dois casos a resposta é a mesma: **toda a família
de tokens daquele aluno é invalidada**, e ele entra de novo. Isso transforma um
roubo de token silencioso, que duraria trinta dias, em um logout que a pessoa
percebe.

Os dois segredos são obrigatoriamente diferentes. Com o mesmo valor, um token de
renovação vazado é aceito como token de acesso: a assinatura confere, e o
servidor não tem como distinguir.

Marcar o token antigo como usado e emitir o novo acontecem **na mesma
transação**. Se o processo cair no meio, ou o antigo continua válido, ou o novo
existe — nunca os dois inválidos, o que deslogaria a pessoa sem motivo.

> Testes: renovação usada duas vezes derruba a família · derrubar uma família não
> desloga os outros aparelhos · token de renovação não é aceito como acesso ·
> `carregarAmbiente` recusa segredos iguais **(já passando)**.

### 4 · Senha com Argon2id

Argon2id, vencedor do concurso de hashing de senha, com custo de memória — o que
torna ataque em GPU caro, diferente de bcrypt.

E o login demora igual quando o e-mail não existe: sem isso, a diferença de
tempo entre "usuário inexistente" e "senha errada" entrega quais e-mails estão
cadastrados.

> Testes: hash nunca aparece em resposta · e-mail inexistente e senha errada
> levam tempo comparável.

### 5 · Limite de tentativas

Login e renovação limitados por IP **e por conta**. Só por IP não adianta:
ataque distribuído troca de IP. Só por conta também não: dá para varrer muitas
contas com uma tentativa em cada.

> Testes: sexta tentativa na mesma conta responde 429 · **bloquear uma conta não
> bloqueia as outras do mesmo endereço**.

O segundo teste existe por causa de um defeito real. O `keyGenerator` lia
`requisicao.body`, mas rodava no hook `onRequest` — antes de o corpo ser
interpretado. O corpo era `undefined`, a chave degenerava em silêncio para só o
IP, e cinco tentativas de uma pessoa bloqueariam o login de todo mundo atrás do
mesmo endereço. Numa escola com rede compartilhada, isso derruba a turma.

Um teste que só contasse as tentativas de uma conta passaria mesmo com o
defeito. É o segundo teste que o pega.

### 6 · Armazenamento diferente em cada plataforma

Porque **a ameaça é diferente**, e copiar a mesma solução seria o erro:

|        | Guarda onde                                                                      | Contra o quê                                                                |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Web    | Acesso em memória, renovação em cookie `httpOnly` + `Secure` + `SameSite=Strict` | XSS: script injetado não lê memória de outro contexto nem cookie `httpOnly` |
| Mobile | `expo-secure-store` — Keychain no iOS, Keystore no Android                       | Outro app ou quem pega o aparelho lendo o disco                             |

`localStorage` está fora nos dois: qualquer script na página lê.

> Testes: o cookie sai com as três flags · o token de acesso não é persistido no
> navegador.

### 7 · Origem autorizada por lista

CORS com lista explícita, e a aplicação **recusa subir** em produção sem ela ou
com origem em `http://` — o cookie vai com `Secure` e simplesmente não seria
enviado, o que viraria um bug de login misterioso.

> Testes: produção sem lista de origens não sobe · produção com `http` não sobe
> **(já passando)**.

### 8 · Validação na fronteira

Todo corpo, query e parâmetro passa por schema zod antes de tocar em qualquer
regra. O que não está no schema é descartado, não repassado — um `senhaHash`
vindo do banco não vaza para a resposta porque alguém esqueceu de removê-lo no
mapeamento.

E o validador **recusa em vez de estourar**: um `refine` que lança transforma
entrada malformada em erro 500, que é o oposto do que validação existe para
fazer. Isso já aconteceu aqui e virou teste.

> Testes: 26 casos no contrato, cobrindo papel inventado, data inexistente, fuso
> falso e campo desconhecido **(já passando)**.

### 9 · SQL sempre parametrizado

Nenhuma query é montada por concatenação. O driver recebe parâmetros; string de
SQL é constante no código.

> Teste: nome de aluno contendo aspas e `--` é gravado e lido como texto.

### 10 · Segredo nunca no repositório

Só `.env.example`, com valores obviamente falsos. A aplicação valida na partida
e recusa subir com segredo ausente, curto, copiado de exemplo ou sem entropia.

O modo mais comum de vazamento não é o segredo commitado — é o **segredo
ausente** virando `process.env.X ?? 'dev'`, e a aplicação passando meses
assinando token com a palavra "dev" sem ninguém notar. Falhar na partida é
barulhento e acontece uma vez.

No CI, o **gitleaks** varre cada push, inclusive o histórico. Segredo que já
entrou no histórico não sai com um commit de remoção.

> Testes: 17 casos em `ambiente.test.ts` **(já passando)** · gitleaks no CI.

### 11 · Cabeçalhos de resposta

Helmet: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`,
`Strict-Transport-Security`. E o cabeçalho que anuncia o servidor é removido —
não é defesa, mas não há motivo para publicar a versão do que está rodando.

### 12 · Registro de eventos de autenticação

Entrada, saída, falha de senha, renovação recusada e detecção de reúso ficam
registrados com data, papel e IP. **Nunca com o token, nem com a senha.**

Sem registro, um vazamento é descoberto pelo usuário — e sempre tarde.

---

## Testes de ponta a ponta

**Playwright** cobre web e API. É a ferramenta certa para navegador, e serve
também para exercitar a API direto por HTTP.

**Playwright não testa React Native** — isso é confusão comum e vale registrar.
Para o app a ferramenta é o **Maestro**, que roda no emulador com fluxos em YAML.

Os fluxos que rodam a cada push, do lado do atacante:

1. Entrar como aluno, trocar o id da URL para o de outro aluno → 404
2. Entrar como aluno, chamar rota de professor → 403
3. Editar o papel dentro do token → 401
4. Usar o mesmo token de renovação duas vezes → a família cai
5. Seis tentativas de login → 429
6. Requisição de origem não autorizada → bloqueada
7. Nome de aluno com aspas e `--` → gravado como texto

O teste que mais importa é o primeiro. É o furo mais comum em sistema real, e o
mais fácil de introduzir sem perceber numa refatoração de rota.

---

## Onde a defesa termina

Escrito de propósito, porque conhecer o limite faz parte do controle:

- **Servidor comprometido**: quem lê a memória do processo lê os segredos.
  Mitigação real seria HSM ou cofre gerenciado, fora do escopo de um projeto de
  portfólio.
- **Aparelho com root ou jailbreak**: o Keystore protege contra outro app, não
  contra o dono com acesso total.
- **Senha fraca do próprio usuário**: exijo tamanho mínimo, não força real.
  Integrar checagem contra vazamentos conhecidos seria o próximo passo.
- **Ataque de negação de serviço**: o limite por conta e IP segura script
  amador, não botnet. Isso é problema de camada de rede.
- **Dependência comprometida**: `npm audit` no CI pega o que já é conhecido, e
  não o que ainda não foi descoberto.
- **Dependência ainda não catalogada**: `npm audit` só conhece o que já foi
  publicado. Hoje o projeto está com zero vulnerabilidades conhecidas e o passo
  **bloqueia** o merge em qualquer alta ou crítica — isso passou a ser possível
  quando o aplicativo saiu do repositório e levou junto a cadeia de ferramentas
  do Expo, que trazia vinte e seis avisos insolúveis sem uma troca de versão
  maior.
