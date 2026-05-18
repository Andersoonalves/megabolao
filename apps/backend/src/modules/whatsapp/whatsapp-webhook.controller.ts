import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, UnauthorizedException } from '@nestjs/common';
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

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() payload: EvolutionWebhookPayload,
    @Headers('apikey') apikey: string,
  ): Promise<{ ok: boolean }> {
    const expectedKey = this.config.get<string>('EVOLUTION_API_KEY', '');
    if (expectedKey && apikey !== expectedKey) {
      throw new UnauthorizedException('Webhook apikey inválida');
    }

    const tenantId = payload.instance;
    if (!tenantId) return { ok: true };

    try {
      switch (payload.event) {
        case 'connection.update':
          await this.handleConnectionUpdate(tenantId, payload.data);
          break;
        case 'qrcode.updated':
          this.handleQrUpdated(tenantId, payload.data);
          break;
        case 'messages.upsert':
          await this.handleMessages(tenantId, payload.data);
          break;
        default:
          // Ignorar outros eventos silenciosamente
          break;
      }
    } catch (err) {
      this.logger.error(`Erro processando webhook ${payload.event} tenant ${tenantId}`, err);
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
    const qrcode = data['qrcode'] as { base64?: string } | undefined;
    const base64 = qrcode?.base64;
    if (base64) this.clientManager.onQrUpdated(tenantId, base64);
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
