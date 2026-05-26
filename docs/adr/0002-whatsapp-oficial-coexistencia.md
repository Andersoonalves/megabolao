# ADR 0002 — Coexistência Evolution API + Meta Cloud API

**Status:** Aceito  
**Data:** 2026-05-26  
**Branch:** feat/whatsapp-official-api

---

## Contexto

O número WhatsApp do operador foi banido por atividade suspeita. A causa identificada foi o uso da Evolution API (Baileys), que usa o protocolo não-oficial do WhatsApp Web. Mesmo com protocolos anti-ban implementados (cooldowns, jitter, cache de estado), o uso de clientes não-oficiais gera risco permanente de ban.

A API oficial do Meta (WhatsApp Cloud API) elimina esse risco para mensagens individuais, mas **não suporta envio para grupos**, funcionalidade central do bolão (notificação de resultados de sorteio via grupos).

---

## Decisão

Adotar arquitetura de **coexistência**:

| Tipo de mensagem | API utilizada | Motivo |
|---|---|---|
| Envio para **grupo** WhatsApp | Evolution API (Baileys) | Única forma de enviar para grupos |
| Envio para **número individual** | Meta Cloud API oficial | Sem risco de ban, rastreável, entrega garantida |

### Roteamento no processor

```typescript
if (mensagem.grupoId) {
  await clientManager.enviarParaGrupo(tenantId, grupoId, conteudo); // Evolution
} else if (mensagem.celular) {
  await metaApi.enviarTexto(celular, conteudo); // Meta
}
```

---

## Consequências

### Positivas
- Mensagens individuais (premiados, confirmação de pagamento, OTP) sem risco de ban
- Webhook oficial (`/whatsapp/meta/webhook`) recebe mensagens de entrada dos participantes
- Rastreabilidade de entrega via status updates da Meta (sent/delivered/read/failed)
- Escalável: múltiplos tenants com números Meta distintos via `whatsapp_phone_number_id` em `tenants`

### Negativas
- Mantém dependência da Evolution API para grupos (risco de ban persistente para grupos)
- Mensagens template via Meta precisam de aprovação prévia da Meta (HSM)
- Meta cobra por conversa após 1.000/mês gratuitas

### Limitações conhecidas
- `META_CLOUD_API`: texto livre só dentro da janela de 24h (usuário deve ter iniciado conversa)
- Fora da janela de 24h: obrigatório usar template aprovado
- Grupos: sem suporte na API oficial — Evolution permanece como única opção

---

## Configuração necessária (Fly.io secrets)

```bash
fly secrets set \
  WHATSAPP_PHONE_NUMBER_ID=<id_do_numero_meta> \
  WHATSAPP_ACCESS_TOKEN=<token_permanente_system_user> \
  WHATSAPP_VERIFY_TOKEN=<token_aleatorio_para_verificacao_webhook> \
  --app nossobolao-backend
```

### Webhook Meta (configurar no Meta Business → WhatsApp → Configuração)
- URL: `https://nossobolao-backend.fly.dev/api/v1/whatsapp/meta/webhook`
- Verify Token: valor de `WHATSAPP_VERIFY_TOKEN`
- Campos subscritos: `messages`

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `whatsapp-meta.service.ts` | Novo — adapter para Meta Cloud API |
| `whatsapp-meta-webhook.controller.ts` | Novo — webhook GET (verificação) + POST (eventos) |
| `jobs/enviar-mensagem.processor.ts` | Routing grupo→Evolution / celular→Meta |
| `dto/enviar-mensagem.dto.ts` | `grupoId` e `celular` tornados opcionais (um obrigatório) |
| `whatsapp-mensagem.service.ts` | Persiste `celular` na criação da mensagem |
| `whatsapp.module.ts` | Registra novos providers e controller |
| `prisma/schema.prisma` | `celular` em `MensagemWhatsapp`; `whatsappPhoneNumberId` em `Tenant` |
| `supabase/migrations/20260526000001_whatsapp_meta_api.sql` | Migration correspondente |
