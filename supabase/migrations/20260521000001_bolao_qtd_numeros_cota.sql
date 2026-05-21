-- Qtd de números por cota configurável por bolão (mínimo 6)
ALTER TABLE boloes
  ADD COLUMN qtd_numeros_cota INT NOT NULL DEFAULT 10
  CONSTRAINT qtd_numeros_cota_minimo CHECK (qtd_numeros_cota >= 6);

-- Remove limite superior fixo de acertos_alvo (agora validado no service vs qtdNumerosCota)
ALTER TABLE categorias_premiacao
  DROP CONSTRAINT IF EXISTS acertos_alvo_range,
  ADD CONSTRAINT acertos_alvo_range CHECK (acertos_alvo >= 0);
