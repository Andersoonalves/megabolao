# ADR 0001 — RBAC Enterprise (perfis dinâmicos + permissões granulares)

- **Status:** Aceito
- **Data:** 2026-05-09
- **Autores:** Time NossoBolão
- **Migration:** `supabase/migrations/20260509160000_rbac_enterprise.sql`

## Contexto

O modelo de autorização anterior usava apenas dois papéis (`MASTER` e `ADMIN`)
no `user_metadata` do Supabase Auth, validados por `RolesGuard`. Esse modelo
era simples mas não suportava:

- Diferenciar acessos dentro de um mesmo tenant (ex.: financeiro só vê prêmios).
- Tenants criarem perfis customizados.
- Auditar **quem fez o quê e quando**.
- Habilitar/desabilitar módulos por tenant (ex.: tenant sem WhatsApp).
- Evitar escalonamento de privilégios entre ADMINs.

## Decisão

Implementamos um modelo RBAC enterprise com:

1. **Perfis dinâmicos por tenant** (`perfis`) — cada tenant pode ter quantos
   perfis quiser, com nome, descrição, prioridade e flag `sistema` (não-deletável).
2. **Catálogo global de módulos e permissões** (`modulos`, `permissoes`) — fixo,
   atualizado por migration. Permissões seguem o formato `<modulo>.<acao>`,
   ex.: `bolao.criar`, `auditoria.ler`.
3. **Módulos por tenant** (`modulos_tenant`) — habilita/desabilita um módulo
   inteiro num tenant específico (preparação para planos diferenciados).
4. **N:N entre perfis e permissões** (`perfil_permissoes`) e entre usuários
   e perfis (`usuario_perfis`).
5. **Auditoria** (`auditoria`) — toda operação sensível registra um evento
   com ação, recurso, severidade, IP, user-agent, payload e usuário.
6. **MASTER permanece especial** — recebe `permissoes = ['*']` (curinga). Não
   tem perfil; valida diretamente no guard.
7. **ADMIN ganha um perfil-semente "Administrador"** com todas as permissões
   não-master do tenant. Backfill executado na própria migration cria esse
   perfil para todos os tenants existentes e o atribui aos `user_profiles`
   já com papel `ADMIN`.
8. **Cache de permissões dentro do JWT** — as permissões efetivas (união dos
   perfis ativos) são gravadas em `user_metadata.permissoes`. O guard valida
   sem nenhuma query ao banco (zero round-trip por requisição).

### Resolução de permissões

```
permissoes_efetivas(usuario)
  = se papel = MASTER → ['*']
    senão                → ⋃ { perfis ativos do usuário }.permissoes
```

### Fluxo de invalidação

Ao alterar perfil ou atribuição de perfis:

1. Backend grava o novo estado no Postgres.
2. `AuthService.syncUserPermissions(userId)` recalcula a união e chama a
   Supabase Admin API para atualizar `user_metadata.permissoes`.
3. Próximo `refreshSession()` no front ou expiração natural do JWT propaga
   as novas permissões.

Para atualização imediata sem logout, o frontend pode chamar
`auth.refreshSession()` após operações de perfil/usuário.

### Anti-escalonamento

Um ADMIN não pode atribuir a um perfil uma permissão que ele próprio não
possui. O `PerfilService.create/update` valida o conjunto de permissões do
DTO contra `currentUser.permissoes` (com bypass para MASTER).

## Alternativas consideradas

### A) Manter apenas papéis fixos com mais granularidade

Adicionar papéis como `ADMIN_FINANCEIRO`, `OPERADOR`, etc. **Rejeitado** —
inflexível, força o time a fazer migration e deploy a cada mudança de
permissão de um tenant. Não atende o requisito de o cliente final criar
seus próprios perfis.

### B) Tabela única `user_permissions`

Atribuir permissões diretamente a usuários, sem perfis. **Rejeitado** —
mais difícil de manter (n usuários × n permissões em vez de n perfis ×
m permissões + atribuições). UX pior: ao trocar uma pessoa de função,
seria preciso refazer toda a configuração.

### C) Cache em Redis / DataLoader

Resolver permissões a cada request com cache em Redis ou DataLoader.
**Rejeitado** — adiciona dependência de Redis para auth (já usado para
BullMQ, mas keep auth path independente). O JWT já tem TTL curto; usar o
próprio token como cache evita complexidade extra e é suportado nativamente
pelo Supabase.

### D) Auditoria em arquivo / Logflare

Registrar a auditoria fora do banco. **Rejeitado** — perde-se o filtro
RLS por tenant, joins com `auth.users`, busca no SQL e isolamento. Mantemos
no Postgres; se volume crescer, migramos para particionamento ou TimescaleDB.

## Consequências

### Positivas

- Tenant administra seus próprios perfis.
- Custo zero de validação por requisição (permissões no JWT).
- Auditoria nativa multitenant via RLS.
- MASTER continua simples e isolado da hierarquia do tenant.
- Backfill cobre todos os tenants existentes — nenhum admin perde acesso.
- Anti-escalonamento aplicado no service layer (não depende de RLS).

### Negativas

- Permissões mudadas só refletem após refresh do JWT (TTL ~1h por padrão
  Supabase; pode ser forçado por `auth.refreshSession()`).
- Tamanho do JWT cresce com N permissões (ADMIN típico ~30 strings ≈ 600
  bytes; aceitável).
- Adicionar uma permissão nova exige migration (acceptable — versionamento).
- Mais tabelas e relacionamentos para manter (mitigado por testes).

## Implementação

### Backend (NestJS)

- `apps/backend/src/modules/auth/decorators/permissions.decorator.ts` —
  `@RequerPermissoes('codigo')`.
- `apps/backend/src/modules/auth/permissoes.guard.ts` — global guard que lê
  o array do JWT e valida.
- `apps/backend/src/modules/auth/auth.service.ts` — métodos
  `resolveEffectivePermissions`, `syncUserPermissions`, `syncPerfilPermissions`.
- Módulos novos:
  - `permissao/` — catálogo (read-only).
  - `perfil/` — CRUD de perfis com anti-escalonamento.
  - `usuario/` — convite (Supabase Admin API), atribuição de perfis, exclusão.
  - `auditoria/` — registro best-effort + listagem paginada.

### Frontend (Angular)

- `apps/frontend/src/app/core/services/auth.service.ts` —
  `permissoes()`, `temPermissao()`, `temAlgumaPermissao()`,
  `temTodasPermissoes()`, `refreshSession()`.
- `apps/frontend/src/app/shared/directives/se-permissao.directive.ts` —
  `*nbSe="'codigo'"` para gating de UI.
- `apps/frontend/src/app/core/guards/permissao.guard.ts` —
  `permissaoGuard('codigo')` para gating de rota.
- Telas: `features/rbac/perfis/`, `features/rbac/usuarios/`,
  `features/rbac/auditoria/`.

### Banco

- Tabelas novas: `modulos`, `permissoes`, `modulos_tenant`, `perfis`,
  `perfil_permissoes`, `usuario_perfis`, `auditoria`.
- RLS habilitada em todas. Catálogo (`modulos`, `permissoes`) é leitura
  pública para autenticados; demais tabelas filtram por `tenant_id` do JWT.
- Backfill: módulos não-master habilitados em todos os tenants; perfil
  "Administrador" criado por tenant; ADMINs existentes recebem o perfil.

## Plano de evolução

1. **Caching de permissões em memória** caso o JWT cresça muito.
2. **Templates de perfil** ("Operador", "Financeiro", "Visualizador") como
   sugestões na criação.
3. **Permissões com escopo** (ex.: `bolao.editar:bolao_id=X`) — apenas se
   houver demanda real; complexidade significativa.
4. **Exportação CSV** da auditoria (já temos a permissão `auditoria.exportar`
   reservada).
5. **Notificação em tempo real** quando perfis do usuário mudam (via Supabase
   Realtime + chamada a `refreshSession`).

## Referências

- Requisitos NossoBolão v3.9 — seção "Autenticação e RBAC".
- Migration: `supabase/migrations/20260509160000_rbac_enterprise.sql`.
