Revisão de código do NossoBolão contra as regras do CLAUDE.md.

**Argumento:** caminho do módulo, arquivo ou nome do módulo (ex: `bolao`, `apps/backend/src/modules/sorteio/`)

## Checklist de revisão (verifique cada item)

### 1. Segurança
- [ ] Toda rota tem `@Roles('MASTER')` ou `@Roles('ADMIN')` ou `@Roles('MASTER', 'ADMIN')`?
- [ ] Toda query filtra por `tenantId`? (busca por `findMany`, `findFirst`, `findUnique` sem `tenantId`)
- [ ] `SUPABASE_SERVICE_KEY` ou outros secrets expostos no código?
- [ ] `any` type usado em algum lugar?

### 2. Regras de negócio
- [ ] Palpites validados com `validarPalpites` de `@nossobolao/shared-utils`?
- [ ] Soma de percentuais de categorias = 100% antes de salvar?
- [ ] Cotas INATIVO excluídas de cálculos de ranking e prêmios?
- [ ] Transições de status validadas antes de executar?

### 3. Testes
- [ ] Existe `.spec.ts` para cada arquivo de produção?
- [ ] Cobre casos de borda: tenant errado, status inválido, dados faltando?
- [ ] `jest.clearAllMocks()` no `beforeEach`?
- [ ] Padrão AAA em todos os testes?

### 4. TypeScript
- [ ] Zero `any` explícito ou implícito?
- [ ] Tipos importados de `@nossobolao/shared-types` ou declarados explicitamente?
- [ ] Nenhum `// @ts-ignore` sem justificativa?

### 5. Padrão de erro
- [ ] Erros de negócio usam `BusinessException`?
- [ ] Código de erro em CAIXA_ALTA_COM_UNDERLINE?
- [ ] `details[]` inclui `field` quando o erro é de campo específico?

### 6. Performance / custo zero
- [ ] Nenhum serviço pago novo introduzido?
- [ ] Queries com N+1? (ex: loop com query dentro)
- [ ] Virtual Scroll mencionado para listas > 100 itens (frontend)?

## Formato de saída
Para cada problema encontrado:
```
arquivo:linha: 🔴 CRÍTICO | ⚠️ AVISO | 💡 SUGESTÃO: descrição do problema. correção recomendada.
```

Ao final: resumo contando críticos / avisos / sugestões.

$ARGUMENTS
