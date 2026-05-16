-- Permite acertos_alvo = 0 (categoria "zero acertos ganha").
-- Constraint anterior: BETWEEN 1 AND 10.
ALTER TABLE categorias_premiacao
  DROP CONSTRAINT IF EXISTS acertos_alvo_range,
  ADD CONSTRAINT acertos_alvo_range CHECK (acertos_alvo BETWEEN 0 AND 10);
