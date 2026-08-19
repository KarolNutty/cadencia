-- Estrutura inicial.
--
-- Migração é arquivo numerado e imutável: uma vez aplicada em qualquer
-- ambiente, ela não é editada. Corrigir algo é escrever a próxima. Editar uma
-- migração já aplicada produz bancos diferentes com o mesmo número, e a
-- diferença só aparece quando alguém tenta reproduzir um bug e não consegue.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL CHECK (length(trim(nome)) >= 2),
  -- Guardado já em minúsculo. "Ana@x.com" e "ana@x.com" são a mesma pessoa, e
  -- sem esta regra o cadastro aceita as duas e o login fica ambíguo.
  email      TEXT NOT NULL CHECK (email = lower(email)),
  senha_hash TEXT NOT NULL,
  papel      TEXT NOT NULL CHECK (papel IN ('aluno', 'professor')),
  fuso       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT usuarios_email_unico UNIQUE (email)
);

CREATE TABLE turmas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  idioma       TEXT NOT NULL,
  -- RESTRICT, e não CASCADE: apagar um professor não pode levar junto as
  -- turmas dele e o histórico de estudo de todos os alunos.
  professor_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  criada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX turmas_por_professor ON turmas (professor_id);

CREATE TABLE matriculas (
  turma_id       UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  aluno_id       UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  matriculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (turma_id, aluno_id)
);

-- A chave primária composta já serve à busca por turma. Este índice existe
-- para a pergunta inversa: de quais turmas este aluno participa.
CREATE INDEX matriculas_por_aluno ON matriculas (aluno_id);

CREATE TABLE baralhos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id  UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  titulo    TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX baralhos_por_turma ON baralhos (turma_id);

CREATE TABLE cartoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baralho_id UUID NOT NULL REFERENCES baralhos (id) ON DELETE CASCADE,
  frente     TEXT NOT NULL,
  verso      TEXT NOT NULL,
  dica       TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cartoes_por_baralho ON cartoes (baralho_id);

-- Estado do agendamento, por aluno e por carta.
--
-- É estado DERIVADO: dá para reconstruí-lo reproduzindo as revisões, e existe
-- um teste que compara os dois caminhos. Ele é materializado porque "o que
-- vence hoje" roda a cada abertura do app e precisa ser um índice, não uma
-- reconstrução.
CREATE TABLE agendamentos (
  aluno_id       UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cartao_id      UUID NOT NULL REFERENCES cartoes (id) ON DELETE CASCADE,
  intervalo_dias INTEGER NOT NULL CHECK (intervalo_dias >= 0),
  facilidade     NUMERIC(3, 2) NOT NULL CHECK (facilidade BETWEEN 1 AND 3),
  repeticoes     INTEGER NOT NULL DEFAULT 0 CHECK (repeticoes >= 0),
  lapsos         INTEGER NOT NULL DEFAULT 0 CHECK (lapsos >= 0),
  -- DATE, e não TIMESTAMPTZ: dia de estudo é data de negócio. Guardar instante
  -- reabriria toda a confusão de fuso que o formato existe para evitar.
  vence_em       DATE NOT NULL,
  sinalizado     BOOLEAN NOT NULL DEFAULT false,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (aluno_id, cartao_id)
);

-- A consulta mais frequente do sistema: o que vence hoje para este aluno.
-- O índice parcial ignora as cartas sinalizadas, que nunca entram na sessão.
CREATE INDEX agendamentos_vencendo
  ON agendamentos (aluno_id, vence_em)
  WHERE sinalizado = false;

-- Revisões são fatos ocorridos: só entram, nunca mudam.
-- Ninguém edita "eu tinha acertado aquela carta ontem".
CREATE TABLE revisoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id           UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cartao_id          UUID NOT NULL REFERENCES cartoes (id) ON DELETE CASCADE,
  avaliacao          TEXT NOT NULL CHECK (avaliacao IN ('errei', 'dificil', 'bom', 'facil')),
  dia                DATE NOT NULL,
  intervalo_anterior INTEGER NOT NULL,
  intervalo_novo     INTEGER NOT NULL,
  -- Identificador do lote enviado pelo app. É o que torna o reenvio seguro
  -- quando a resposta se perde na volta.
  lote_id            UUID NOT NULL,
  registrada_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX revisoes_por_aluno ON revisoes (aluno_id, dia);

-- A idempotência do envio depende deste índice: a segunda tentativa do mesmo
-- lote esbarra na restrição em vez de duplicar o histórico. A garantia é do
-- banco, e não de um "select antes do insert", que perde numa corrida entre
-- duas requisições simultâneas.
CREATE UNIQUE INDEX revisoes_lote_unico ON revisoes (lote_id, cartao_id);

-- Tokens de renovação em uso.
--
-- Guardar o token permite duas coisas que um JWT sozinho não dá: revogar antes
-- da expiração e detectar reúso. Guarda-se o HASH, nunca o token, quem lesse
-- o banco poderia se passar por qualquer aluno.
CREATE TABLE tokens_de_renovacao (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  familia_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  usado_em   TIMESTAMPTZ,
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tokens_hash_unico UNIQUE (token_hash)
);

CREATE INDEX tokens_por_familia ON tokens_de_renovacao (familia_id);
CREATE INDEX tokens_por_usuario ON tokens_de_renovacao (usuario_id);

-- Registro de eventos de autenticação.
--
-- Nunca guarda token nem senha. Sem este registro, um vazamento é descoberto
-- pelo próprio usuário, e sempre tarde.
CREATE TABLE eventos_de_autenticacao (
  id          BIGSERIAL PRIMARY KEY,
  -- SET NULL: apagar o usuário não apaga o rastro de que os eventos
  -- aconteceram. É justamente o histórico de quem sumiu que se quer auditar.
  usuario_id  UUID REFERENCES usuarios (id) ON DELETE SET NULL,
  tipo        TEXT NOT NULL,
  ip          INET,
  detalhe     TEXT,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eventos_por_usuario ON eventos_de_autenticacao (usuario_id, ocorrido_em DESC);
