CREATE TABLE whatsapp_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  conteudo      TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'MANUAL',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_templates_tenant ON whatsapp_templates(tenant_id);

CREATE TRIGGER trg_wa_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_templates_tenant_isolation" ON whatsapp_templates
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);
