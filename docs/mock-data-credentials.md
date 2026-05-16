# Dados de Teste — NossoBolão

Tenant: **Bolão Mega da Virada 2023** (slug: `bolao-mega-da-virada-2023`)

---

## Credenciais

### Administradores (acesso ao painel admin)

| # | Email | Senha | Nome |
|---|---|---|---|
| 1 | `admin1@mega-virada.test` | `Teste@123` | Carlos Administrador |
| 2 | `admin2@mega-virada.test` | `Teste@123` | Maria Gestora |
| 3 | `admin3@mega-virada.test` | `Teste@123` | João Operador |

### Participantes (acesso ao portal)

| # | Email | Senha | Nome |
|---|---|---|---|
| 4 | `participante1@mega-virada.test` | `Teste@123` | Ana Participante |
| 5 | `participante2@mega-virada.test` | `Teste@123` | Bruno Participante |

### Participantes sem login (apenas dados no banco)

| # | Nome | Celular |
|---|---|---|
| 6 | Carol Souza | 11999100006 |
| 7 | Daniel Lima | 11999100007 |
| 8 | Elena Costa | 11999100008 |
| 9 | Fabio Santos | 11999100009 |
| 10 | Gabriela Oliveira | 11999100010 |
| 11 | Henrique Pereira | 11999100011 |
| 12 | Isabela Rodrigues | 11999100012 |
| 13 | José Ferreira | 11999100013 |
| 14 | Larissa Almeida | 11999100014 |
| 15 | Marcos Nascimento | 11999100015 |

---

## Bolões

| # | Nome | Status | Valor Cota | Cotas | Sorteios |
|---|---|---|---|---|---|
| 1 | Mega-Sena da Virada 2023 | EM_ANDAMENTO | R$ 25,00 | 10 | 2 |
| 2 | Mega-Sena Abril 2026 | FINALIZADO | R$ 30,00 | 11 | 2 |
| 3 | Mega-Sena Maio 2026 | EM_ANDAMENTO | R$ 20,00 | 9 | 2 |
| 4 | Mega-Sena Junho 2026 | A_SER_INICIADO | R$ 35,00 | 0 | 0 |

---

## Cotas por Bolão

### Bolão 1: Mega-Sena da Virada 2023 (EM_ANDAMENTO)

| Seq | Participante | Palpites | Status |
|---|---|---|---|
| 1 | Carlos Administrador | 01 05 12 23 34 45 50 55 58 60 | PAGO |
| 2 | Carlos Administrador | 02 08 15 22 33 41 47 51 56 59 | PAGO |
| 3 | Carlos Administrador | 03 09 17 25 36 42 48 52 57 58 | PENDENTE |
| 4 | Maria Gestora | 04 10 18 27 35 40 46 53 55 60 | PAGO |
| 5 | Maria Gestora | 06 11 19 28 37 43 49 54 56 59 | PAGO |
| 6 | João Operador | 07 14 21 30 38 44 50 52 57 60 | PAGO |
| 7 | João Operador | 01 08 16 24 31 39 45 51 55 58 | PENDENTE |
| 8 | Ana Participante | 03 10 17 22 30 38 44 49 55 60 | PAGO |
| 9 | Bruno Participante | 05 12 19 26 33 40 47 53 56 59 | PAGO |
| 10 | Bruno Participante | 02 09 15 24 31 37 46 50 57 58 | PENDENTE |

**Sorteios:**
- Concurso 2700 (15/12/2023): 05 12 23 34 45 55
- Concurso 2701 (22/12/2023): 01 08 17 28 38 50

**Categorias:** Taxa 15% · Prêmio Principal 50% · 9 acertos 15% · 8 acertos 10% · Menos Pontos 10%

---

### Bolão 2: Mega-Sena Abril 2026 (FINALIZADO)

| Seq | Participante | Palpites | Status | Acertos |
|---|---|---|---|---|
| 1 | Carol Souza | 01 07 14 23 31 38 45 50 55 60 | PAGO | 8 | 🏆 Melhor 1º Sorteio |
| 2 | Carol Souza | 02 08 15 22 33 41 47 51 56 59 | PAGO | 5 |
| 3 | Carol Souza | 03 09 17 25 36 42 48 52 57 58 | PENDENTE | 0 |
| 4 | Daniel Lima | 08 10 42 27 35 40 46 53 55 58 | PAGO | 9 | 🏆 9 Acertos |
| 5 | Daniel Lima | 06 11 19 28 37 43 49 54 56 59 | PAGO | 4 |
| 6 | Elena Costa | 42 20 29 34 41 48 53 57 49 60 | PAGO | 9 | 🏆 9 Acertos (divide) |
| 7 | Fabio Santos | 01 08 10 23 29 31 40 42 49 55 | PAGO | 10 | 🏆 Prêmio Principal |
| 8 | Fabio Santos | 01 08 16 24 31 39 45 51 55 58 | PAGO | 3 |
| 9 | Fabio Santos | 03 10 17 22 30 38 44 49 55 60 | PENDENTE | 0 |
| 10 | Gabriela Oliveira | 05 12 19 26 33 40 47 53 56 59 | PAGO | 5 | 🏆 Pior Pontuação |
| 11 | Gabriela Oliveira | 02 09 15 24 31 37 46 50 57 58 | INATIVO | 0 |

**Sorteios:**
- Concurso 2994 (09/04/2026): 01 10 23 31 40 55
- Concurso 2995 (11/04/2026): 08 29 42 49 50 58

**Categorias:** Taxa 15% · Ganhador 10 acertos 45% · Melhor 1º Sorteio 15% · 9 acertos 15% · Pior Pontuação 10%

**Prêmios distribuídos:**

| Categoria | Ganhador | Cota | Acertos | Valor |
|---|---|---|---|---|
| Ganhador 10 acertos (45%) | Fabio Santos | #7 | 10 | R$ 148,50 |
| Melhor do 1º Sorteio (15%) | Carol Souza | #1 | 8 | R$ 49,50 |
| 9 Acertos (15%) | Daniel Lima | #4 | 9 | R$ 24,75 (divide) |
| 9 Acertos (15%) | Elena Costa | #6 | 9 | R$ 24,75 (divide) |
| Pior Pontuação (10%) | Gabriela Oliveira | #10 | 5 | R$ 33,00 |
| Taxa Administrativa (15%) | — | — | — | R$ 49,50 |

---

### Bolão 3: Mega-Sena Maio 2026 (EM_ANDAMENTO)

| Seq | Participante | Palpites | Status |
|---|---|---|---|
| 1 | Carlos Administrador | 01 05 12 23 34 45 50 55 58 60 | PAGO |
| 2 | Carlos Administrador | 02 08 15 22 33 41 47 51 56 59 | PENDENTE |
| 3 | Henrique Pereira | 03 09 17 25 36 42 48 52 57 58 | PAGO |
| 4 | Henrique Pereira | 04 10 18 27 35 40 46 53 55 60 | PAGO |
| 5 | Henrique Pereira | 06 11 19 28 37 43 49 54 56 59 | PENDENTE |
| 6 | Isabela Rodrigues | 07 14 21 30 38 44 50 52 57 60 | PAGO |
| 7 | Ana Participante | 01 08 16 24 31 39 45 51 55 58 | PAGO |
| 8 | Ana Participante | 03 10 17 22 30 38 44 49 55 60 | PENDENTE |
| 9 | Bruno Participante | 05 12 19 26 33 40 47 53 56 59 | PAGO |

**Sorteios:**
- Concurso 3010 (07/05/2026): 03 15 22 31 44 58
- Concurso 3011 (10/05/2026): 07 14 25 38 49 55

**Categorias:** Taxa 10% · Prêmio Principal 40% · 9 acertos 20% · 8 acertos 15% · 7 acertos 10% · Menos Pontos 5%

---

### Bolão 4: Mega-Sena Junho 2026 (A_SER_INICIADO)

Bolão ainda não iniciado. Sem cotas e sem sorteios.

**Categorias:** Taxa 15% · Prêmio Total 60% · Consolação 25%

---

## Resumo de Variações para Teste

| Cenário | Onde testar |
|---|---|
| Bolão EM_ANDAMENTO com cotas pagas/pendentes | Bolões 1 e 3 |
| Bolão FINALIZADO com acertos e ranking | Bolão 2 |
| Bolão A_SER_INICIADO sem dados | Bolão 4 |
| Participante com 1 cota | Ana (B1), Elena (B2), Isabela (B3), Bruno (B3) |
| Participante com 2 cotas | Maria (B1), Bruno (B1), Daniel (B2), Carlos (B3), Ana (B3) |
| Participante com 3 cotas | Carlos (B1), Carol (B2), Fabio (B2), Henrique (B3) |
| Cota PAGO | Maioria |
| Cota PENDENTE | Vários bolões |
| Cota INATIVO | Gabriela (B2, cota 11) |
| Cota PREMIADO (10 acertos) | Fabio (B2, cota 7) — justifica status FINALIZADO |
| Cota PREMIADO (9 acertos) | Daniel (B2, cota 4) + Elena (B2, cota 6) — dividem R$49,50 (R$24,75 cada) |
| Cota PREMIADO (melhor 1º sorteio) | Carol (B2, cota 1) — 4 acertos no 1º sorteio |
| Cota PREMIADO (pior pontuação) | Gabriela (B2, cota 10) — 5 acertos, menor entre PAGO |
| Sorteio com processado=true | Todos os sorteios |
| Participante compartilhado entre bolões | Carlos, Ana, Bruno (B1+B3) |
| Categorias diferentes por bolão | Cada bolão tem config única |
