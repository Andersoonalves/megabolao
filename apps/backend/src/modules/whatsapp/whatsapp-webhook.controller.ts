import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';
import { PrismaService } from '../prisma/prisma.service';

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
}

@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly clientManager: WhatsAppClientManager,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Evolution API v2 envia para /webhook OU /webhook/:event (quando byEvents=true)
  // Aceitar ambos os formatos
  @Post()
  @Post(':event')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() payload: EvolutionWebhookPayload,
    @Headers('apikey') apikey: string,
    @Param('event') eventParam?: string,
  ): Promise<{ ok: boolean }> {
    this.logger.log(`[WEBHOOK] Recebido: event=${payload?.event ?? eventParam ?? 'N/A'} instance=${payload?.instance ?? 'N/A'} path_event=${eventParam ?? '-'}`);

    // Normalizar event: pode vir no body (byEvents=false) ou na URL (byEvents=true)
    if (!payload.event && eventParam) {
      payload.event = eventParam.replace(/-/g, '.');
      this.logger.log(`[WEBHOOK] Event normalizado da URL: ${payload.event}`);
    }

    // Evolution API não manda apikey no webhook — só rejeitar se vier errada
    const expectedKey = this.config.get<string>('EVOLUTION_API_KEY', '');
    if (expectedKey && apikey && apikey !== expectedKey) {
      this.logger.warn(`[WEBHOOK] apikey inválida recebida`);
      throw new UnauthorizedException('Webhook apikey inválida');
    }

    const tenantId = payload.instance;
    if (!tenantId) {
      this.logger.warn(`[WEBHOOK] Sem tenantId no payload`);
      return { ok: true };
    }

    const event = (payload.event ?? '').toLowerCase().replace(/_/g, '.');
    this.logger.log(`[WEBHOOK] Processando event="${event}" tenant="${tenantId.slice(0,8)}..."`);
    this.logger.debug(`[WEBHOOK] Data: ${JSON.stringify(payload.data ?? {}).slice(0, 200)}`);

    try {
      switch (event) {
        case 'connection.update':
          await this.handleConnectionUpdate(tenantId, payload.data);
          break;
        case 'qrcode.updated':
          this.logger.log(`[WEBHOOK] QRCODE_UPDATED recebido para ${tenantId.slice(0, 8)}…`);
          this.handleQrUpdated(tenantId, payload.data);
          break;
        case 'messages.upsert':
          await this.handleMessages(tenantId, payload.data);
          break;
        default:
          this.logger.debug(`[WEBHOOK] Evento ignorado: "${event}"`);
          break;
      }
    } catch (err) {
      this.logger.error(`[WEBHOOK] Erro processando ${event} tenant ${tenantId}`, err);
    }

    return { ok: true };
  }

  private async handleConnectionUpdate(tenantId: string, data: Record<string, unknown>): Promise<void> {
    const state = data['state'] as string | undefined;
    if (!state) return;

    let numero: string | undefined;
    // Evolution API pode incluir o número no campo 'wid' ou 'me'
    const me = data['me'] as { id?: string } | undefined;
    if (me?.id) numero = me.id.replace(/[^0-9]/g, '').replace(/:.*$/, '');

    this.clientManager.onConnectionUpdate(tenantId, state, numero);
  }

  private handleQrUpdated(tenantId: string, data: Record<string, unknown>): void {
    const qrcode = data['qrcode'] as { base64?: string; code?: string } | Record<string, unknown> | undefined;
    const nested = qrcode && typeof qrcode === 'object' ? qrcode : undefined;
    const payload =
      (typeof nested?.['base64'] === 'string' && nested['base64']) ||
      (typeof data['base64'] === 'string' && data['base64']) ||
      (typeof nested?.['code'] === 'string' && nested['code']) ||
      (typeof data['code'] === 'string' && data['code']) ||
      undefined;
    if (payload) {
      this.clientManager.onQrUpdated(tenantId, payload);
    } else {
      this.logger.warn(`[WEBHOOK] QRCODE_UPDATED sem payload utilizável: ${JSON.stringify(data).slice(0, 200)}`);
    }
  }

  private async handleMessages(tenantId: string, data: Record<string, unknown>): Promise<void> {
    const messages = data['messages'] as unknown[];
    if (!Array.isArray(messages)) return;

    for (const raw of messages) {
      const msg = raw as {
        key?: { remoteJid?: string; fromMe?: boolean; id?: string };
        message?: { conversation?: string; extendedTextMessage?: { text?: string } };
        messageType?: string;
        pushName?: string;
      };

      // Ignorar mensagens enviadas pelo próprio tenant
      if (msg.key?.fromMe) continue;

      const remoteJid = msg.key?.remoteJid;
      // Ignorar grupos (JID termina em @g.us)
      if (!remoteJid || remoteJid.endsWith('@g.us')) continue;

      const celular = remoteJid.replace(/@.*$/, '');
      const conteudo =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        `[${msg.messageType ?? 'media'}]`;

      await this.prisma.crmMensagem.create({
        data: {
          tenantId,
          celular,
          direcao:    'IN',
          conteudo,
          tipo:       'text',
          lida:       false,
          waMessageId: msg.key?.id,
        },
      });

      // Criar contato CRM se não existir (não sobrescreve nome existente)
      const existing = await this.prisma.crmContato.findFirst({ where: { tenantId, celular } });
      if (!existing) {
        const participante = await this.prisma.participante.findFirst({
          where: { tenantId, numeroCelular: { contains: celular.slice(-8) } },
          select: { id: true },
        });
        await this.prisma.crmContato.create({
          data: { tenantId, celular, nome: msg.pushName, participanteId: participante?.id },
        });
      }
    }
  }
}
