-- ============================================================
-- NossoBolão — Initial Schema
-- 20260506000000_initial_schema.sql
-- ============================================================

-- ── ENUMs ────────────────────────────────────────────────────

CREATE TYPE tenant_status     AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');
CREATE TYPE bolao_status      AS ENUM ('A_SER_INICIADO', 'EM_ANDAMENTO', 'FINALIZADO');
CREATE TYPE papel_usuario     AS ENUM ('MASTER', 'ADMIN');
CREATE TYPE categoria_tipo    AS ENUM (
  'TAXA_ADMINISTRATIVA',
  'ACERTOS_EXATOS',
  'MAIOR_PONTUACAO_SORTEIO',
  'MAIOR_PONTUACAO_GERAL',
  'MENOR_PONTUACAO_GERAL'
);
CREATE TYPE pagamento_status  AS ENUM ('PENDENTE', 'PAGO', 'INATIVO');
CREATE TYPE resultado_status  AS ENUM ('EM_ANDAMENTO', 'PREMIADO', 'NAO_PREMIADO');
CREATE TYPE mensagem_tipo     AS ENUM (
  'RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN', 'MANUAL'
);
CREATE TYPE mensagem_status   AS ENUM ('PENDENTE', 'ENVIADO', 'FALHA');

-- ── FUNÇÃO UTILITÁRIA ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TENANTS ──────────────────────────────────────────────────

CREATE TABLE tenants (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                    TEXT NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  status                  tenant_status NOT NULL DEFAULT 'ATIVO',
  taxa_administrativa_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00
    CONSTRAINT taxa_valida CHECK (taxa_administrativa_pct BETWEEN 0 AND 100),
  branding                JSONB NOT NULL DEFAULT '{}',
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug   ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ADMIN vê apenas o próprio tenant; service_role (backend) bypassa RLS
CREATE POLICY "tenant_select_own" ON tenants
  FOR SELECT TO authenticated
  USING (id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── USER PROFILES ─────────────────────────────────────────────

CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  papel         papel_usuario NOT NULL,
  celular       TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profile_select_own" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "user_profile_update_own" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- ── BOLÕES ───────────────────────────────────────────────────

CREATE TABLE boloes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  status        bolao_status NOT NULL DEFAULT 'A_SER_INICIADO',
  valor_cota    NUMERIC(10,2) NOT NULL
    CONSTRAINT valor_cota_positivo CHECK (valor_cota > 0),
  data_inicio   DATE,
  data_termino  DATE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boloes_tenant        ON boloes(tenant_id);
CREATE INDEX idx_boloes_tenant_status ON boloes(tenant_id, status);

CREATE TRIGGER trg_boloes_updated_at
  BEFORE UPDATE ON boloes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE boloes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boloes_tenant_isolation" ON boloes
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── CATEGORIAS DE PREMIAÇÃO ──────────────────────────────────

CREATE TABLE categorias_premiacao (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id                 UUID NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  nome                     TEXT NOT NULL,
  tipo                     categoria_tipo NOT NULL,
  acertos_alvo             INT CONSTRAINT acertos_alvo_range CHECK (acertos_alvo BETWEEN 1 AND 10),
  sorteio_referencia       INT,
  percentual               NUMERIC(5,2) NOT NULL
    CONSTRAINT percentual_valido CHECK (percentual > 0 AND percentual <= 100),
  acumula_sem_ganhador     BOOLEAN NOT NULL DEFAULT FALSE,
  valor_acumulado_anterior NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordem                    INT NOT NULL DEFAULT 0,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categorias_bolao ON categorias_premiacao(tenant_id, bolao_id);

CREATE TRIGGER trg_categorias_updated_at
  BEFORE UPDATE ON categorias_premiacao
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE categorias_premiacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_tenant_isolation" ON categorias_premiacao
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── COTAS ────────────────────────────────────────────────────

CREATE TABLE cotas (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id                   UUID NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  nome_identificacao         TEXT NOT NULL,
  numero_celular             TEXT,
  numero_sequencial          INT NOT NULL,
  palpites                   INT[] NOT NULL,
  status_pagamento           pagamento_status NOT NULL DEFAULT 'PENDENTE',
  data_confirmacao_pagamento TIMESTAMPTZ,
  total_acertos_acumulados   INT NOT NULL DEFAULT 0,
  status_resultado           resultado_status NOT NULL DEFAULT 'EM_ANDAMENTO',
  criado_em                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bolao_id, numero_sequencial)
);

CREATE INDEX idx_cotas_bolao       ON cotas(tenant_id, bolao_id);
CREATE INDEX idx_cotas_pagamento   ON cotas(tenant_id, bolao_id, status_pagamento);
CREATE INDEX idx_cotas_sequencial  ON cotas(tenant_id, bolao_id, numero_sequencial);
CREATE INDEX idx_cotas_resultado   ON cotas(tenant_id, bolao_id, status_resultado);

CREATE TRIGGER trg_cotas_updated_at
  BEFORE UPDATE ON cotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotas_tenant_isolation" ON cotas
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- Portal: participante vê apenas a própria cota (por celular)
CREATE POLICY "cotas_portal_select" ON cotas
  FOR SELECT TO authenticated
  USING (
    numero_celular = (auth.jwt() -> 'user_metadata' ->> 'celular')
    AND tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID
  );

-- ── SORTEIOS ─────────────────────────────────────────────────

CREATE TABLE sorteios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id           UUID NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  numero_concurso    INT NOT NULL,
  data_sorteio       DATE NOT NULL,
  bolas_sorteadas    INT[] NOT NULL,
  sequencia_no_bolao INT NOT NULL,
  eh_primeiro        BOOLEAN NOT NULL DEFAULT FALSE,
  processado         BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bolao_id, numero_concurso)
);

CREATE INDEX idx_sorteios_bolao      ON sorteios(tenant_id, bolao_id);
CREATE INDEX idx_sorteios_processado ON sorteios(tenant_id, bolao_id, processado);

ALTER TABLE sorteios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sorteios_tenant_isolation" ON sorteios
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── ACERTOS POR SORTEIO ──────────────────────────────────────

CREATE TABLE acertos_sorteio (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id   UUID NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  sorteio_id UUID NOT NULL REFERENCES sorteios(id) ON DELETE CASCADE,
  cota_id    UUID NOT NULL REFERENCES cotas(id) ON DELETE CASCADE,
  acertos    INT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sorteio_id, cota_id) -- idempotência do CalcAcertosJob
);

CREATE INDEX idx_acertos_sorteio ON acertos_sorteio(tenant_id, sorteio_id);
CREATE INDEX idx_acertos_cota    ON acertos_sorteio(tenant_id, cota_id);

ALTER TABLE acertos_sorteio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acertos_tenant_isolation" ON acertos_sorteio
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── PRÊMIOS ──────────────────────────────────────────────────

CREATE TABLE premios (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id               UUID NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  cota_id                UUID NOT NULL REFERENCES cotas(id) ON DELETE CASCADE,
  categoria_premiacao_id UUID NOT NULL REFERENCES categorias_premiacao(id),
  valor_total_categoria  NUMERIC(12,2) NOT NULL,
  valor_por_ganhador     NUMERIC(12,2) NOT NULL,
  status_pagamento       pagamento_status NOT NULL DEFAULT 'PENDENTE',
  data_pagamento         TIMESTAMPTZ,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_premios_bolao   ON premios(tenant_id, bolao_id);
CREATE INDEX idx_premios_cota    ON premios(tenant_id, cota_id);
CREATE INDEX idx_premios_status  ON premios(tenant_id, status_pagamento);

CREATE TRIGGER trg_premios_updated_at
  BEFORE UPDATE ON premios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE premios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premios_tenant_isolation" ON premios
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);

-- ── MENSAGENS WHATSAPP ───────────────────────────────────────

CREATE TABLE mensagens_whatsapp (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bolao_id      UUID REFERENCES boloes(id) ON DELETE SET NULL,
  tipo          mensagem_tipo NOT NULL,
  conteudo      TEXT NOT NULL,
  grupo_id      TEXT,
  status        mensagem_status NOT NULL DEFAULT 'PENDENTE',
  tentativas    INT NOT NULL DEFAULT 0,
  erro          TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mensagens_tenant ON mensagens_whatsapp(tenant_id);
CREATE INDEX idx_mensagens_status ON mensagens_whatsapp(tenant_id, status);

CREATE TRIGGER trg_mensagens_updated_at
  BEFORE UPDATE ON mensagens_whatsapp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mensagens_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensagens_tenant_isolation" ON mensagens_whatsapp
  FOR ALL TO authenticated
  USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);
