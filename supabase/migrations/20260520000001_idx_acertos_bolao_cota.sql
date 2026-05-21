-- Índice cobrindo para o UPDATE de total_acertos_acumulados no CalcAcertosJob.
-- A query agrega acertos_sorteio por (tenant_id, bolao_id) e faz GROUP BY cota_id.
-- INCLUDE (acertos) permite index-only scan: HashAggregate lê só o índice, sem heap fetch.
-- Substitui o idx_acertos_cota (tenant_id, cota_id) que não cobre bolao_id.

CREATE INDEX idx_acertos_bolao_cota
  ON acertos_sorteio (tenant_id, bolao_id, cota_id)
  INCLUDE (acertos);

DROP INDEX IF EXISTS idx_acertos_cota;
