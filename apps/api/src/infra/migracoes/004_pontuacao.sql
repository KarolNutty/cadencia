-- Pontuação, ofensiva e ranking.

-- O XP é gravado por dia, e não somado numa coluna do usuário.
--
-- Uma coluna `xp_total` seria mais simples de ler e impossível de auditar: não
-- daria para responder "quanto ele ganhou na semana passada", que é justamente
-- o que o ranking precisa. E qualquer erro de cálculo ficaria permanente, sem
-- histórico para recalcular.
CREATE TABLE pontos_por_dia (
  aluno_id  UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  turma_id  UUID NOT NULL REFERENCES turmas (id) ON DELETE CASCADE,
  dia       DATE NOT NULL,
  xp        INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (aluno_id, turma_id, dia)
);

-- O ranking da semana lê por turma e intervalo de datas.
CREATE INDEX pontos_por_turma_e_dia ON pontos_por_dia (turma_id, dia DESC);
