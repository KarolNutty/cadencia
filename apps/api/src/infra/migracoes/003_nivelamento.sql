-- Teste de nivelamento.

CREATE TABLE perguntas_de_nivelamento (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idioma       TEXT NOT NULL,
  nivel        TEXT NOT NULL CHECK (nivel IN ('A1','A2','B1','B2','C1','C2')),
  enunciado    TEXT NOT NULL,
  -- As alternativas em ordem; o índice da correta é guardado à parte e NUNCA
  -- sai do servidor junto com a pergunta.
  alternativas TEXT[] NOT NULL CHECK (array_length(alternativas, 1) BETWEEN 2 AND 6),
  correta      INTEGER NOT NULL CHECK (correta >= 0),
  criada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX perguntas_por_nivel ON perguntas_de_nivelamento (idioma, nivel);

-- Uma tentativa de teste por aluno e idioma.
CREATE TABLE tentativas_de_nivelamento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id    UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  idioma      TEXT NOT NULL,
  -- O estado da busca vive no servidor. Guardá-lo no cliente permitiria
  -- reescrevê-lo pelo console e sair com o nível que quisesse.
  nivel_atual TEXT NOT NULL,
  menor       INTEGER NOT NULL,
  maior       INTEGER NOT NULL,
  nivel_final TEXT,
  confianca   NUMERIC(3, 2),
  concluida_em TIMESTAMPTZ,
  -- Confirmado pelo professor antes de valer para matrícula.
  confirmado_em TIMESTAMPTZ,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tentativas_por_aluno ON tentativas_de_nivelamento (aluno_id, idioma);

CREATE TABLE respostas_de_nivelamento (
  tentativa_id UUID NOT NULL REFERENCES tentativas_de_nivelamento (id) ON DELETE CASCADE,
  pergunta_id  UUID NOT NULL REFERENCES perguntas_de_nivelamento (id) ON DELETE CASCADE,
  nivel        TEXT NOT NULL,
  acertou      BOOLEAN NOT NULL,
  respondida_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A mesma pergunta não é respondida duas vezes na mesma tentativa: repetir
  -- invalidaria a medida, porque a pessoa lembra da resposta anterior.
  PRIMARY KEY (tentativa_id, pergunta_id)
);
