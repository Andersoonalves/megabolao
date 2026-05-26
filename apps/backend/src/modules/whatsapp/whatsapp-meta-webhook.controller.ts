import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface MetaWebhookEntry {
  changes: {
    value: {
      messages?: MetaIncomingMessage[];
      statuses?: MetaStatusUpdate[];
    };
  }[];
}

interface MetaIncomingMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type: string };
  audio?: { id: string };
  document?: { id: string; filename?: string };
  timestamp: string;
}

interface MetaStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient_id: string;
  errors?: { code: number; title: string }[];
}

@ApiExcludeController()
@Controller('whatsapp/meta/webhook')
export class WhatsAppMetaWebhookController {
  private readonly logger = new Logger(WhatsAppMetaWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Verificação do webhook pela Meta (GET com hub.challenge). */
  @Get()
  @Public()
  verify(
    @Query('hub.mode')         mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge')    challenge: string,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN', '');
    if (mode !== 'subscribe' || token !== expected) {
      this.logger.warn(`[META WEBHOOK] Verificação falhou: mode=${mode}`);
      throw new UnauthorizedException('Verify token inválido');
    }
    this.logger.log('[META WEBHOOK] Webhook verificado com sucesso');
    return challenge;
  }

  /** Recebe eventos da Meta (mensagens recebidas, atualizações de status). */
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handle(@Body() payload: { object: string; entry: MetaWebhookEntry[] }): Promise<{ ok: boolean }> {
    if (payload?.object !== 'whatsapp_business_account') {
      return { ok: true };
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { messages = [], statuses = [] } = change.value ?? {};

        for (const msg of messages) {
          await this.handleIncomingMessage(msg).catch(err =>
            this.logger.error(`[META WEBHOOK] Erro em mensagem ${msg.id}`, err),
          );
        }

        for (const status of statuses) {
          this.handleStatusUpdate(status);
        }
      }
    }

    return { ok: true };
  }

  private async handleIncomingMessage(msg: MetaIncomingMessage): Promise<void> {
    const celular = msg.from.startsWith('55') ? msg.from : `55${msg.from}`;
    const tipo    = this.mapTipo(msg.type);
    const conteudo = this.extractConteudo(msg);

    this.logger.log(`[META WEBHOOK] IN from=${celular.slice(0, 6)}*** tipo=${tipo}`);

    // Persiste no CRM — sem tenant_id pois Meta não tem conceito de instância por tenant.
    // TODO: mapear phone_number_id → tenant_id quando múltiplos números forem suportados.
    await this.prisma.crmMensagem.create({
      data: {
        tenantId: await this.resolveTenantId(),
        celular,
        direcao: 'IN',
        conteudo,
        tipo,
        lida: false,
        waMessageId: msg.id,
      },
    }).catch(err => {
      if ((err as { code?: string }).code === 'P2002') return; // duplicado — idempotente
      throw err;
    });
  }

  private handleStatusUpdate(status: MetaStatusUpdate): void {
    this.logger.log(`[META WEBHOOK] STATUS id=${status.id} → ${status.status}`);
    // TODO: atualizar status em mensagens_whatsapp quando id for rastreado
  }

  private mapTipo(type: string): 'text' | 'image' | 'document' | 'audio' {
    if (type === 'image')                          return 'image';
    if (type === 'document')                       return 'document';
    if (type === 'audio' || type === 'voice')      return 'audio';
    return 'text';
  }

  private extractConteudo(msg: MetaIncomingMessage): string {
    if (msg.text?.body)          return msg.text.body;
    if (msg.image?.caption)      return msg.image.caption;
    if (msg.document?.filename)  return `[documento: ${msg.document.filename}]`;
    return `[${msg.type}]`;
  }

  /** Resolve o tenant_id do número configurado em WHATSAPP_PHONE_NUMBER_ID. */
  private async resolveTenantId(): Promise<string> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const tenant = await this.prisma.tenant.findFirst({
      where: { whatsappPhoneNumberId: phoneNumberId },
      select: { id: true },
    });
    if (!tenant) throw new Error(`Tenant não encontrado para phone_number_id=${phoneNumberId}`);
    return tenant.id;
  }
}
