-- Correção de redação.

CREATE TABLE temas_de_redacao (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id  UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  titulo    TEXT NOT NULL,
  enunciado TEXT NOT NULL,
  nivel     TEXT NOT NULL CHECK (nivel IN ('A1','A2','B1','B2','C1','C2')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX temas_por_turma ON temas_de_redacao (turma_id, criado_em DESC);

CREATE TABLE redacoes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id   UUID NOT NULL REFERENCES temas_de_redacao (id) ON DELETE CASCADE,
  aluno_id  UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  texto     TEXT NOT NULL,
  palavras  INTEGER NOT NULL,

  -- A análise vem como JSON porque o formato pertence ao provedor, e guardar
  -- o retorno cru permite reprocessar se a regra de verificação mudar. Os
  -- campos que a aplicação usa saem daqui validados pelo contrato.
  analise   JSONB,
  provedor  TEXT,
  analisada_em TIMESTAMPTZ,

  -- O parecer do professor. A IA analisa; quem avalia é ele.
  parecer   TEXT,
  nota      INTEGER CHECK (nota BETWEEN 0 AND 10),
  corrigida_em TIMESTAMPTZ,

  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma entrega por tema e aluno. Reenviar substitui, e a restrição é o que
  -- garante isso mesmo com dois envios simultâneos.
  CONSTRAINT redacao_unica UNIQUE (tema_id, aluno_id)
);

CREATE INDEX redacoes_por_tema ON redacoes (tema_id, enviada_em DESC);
CREATE INDEX redacoes_por_aluno ON redacoes (aluno_id, enviada_em DESC);

-- As pendentes de correção, que é a fila do professor.
CREATE INDEX redacoes_pendentes ON redacoes (tema_id) WHERE corrigida_em IS NULL;
