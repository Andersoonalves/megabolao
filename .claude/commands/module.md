Scaffolda um novo módulo NestJS para o NossoBolão seguindo o padrão do CLAUDE.md.

**Argumento obrigatório:** nome do módulo em kebab-case (ex: `sorteio`, `premio`, `whatsapp`)

## Arquivos a criar em `apps/backend/src/modules/$ARGUMENTS/`

### `$ARGUMENTS.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { ${PascalCase}Controller } from './$ARGUMENTS.controller';
import { ${PascalCase}Service } from './$ARGUMENTS.service';

@Module({
  controllers: [${PascalCase}Controller],
  providers: [${PascalCase}Service],
  exports: [${PascalCase}Service],
})
export class ${PascalCase}Module {}
```

### `$ARGUMENTS.controller.ts`
- `@ApiTags('$ARGUMENTS')`, `@ApiBearerAuth()`, `@Roles(...)` em TODOS os endpoints
- Injetar `@TenantId() tenantId: string | null` em todos os handlers
- Passar `tenantId` para o service

### `$ARGUMENTS.service.ts`
- Injetar `PrismaService` (já é global)
- `assertTenantId(tenantId)` em TODOS os métodos públicos
- TODA query filtra por `{ tenantId }` — sem exceção
- Usar `BusinessException` para erros de negócio
- Mapper `toResponse()` privado (converte Decimal → number)

### `$ARGUMENTS.service.spec.ts`
- `jest.clearAllMocks()` no `beforeEach`
- Padrão AAA em cada teste
- Mock do `PrismaService` com `jest.fn()`
- Cobrir: casos de sucesso + rejeições + isolamento de tenant

### `dto/create-$ARGUMENTS.dto.ts`
- `class-validator` completo, sem `any`
- `@ApiProperty` em todos os campos

### `dto/update-$ARGUMENTS.dto.ts`
```typescript
import { PartialType } from '@nestjs/swagger';
import { Create${PascalCase}Dto } from './create-$ARGUMENTS.dto';
export class Update${PascalCase}Dto extends PartialType(Create${PascalCase}Dto) {}
```

## Após criar os arquivos
1. Adicionar `${PascalCase}Module` em `apps/backend/src/app.module.ts`
2. Confirmar que `npx nx test backend` ainda passa

## Regras críticas (nunca violar)
- TypeScript strict: zero `any`
- Toda query: filtro por `tenant_id`
- Erro padrão: `{ statusCode: 422, error: 'CODIGO', message: '...', details: [...], requestId, timestamp }`
- Spec junto com o código na mesma entrega

$ARGUMENTS
