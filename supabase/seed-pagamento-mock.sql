-- ================================================================
-- NossoBolão — Mock para teste de pagamento
-- Bolão: 00000000-0000-0000-0000-000000000098
-- 50 cotas (todas PAGO) × R$100 = R$5.000 bruto
-- Status: FINALIZADO — pronto para POST /premios/calcular + PATCH /premios/:id/pagar
--
-- 20 ganhadores distribuídos:
--   3 × Premio Principal    (total_acertos = 10) → R$916,67 cada
--   5 × Mais Pontos S1      (max acertos sorteio 1 = 6) → R$100,00 cada
--   7 × 09 Pontos           (total_acertos = 9)  → R$71,43 cada
--   5 × Menos Pontos        (total_acertos = 0)  → R$100,00 cada
--
-- Uso:
--   docker exec -i supabase_db_megabolao psql -U postgres -d postgres \
--     < supabase/seed-pagamento-mock.sql
-- ================================================================

DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_bolao_id  UUID := '00000000-0000-0000-0000-000000000098';
  v_s1_id     UUID;
  v_s2_id     UUID;
  v_bolas_s1  INT[] := ARRAY[1,2,3,4,5,6];
  v_bolas_s2  INT[] := ARRAY[7,8,9,10,11,12];
  n_acertos   INT;

BEGIN

  -- ── BOLÃO ────────────────────────────────────────────────────
  RAISE NOTICE '[1/6] Bolão...';

  INSERT INTO boloes (id, tenant_id, nome, status, valor_cota, data_inicio, data_termino)
  VALUES (
    v_bolao_id, v_tenant_id,
    'Bolão Pagamento Mock — R$100',
    'FINALIZADO',
    100.00,
    '2026-04-01', '2026-05-20'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── CATEGORIAS (soma = 100%) ──────────────────────────────────
  RAISE NOTICE '[2/6] Categorias...';

  INSERT INTO categorias_premiacao
    (id, tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem)
  VALUES
    ('09800000-0000-0000-0000-000000000001', v_tenant_id, v_bolao_id,
     'Taxa Administrativa',    'TAXA_ADMINISTRATIVA', NULL, NULL, 15, false, 1),
    ('09800000-0000-0000-0000-000000000002', v_tenant_id, v_bolao_id,
     'Premio Principal',       'ACERTOS_EXATOS',        10, NULL, 55, false, 2),
    ('09800000-0000-0000-0000-000000000003', v_tenant_id, v_bolao_id,
     'Mais Pontos 1o Sorteio', 'MAIOR_PONTUACAO_SORTEIO', NULL, 1, 10, false, 3),
    ('09800000-0000-0000-0000-000000000004', v_tenant_id, v_bolao_id,
     '09 Pontos',              'ACERTOS_EXATOS',         9, NULL, 10, true,  4),
    ('09800000-0000-0000-0000-000000000005', v_tenant_id, v_bolao_id,
     'Menos Pontos',           'MENOR_PONTUACAO_GERAL', NULL, NULL, 10, false, 5)
  ON CONFLICT (id) DO NOTHING;

  -- ── PARTICIPANTES (50) ────────────────────────────────────────
  RAISE NOTICE '[3/6] Participantes (50)...';

  INSERT INTO participantes (tenant_id, nome, numero_celular, email)
  SELECT
    v_tenant_id,
    CASE
      -- Grupo A (1-3): Premio Principal
      WHEN gs <= 3  THEN 'Campeão '  || gs
      -- Grupo B (4-8): Mais Pontos 1o Sorteio
      WHEN gs <= 8  THEN 'CravouS1 ' || gs
      -- Grupo C (9-15): 09 Pontos
      WHEN gs <= 15 THEN 'NovePts '  || gs
      -- Grupo D (16-20): Menos Pontos
      WHEN gs <= 20 THEN 'MenosPts ' || gs
      -- Grupo E (21-50): Regular
      ELSE               'Participante ' || gs
    END,
    '119' || lpad((9000 + gs)::text, 8, '0'),
    'mock98_' || gs || '@teste.local'
  FROM generate_series(1, 50) gs
  ON CONFLICT (tenant_id, numero_celular) DO NOTHING;

  -- ── COTAS (50, todas PAGO) ────────────────────────────────────
  RAISE NOTICE '[4/6] Cotas (50) com palpites controlados...';

  INSERT INTO cotas
    (tenant_id, bolao_id, nome_identificacao, numero_celular,
     numero_sequencial, palpites, status_pagamento, participante_id)

  -- Grupo A (3 cotas): Premio Principal — total_acertos = 10
  --   S1: {1,2,3,4,5} ∩ {1,2,3,4,5,6} = 5
  --   S2: {7,8,9,10,11} ∩ {7,8,9,10,11,12} = 5 → total = 10
  SELECT v_tenant_id, v_bolao_id, p.nome, p.numero_celular, gs,
    ARRAY[1,2,3,4,5,7,8,9,10,11], 'PAGO'::pagamento_status, p.id
  FROM generate_series(1, 3) gs
  JOIN participantes p ON p.tenant_id = v_tenant_id
    AND p.numero_celular = '119' || lpad((9000 + gs)::text, 8, '0')

  UNION ALL

  -- Grupo B (5 cotas): Mais Pontos 1o Sorteio — 6 acertos em S1, 0 em S2
  --   S1: {1,2,3,4,5,6} ∩ {1,2,3,4,5,6} = 6
  --   S2: {13,14,15,16} ∩ {7..12} = 0 → total = 6, max S1 = 6
  SELECT v_tenant_id, v_bolao_id, p.nome, p.numero_celular, 3 + gs,
    ARRAY[1,2,3,4,5,6,13,14,15,16], 'PAGO'::pagamento_status, p.id
  FROM generate_series(1, 5) gs
  JOIN participantes p ON p.tenant_id = v_tenant_id
    AND p.numero_celular = '119' || lpad((9000 + 3 + gs)::text, 8, '0')

  UNION ALL

  -- Grupo C (7 cotas): 09 Pontos — total_acertos = 9, variações
  --   Todos: S1=5, S2=4 → total=9 (verif. abaixo por linha)
  SELECT v_tenant_id, v_bolao_id, p.nome, p.numero_celular, 8 + gs,
    CASE gs
      -- S1:{1,2,3,4,5}=5  S2:{7,8,9,10}=4  → 9
      WHEN 1 THEN ARRAY[1,2,3,4,5, 7,8,9,10,   30]
      -- S1:{1,2,3,4,6}=5  S2:{7,8,9,11}=4  → 9
      WHEN 2 THEN ARRAY[1,2,3,4,6, 7,8,9,11,   31]
      -- S1:{1,2,3,5,6}=5  S2:{7,8,9,12}=4  → 9
      WHEN 3 THEN ARRAY[1,2,3,5,6, 7,8,9,12,   32]
      -- S1:{1,2,4,5,6}=5  S2:{7,8,10,11}=4 → 9
      WHEN 4 THEN ARRAY[1,2,4,5,6, 7,8,10,11,  33]
      -- S1:{1,3,4,5,6}=5  S2:{7,9,10,11}=4 → 9
      WHEN 5 THEN ARRAY[1,3,4,5,6, 7,9,10,11,  34]
      -- S1:{2,3,4,5,6}=5  S2:{8,9,10,11}=4 → 9
      WHEN 6 THEN ARRAY[2,3,4,5,6, 8,9,10,11,  35]
      -- S1:{1,2,3,4,5}=5  S2:{8,9,10,12}=4 → 9
      WHEN 7 THEN ARRAY[1,2,3,4,5, 8,9,10,12,  36]
    END,
    'PAGO'::pagamento_status, p.id
  FROM generate_series(1, 7) gs
  JOIN participantes p ON p.tenant_id = v_tenant_id
    AND p.numero_celular = '119' || lpad((9000 + 8 + gs)::text, 8, '0')

  UNION ALL

  -- Grupo D (5 cotas): Menos Pontos — total_acertos = 0 (palpites fora de qualquer sorteio)
  SELECT v_tenant_id, v_bolao_id, p.nome, p.numero_celular, 15 + gs,
    CASE gs
      WHEN 1 THEN ARRAY[21,22,23,24,25,26,27,28,29,30]
      WHEN 2 THEN ARRAY[31,32,33,34,35,36,37,38,39,40]
      WHEN 3 THEN ARRAY[41,42,43,44,45,46,47,48,49,50]
      WHEN 4 THEN ARRAY[51,52,53,54,55,56,57,58,59,60]
      WHEN 5 THEN ARRAY[21,31,41,51,22,32,42,52,23,33]
    END,
    'PAGO'::pagamento_status, p.id
  FROM generate_series(1, 5) gs
  JOIN participantes p ON p.tenant_id = v_tenant_id
    AND p.numero_celular = '119' || lpad((9000 + 15 + gs)::text, 8, '0')

  UNION ALL

  -- Grupo E (30 cotas): Regular — total entre 1–6, não ganham nenhuma categoria
  SELECT v_tenant_id, v_bolao_id, p.nome, p.numero_celular, 20 + gs,
    CASE ((gs - 1) % 6)
      WHEN 0 THEN ARRAY[1,17,18,19,20,21,22,23,24,25]        -- S1:1, S2:0 = 1
      WHEN 1 THEN ARRAY[1,2,17,18,19,20,21,22,23,24]         -- S1:2, S2:0 = 2
      WHEN 2 THEN ARRAY[1,2,3,17,18,19,20,21,22,23]          -- S1:3, S2:0 = 3
      WHEN 3 THEN ARRAY[1,2,3,7,17,18,19,20,21,22]           -- S1:3, S2:1 = 4
      WHEN 4 THEN ARRAY[1,2,3,7,8,17,18,19,20,21]            -- S1:3, S2:2 = 5
      WHEN 5 THEN ARRAY[1,2,3,4,7,8,17,18,19,20]             -- S1:4, S2:2 = 6
    END,
    'PAGO'::pagamento_status, p.id
  FROM generate_series(1, 30) gs
  JOIN participantes p ON p.tenant_id = v_tenant_id
    AND p.numero_celular = '119' || lpad((9000 + 20 + gs)::text, 8, '0')

  ON CONFLICT (tenant_id, bolao_id, numero_sequencial) DO NOTHING;

  -- ── SORTEIOS ─────────────────────────────────────────────────
  RAISE NOTICE '[5/6] Sorteios + CalcAcertosJob...';

  INSERT INTO sorteios (tenant_id, bolao_id, numero_concurso, data_sorteio, bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado)
  VALUES
    (v_tenant_id, v_bolao_id, 3100, '2026-04-10', v_bolas_s1, 1, true,  false),
    (v_tenant_id, v_bolao_id, 3101, '2026-04-17', v_bolas_s2, 2, false, false)
  ON CONFLICT (tenant_id, bolao_id, numero_concurso) DO NOTHING;

  SELECT id INTO v_s1_id FROM sorteios
  WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id AND numero_concurso = 3100;
  SELECT id INTO v_s2_id FROM sorteios
  WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id AND numero_concurso = 3101;

  -- ── CALC ACERTOS (lógica do CalcAcertosProcessor) ─────────────
  -- Sorteio 1
  INSERT INTO acertos_sorteio (tenant_id, bolao_id, sorteio_id, cota_id, acertos)
  SELECT v_tenant_id, v_bolao_id, v_s1_id, c.id,
    (SELECT COUNT(*)::INT FROM unnest(c.palpites) p WHERE p = ANY(v_bolas_s1))
  FROM cotas c
  WHERE c.tenant_id = v_tenant_id AND c.bolao_id = v_bolao_id AND c.status_pagamento = 'PAGO'
  ON CONFLICT (sorteio_id, cota_id) DO NOTHING;
  GET DIAGNOSTICS n_acertos = ROW_COUNT;
  RAISE NOTICE '  S1: % acertos inseridos', n_acertos;

  -- Sorteio 2
  INSERT INTO acertos_sorteio (tenant_id, bolao_id, sorteio_id, cota_id, acertos)
  SELECT v_tenant_id, v_bolao_id, v_s2_id, c.id,
    (SELECT COUNT(*)::INT FROM unnest(c.palpites) p WHERE p = ANY(v_bolas_s2))
  FROM cotas c
  WHERE c.tenant_id = v_tenant_id AND c.bolao_id = v_bolao_id AND c.status_pagamento = 'PAGO'
  ON CONFLICT (sorteio_id, cota_id) DO NOTHING;
  GET DIAGNOSTICS n_acertos = ROW_COUNT;
  RAISE NOTICE '  S2: % acertos inseridos', n_acertos;

  -- UPDATE total_acertos_acumulados (query otimizada)
  UPDATE cotas SET
    total_acertos_acumulados = agg.total,
    atualizado_em            = NOW()
  FROM (
    SELECT cota_id, COALESCE(SUM(acertos), 0)::INT AS total
    FROM acertos_sorteio
    WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id
    GROUP BY cota_id
  ) agg
  WHERE cotas.id               = agg.cota_id
    AND cotas.bolao_id         = v_bolao_id
    AND cotas.tenant_id        = v_tenant_id
    AND cotas.status_pagamento = 'PAGO';

  UPDATE sorteios SET processado = true
  WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id;

  -- ── PRÊMIOS (replica lógica do PremioService.calcular) ─────────
  RAISE NOTICE '[6/6] Calculando e inserindo prêmios...';

  -- Base: 50 cotas × R$100 = R$5.000
  -- Premio Principal 55%: R$2.750 / 3 = R$916,67
  -- Mais Pontos S1 10%: R$500 / 5 = R$100,00
  -- 09 Pontos 10%: R$500 / 7 = R$71,43
  -- Menos Pontos 10%: R$500 / 5 = R$100,00

  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)

  -- Premio Principal (seq 1-3 → total_acertos=10)
  SELECT v_tenant_id, v_bolao_id, c.id,
    '09800000-0000-0000-0000-000000000002'::UUID,
    2750.00, 916.67, 'PENDENTE'::pagamento_status
  FROM cotas c
  WHERE c.tenant_id = v_tenant_id AND c.bolao_id = v_bolao_id
    AND c.total_acertos_acumulados = 10 AND c.status_pagamento = 'PAGO'

  UNION ALL

  -- Mais Pontos 1o Sorteio (seq 4-8 → 6 acertos em S1)
  SELECT v_tenant_id, v_bolao_id, a.cota_id,
    '09800000-0000-0000-0000-000000000003'::UUID,
    500.00, 100.00, 'PENDENTE'::pagamento_status
  FROM acertos_sorteio a
  WHERE a.tenant_id  = v_tenant_id
    AND a.bolao_id   = v_bolao_id
    AND a.sorteio_id = v_s1_id
    AND a.acertos    = (
      SELECT MAX(acertos) FROM acertos_sorteio
      WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id AND sorteio_id = v_s1_id
    )

  UNION ALL

  -- 09 Pontos (seq 9-15 → total_acertos=9)
  SELECT v_tenant_id, v_bolao_id, c.id,
    '09800000-0000-0000-0000-000000000004'::UUID,
    500.00, 71.43, 'PENDENTE'::pagamento_status
  FROM cotas c
  WHERE c.tenant_id = v_tenant_id AND c.bolao_id = v_bolao_id
    AND c.total_acertos_acumulados = 9 AND c.status_pagamento = 'PAGO'

  UNION ALL

  -- Menos Pontos (seq 16-20 → total_acertos=0)
  SELECT v_tenant_id, v_bolao_id, c.id,
    '09800000-0000-0000-0000-000000000005'::UUID,
    500.00, 100.00, 'PENDENTE'::pagamento_status
  FROM cotas c
  WHERE c.tenant_id = v_tenant_id AND c.bolao_id = v_bolao_id
    AND c.total_acertos_acumulados = (
      SELECT MIN(total_acertos_acumulados) FROM cotas
      WHERE tenant_id = v_tenant_id AND bolao_id = v_bolao_id AND status_pagamento = 'PAGO'
    )
    AND c.status_pagamento = 'PAGO'

  ON CONFLICT DO NOTHING;

  RAISE NOTICE '=== CONCLUÍDO ===';
  RAISE NOTICE 'Bolão: %', v_bolao_id;
  RAISE NOTICE 'POST /boloes/%/premios/calcular → idempotente (já calculado)', v_bolao_id;
  RAISE NOTICE 'PATCH /boloes/%/premios/:id/pagar → marcar pago', v_bolao_id;

END $$;

-- ── VERIFICAÇÃO ───────────────────────────────────────────────────

-- Sanidade: acertos por grupo
SELECT
  c.total_acertos_acumulados AS total_acertos,
  COUNT(*)                   AS cotas,
  MIN(c.numero_sequencial)   AS seq_min,
  MAX(c.numero_sequencial)   AS seq_max
FROM cotas c
WHERE c.bolao_id = '00000000-0000-0000-0000-000000000098'
  AND c.status_pagamento = 'PAGO'
GROUP BY c.total_acertos_acumulados
ORDER BY c.total_acertos_acumulados DESC;

-- Prêmios gerados por categoria
SELECT
  cp.nome                  AS categoria,
  COUNT(pr.id)             AS ganhadores,
  pr.valor_total_categoria AS valor_pool,
  pr.valor_por_ganhador    AS valor_each,
  pr.status_pagamento
FROM premios pr
JOIN categorias_premiacao cp ON cp.id = pr.categoria_premiacao_id
WHERE pr.bolao_id = '00000000-0000-0000-0000-000000000098'
GROUP BY cp.nome, pr.valor_total_categoria, pr.valor_por_ganhador, pr.status_pagamento, cp.ordem
ORDER BY cp.ordem;

-- Total ganhadores
SELECT COUNT(*) AS total_premios_pendentes
FROM premios
WHERE bolao_id = '00000000-0000-0000-0000-000000000098'
  AND status_pagamento = 'PENDENTE';
