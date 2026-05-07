-- Seed de testes de integração — dados isolados por tenant

-- Tenant A e Tenant B para validar isolamento multitenancy
INSERT INTO tenants (id, nome, slug, status, taxa_administrativa_pct, branding)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tenant A Testes', 'tenant-a', 'ATIVO', 15.00, '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Tenant B Testes', 'tenant-b', 'ATIVO', 20.00, '{}');

-- Bolão do Tenant A (categorias somam 100%)
INSERT INTO boloes (id, tenant_id, nome, status, valor_cota)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Bolão Teste A',
  'EM_ANDAMENTO',
  10.00
);

INSERT INTO categorias_premiacao
  (tenant_id, bolao_id, nome, tipo, acertos_alvo, percentual, acumula_sem_ganhador, ordem)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Taxa Admin', 'TAXA_ADMINISTRATIVA', NULL, 15, false, 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Premio',     'ACERTOS_EXATOS',        10, 85, false, 2);

-- Bolão do Tenant B (categorias somam 100%)
INSERT INTO boloes (id, tenant_id, nome, status, valor_cota)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Bolão Teste B',
  'EM_ANDAMENTO',
  20.00
);

INSERT INTO categorias_premiacao
  (tenant_id, bolao_id, nome, tipo, acertos_alvo, percentual, acumula_sem_ganhador, ordem)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Taxa Admin', 'TAXA_ADMINISTRATIVA', NULL, 20, false, 1),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Premio',     'ACERTOS_EXATOS',        10, 80, false, 2);

-- Cotas para teste de palpites (10 números válidos 1–60, sem repetição)
INSERT INTO cotas
  (tenant_id, bolao_id, nome_identificacao, numero_sequencial, palpites, status_pagamento)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Participante 1', 1, ARRAY[1,2,3,4,5,6,7,8,9,10], 'PAGO'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Participante 2', 2, ARRAY[11,12,13,14,15,16,17,18,19,20], 'PAGO'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Inativo 3',      3, ARRAY[21,22,23,24,25,26,27,28,29,30], 'INATIVO');
