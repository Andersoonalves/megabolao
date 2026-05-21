-- ================================================================
-- NossoBolão — Sorteios de carga + CalcAcertosJob em SQL
-- Bolão: 00000000-0000-0000-0000-000000000099 (10k cotas)
--
-- Replica exatamente a lógica do CalcAcertosProcessor:
--   1. Insere acertos_sorteio por cota PAGO (ON CONFLICT = idempotente)
--   2. UPDATE total_acertos_acumulados em batch único
--   3. Marca sorteio.processado = true
--
-- Uso:
--   docker exec -i supabase_db_megabolao psql -U postgres -d postgres \
--     < supabase/seed-load-test-sorteios.sql
-- ================================================================

DO $$
DECLARE
  v_tenant_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_bolao_id     UUID := '00000000-0000-0000-0000-000000000099';
  v_sorteio_id   UUID;
  sorteio        JSONB;
  bolas          INT[];
  t_start        TIMESTAMPTZ;
  t_acertos      INTERVAL;
  t_update       INTERVAL;
  n_cotas        INT;
  n_acertos      INT;

  sorteios_data JSONB := '[
    {"concurso": 3000, "data": "2026-05-01", "bolas": [3,12,22,35,47,56], "seq": 1, "primeiro": true},
    {"concurso": 3001, "data": "2026-05-06", "bolas": [5,11,19,33,44,59], "seq": 2, "primeiro": false},
    {"concurso": 3002, "data": "2026-05-08", "bolas": [2,16,25,36,48,60], "seq": 3, "primeiro": false},
    {"concurso": 3003, "data": "2026-05-13", "bolas": [6,13,21,34,46,57], "seq": 4, "primeiro": false},
    {"concurso": 3004, "data": "2026-05-15", "bolas": [4,17,28,39,50,58], "seq": 5, "primeiro": false},
    {"concurso": 3005, "data": "2026-05-20", "bolas": [1,14,27,40,52,55], "seq": 6, "primeiro": false}
  ]';

BEGIN

  -- ── FASE 1: Sorteios ─────────────────────────────────────────
  RAISE NOTICE '=== FASE 1: Inserindo sorteios ===';

  FOR sorteio IN SELECT * FROM jsonb_array_elements(sorteios_data)
  LOOP
    INSERT INTO sorteios
      (tenant_id, bolao_id, numero_concurso, data_sorteio,
       bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado)
    VALUES (
      v_tenant_id,
      v_bolao_id,
      (sorteio->>'concurso')::INT,
      (sorteio->>'data')::DATE,
      ARRAY(SELECT jsonb_array_elements_text(sorteio->'bolas')::INT),
      (sorteio->>'seq')::INT,
      (sorteio->>'primeiro')::BOOLEAN,
      false
    )
    ON CONFLICT (tenant_id, bolao_id, numero_concurso) DO NOTHING;

    SELECT id INTO v_sorteio_id
    FROM sorteios
    WHERE tenant_id        = v_tenant_id
      AND bolao_id         = v_bolao_id
      AND numero_concurso  = (sorteio->>'concurso')::INT;

    RAISE NOTICE '  concurso % → %', sorteio->>'concurso', v_sorteio_id;
  END LOOP;

  -- ── FASE 2: CalcAcertosJob ────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '=== FASE 2: CalcAcertosJob (lógica replicada em SQL) ===';

  FOR v_sorteio_id, bolas IN
    SELECT id, bolas_sorteadas
    FROM sorteios
    WHERE tenant_id  = v_tenant_id
      AND bolao_id   = v_bolao_id
      AND processado = false
    ORDER BY sequencia_no_bolao
  LOOP
    t_start := clock_timestamp();

    -- Passo 1: acertos_sorteio (idempotente)
    INSERT INTO acertos_sorteio (tenant_id, bolao_id, sorteio_id, cota_id, acertos)
    SELECT
      v_tenant_id,
      v_bolao_id,
      v_sorteio_id,
      c.id,
      (SELECT COUNT(*)::INT FROM unnest(c.palpites) p WHERE p = ANY(bolas))
    FROM cotas c
    WHERE c.tenant_id        = v_tenant_id
      AND c.bolao_id         = v_bolao_id
      AND c.status_pagamento = 'PAGO'
    ON CONFLICT (sorteio_id, cota_id) DO NOTHING;

    GET DIAGNOSTICS n_acertos = ROW_COUNT;
    t_acertos := clock_timestamp() - t_start;

    -- Passo 2: total_acertos_acumulados — FROM + pre-aggregate (mesma query do processor TS corrigido)
    t_start := clock_timestamp();

    UPDATE cotas SET
      total_acertos_acumulados = agg.total,
      atualizado_em            = NOW()
    FROM (
      SELECT cota_id, COALESCE(SUM(acertos), 0)::INT AS total
      FROM acertos_sorteio
      WHERE tenant_id = v_tenant_id
        AND bolao_id  = v_bolao_id
      GROUP BY cota_id
    ) agg
    WHERE cotas.id               = agg.cota_id
      AND cotas.bolao_id         = v_bolao_id
      AND cotas.tenant_id        = v_tenant_id
      AND cotas.status_pagamento = 'PAGO';

    GET DIAGNOSTICS n_cotas = ROW_COUNT;
    t_update := clock_timestamp() - t_start;

    -- Passo 3: marcar processado
    UPDATE sorteios SET processado = true WHERE id = v_sorteio_id;

    RAISE NOTICE '  sorteio % | acertos: % rows em % | update cotas: % em %',
      v_sorteio_id, n_acertos, t_acertos, n_cotas, t_update;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== CONCLUÍDO ===';

END $$;

-- ── RELATÓRIO ────────────────────────────────────────────────────

-- Sorteios processados
SELECT numero_concurso, sequencia_no_bolao, processado, bolas_sorteadas
FROM sorteios
WHERE bolao_id = '00000000-0000-0000-0000-000000000099'
ORDER BY sequencia_no_bolao;

-- Estatísticas gerais de acertos_sorteio
SELECT
  COUNT(*)                    AS total_registros,
  COUNT(DISTINCT sorteio_id)  AS sorteios_processados,
  COUNT(DISTINCT cota_id)     AS cotas_distintas,
  ROUND(AVG(acertos), 2)      AS media_acertos,
  MAX(acertos)                AS max_acertos
FROM acertos_sorteio
WHERE bolao_id = '00000000-0000-0000-0000-000000000099';

-- Distribuição de acertos acumulados (top 20 faixas)
SELECT
  total_acertos_acumulados                                         AS acertos_totais,
  COUNT(*)                                                         AS cotas,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2)              AS pct
FROM cotas
WHERE bolao_id        = '00000000-0000-0000-0000-000000000099'
  AND status_pagamento = 'PAGO'
GROUP BY total_acertos_acumulados
ORDER BY total_acertos_acumulados DESC
LIMIT 20;

-- Top 10 cotas (ranking)
SELECT
  c.numero_sequencial,
  c.nome_identificacao,
  c.total_acertos_acumulados,
  c.palpites
FROM cotas c
WHERE c.bolao_id        = '00000000-0000-0000-0000-000000000099'
  AND c.status_pagamento = 'PAGO'
ORDER BY c.total_acertos_acumulados DESC
LIMIT 10;
