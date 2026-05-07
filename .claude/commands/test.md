Execute os testes do NossoBolão.

**Argumento opcional:** nome do módulo (`auth`, `tenant`, `bolao`, `participante`, `sorteio`, `premio`, `whatsapp`, `relatorio`)

## Sem argumento — suite completa
```bash
npx nx test backend
```
Mostre: total de suites, total de testes, falhas (com stack trace), tempo.

## Com argumento — módulo específico
Mapeie o argumento para o caminho do spec:
- `auth`         → `apps/backend/src/modules/auth/auth.service.spec.ts`
- `tenant`       → `apps/backend/src/modules/tenant/tenant.service.spec.ts`
- `bolao`        → `apps/backend/src/modules/bolao/bolao.service.spec.ts`
- `participante` → `apps/backend/src/modules/participante/participante.service.spec.ts`
- `sorteio`      → `apps/backend/src/modules/sorteio/sorteio.service.spec.ts`
- `premio`       → `apps/backend/src/modules/premio/premio.service.spec.ts`

```bash
npx nx test backend --testFile=<caminho-do-spec>
```

## Ao finalizar
- Se tudo passou: confirme contagem
- Se falhou: identifique causa raiz e sugira correção antes de reportar ao usuário

$ARGUMENTS
