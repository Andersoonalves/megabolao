# NossoBolão — Setup Rápido

Monorepo **Nx**: `apps/backend` (NestJS), `apps/frontend` (Angular 21), `libs/shared-types` (tipos gerados do OpenAPI), `libs/shared-utils`, `supabase/` (migrations e seeds).

Documentação de produto: [requisitos_nossobolao_v3.9.md](requisitos_nossobolao_v3.9.md). Convenções do projeto para agentes e modos de trabalho: [CLAUDE.md](CLAUDE.md).

## Pré-requisitos

- Node.js 20+
- Docker (para Supabase local)
- Supabase CLI: `npm i -g supabase`
- Fly CLI (para deploy): https://fly.io/install
- Redis local (BullMQ) — ex.: `redis://localhost:6379` na variável `REDIS_URL`

---

## 1. Clonar e instalar dependências

```bash
git clone <repo-url> nossobolao
cd nossobolao
npm install
```

---

## 2. Configurar variáveis de ambiente

```bash
cp env.example apps/backend/.env.local
# Editar apps/backend/.env.local com suas chaves do Supabase
```

Variáveis obrigatórias:

```
APP_ENV=local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<ver output do supabase start>
SUPABASE_SERVICE_KEY=<ver output do supabase start>
SUPABASE_JWT_SECRET=<ver output do supabase start>
REDIS_URL=redis://localhost:6379
API_PORT=3000
```

---

## 3. Subir Supabase local

```bash
npm run supabase:start
# ou: supabase start
# Anote as chaves exibidas e cole no .env.local
```

Aplicar schema + seed de desenvolvimento:

```bash
npm run supabase:reset
# ou: supabase db reset
```

---

## 4. Rodar o backend

```bash
npm run dev:backend
# Alternativa via Nx: npm run dev:backend:nx
```

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/api/v1/health

Gerar tipos TypeScript do OpenAPI para o frontend (com o backend no ar):

```bash
npm run generate:types
```

---

## 5. Rodar o frontend

```bash
npm run dev:frontend
```

---

## 6. Testes e lint

```bash
npm run test:backend           # Unitários backend
npm run test:backend -- --coverage
npm run test:frontend          # Unitários frontend
npm run test                   # Nx: todos os projetos com target test
npm run lint                   # Nx: lint em todos os projetos
```

E2E Playwright: projeto `frontend-e2e` (via Nx, ex. `nx e2e frontend-e2e`).

---

## Módulos do backend (`apps/backend`)

Todos estão registrados em `AppModule`; jobs BullMQ ficam dentro dos módulos de domínio (ex.: cálculo de acertos em `SorteioModule`, fila WhatsApp em `WhatsAppModule`).

| # | Módulo | Escopo principal |
|---|--------|------------------|
| 1 | AuthModule + Guards + Middleware | JWT Supabase, RBAC |
| 2 | SupabaseModule + PrismaModule | Cliente DB / ORM |
| 3 | TenantModule | CRUD tenant, branding |
| 4 | BolaoModule | Bolões, categorias de premiação |
| 5 | ParticipanteModule | Participantes, cotas, palpites |
| 6 | SorteioModule | Sorteios, fila `CalcAcertosProcessor` |
| 7 | PremioModule | Premiação e pagamentos |
| 8 | WhatsAppModule | Sessão por tenant, fila de envio |
| 9 | GoogleDriveModule | Integração Google |
| 10 | RelatorioModule | PDF / XLSX |
| 11 | PwaModule | Manifest dinâmico por tenant |

O **frontend Angular** cobre dashboards, bolão, portal do participante, fluxos complementares conforme evolução do requisito — usar o documento de requisitos e o código em `apps/frontend/src/app` como referência.

---

## Estrutura de módulo NestJS (padrão)

```
apps/backend/src/modules/[nome]/
  [nome].module.ts
  [nome].controller.ts   ← @ApiTags + @Roles em todo endpoint
  [nome].service.ts      ← toda query filtra por tenant_id
  [nome].service.spec.ts ← padrão AAA
  dto/
    create-[nome].dto.ts
    update-[nome].dto.ts
```

## Regras críticas (jamais ignorar)

1. **Toda query filtra por `tenant_id`** — sem exceção
2. **`SUPABASE_SERVICE_KEY` jamais vai ao frontend**
3. **TypeScript strict** — `any` proibido
4. **Toda rota tem `@Roles()`** — sem endpoint desprotegido acidentalmente
5. **Custo zero** — não adicionar serviços pagos sem decisão explícita (`requisitos_nossobolao_v3.9.md`, custos / Fase 0)
