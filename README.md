# NossoBolão — Setup Rápido

## Pré-requisitos

- Node.js 20+
- Docker (para Supabase local)
- Supabase CLI: `npm i -g supabase`
- Fly CLI (para deploy): https://fly.io/install

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
supabase start
# Anote as chaves exibidas e cole no .env.local
```

Aplicar schema + seed de desenvolvimento:
```bash
supabase db reset
```

---

## 4. Rodar o backend

```bash
npm run start:backend
# API disponível em: http://localhost:3000/api/v1
# Swagger: http://localhost:3000/docs
# Health: http://localhost:3000/api/v1/health
```

---

## 5. Rodar os testes

```bash
npm run test:backend          # Unitários
npm run test:backend -- --coverage  # Com coverage
```

---

## Ordem de implementação dos módulos

| # | Módulo | Status |
|---|--------|--------|
| 1 | AuthModule + Guards + SupabaseModule | ✅ Pronto |
| 2 | TenantModule CRUD + branding | ⬜ Próximo |
| 3 | BolaoModule + categorias livres | ⬜ |
| 4 | ParticipanteModule + cotas | ⬜ |
| 5 | SorteioModule + job disparo | ⬜ |
| 6 | CalcAcertosJob (BullMQ worker) | ⬜ |
| 7 | PremioModule + cálculo | ⬜ |
| 8 | WhatsAppModule | ⬜ |
| 9 | GoogleDriveModule | ⬜ |
| 10 | RelatorioModule | ⬜ |
| 11 | PwaModule | ⬜ |

---

## Estrutura de módulo padrão

```
src/modules/[nome]/
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
5. **Custo zero** — não adicionar serviços pagos
