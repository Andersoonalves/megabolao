-- ============================================================
-- NossoBolão — RBAC Enterprise
-- 20260509160000_rbac_enterprise.sql
--
-- Adiciona perfis dinâmicos, permissões granulares, módulos por
-- tenant e auditoria. MASTER continua especial (curinga global);
-- ADMIN passa a ter um perfil-semente "Administrador" com todas
-- as permissões do tenant.
-- ============================================================

-- ── ENUMs ─────────────────────────────────────────────────────

CREATE TYPE auditoria_severidade AS ENUM ('INFO', 'AVISO', 'CRITICO');

-- ── CATÁLOGO GLOBAL DE MÓDULOS ───────────────────────────────

CREATE TABLE modulos (
  codigo         VARCHAR(40)  PRIMARY KEY,
  nome           VARCHAR(80)  NOT NULL,
  descricao      TEXT,
  ordem          INT          NOT NULL DEFAULT 0,
  apenas_master  BOOLEAN      NOT NULL DEFAULT FALSE,
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Catálogo é leitura pública para usuários autenticados (não há dado sensível)
ALTER TABLE modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modulos_select_all" ON modulos
  FOR SELECT TO authenticated
  USING (TRUE);

-- ── CATÁLOGO GLOBAL DE PERMISSÕES ────────────────────────────

CREATE TABLE permissoes (
  codigo         VARCHAR(80)  PRIMARY KEY,
  modulo_codigo  VARCHAR(40)  NOT NULL REFERENCES modulos(codigo) ON DELETE RESTRICT,
  nome           VARCHAR(120) NOT NULL,
  descricao      TEXT,
  apenas_master  BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissoes_modulo ON permissoes(modulo_codigo);

ALTER TABLE permissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissoes_select_all" ON permissoes
  FOR SELECT TO authenticated
  USING (TRUE);

-- ── MÓDULOS LIBERADOS POR TENANT ─────────────────────────────

CREATE TABLE modulos_tenant (
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modulo_codigo  VARCHAR(40)  NOT NULL REFERENCES modulos(codigo) ON DELETE CASCADE,
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  habilitado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, modulo_codigo)
);

CREATE INDEX idx_modulos_tenant_tenant ON modulos_tenant(tenant_id);

ALTER TABLE modulos_tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modulos_tenant_isolation" ON modulos_tenant
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── PERFIS POR TENANT ────────────────────────────────────────

CREATE TABLE perfis (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome           VARCHAR(80)  NOT NULL,
  descricao      TEXT,
  prioridade     INT          NOT NULL DEFAULT 0,        -- maior = mais privilegiado
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  sistema        BOOLEAN      NOT NULL DEFAULT FALSE,    -- perfis embutidos não-deletáveis
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT perfis_nome_unico_por_tenant UNIQUE (tenant_id, nome)
);

CREATE INDEX idx_perfis_tenant ON perfis(tenant_id);

CREATE TRIGGER trg_perfis_updated_at
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfis_tenant_isolation" ON perfis
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── PERMISSÕES DE CADA PERFIL (N:N) ──────────────────────────

CREATE TABLE perfil_permissoes (
  perfil_id         UUID         NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  permissao_codigo  VARCHAR(80)  NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, permissao_codigo)
);

CREATE INDEX idx_perfil_permissoes_perfil ON perfil_permissoes(perfil_id);
CREATE INDEX idx_perfil_permissoes_permissao ON perfil_permissoes(permissao_codigo);

ALTER TABLE perfil_permissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfil_permissoes_via_perfil" ON perfil_permissoes
  FOR ALL TO authenticated
  USING (
    perfil_id IN (
      SELECT id FROM perfis
      WHERE tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID
    )
  );

-- ── ATRIBUIÇÃO DE PERFIS A USUÁRIOS (N:N) ────────────────────

CREATE TABLE usuario_perfis (
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil_id      UUID        NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  atribuido_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atribuido_por  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, perfil_id)
);

CREATE INDEX idx_usuario_perfis_user   ON usuario_perfis(user_id);
CREATE INDEX idx_usuario_perfis_perfil ON usuario_perfis(perfil_id);

ALTER TABLE usuario_perfis ENABLE ROW LEVEL SECURITY;

-- Usuário sempre pode ver seus próprios perfis (necessário para o front exibir)
CREATE POLICY "usuario_perfis_self_select" ON usuario_perfis
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ADMINs do tenant gerem atribuições dos usuários do mesmo tenant
CREATE POLICY "usuario_perfis_admin_tenant" ON usuario_perfis
  FOR ALL TO authenticated
  USING (
    perfil_id IN (
      SELECT id FROM perfis
      WHERE tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID
    )
  );

-- ── AUDITORIA ────────────────────────────────────────────────

CREATE TABLE auditoria (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  VARCHAR(255),                              -- snapshot
  acao        VARCHAR(80) NOT NULL,                      -- ex: PERFIL_CRIADO
  recurso     VARCHAR(40),                               -- ex: PERFIL
  recurso_id  UUID,
  severidade  auditoria_severidade NOT NULL DEFAULT 'INFO',
  detalhes    JSONB        NOT NULL DEFAULT '{}'::JSONB,
  ip          INET,
  user_agent  TEXT,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_tenant_data ON auditoria(tenant_id, criado_em DESC);
CREATE INDEX idx_auditoria_user        ON auditoria(user_id);
CREATE INDEX idx_auditoria_acao        ON auditoria(acao);
CREATE INDEX idx_auditoria_recurso     ON auditoria(recurso, recurso_id);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditoria_tenant_select" ON auditoria
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ============================================================
-- SEED — catálogo global
-- ============================================================

INSERT INTO modulos (codigo, nome, descricao, ordem, apenas_master) VALUES
  ('BOLAO',         'Bolões',             'Gestão de bolões',                10,  FALSE),
  ('PARTICIPANTE',  'Participantes',      'Banco de participantes',          20,  FALSE),
  ('COTAS',         'Cotas',              'Gestão de cotas e palpites',      30,  FALSE),
  ('SORTEIO',       'Sorteios',           'Registro de sorteios',            40,  FALSE),
  ('PREMIO',        'Prêmios',            'Gestão de prêmios',               50,  FALSE),
  ('WHATSAPP',      'WhatsApp',           'Comunicação via WhatsApp',        60,  FALSE),
  ('RELATORIO',     'Relatórios',         'Relatórios e exportações',        70,  FALSE),
  ('USUARIOS',      'Usuários',           'Gestão de usuários do tenant',    80,  FALSE),
  ('PERFIS',        'Perfis & Permissões','Gestão de perfis e permissões',   90,  FALSE),
  ('AUDITORIA',     'Auditoria',          'Trilha de auditoria',            100,  FALSE),
  ('MASTER',        'Plataforma',         'Administração da plataforma',    900,  TRUE);

INSERT INTO permissoes (codigo, modulo_codigo, nome, descricao, apenas_master) VALUES
  -- BOLAO
  ('bolao.ler',       'BOLAO', 'Ler bolões',       'Listar e visualizar bolões',   FALSE),
  ('bolao.criar',     'BOLAO', 'Criar bolão',      'Criar novo bolão',             FALSE),
  ('bolao.editar',    'BOLAO', 'Editar bolão',     'Editar dados e categorias',    FALSE),
  ('bolao.excluir',   'BOLAO', 'Excluir bolão',    'Excluir bolão',                FALSE),
  ('bolao.iniciar',   'BOLAO', 'Iniciar bolão',    'Transição A_SER_INICIADO → EM_ANDAMENTO', FALSE),
  ('bolao.finalizar', 'BOLAO', 'Finalizar bolão',  'Transição EM_ANDAMENTO → FINALIZADO',     FALSE),

  -- PARTICIPANTE
  ('participante.ler',      'PARTICIPANTE', 'Ler participantes',     'Listar e visualizar', FALSE),
  ('participante.criar',    'PARTICIPANTE', 'Criar participante',    'Cadastrar novo',      FALSE),
  ('participante.editar',   'PARTICIPANTE', 'Editar participante',   'Editar dados',        FALSE),
  ('participante.excluir',  'PARTICIPANTE', 'Excluir participante',  'Remover do banco',    FALSE),
  ('participante.exportar', 'PARTICIPANTE', 'Exportar participantes','Exportar lista CSV/XLSX', FALSE),

  -- COTAS
  ('cota.ler',                 'COTAS', 'Ler cotas',          'Listar e visualizar',          FALSE),
  ('cota.editar',              'COTAS', 'Editar cota',        'Editar palpites e dados',      FALSE),
  ('cota.confirmar_pagamento', 'COTAS', 'Confirmar pagamento','Marcar cota como PAGA',        FALSE),
  ('cota.exportar',            'COTAS', 'Exportar cotas',     'Exportar lista',               FALSE),

  -- SORTEIO
  ('sorteio.ler',       'SORTEIO', 'Ler sorteios',       'Listar e visualizar',     FALSE),
  ('sorteio.criar',     'SORTEIO', 'Registrar sorteio',  'Adicionar resultado',     FALSE),
  ('sorteio.processar', 'SORTEIO', 'Processar acertos',  'Disparar cálculo',        FALSE),

  -- PREMIO
  ('premio.ler',      'PREMIO', 'Ler prêmios',     'Listar prêmios calculados',                  FALSE),
  ('premio.calcular', 'PREMIO', 'Calcular prêmios','Disparar distribuição (bolão FINALIZADO)',   FALSE),
  ('premio.pagar',    'PREMIO', 'Pagar prêmio',    'Marcar prêmio como PAGO',                    FALSE),

  -- WHATSAPP
  ('whatsapp.ler',      'WHATSAPP', 'Ler histórico',    'Ver mensagens enviadas',      FALSE),
  ('whatsapp.conectar', 'WHATSAPP', 'Conectar sessão',  'Conectar WhatsApp do tenant', FALSE),
  ('whatsapp.enviar',   'WHATSAPP', 'Enviar mensagens', 'Disparar mensagens',          FALSE),

  -- RELATORIO
  ('relatorio.gerar',    'RELATORIO', 'Gerar relatório',    'Gerar relatórios PDF/XLSX', FALSE),
  ('relatorio.exportar', 'RELATORIO', 'Exportar relatório', 'Baixar arquivo',            FALSE),

  -- USUARIOS
  ('usuario.ler',             'USUARIOS', 'Ler usuários',      'Listar usuários do tenant',     FALSE),
  ('usuario.criar',           'USUARIOS', 'Criar usuário',     'Convidar novo usuário',         FALSE),
  ('usuario.editar',          'USUARIOS', 'Editar usuário',    'Editar dados do usuário',       FALSE),
  ('usuario.excluir',         'USUARIOS', 'Excluir usuário',   'Desativar/remover',             FALSE),
  ('usuario.atribuir_perfil', 'USUARIOS', 'Atribuir perfis',   'Adicionar/remover perfis',      FALSE),

  -- PERFIS
  ('perfil.ler',     'PERFIS', 'Ler perfis',     'Listar perfis do tenant',     FALSE),
  ('perfil.criar',   'PERFIS', 'Criar perfil',   'Criar novo perfil',           FALSE),
  ('perfil.editar',  'PERFIS', 'Editar perfil',  'Editar perfil e permissões',  FALSE),
  ('perfil.excluir', 'PERFIS', 'Excluir perfil', 'Remover perfil',              FALSE),

  -- AUDITORIA
  ('auditoria.ler',      'AUDITORIA', 'Ler auditoria',      'Visualizar logs',  FALSE),
  ('auditoria.exportar', 'AUDITORIA', 'Exportar auditoria', 'Baixar logs CSV',  FALSE),

  -- MASTER
  ('tenant.ler',       'MASTER', 'Ler tenants',      'Listar tenants',                  TRUE),
  ('tenant.criar',     'MASTER', 'Criar tenant',     'Criar novo tenant',               TRUE),
  ('tenant.editar',    'MASTER', 'Editar tenant',    'Editar dados/branding',           TRUE),
  ('tenant.suspender', 'MASTER', 'Suspender tenant', 'Mudar status',                    TRUE),
  ('modulos.gerir',    'MASTER', 'Gerir módulos',    'Habilitar/desabilitar módulos por tenant', TRUE);

-- ============================================================
-- BACKFILL — habilita módulos não-MASTER em todos os tenants
-- ============================================================

INSERT INTO modulos_tenant (tenant_id, modulo_codigo, ativo)
SELECT t.id, m.codigo, TRUE
FROM tenants t CROSS JOIN modulos m
WHERE m.apenas_master = FALSE
ON CONFLICT DO NOTHING;

-- ============================================================
-- BACKFILL — perfil-semente "Administrador" para cada tenant
-- ============================================================

DO $$
DECLARE
  t RECORD;
  v_perfil_id UUID;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    -- Cria ou busca o perfil Administrador
    INSERT INTO perfis (tenant_id, nome, descricao, prioridade, sistema)
    VALUES (t.id, 'Administrador', 'Acesso completo ao tenant — perfil do sistema', 1000, TRUE)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

    SELECT id INTO v_perfil_id FROM perfis
      WHERE tenant_id = t.id AND nome = 'Administrador';

    -- Atribui todas as permissões não-MASTER ao perfil
    INSERT INTO perfil_permissoes (perfil_id, permissao_codigo)
    SELECT v_perfil_id, codigo FROM permissoes WHERE apenas_master = FALSE
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- BACKFILL — atribui perfil "Administrador" aos user_profiles
--            existentes com papel = 'ADMIN'
-- ============================================================

DO $$
DECLARE
  up RECORD;
  v_perfil_id UUID;
BEGIN
  FOR up IN
    SELECT id, tenant_id FROM user_profiles
    WHERE papel = 'ADMIN' AND tenant_id IS NOT NULL
  LOOP
    SELECT id INTO v_perfil_id FROM perfis
      WHERE tenant_id = up.tenant_id AND nome = 'Administrador';

    IF v_perfil_id IS NOT NULL THEN
      INSERT INTO usuario_perfis (user_id, perfil_id)
      VALUES (up.id, v_perfil_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
