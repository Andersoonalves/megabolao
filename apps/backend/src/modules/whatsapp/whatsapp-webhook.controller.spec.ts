import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_ID = '90f87ebf-5c73-43e0-b917-50224742be0e';

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  let prisma: { crmMensagem: { create: jest.Mock; findFirst: jest.Mock }; crmContato: { findFirst: jest.Mock; create: jest.Mock }; participante: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      crmMensagem: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      crmContato: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1', celular: '83999990000' }),
        create: jest.fn(),
      },
      participante: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        { provide: WhatsAppClientManager, useValue: { onConnectionUpdate: jest.fn(), onQrUpdated: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => '' } },
      ],
    }).compile();

    controller = module.get(WhatsAppWebhookController);
  });

  it('MESSAGES_UPSERT com data único (Evolution v2) persiste mensagem IN', async () => {
    await controller.handle(
      {
        event: 'messages.upsert',
        instance: TENANT_ID,
        data: {
          key: {
            id: 'WA_MSG_1',
            remoteJid: '5583999990000@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Oi, recebi sim' },
          messageType: 'conversation',
          pushName: 'João',
        },
      },
      '',
    );

    expect(prisma.crmMensagem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          celular: '83999990000',
          direcao: 'IN',
          conteudo: 'Oi, recebi sim',
        }),
      }),
    );
  });

  it('não falha se contato CRM já existir (unique P2002)', async () => {
    prisma.crmContato.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.crmContato.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      controller.handle(
        {
          event: 'messages.upsert',
          instance: TENANT_ID,
          data: {
            key: { id: 'WA_MSG_2', remoteJid: '5583999990000@s.whatsapp.net', fromMe: false },
            message: { conversation: 'segunda' },
          },
        },
        '',
      ),
    ).resolves.toEqual({ ok: true });

    expect(prisma.crmMensagem.create).toHaveBeenCalled();
  });

  it('ignora mensagens fromMe', async () => {
    await controller.handle(
      {
        event: 'messages.upsert',
        instance: TENANT_ID,
        data: {
          key: { id: 'x', remoteJid: '5583999990000@s.whatsapp.net', fromMe: true },
          message: { conversation: 'enviada por mim' },
        },
      },
      '',
    );

    expect(prisma.crmMensagem.create).not.toHaveBeenCalled();
  });
});
