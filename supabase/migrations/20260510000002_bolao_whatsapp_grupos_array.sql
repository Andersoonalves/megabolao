-- Substituir campos singulares por array de grupos WhatsApp
ALTER TABLE boloes
  DROP COLUMN IF EXISTS whatsapp_grupo_id,
  DROP COLUMN IF EXISTS whatsapp_grupo_nome,
  ADD COLUMN whatsapp_grupos JSONB NOT NULL DEFAULT '[]';
