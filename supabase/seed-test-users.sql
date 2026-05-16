-- ============================================================
-- Seed completo: 4 bolões × 5 participantes × cotas × sorteios
-- Tenant: "Bolão Mega da Virada 2023"
-- NÃO apaga dados existentes. ON CONFLICT para idempotência.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_tid UUID;  -- tenant_id

  -- Admins (auth.users + user_profiles)
  v_a1 UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_a2 UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_a3 UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

  -- Participantes regulares (sem auth, só participantes)
  v_p1 UUID := gen_random_uuid(); v_p2 UUID := gen_random_uuid();
  v_p3 UUID := gen_random_uuid(); v_p4 UUID := gen_random_uuid();
  v_p5 UUID := gen_random_uuid(); v_p6 UUID := gen_random_uuid();
  v_p7 UUID := gen_random_uuid(); v_p8 UUID := gen_random_uuid();
  v_p9 UUID := gen_random_uuid(); v_p10 UUID := gen_random_uuid();
  v_p11 UUID := gen_random_uuid(); v_p12 UUID := gen_random_uuid();
  v_p13 UUID := gen_random_uuid(); v_p14 UUID := gen_random_uuid();
  v_p15 UUID := gen_random_uuid();

  -- Bolões
  v_b1 UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';  -- Virada 2023 (EM_ANDAMENTO)
  v_b2 UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';  -- Abril 2026  (FINALIZADO)
  v_b3 UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';  -- Maio 2026   (EM_ANDAMENTO)
  v_b4 UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';  -- Junho 2026  (A_SER_INICIADO)

  v_perfil_id UUID;
  v_senha TEXT;
  v_seq INT;
BEGIN
  -- ── Buscar tenant ────────────────────────────────────────────
  SELECT id INTO v_tid FROM tenants WHERE nome ILIKE '%Mega da Virada 2023%' LIMIT 1;
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Tenant "Bolão Mega da Virada 2023" não encontrado.';
  END IF;

  v_senha := crypt('Teste@123', gen_salt('bf'));

  -- ══════════════════════════════════════════════════════════════
  -- 1. AUTH USERS (5 total: 3 admins + 2 participantes com login)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_a1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin1@mega-virada.test', v_senha, now(), '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('tenant_id', v_tid::text, 'papel', 'ADMIN', 'nome_completo', 'Carlos Administrador'),
     now(), now()),
    (v_a2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin2@mega-virada.test', v_senha, now(), '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('tenant_id', v_tid::text, 'papel', 'ADMIN', 'nome_completo', 'Maria Gestora'),
     now(), now()),
    (v_a3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin3@mega-virada.test', v_senha, now(), '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('tenant_id', v_tid::text, 'papel', 'ADMIN', 'nome_completo', 'João Operador'),
     now(), now()),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'participante1@mega-virada.test', v_senha, now(), '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('tenant_id', v_tid::text, 'papel', 'ADMIN', 'nome_completo', 'Ana Participante'),
     now(), now()),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'participante2@mega-virada.test', v_senha, now(), '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('tenant_id', v_tid::text, 'papel', 'ADMIN', 'nome_completo', 'Bruno Participante'),
     now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 2. USER PROFILES
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO user_profiles (id, tenant_id, papel, celular) VALUES
    (v_a1, v_tid, 'ADMIN', '11999000001'),
    (v_a2, v_tid, 'ADMIN', '11999000002'),
    (v_a3, v_tid, 'ADMIN', '11999000003'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', v_tid, 'ADMIN', '11999000004'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', v_tid, 'ADMIN', '11999000005')
  ON CONFLICT (id) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 3. PERFIL ADMIN
  -- ══════════════════════════════════════════════════════════════
  SELECT id INTO v_perfil_id FROM perfis WHERE tenant_id = v_tid AND nome = 'Administrador' LIMIT 1;
  IF v_perfil_id IS NULL THEN
    v_perfil_id := gen_random_uuid();
    INSERT INTO perfis (id, tenant_id, nome, descricao, prioridade, ativo, sistema)
    VALUES (v_perfil_id, v_tid, 'Administrador', 'Perfil com todas as permissões', 0, true, true);
  END IF;

  INSERT INTO usuario_perfis (user_id, perfil_id) VALUES
    (v_a1, v_perfil_id), (v_a2, v_perfil_id), (v_a3, v_perfil_id),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', v_perfil_id),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', v_perfil_id)
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 4. PARTICIPANTES (15)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO participantes (id, tenant_id, nome, numero_celular, email) VALUES
    (v_p1,  v_tid, 'CARLOS ADMINISTRADOR',   '11999000001', 'admin1@mega-virada.test'),
    (v_p2,  v_tid, 'MARIA GESTORA',          '11999000002', 'admin2@mega-virada.test'),
    (v_p3,  v_tid, 'JOAO OPERADOR',          '11999000003', 'admin3@mega-virada.test'),
    (v_p4,  v_tid, 'ANA PARTICIPANTE',       '11999000004', 'participante1@mega-virada.test'),
    (v_p5,  v_tid, 'BRUNO PARTICIPANTE',     '11999000005', 'participante2@mega-virada.test'),
    (v_p6,  v_tid, 'CAROL SOUZA',            '11999100006', NULL),
    (v_p7,  v_tid, 'DANIEL LIMA',            '11999100007', NULL),
    (v_p8,  v_tid, 'ELENA COSTA',            '11999100008', NULL),
    (v_p9,  v_tid, 'FABIO SANTOS',           '11999100009', NULL),
    (v_p10, v_tid, 'GABRIELA OLIVEIRA',      '11999100010', NULL),
    (v_p11, v_tid, 'HENRIQUE PEREIRA',       '11999100011', NULL),
    (v_p12, v_tid, 'ISABELA RODRIGUES',      '11999100012', NULL),
    (v_p13, v_tid, 'JOSE FERREIRA',          '11999100013', NULL),
    (v_p14, v_tid, 'LARISSA ALMEIDA',        '11999100014', NULL),
    (v_p15, v_tid, 'MARCOS NASCIMENTO',      '11999100015', NULL)
  ON CONFLICT (tenant_id, numero_celular) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 5. BOLÕES (4)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO boloes (id, tenant_id, nome, status, valor_cota, data_inicio, data_termino) VALUES
    (v_b1, v_tid, 'Mega-Sena da Virada 2023',   'EM_ANDAMENTO',  25.00, '2023-12-01', '2024-01-01'),
    (v_b2, v_tid, 'Mega-Sena Abril 2026',       'FINALIZADO',    30.00, '2026-04-01', '2026-04-30'),
    (v_b3, v_tid, 'Mega-Sena Maio 2026',        'EM_ANDAMENTO',  20.00, '2026-05-01', '2026-05-31'),
    (v_b4, v_tid, 'Mega-Sena Junho 2026',       'A_SER_INICIADO', 35.00, '2026-06-01', '2026-06-30')
  ON CONFLICT (id) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 6. CATEGORIAS DE PREMIAÇÃO (por bolão, soma = 100%)
  -- ══════════════════════════════════════════════════════════════
  -- Bolão 1: Virada 2023
  INSERT INTO categorias_premiacao (id, tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem) VALUES
    (gen_random_uuid(), v_tid, v_b1, 'Taxa Administrativa',       'TAXA_ADMINISTRATIVA',    NULL, NULL, 15, false, 1),
    (gen_random_uuid(), v_tid, v_b1, 'Prêmio Principal (10)',     'ACERTOS_EXATOS',          10, NULL, 50, false, 2),
    (gen_random_uuid(), v_tid, v_b1, '9 Acertos',                 'ACERTOS_EXATOS',           9, NULL, 15, true,  3),
    (gen_random_uuid(), v_tid, v_b1, '8 Acertos',                 'ACERTOS_EXATOS',           8, NULL, 10, true,  4),
    (gen_random_uuid(), v_tid, v_b1, 'Menos Pontos',              'MENOR_PONTUACAO_GERAL',  NULL, NULL, 10, false, 5);

  -- Bolão 2: Abril 2026
  INSERT INTO categorias_premiacao (id, tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem) VALUES
    (gen_random_uuid(), v_tid, v_b2, 'Taxa Admin (15%)',          'TAXA_ADMINISTRATIVA',    NULL, NULL, 15, false, 1),
    (gen_random_uuid(), v_tid, v_b2, 'Ganhador 10 acertos',      'ACERTOS_EXATOS',          10, NULL, 45, false, 2),
    (gen_random_uuid(), v_tid, v_b2, 'Melhor do 1º Sorteio',     'MAIOR_PONTUACAO_SORTEIO', NULL,    1, 15, false, 3),
    (gen_random_uuid(), v_tid, v_b2, '9 Acertos',                 'ACERTOS_EXATOS',           9, NULL, 15, true,  4),
    (gen_random_uuid(), v_tid, v_b2, 'Pior Pontuação',            'MENOR_PONTUACAO_GERAL',  NULL, NULL, 10, false, 5);

  -- Bolão 3: Maio 2026
  INSERT INTO categorias_premiacao (id, tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem) VALUES
    (gen_random_uuid(), v_tid, v_b3, 'Taxa (10%)',                'TAXA_ADMINISTRATIVA',    NULL, NULL, 10, false, 1),
    (gen_random_uuid(), v_tid, v_b3, 'Prêmio Principal',          'ACERTOS_EXATOS',          10, NULL, 40, false, 2),
    (gen_random_uuid(), v_tid, v_b3, '9 Acertos',                 'ACERTOS_EXATOS',           9, NULL, 20, true,  3),
    (gen_random_uuid(), v_tid, v_b3, '8 Acertos',                 'ACERTOS_EXATOS',           8, NULL, 15, true,  4),
    (gen_random_uuid(), v_tid, v_b3, '7 Acertos',                 'ACERTOS_EXATOS',           7, NULL, 10, true,  5),
    (gen_random_uuid(), v_tid, v_b3, 'Menos Pontos',              'MENOR_PONTUACAO_GERAL',  NULL, NULL,  5, false, 6);

  -- Bolão 4: Junho 2026 (A_SER_INICIADO — sem categorias ainda, mas criamos para teste)
  INSERT INTO categorias_premiacao (id, tenant_id, bolao_id, nome, tipo, acertos_alvo, sorteio_referencia, percentual, acumula_sem_ganhador, ordem) VALUES
    (gen_random_uuid(), v_tid, v_b4, 'Taxa (15%)',                'TAXA_ADMINISTRATIVA',    NULL, NULL, 15, false, 1),
    (gen_random_uuid(), v_tid, v_b4, 'Prêmio Total (10 acertos)', 'ACERTOS_EXATOS',          10, NULL, 60, false, 2),
    (gen_random_uuid(), v_tid, v_b4, 'Consolação (9)',            'ACERTOS_EXATOS',           9, NULL, 25, true,  3);

  -- ══════════════════════════════════════════════════════════════
  -- 7. COTAS (cada bolão: 5 participantes × 1-3 cotas)
  -- ══════════════════════════════════════════════════════════════
  v_seq := 0;

  -- ── Bolão 1: Virada 2023 ─────────────────────────────────────
  -- Carlos: 3 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'CARLOS ADMINISTRADOR', '11999000001', v_seq, ARRAY[1,5,12,23,34,45,50,55,58,60], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'CARLOS ADMINISTRADOR', '11999000001', v_seq, ARRAY[2,8,15,22,33,41,47,51,56,59], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'CARLOS ADMINISTRADOR', '11999000001', v_seq, ARRAY[3,9,17,25,36,42,48,52,57,58], 'PENDENTE');
  -- Maria: 2 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'MARIA GESTORA', '11999000002', v_seq, ARRAY[4,10,18,27,35,40,46,53,55,60], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'MARIA GESTORA', '11999000002', v_seq, ARRAY[6,11,19,28,37,43,49,54,56,59], 'PAGO');
  -- João: 2 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'JOAO OPERADOR', '11999000003', v_seq, ARRAY[7,14,21,30,38,44,50,52,57,60], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'JOAO OPERADOR', '11999000003', v_seq, ARRAY[1,8,16,24,31,39,45,51,55,58], 'PENDENTE');
  -- Ana: 1 cota
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'ANA PARTICIPANTE', '11999000004', v_seq, ARRAY[3,10,17,22,30,38,44,49,55,60], 'PAGO');
  -- Bruno: 2 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'BRUNO PARTICIPANTE', '11999000005', v_seq, ARRAY[5,12,19,26,33,40,47,53,56,59], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b1, 'BRUNO PARTICIPANTE', '11999000005', v_seq, ARRAY[2,9,15,24,31,37,46,50,57,58], 'PENDENTE');

  -- ── Bolão 2: Abril 2026 (FINALIZADO) ────────────────────────
  v_seq := 0;
  -- Carol: 3 cotas (cota 1 = 8 acertos, Melhor 1º Sorteio, PREMIADO)
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados, status_resultado) VALUES
    (v_tid, v_b2, 'CAROL SOUZA', '11999100006', v_seq, ARRAY[1,7,14,23,31,38,45,50,55,60], 'PAGO', 8, 'PREMIADO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'CAROL SOUZA', '11999100006', v_seq, ARRAY[2,8,15,22,33,41,47,51,56,59], 'PAGO', 5);
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'CAROL SOUZA', '11999100006', v_seq, ARRAY[3,9,17,25,36,42,48,52,57,58], 'PENDENTE', 0);
  -- Daniel: 2 cotas (cota 4 = 9 acertos, PREMIADO)
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados, status_resultado) VALUES
    (v_tid, v_b2, 'DANIEL LIMA', '11999100007', v_seq, ARRAY[8,10,42,27,35,40,46,53,55,58], 'PAGO', 9, 'PREMIADO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'DANIEL LIMA', '11999100007', v_seq, ARRAY[6,11,19,28,37,43,49,54,56,59], 'PAGO', 4);
  -- Elena: 1 cota (9 acertos, PREMIADO — divide 9 Acertos com Daniel)
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados, status_resultado) VALUES
    (v_tid, v_b2, 'ELENA COSTA', '11999100008', v_seq, ARRAY[42,20,29,34,41,48,53,57,49,60], 'PAGO', 9, 'PREMIADO');
  -- Fabio: 3 cotas (cota 7 = 10 acertos, PREMIADO)
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados, status_resultado) VALUES
    (v_tid, v_b2, 'FABIO SANTOS', '11999100009', v_seq, ARRAY[1,8,10,23,29,31,40,42,49,55], 'PAGO', 10, 'PREMIADO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'FABIO SANTOS', '11999100009', v_seq, ARRAY[1,8,16,24,31,39,45,51,55,58], 'PAGO', 3);
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'FABIO SANTOS', '11999100009', v_seq, ARRAY[3,10,17,22,30,38,44,49,55,60], 'PENDENTE', 0);
  -- Gabriela: 2 cotas (cota 10 = 5 acertos, pior pontuação, PREMIADO)
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados, status_resultado) VALUES
    (v_tid, v_b2, 'GABRIELA OLIVEIRA', '11999100010', v_seq, ARRAY[5,12,19,26,33,40,47,53,56,59], 'PAGO', 5, 'PREMIADO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento, total_acertos_acumulados) VALUES
    (v_tid, v_b2, 'GABRIELA OLIVEIRA', '11999100010', v_seq, ARRAY[2,9,15,24,31,37,46,50,57,58], 'INATIVO', 0);

  -- ── Bolão 3: Maio 2026 (EM_ANDAMENTO) ────────────────────────
  v_seq := 0;
  -- Carlos: 2 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'CARLOS ADMINISTRADOR', '11999000001', v_seq, ARRAY[1,5,12,23,34,45,50,55,58,60], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'CARLOS ADMINISTRADOR', '11999000001', v_seq, ARRAY[2,8,15,22,33,41,47,51,56,59], 'PENDENTE');
  -- Henrique: 3 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'HENRIQUE PEREIRA', '11999100011', v_seq, ARRAY[3,9,17,25,36,42,48,52,57,58], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'HENRIQUE PEREIRA', '11999100011', v_seq, ARRAY[4,10,18,27,35,40,46,53,55,60], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'HENRIQUE PEREIRA', '11999100011', v_seq, ARRAY[6,11,19,28,37,43,49,54,56,59], 'PENDENTE');
  -- Isabela: 1 cota
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'ISABELA RODRIGUES', '11999100012', v_seq, ARRAY[7,14,21,30,38,44,50,52,57,60], 'PAGO');
  -- Ana: 2 cotas
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'ANA PARTICIPANTE', '11999000004', v_seq, ARRAY[1,8,16,24,31,39,45,51,55,58], 'PAGO');
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'ANA PARTICIPANTE', '11999000004', v_seq, ARRAY[3,10,17,22,30,38,44,49,55,60], 'PENDENTE');
  -- Bruno: 1 cota
  v_seq := v_seq + 1;
  INSERT INTO cotas (tenant_id, bolao_id, nome_identificacao, numero_celular, numero_sequencial, palpites, status_pagamento) VALUES
    (v_tid, v_b3, 'BRUNO PARTICIPANTE', '11999000005', v_seq, ARRAY[5,12,19,26,33,40,47,53,56,59], 'PAGO');

  -- ── Bolão 4: Junho 2026 (A_SER_INICIADO — sem cotas ainda) ──
  -- Vazio por enquanto — bolão ainda não iniciou

  -- ══════════════════════════════════════════════════════════════
  -- 8. SORTEIOS (2 por bolão ativo)
  -- ══════════════════════════════════════════════════════════════
  -- Bolão 1: Virada 2023
  INSERT INTO sorteios (tenant_id, bolao_id, numero_concurso, data_sorteio, bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado) VALUES
    (v_tid, v_b1, 2700, '2023-12-15', ARRAY[5,12,23,34,45,55], 1, true,  true),
    (v_tid, v_b1, 2701, '2023-12-22', ARRAY[1,8,17,28,38,50], 2, false, true)
  ON CONFLICT (tenant_id, bolao_id, numero_concurso) DO NOTHING;

  -- Bolão 2: Abril 2026 (FINALIZADO)
  INSERT INTO sorteios (tenant_id, bolao_id, numero_concurso, data_sorteio, bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado) VALUES
    (v_tid, v_b2, 2994, '2026-04-09', ARRAY[1,10,23,31,40,55], 1, true,  true),
    (v_tid, v_b2, 2995, '2026-04-11', ARRAY[8,29,42,49,50,58], 2, false, true)
  ON CONFLICT (tenant_id, bolao_id, numero_concurso) DO NOTHING;

  -- Bolão 3: Maio 2026 (EM_ANDAMENTO)
  INSERT INTO sorteios (tenant_id, bolao_id, numero_concurso, data_sorteio, bolas_sorteadas, sequencia_no_bolao, eh_primeiro, processado) VALUES
    (v_tid, v_b3, 3010, '2026-05-07', ARRAY[3,15,22,31,44,58], 1, true,  true),
    (v_tid, v_b3, 3011, '2026-05-10', ARRAY[7,14,25,38,49,55], 2, false, true)
  ON CONFLICT (tenant_id, bolao_id, numero_concurso) DO NOTHING;

  -- Bolão 4: Junho 2026 (A_SER_INICIADO — sem sorteios)

  -- ══════════════════════════════════════════════════════════════
  -- 9. PRÊMIOS (Bolão 2 FINALIZADO — 4 categorias com ganhador)
  -- valor_bruto = 11 cotas PAGO × R$30 = R$330
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)
  SELECT c.tenant_id, c.bolao_id, c.id, cat.id,
    (11 * 30 * cat.percentual / 100), (11 * 30 * cat.percentual / 100), 'PENDENTE'
  FROM cotas c
  JOIN categorias_premiacao cat ON cat.bolao_id = c.bolao_id
  WHERE c.bolao_id = v_b2
    AND cat.tipo = 'ACERTOS_EXATOS' AND cat.acertos_alvo = 10
    AND c.nome_identificacao = 'FABIO SANTOS' AND c.numero_sequencial = 7;

  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)
  SELECT c.tenant_id, c.bolao_id, c.id, cat.id,
    (11 * 30 * cat.percentual / 100), (11 * 30 * cat.percentual / 100), 'PENDENTE'
  FROM cotas c
  JOIN categorias_premiacao cat ON cat.bolao_id = c.bolao_id
  WHERE c.bolao_id = v_b2
    AND cat.tipo = 'MAIOR_PONTUACAO_SORTEIO'
    AND c.nome_identificacao = 'CAROL SOUZA' AND c.numero_sequencial = 1;

  -- 9 Acertos: Daniel + Elena dividem R$49,50 (R$24,75 cada)
  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)
  SELECT c.tenant_id, c.bolao_id, c.id, cat.id,
    (11 * 30 * cat.percentual / 100), 24.75, 'PENDENTE'
  FROM cotas c
  JOIN categorias_premiacao cat ON cat.bolao_id = c.bolao_id
  WHERE c.bolao_id = v_b2
    AND cat.tipo = 'ACERTOS_EXATOS' AND cat.acertos_alvo = 9
    AND c.nome_identificacao = 'DANIEL LIMA' AND c.numero_sequencial = 4;

  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)
  SELECT c.tenant_id, c.bolao_id, c.id, cat.id,
    (11 * 30 * cat.percentual / 100), 24.75, 'PENDENTE'
  FROM cotas c
  JOIN categorias_premiacao cat ON cat.bolao_id = c.bolao_id
  WHERE c.bolao_id = v_b2
    AND cat.tipo = 'ACERTOS_EXATOS' AND cat.acertos_alvo = 9
    AND c.nome_identificacao = 'ELENA COSTA' AND c.numero_sequencial = 6;

  INSERT INTO premios (tenant_id, bolao_id, cota_id, categoria_premiacao_id, valor_total_categoria, valor_por_ganhador, status_pagamento)
  SELECT c.tenant_id, c.bolao_id, c.id, cat.id,
    (11 * 30 * cat.percentual / 100), (11 * 30 * cat.percentual / 100), 'PENDENTE'
  FROM cotas c
  JOIN categorias_premiacao cat ON cat.bolao_id = c.bolao_id
  WHERE c.bolao_id = v_b2
    AND cat.tipo = 'MENOR_PONTUACAO_GERAL'
    AND c.nome_identificacao = 'GABRIELA OLIVEIRA' AND c.numero_sequencial = 10;

  RAISE NOTICE '✅ Seed completo: 4 bolões, 15 participantes, cotas variadas, sorteios, prêmios.';
END $$;

COMMIT;
