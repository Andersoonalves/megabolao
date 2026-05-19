import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isPrismaUniqueViolation,
  normalizarCelularCrm,
  prismaCelularWhere,
  variantesCelularCrm,
} from '../../common/utils/celular-crm.util';

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

  /** Evolution v2: `data` é a mensagem OU `data.messages` é um lote. */
  private collectIncomingMessages(data: Record<string, unknown>): Record<string, unknown>[] {
    const batch = data['messages'];
    if (Array.isArray(batch)) {
      return batch.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object');
    }
    if (data['key'] && typeof data['key'] === 'object') {
      return [data];
    }
    return [];
  }

  private extractMessageText(msg: Record<string, unknown>): string {
    const messageType = typeof msg['messageType'] === 'string' ? msg['messageType'] : 'media';
    const rawMessage = msg['message'];
    if (!rawMessage || typeof rawMessage !== 'object') {
      return `[${messageType}]`;
    }
    const envelope = rawMessage as Record<string, unknown>;
    const inner =
      envelope['ephemeralMessage'] && typeof envelope['ephemeralMessage'] === 'object'
        ? (envelope['ephemeralMessage'] as Record<string, unknown>)['message']
        : envelope;
    if (!inner || typeof inner !== 'object') {
      return `[${messageType}]`;
    }
    const body = inner as Record<string, unknown>;
    if (typeof body['conversation'] === 'string') return body['conversation'];
    const ext = body['extendedTextMessage'] as { text?: string } | undefined;
    if (typeof ext?.text === 'string') return ext.text;
    const img = body['imageMessage'] as { caption?: string } | undefined;
    if (typeof img?.caption === 'string') return img.caption;
    const vid = body['videoMessage'] as { caption?: string } | undefined;
    if (typeof vid?.caption === 'string') return vid.caption;
    return `[${messageType}]`;
  }

  private async handleMessages(tenantId: string, data: Record<string, unknown>): Promise<void> {
    const messages = this.collectIncomingMessages(data);
    if (messages.length === 0) {
      this.logger.debug(
        `[WEBHOOK] MESSAGES_UPSERT sem mensagens parseáveis: ${JSON.stringify(data).slice(0, 300)}`,
      );
      return;
    }

    for (const raw of messages) {
      const msg = raw as {
        key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string; addressingMode?: string };
        messageType?: string;
        pushName?: string;
      };

      if (msg.key?.fromMe) continue;

      const remoteJid = msg.key?.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@g.us')) continue;

      const jidParaNumero =
        msg.key?.addressingMode === 'lid' && msg.key?.remoteJidAlt
          ? msg.key.remoteJidAlt
          : remoteJid;
      const celular = normalizarCelularCrm(jidParaNumero.replace(/@.*$/, ''));
      if (!celular || celular.length < 8) {
        this.logger.warn(`[WEBHOOK] JID sem celular válido: ${remoteJid}`);
        continue;
      }

      const conteudo = this.extractMessageText(raw);
      const waMessageId = msg.key?.id;

      const contatoExistente = await this.prisma.crmContato.findFirst({
        where: prismaCelularWhere(tenantId, celular),
        select: { celular: true },
        orderBy: { atualizadoEm: 'desc' },
      });
      const celularMensagem = contatoExistente?.celular ?? celular;

      if (waMessageId) {
        const dup = await this.prisma.crmMensagem.findFirst({
          where: { tenantId, waMessageId },
          select: { id: true },
        });
        if (dup) continue;
      }

      await this.prisma.crmMensagem.create({
        data: {
          tenantId,
          celular: celularMensagem,
          direcao: 'IN',
          conteudo,
          tipo: 'text',
          lida: false,
          waMessageId,
        },
      });

      this.logger.log(`[WEBHOOK] CRM IN celular=${celularMensagem} len=${conteudo.length}`);

      await this.ensureContatoCrm(tenantId, celular, msg.pushName);
    }
  }

  private async ensureContatoCrm(
    tenantId: string,
    celular: string,
    pushName?: string,
  ): Promise<void> {
    const variants = variantesCelularCrm(celular);
    const existing = await this.prisma.crmContato.findFirst({
      where: {
        tenantId,
        celular: variants.length === 1 ? variants[0]! : { in: variants },
      },
    });
    if (existing) return;

    const participante = await this.prisma.participante.findFirst({
      where: { tenantId, numeroCelular: { contains: celular.slice(-8) } },
      select: { id: true, numeroCelular: true },
    });
    const celularContato = participante?.numeroCelular
      ? normalizarCelularCrm(participante.numeroCelular)
      : celular;

    const dupAgain = await this.prisma.crmContato.findFirst({
      where: {
        tenantId,
        celular: { in: variantesCelularCrm(celularContato) },
      },
    });
    if (dupAgain) return;

    try {
      await this.prisma.crmContato.create({
        data: {
          tenantId,
          celular: celularContato,
          nome: pushName,
          participanteId: participante?.id,
        },
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        this.logger.debug(`[WEBHOOK] Contato CRM já existe (${celularContato})`);
        return;
      }
      throw err;
    }
  }
}
