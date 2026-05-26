# WhatsApp Anti-Ban — Regras e Delays

Stack: **Evolution API v2 + Baileys (multi-device)**
Módulo: `apps/backend/src/modules/whatsapp/`

---

## Resumo dos delays implementados

| Camada | Mecanismo | Valor |
|--------|-----------|-------|
| Processor (pré-envio) | Jitter aleatório | **3–8s** por mensagem |
| Client Manager (throttle) | Intervalo mínimo entre envios | **3s mínimo** por tenant |
| BullMQ retry backoff | Exponencial após falha | **30s → 60s → 120s** |
| Ban signal detectado | Pausa extra antes de re-throw | **+60s** adicional |
| Polling `/status` | Nunca gera QR automaticamente | apenas ação explícita do usuário |
| Cache de connectionState | TTL para não bater na Evolution por poll | **8s** |
| Cooldown de `renovarQr` | Impede delete+create em sequência | **60s** entre renovações |
| Cooldown de `/instance/connect` | Impede spam de reconexão | **30s** por tentativa |
| Frontend poll `AGUARDANDO_QR` | Intervalo de polling enquanto exibe QR | **3s** (Evolution chamada cada ~8s via cache) |
| Frontend poll `CARREGANDO` | Intervalo de polling enquanto inicializa | **8s** (alinhado com cache TTL) |

---

## Regras por categoria

### 1. Rate limiting

**Por que importa:** Baileys/WhatsApp detecta rajadas de mensagens como bot e aplica bloqueio temporário ou ban permanente do número.

**Implementado em:**
- `enviar-mensagem.processor.ts` → jitter de 3–8s antes de cada `enviarParaGrupo`
- `whatsapp-client-manager.service.ts` → `throttleSend()` garante mínimo 3s entre chamadas da mesma instância

**Regras operacionais (não enforçadas em código — responsabilidade do admin):**
- Máximo **~200 mensagens/dia** por número em instância nova
- Máximo **~500 mensagens/dia** por número com histórico estabelecido (30+ dias)
- Nunca enfileirar mais de 50 mensagens de uma vez para o mesmo grupo

---

### 2. Conteúdo

**Por que importa:** Evolution/Baileys flageia mensagens com conteúdo 100% idêntico enviadas em sequência. Redes de spam usam esse padrão.

**Implementado em:**
- `enviar-mensagem.processor.ts` → `varyContent()` appenda 1–3 zero-width spaces (`U+200B`) no final do texto antes de enviar

**Regras operacionais:**
- Nunca usar links encurtados (bit.ly, tinyurl) — red flag do WhatsApp
- Evitar palavras de spam: "grátis", "clique aqui", "promoção", "ganhe"
- Imagens e PDFs têm menor risco que texto puro com link externo

---

### 3. Detecção de ban signal

**Por que importa:** Quando a Evolution API retorna erro de rate limit ou bloqueio, re-tentar imediatamente piora a situação.

**Implementado em:**
- `enviar-mensagem.processor.ts` → `isBanSignal()` detecta termos: `429`, `rate`, `blocked`, `banned`, `spam`, `broadcast`, `too many`
- Quando detectado: pausa adicional de **60s** antes de re-throw + prefixo `[BAN_SIGNAL]` no campo `erro` da mensagem

**Como monitorar:**
```sql
SELECT id, erro, tentativas, atualizado_em
FROM mensagens_whatsapp
WHERE status = 'FALHA'
  AND erro LIKE '[BAN_SIGNAL]%'
ORDER BY atualizado_em DESC;
```

---

### 4. Concorrência

**Por que importa:** Mensagens paralelas da mesma instância = múltiplas conexões Baileys simultâneas = ban imediato.

**Implementado em:**
- `enviar-mensagem.processor.ts` → `concurrency: 1` no BullMQ Worker
- Significa: uma mensagem por vez por processo backend

---

### 5. Backoff de retry

**Por que importa:** Retry imediato após falha sinaliza comportamento automatizado. Backoff exponencial simula falha humana/técnica.

**Implementado em:**
- `whatsapp-mensagem.service.ts` + `whatsapp.module.ts` → `backoff: { type: 'exponential', delay: 30_000 }`
- Tentativa 1: imediata
- Tentativa 2: +30s de espera
- Tentativa 3: +60s de espera
- Total: até 3 tentativas, depois status `FALHA` permanente

**Para reenviar mensagem em FALHA:** `POST /whatsapp/mensagens/:id/retry`

---

## Regras do número (responsabilidade do admin)

### Número novo (0–30 dias de uso orgânico)
- NÃO usar direto em automação
- Usar manualmente por 30 dias antes de conectar na Evolution API
- Começar com volume baixo: máximo 20 mensagens/dia na primeira semana

### Warm-up progressivo
| Semana | Volume máximo/dia |
|--------|-------------------|
| 1      | 20 mensagens      |
| 2      | 50 mensagens      |
| 3      | 100 mensagens     |
| 4+     | 200–500 mensagens |

### Boas práticas do número
- Chip dedicado ao bolão — nunca número pessoal ativo
- Manter o aparelho/número salvando contatos de participantes
- Nunca trocar de aparelho durante bolão em andamento
- Manter QR conectado — reconexão frequente é sinal suspeito

---

## Infraestrutura

### Evolution API
- **1 instância por tenant** = 1 número WhatsApp por bolão
- Múltiplos tenants no mesmo VPS = múltiplos números no mesmo IP
- WhatsApp detecta concentração de números por IP → usar proxy rotativo em produção com 5+ tenants
- Manter a Evolution API em VPS com IP fixo residencial ou datacenter de boa reputação (Hetzner, DigitalOcean)

### Sessão Baileys
- `LocalAuth` persistido — evita novo QR a cada restart (que aumenta suspeita)
- `CONNECT_COOLDOWN_MS = 30s` — impede spam de `/connect` durante polling
- `GET /whatsapp/sessao/status` (polling) **nunca** chama `/instance/connect` — só retorna cache
- `POST /whatsapp/sessao/qr/renovar` bloqueado por 60s entre usos (cooldown)
- Frontend: polling adaptativo — 3s no estado `AGUARDANDO_QR`, 8s no estado `CARREGANDO`
- Com cache backend de 8s TTL, Evolution API recebe no máximo 1 chamada a cada 8s mesmo com poll de 3s
- Não usar o mesmo número em dois dispositivos/instâncias simultaneamente

---

## Sinais de alerta e ações

| Sinal | O que fazer |
|-------|-------------|
| Mensagens com `[BAN_SIGNAL]` no erro | Parar envios por 24h, verificar número no aparelho |
| QR sendo pedido sem motivo | Sessão comprometida — verificar se número foi banido temporariamente |
| `status: 'FALHA'` em 3+ mensagens seguidas | Parar a fila manualmente, investigar erro |
| Volume de entrega caindo | Número pode estar em "modo silencioso" — reduzir volume por 48h |
| Notificação "sua conta foi suspensa" no app | Ban permanente — trocar número |

---

## Configuração atual no código

```typescript
// enviar-mensagem.processor.ts
const JITTER_MIN_MS = 3_000;   // delay mínimo pré-envio
const JITTER_MAX_MS = 8_000;   // delay máximo pré-envio
const BAN_PAUSE_MS  = 60_000;  // pausa extra ao detectar ban signal

// whatsapp-client-manager.service.ts
MIN_SEND_INTERVAL_MS     = 3_000;   // throttle mínimo entre envios por tenant
CONNECT_COOLDOWN_MS      = 30_000;  // cooldown entre chamadas /instance/connect
CONNECTION_STATE_TTL_MS  = 8_000;   // cache de connectionState (TTL)
RENOVAR_COOLDOWN_MS      = 60_000;  // cooldown entre renovarQr (delete+create)

// whatsapp.component.ts (frontend)
// AGUARDANDO_QR: setInterval 3s, mas cache backend 8s → Evolution chamada cada ~8s
// CARREGANDO:    throttle interno 8s → alinhado com cache TTL
// CONECTADO:     sem polling

// whatsapp-mensagem.service.ts + whatsapp.module.ts
backoff: { type: 'exponential', delay: 30_000 } // 30s→60s→120s

// enviar-mensagem.processor.ts (BullMQ Worker)
concurrency: 1  // 1 mensagem por vez
```
