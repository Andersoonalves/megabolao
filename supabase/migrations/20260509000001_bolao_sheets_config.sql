-- Campos de integração Google Sheets por bolão
ALTER TABLE boloes
  ADD COLUMN sheets_spreadsheet_id TEXT,
  ADD COLUMN sheets_ativo          BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN sheets_ultima_sync_at TIMESTAMPTZ,
  ADD COLUMN sheets_ultimo_erro    TEXT;
