import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BancoParticipanteService } from './banco-participante.service';

const TENANT_ID = 'tenant-uuid-1';

const mockTenantService = {
  assertTenantPermiteCadastros: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  participante: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  cota: { count: jest.fn() },
  $transaction: jest.fn(),
};

describe('BancoParticipanteService', () => {
  let service: BancoParticipanteService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BancoParticipanteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<BancoParticipanteService>(BancoParticipanteService);
  });

  describe('create', () => {
    it('lança BusinessException quando tenant não permite cadastros', async () => {
      mockTenantService.assertTenantPermiteCadastros.mockRejectedValueOnce(
        new BusinessException('TENANT_CADASTROS_BLOQUEADOS', 'Tenant suspenso'),
      );

      await expect(
        service.create(TENANT_ID, { nome: 'JOÃO', numeroCelular: '83999990000' }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.participante.findUnique).not.toHaveBeenCalled();
    });

    it('cria participante quando tenant está ativo', async () => {
      mockPrisma.participante.findUnique.mockResolvedValue(null);
      mockPrisma.participante.create.mockResolvedValue({
        id: 'p1',
        tenantId: TENANT_ID,
        nome: 'JOÃO',
        numeroCelular: '83999990000',
        email: null,
        observacoes: null,
        criadoEm: new Date('2026-01-01T00:00:00Z'),
        atualizadoEm: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await service.create(TENANT_ID, { nome: 'joão', numeroCelular: '83999990000' });

      expect(result.nome).toBe('JOÃO');
      expect(mockTenantService.assertTenantPermiteCadastros).toHaveBeenCalledWith(TENANT_ID);
      expect(mockPrisma.participante.create).toHaveBeenCalled();
    });
  });

  describe('assertTenantId', () => {
    it('lança Forbidden quando tenantId é null', async () => {
      await expect(service.create(null, { nome: 'X', numeroCelular: '83999990000' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
