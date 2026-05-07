Cria uma nova migration Supabase para o NossoBolão.

**Argumento obrigatório:** descrição em snake_case (ex: `add_whatsapp_sessions`, `alter_cotas_add_grupo_id`)

## Passo 1 — Gerar timestamp
```bash
date +%Y%m%d%H%M%S
```

## Passo 2 — Criar arquivo
Caminho: `supabase/migrations/{timestamp}_$ARGUMENTS.sql`

## Passo 3 — Conteúdo base da migration

```sql
-- ============================================================
-- {timestamp}_$ARGUMENTS.sql
-- ============================================================

-- Suas alterações aqui.
-- Toda tabela nova DEVE incluir:
--   1. RLS: ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY;
--   2. Política de isolamento de tenant:
--      CREATE POLICY "{tabela}_tenant_isolation" ON {tabela}
--        FOR ALL TO authenticated
--        USING     (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID)
--        WITH CHECK (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);
--   3. Índices relevantes (tenant_id + campos de busca frequente)
--   4. Trigger de atualizado_em se a tabela tiver essa coluna:
--      CREATE TRIGGER trg_{tabela}_updated_at
--        BEFORE UPDATE ON {tabela}
--        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Regras obrigatórias
- Nome do arquivo: `YYYYMMDDHHMMSS_acao_tabela.sql` — sem espaços
- Toda tabela nova: RLS + políticas + índices na mesma migration
- Nunca usar `DROP TABLE` sem confirmação explícita do usuário
- ENUMs novos: nomear com sufixo do domínio (ex: `whatsapp_session_status`)
- Atualizar `prisma/schema.prisma` se necessário após criar a migration

$ARGUMENTS
