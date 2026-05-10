-- Grupo WhatsApp padrão por bolão para notificações automáticas
ALTER TABLE boloes
  ADD COLUMN whatsapp_grupo_id   TEXT,
  ADD COLUMN whatsapp_grupo_nome TEXT;
