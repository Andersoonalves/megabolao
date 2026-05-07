Gate de qualidade completo do NossoBolão. Rode em sequência — pare e reporte se alguma etapa falhar.

## Passo 1 — TypeScript (sem emitir arquivos)
```bash
npx nx run backend:build --no-cache 2>&1 | head -50
```
Deve concluir sem erros de tipo.

## Passo 2 — Lint
```bash
npx nx lint backend 2>&1
```
Sem erros (warnings são aceitáveis se não violam regras do projeto).

## Passo 3 — Testes
```bash
npx nx test backend 2>&1
```
Todos os testes devem passar.

## Relatório final
Mostre tabela resumo:
| Etapa      | Status | Detalhes |
|------------|--------|----------|
| TypeScript | ✅/❌  | ...      |
| Lint       | ✅/❌  | ...      |
| Testes     | ✅/❌  | X/Y passando |

Se alguma etapa falhar, liste os erros e proponha correção antes de marcar como concluído.

$ARGUMENTS
