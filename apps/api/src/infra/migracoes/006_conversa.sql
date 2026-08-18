-- Prática de conversação.

CREATE TABLE conversas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id   UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  turma_id   UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  cenario    TEXT NOT NULL,
  nivel      TEXT NOT NULL CHECK (nivel IN ('A1','A2','B1','B2','C1','C2')),
  encerrada_em TIMESTAMPTZ,
  criada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversas_por_aluno ON conversas (aluno_id, criada_em DESC);

CREATE TABLE falas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES conversas (id) ON DELETE CASCADE,
  autor       TEXT NOT NULL CHECK (autor IN ('aluno', 'assistente')),
  texto       TEXT NOT NULL,

  -- As correções da fala do aluno, já verificadas contra o que ele escreveu.
  -- Guardadas para o professor poder ver depois onde a turma erra mais.
  correcoes   JSONB,

  dita_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A conversa é sempre lida em ordem, do começo ao fim.
CREATE INDEX falas_por_conversa ON falas (conversa_id, dita_em);
