-- ============================================================
-- NossoBolão — Banco de Participantes por Tenant
-- 20260508000001_create_participantes.sql
-- ============================================================

CREATE TABLE participantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  numero_celular TEXT NOT NULL,
  email          TEXT,
  observacoes    TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, numero_celular)
);

CREATE INDEX idx_participantes_tenant   ON participantes(tenant_id);
CREATE INDEX idx_participantes_celular  ON participantes(tenant_id, numero_celular);

CREATE TRIGGER trg_participantes_updated_at
  BEFORE UPDATE ON participantes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE participantes ENABLE ROW LEVEL SECURITY;

-- Admin vê apenas participantes do próprio tenant
CREATE POLICY "participantes_tenant_isolation" ON participantes
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- Portal: participante vê apenas o próprio registro pelo celular
CREATE POLICY "participantes_portal_select" ON participantes
  FOR SELECT TO authenticated
  USING (
    numero_celular = (auth.jwt() -> 'user_metadata' ->> 'celular')
    AND tenant_id  = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID
  );

-- Vincular cotas ao participante (nullable — cotas antigas sem telefone ficam sem vínculo)
ALTER TABLE cotas ADD COLUMN participante_id UUID REFERENCES participantes(id) ON DELETE SET NULL;

CREATE INDEX idx_cotas_participante ON cotas(tenant_id, participante_id);
