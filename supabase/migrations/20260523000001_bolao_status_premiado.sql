-- Adiciona valor PREMIADO ao enum bolao_status
-- Disparado quando uma cota atinge total_acertos_acumulados >= qtd_numeros_cota
ALTER TYPE bolao_status ADD VALUE IF NOT EXISTS 'PREMIADO' AFTER 'EM_ANDAMENTO';

-- Necessário para usar o novo valor no mesmo transaction em Postgres < 16
COMMIT;

-- Backfill: marca bolões EM_ANDAMENTO que já têm ganhador principal
UPDATE boloes b
SET status = 'PREMIADO', atualizado_em = NOW()
WHERE b.status = 'EM_ANDAMENTO'
  AND EXISTS (
    SELECT 1 FROM cotas c
    WHERE c.bolao_id  = b.id
      AND c.tenant_id = b.tenant_id
      AND c.status_pagamento = 'PAGO'
      AND c.total_acertos_acumulados >= b.qtd_numeros_cota
  );
