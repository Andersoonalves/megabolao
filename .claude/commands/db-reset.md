Reseta o banco Supabase local e aplica migrations + seed de desenvolvimento.

## ⚠️ Atenção — operação destrutiva
Isso apaga TODOS os dados locais. Confirme com o usuário antes de prosseguir
(exceto se o usuário já confirmou explicitamente ao invocar o comando).

## Sequência de execução

```bash
# 1. Para o Supabase se estiver rodando
supabase stop

# 2. Sobe e reseta (aplica migrations + seed.sql)
supabase db reset

# 3. Confirma que API está no ar
supabase status
```

Alternativa (via npm script):
```bash
npm run supabase:reset
```

## Após o reset
- Verifique que as migrations rodaram sem erro
- O seed.sql cria: 1 tenant, 1 bolão (concursos 2994–2999), 6 sorteios, cota 213 (ganhador)
- O seed.test.sql NÃO é aplicado aqui (apenas em testes de integração)

## Se supabase CLI não estiver disponível
Informe o usuário: "supabase CLI não encontrado. Execute `brew install supabase/tap/supabase` ou conecte ao Supabase Cloud e aplique as migrations manualmente via Dashboard."

$ARGUMENTS
