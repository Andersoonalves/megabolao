import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MetaSendResult {
  messageId: string;
}

interface MetaTextPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: { type: string; text?: string }[];
  sub_type?: string;
  index?: number;
}

interface MetaTemplatePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: MetaTemplateComponent[];
  };
}

/**
 * Adapter para a API oficial do WhatsApp (Meta Cloud API v20).
 * Usado exclusivamente para mensagens individuais (número → número).
 * Envio para grupos permanece via Evolution API (WhatsAppClientManager).
 */
@Injectable()
export class MetaCloudApiService {
  private readonly logger = new Logger(MetaCloudApiService.name);
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    this.accessToken   = config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.enabled       = !!(this.phoneNumberId && this.accessToken);
    if (!this.enabled) {
      this.logger.warn('Meta Cloud API desabilitada — WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN ausentes');
    }
  }

  async enviarTexto(celular: string, texto: string): Promise<MetaSendResult> {
    this.assertEnabled();
    const to = this.normalizarNumero(celular);
    const payload: MetaTextPayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: texto },
    };
    return this.send(payload);
  }

  async enviarTemplate(
    celular: string,
    templateName: string,
    languageCode = 'pt_BR',
    components: MetaTemplateComponent[] = [],
  ): Promise<MetaSendResult> {
    this.assertEnabled();
    const to = this.normalizarNumero(celular);
    const payload: MetaTemplatePayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components }),
      },
    };
    return this.send(payload);
  }

  private async send(payload: MetaTextPayload | MetaTemplatePayload): Promise<MetaSendResult> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Meta Cloud API ${res.status}: ${body}`);
    }

    const data = await res.json() as { messages?: { id: string }[] };
    const messageId = data.messages?.[0]?.id ?? '';
    this.logger.log(`[META] Mensagem enviada → ${(payload.to as string).slice(0, 6)}*** id=${messageId}`);
    return { messageId };
  }

  /** Garante +55 e dígito 9 para celulares brasileiros. */
  private normalizarNumero(celular: string): string {
    const digits = celular.replace(/\D/g, '');
    if (digits.startsWith('55')) return digits;
    return `55${digits}`;
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error('Meta Cloud API não configurada (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN ausentes)');
    }
  }
}
