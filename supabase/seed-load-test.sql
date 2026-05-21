-- ================================================================
-- NossoBolão — Seed de Carga
-- Bolão: 10.000 cotas / 8.000 participantes
--
-- Distribuição:
--   - 6.000 participantes com 1 cota  (cotas 1–6000)
--   - 2.000 participantes com 2 cotas (cotas 6001–10000)
--   - ~85% das cotas com status PAGO
--
-- Uso:
--   supabase db execute --local < supabase/seed-load-test.sql
--   ou: psql "$DATABASE_URL" < supabase/seed-load-test.sql
-- ================================================================

DO $$
DECLARE
  v_tenant_id UUID    := '00000000-0000-0000-0000-000000000001';
  v_bolao_id  UUID    := '00000000-0000-0000-0000-000000000099';
  v_batch     INT     := 500;
  i           INT;
  total_p     INT;
  total_c     INT;
BEGIN

  RAISE NOTICE '[1/4] Criando bolão de carga...';

  INSERT INTO boloes (id, tenant_id, nome, status, valor_cota, data_inicio, data_termino)
  VALUES (
    v_bolao_id,
    v_tenant_id,
    'Bolão Carga — 10k Cotas',
    'EM_ANDAMENTO',
    30.00,
    '2026-05-01',
    '2026-07-30'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── CATEGORIAS ──────────────────────────────────────────────

  RAISE NOTICE '[2/4] Inserindo categorias...';

  INSERT INTO categorias_premiacao
    (tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia,
     percentual, acumula_sem_ganhador, ordem)
  VALUES
    (v_tenant_id, v_bolao_id, 'Taxa Administrativa',    'TAXA_ADMINISTRATIVA',     NULL, NULL, 15, false, 1),
    (v_tenant_id, v_bolao_id, 'Premio Principal',       'ACERTOS_EXATOS',            10, NULL, 55, false, 2),
    (v_tenant_id, v_bolao_id, 'Mais Pontos 1o Sorteio', 'MAIOR_PONTUACAO_SORTEIO', NULL,    1, 10, false, 3),
    (v_tenant_id, v_bolao_id, '09 Pontos',              'ACERTOS_EXATOS',             9, NULL, 10, true,  4),
    (v_tenant_id, v_bolao_id, 'Menos Pontos',           'MENOR_PONTUACAO_GERAL',    NULL, NULL, 10, false, 5)
  ON CONFLICT DO NOTHING;

  -- ── PARTICIPANTES (8.000 em lotes de 1.000) ─────────────────

  RAISE NOTICE '[3/4] Inserindo 8.000 participantes em lotes de 1.000...';

  FOR i IN 0 .. 7 LOOP
    INSERT INTO participantes (tenant_id, nome, numero_celular, email)
    SELECT
      v_tenant_id,
      'Participante Carga ' || lpad((i * 1000 + gs)::text, 5, '0'),
      '119' || lpad((i * 1000 + gs)::text, 8, '0'),
      'carga' || lpad((i * 1000 + gs)::text, 5, '0') || '@teste.local'
    FROM generate_series(1, 1000) gs
    ON CONFLICT (tenant_id, numero_celular) DO NOTHING;

    RAISE NOTICE '  participantes: lote % de 8 concluído (%)', i + 1, (i + 1) * 1000;
  END LOOP;

  SELECT COUNT(*) INTO total_p FROM participantes WHERE tenant_id = v_tenant_id;
  RAISE NOTICE '  total participantes no tenant: %', total_p;

  -- ── COTAS (10.000 em lotes de 500) ──────────────────────────

  RAISE NOTICE '[4/4] Inserindo 10.000 cotas em lotes de 500...';

  -- Bloco A: cotas 1–8.000 → um por participante (1..8000)
  -- 16 lotes de 500
  FOR i IN 0 .. 15 LOOP
    INSERT INTO cotas
      (tenant_id, bolao_id, nome_identificacao, numero_celular,
       numero_sequencial, palpites, status_pagamento, participante_id)
    SELECT
      v_tenant_id,
      v_bolao_id,
      p.nome,
      p.numero_celular,
      (i * v_batch + gs)::int                                            AS numero_sequencial,
      ARRAY(SELECT n FROM generate_series(1, 60) n ORDER BY random() LIMIT 10) AS palpites,
      CASE WHEN random() < 0.85 THEN 'PAGO'::pagamento_status
                                 ELSE 'PENDENTE'::pagamento_status END,
      p.id
    FROM generate_series(1, v_batch) gs
    JOIN participantes p
      ON  p.tenant_id       = v_tenant_id
      AND p.numero_celular  = '119' || lpad((i * v_batch + gs)::text, 8, '0')
    ON CONFLICT (tenant_id, bolao_id, numero_sequencial) DO NOTHING;

    RAISE NOTICE '  cotas bloco A: lote % de 16 concluído (seq até %)',
      i + 1, (i + 1) * v_batch;
  END LOOP;

  -- Bloco B: cotas 8.001–10.000 → segunda cota para participantes 1..2000
  -- 4 lotes de 500
  FOR i IN 0 .. 3 LOOP
    INSERT INTO cotas
      (tenant_id, bolao_id, nome_identificacao, numero_celular,
       numero_sequencial, palpites, status_pagamento, participante_id)
    SELECT
      v_tenant_id,
      v_bolao_id,
      p.nome || ' #2',
      p.numero_celular,
      (8000 + i * v_batch + gs)::int                                     AS numero_sequencial,
      ARRAY(SELECT n FROM generate_series(1, 60) n ORDER BY random() LIMIT 10) AS palpites,
      CASE WHEN random() < 0.85 THEN 'PAGO'::pagamento_status
                                 ELSE 'PENDENTE'::pagamento_status END,
      p.id
    FROM generate_series(1, v_batch) gs
    JOIN participantes p
      ON  p.tenant_id       = v_tenant_id
      AND p.numero_celular  = '119' || lpad((i * v_batch + gs)::text, 8, '0')
    ON CONFLICT (tenant_id, bolao_id, numero_sequencial) DO NOTHING;

    RAISE NOTICE '  cotas bloco B: lote % de 4 concluído (seq até %)',
      i + 1, 8000 + (i + 1) * v_batch;
  END LOOP;

  SELECT COUNT(*) INTO total_c FROM cotas WHERE bolao_id = v_bolao_id;
  RAISE NOTICE '=== CONCLUÍDO === cotas inseridas no bolão: %', total_c;
  RAISE NOTICE 'bolao_id: %', v_bolao_id;

END $$;

-- ── VERIFICAÇÃO RÁPIDA ────────────────────────────────────────

SELECT
  'bolão'               AS entidade,
  nome,
  status,
  valor_cota
FROM boloes
WHERE id = '00000000-0000-0000-0000-000000000099';

SELECT
  status_pagamento,
  COUNT(*)              AS total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM cotas
WHERE bolao_id = '00000000-0000-0000-0000-000000000099'
GROUP BY status_pagamento
ORDER BY status_pagamento;

SELECT
  COUNT(DISTINCT participante_id)  AS participantes_com_cota,
  COUNT(*)                         AS total_cotas,
  ROUND(COUNT(*)::numeric / COUNT(DISTINCT participante_id), 2) AS media_cotas_por_participante
FROM cotas
WHERE bolao_id = '00000000-0000-0000-0000-000000000099';
