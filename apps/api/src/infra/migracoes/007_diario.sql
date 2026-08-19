-- Diário de classe.

CREATE TABLE aulas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id  UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,

  -- DATE, e não TIMESTAMPTZ: uma aula acontece num dia do calendário da escola.
  -- Guardar instante exigiria decidir o fuso de cada leitura, e a data da aula
  -- não muda quando alguém abre o diário de outro país.
  dia       DATE NOT NULL,

  conteudo  TEXT NOT NULL,
  dever     TEXT,

  -- O link da chamada é um campo, não integração. Embutir vídeo seriam semanas
  -- de trabalho para provar que se sabe usar a biblioteca de outra pessoa.
  encontro  TEXT,

  criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma aula por turma e dia. Registrar duas vezes é engano comum, e a
  -- restrição transforma isso em erro claro em vez de duplicata silenciosa.
  CONSTRAINT aula_unica_no_dia UNIQUE (turma_id, dia)
);

CREATE INDEX aulas_por_turma ON aulas (turma_id, dia DESC);

CREATE TABLE presencas (
  aula_id  UUID NOT NULL REFERENCES aulas (id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,

  -- Três estados, e não um booleano. "Faltou" e "faltou com justificativa" têm
  -- consequências diferentes na secretaria, e um booleano obrigaria a inventar
  -- uma tabela paralela depois.
  situacao TEXT NOT NULL CHECK (situacao IN ('presente', 'ausente', 'justificada')),

  anotacao TEXT,

  PRIMARY KEY (aula_id, aluno_id)
);

CREATE INDEX presencas_por_aluno ON presencas (aluno_id);
