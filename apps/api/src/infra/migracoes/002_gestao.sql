-- Gestão de turmas, matrícula e conteúdo.
--
-- Migração nova em vez de editar a 001: a inicial já foi aplicada, e mexer numa
-- migração aplicada produz bancos diferentes com o mesmo número.

-- Convite de aluno que ainda não tem conta.
--
-- O professor matricula por e-mail, e a pessoa pode não existir no sistema. Sem
-- isto, ou a matrícula falha, ou o professor precisa criar a conta de alguém —
-- e definir a senha de outra pessoa é o que nunca se deve fazer.
CREATE TABLE convites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id   UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  email      TEXT NOT NULL CHECK (email = lower(email)),
  criado_por UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  aceito_em  TIMESTAMPTZ,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Um convite pendente por pessoa e turma. Convidar duas vezes é engano
  -- comum, e a restrição transforma isso em erro claro em vez de duplicata.
  CONSTRAINT convites_unicos UNIQUE (turma_id, email)
);

CREATE INDEX convites_por_email ON convites (email) WHERE aceito_em IS NULL;

-- Turma arquivada some da lista sem levar junto o histórico dos alunos.
ALTER TABLE turmas ADD COLUMN arquivada_em TIMESTAMPTZ;

-- Nível do baralho, para o professor organizar por etapa do curso.
ALTER TABLE baralhos ADD COLUMN nivel TEXT
  CHECK (nivel IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- Ordem manual das palavras dentro do baralho.
ALTER TABLE cartoes ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0;

CREATE INDEX cartoes_por_ordem ON cartoes (baralho_id, ordem);

-- A mesma palavra não entra duas vezes no mesmo baralho.
--
-- Colar uma lista com repetição é o caso comum, e sem esta restrição o aluno
-- veria a mesma carta duas vezes na sessão sem entender por quê.
CREATE UNIQUE INDEX cartoes_frente_unica
  ON cartoes (baralho_id, lower(trim(frente)));
