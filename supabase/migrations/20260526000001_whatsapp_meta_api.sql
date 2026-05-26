-- Suporte à Meta Cloud API (API oficial do WhatsApp)
-- Adiciona: celular em mensagens_whatsapp (destino individual)
--            whatsapp_phone_number_id em tenants (vincula tenant ao número oficial)

ALTER TABLE mensagens_whatsapp
  ADD COLUMN IF NOT EXISTS celular TEXT;

-- Índice para consulta de mensagens por celular
CREATE INDEX IF NOT EXISTS idx_mensagens_celular
  ON mensagens_whatsapp(tenant_id, celular)
  WHERE celular IS NOT NULL;

-- CHECK: toda mensagem deve ter grupo_id OU celular (não ambos nulos)
ALTER TABLE mensagens_whatsapp
  ADD CONSTRAINT chk_mensagem_destino
  CHECK (grupo_id IS NOT NULL OR celular IS NOT NULL);

-- Vincula tenant ao phone_number_id da Meta (único por tenant)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT UNIQUE;
