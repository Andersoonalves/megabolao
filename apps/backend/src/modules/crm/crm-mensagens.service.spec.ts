import { Test, TestingModule } from '@nestjs/testing';
import { CrmMensagensService } from './crm-mensagens.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientManager } from '../whatsapp/whatsapp-client-manager.service';

const TENANT_ID = 'tenant-1';

describe('CrmMensagensService', () => {
  let service: CrmMensagensService;
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([
      { id: '2', celular: '8396550382', direcao: 'IN', criadoEm: new Date('2026-05-19') },
      { id: '1', celular: '83996550382', direcao: 'OUT', criadoEm: new Date('2026-05-18') },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmMensagensService,
        {
          provide: PrismaService,
          useValue: {
            crmMensagem: { findMany, updateMany: jest.fn() },
            crmContato: { findFirst: jest.fn().mockResolvedValue(null) },
          },
        },
        { provide: WhatsAppClientManager, useValue: {} },
      ],
    }).compile();

    service = module.get(CrmMensagensService);
  });

  it('findAll busca por variantes de celular e retorna as mais recentes em ordem asc', async () => {
    const result = await service.findAll(TENANT_ID, '83996550382', 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          OR: expect.arrayContaining([
            expect.objectContaining({
              celular: expect.objectContaining({ in: expect.any(Array) }),
            }),
            { celular: { endsWith: '96550382' } },
          ]),
        },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      }),
    );
    expect(result[0]?.id).toBe('1');
    expect(result[1]?.id).toBe('2');
  });
});
