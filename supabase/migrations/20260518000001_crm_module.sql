-- ============================================================
-- CRM Module: etapas do funil, contatos, mensagens/notas
-- ============================================================

-- ── Etapas do funil ──────────────────────────────────────────
CREATE TABLE crm_etapas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        VARCHAR(80) NOT NULL,
  cor         VARCHAR(7)  NOT NULL DEFAULT '#64748b',
  ordem       SMALLINT    NOT NULL DEFAULT 0,
  is_sistema  BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE INDEX idx_crm_etapas_tenant ON crm_etapas(tenant_id, ordem);

ALTER TABLE crm_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_etapas_tenant" ON crm_etapas
  USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

-- ── Contatos CRM ─────────────────────────────────────────────
CREATE TABLE crm_contatos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  celular          VARCHAR(20) NOT NULL,
  nome             VARCHAR(150),
  etapa_id         UUID        REFERENCES crm_etapas(id) ON DELETE SET NULL,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  notas            TEXT,
  participante_id  UUID        REFERENCES participantes(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, celular)
);

CREATE INDEX idx_crm_contatos_tenant   ON crm_contatos(tenant_id);
CREATE INDEX idx_crm_contatos_etapa    ON crm_contatos(etapa_id);
CREATE INDEX idx_crm_contatos_celular  ON crm_contatos(tenant_id, celular);
CREATE INDEX idx_crm_contatos_part     ON crm_contatos(participante_id) WHERE participante_id IS NOT NULL;

ALTER TABLE crm_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_contatos_tenant" ON crm_contatos
  USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

-- ── Mensagens / Notas CRM ────────────────────────────────────
-- direcao: 'IN' = recebida do participante (WA futuro)
--          'OUT' = enviada pelo admin (WA)
--          'NOTE' = nota interna do admin
CREATE TABLE crm_mensagens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  celular       VARCHAR(20) NOT NULL,
  direcao       VARCHAR(5)  NOT NULL DEFAULT 'OUT' CHECK (direcao IN ('IN','OUT','NOTE')),
  conteudo      TEXT        NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (tipo IN ('text','image','document','audio','note')),
  lida          BOOLEAN     NOT NULL DEFAULT FALSE,
  wa_message_id VARCHAR(100),
  enviada_por   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_msgs_tenant   ON crm_mensagens(tenant_id, celular, criado_em DESC);
CREATE INDEX idx_crm_msgs_nao_lida ON crm_mensagens(tenant_id, celular) WHERE lida = FALSE AND direcao = 'IN';

ALTER TABLE crm_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_mensagens_tenant" ON crm_mensagens
  USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

-- ── Permissões RBAC ──────────────────────────────────────────
INSERT INTO modulos (codigo, nome, descricao, ordem, apenas_master) VALUES
  ('CRM', 'CRM', 'Funil de vendas e comunicação com participantes', 65, FALSE)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO permissoes (codigo, modulo_codigo, nome, descricao, apenas_master) VALUES
  ('crm.ler',    'CRM', 'Ver CRM',            'Visualizar kanban, contatos e conversas', FALSE),
  ('crm.editar', 'CRM', 'Editar CRM',          'Mover contatos, editar etapas e notas',   FALSE),
  ('crm.enviar', 'CRM', 'Enviar via WhatsApp', 'Enviar mensagens WA a partir do CRM',     FALSE)
ON CONFLICT (codigo) DO NOTHING;

-- Atribui novas permissões ao perfil Administrador de cada tenant existente
DO $$
DECLARE
  t RECORD;
  v_perfil_id UUID;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    SELECT id INTO v_perfil_id FROM perfis
      WHERE tenant_id = t.id AND nome = 'Administrador';
    IF v_perfil_id IS NOT NULL THEN
      INSERT INTO perfil_permissoes (perfil_id, permissao_codigo)
      VALUES
        (v_perfil_id, 'crm.ler'),
        (v_perfil_id, 'crm.editar'),
        (v_perfil_id, 'crm.enviar')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ── Etapas padrão para tenants existentes ───────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    INSERT INTO crm_etapas (tenant_id, nome, cor, ordem, is_sistema) VALUES
      (t.id, 'Prospecto',      '#64748b', 0, TRUE),
      (t.id, 'Contato Feito',  '#3b82f6', 1, FALSE),
      (t.id, 'Interessado',    '#f59e0b', 2, FALSE),
      (t.id, 'Cota Pendente',  '#ef4444', 3, FALSE),
      (t.id, 'Pago',           '#22c55e', 4, TRUE),
      (t.id, 'Inativo',        '#94a3b8', 5, FALSE)
    ON CONFLICT (tenant_id, nome) DO NOTHING;
  END LOOP;
END $$;
