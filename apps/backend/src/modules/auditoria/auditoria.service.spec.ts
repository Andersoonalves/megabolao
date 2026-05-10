import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from './auditoria.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('AuditoriaService', () => {
  let service: AuditoriaService;
  let mockPrisma: {
    auditoria: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      auditoria: {
        create:   jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count:    jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((args) => {
        if (Array.isArray(args)) return Promise.all(args);
        return args(mockPrisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AuditoriaService);
  });

  describe('registrar', () => {
    it('persiste o evento com defaults (severidade INFO, detalhes vazio)', async () => {
      // Arrange
      const input = {
        tenantId: TENANT_ID,
        userId: 'u1',
        userEmail: 'a@b.com',
        acao: 'PERFIL_CRIADO',
        recurso: 'PERFIL',
        recursoId: 'p1',
      };

      // Act
      await service.registrar(input);

      // Assert
      expect(mockPrisma.auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          acao: 'PERFIL_CRIADO',
          severidade: 'INFO',
          detalhes: {},
        }),
      });
    });

    it('NUNCA propaga erros — falha de gravação não bloqueia operação de negócio', async () => {
      // Arrange
      mockPrisma.auditoria.create.mockRejectedValue(new Error('DB down'));

      // Act / Assert
      await expect(
        service.registrar({ tenantId: TENANT_ID, userId: null, acao: 'TESTE' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('listar', () => {
    it('lança ForbiddenException quando tenantId é null', async () => {
      // Arrange / Act / Assert
      await expect(service.listar(null)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('aplica filtros opcionais (acao, severidade) e paginação default', async () => {
      // Arrange
      mockPrisma.auditoria.findMany.mockResolvedValue([
        {
          id: 'a1',
          tenantId: TENANT_ID,
          userId: 'u1',
          userEmail: 'a@b.com',
          acao: 'PERFIL_CRIADO',
          recurso: 'PERFIL',
          recursoId: 'p1',
          severidade: 'INFO',
          detalhes: { foo: 'bar' },
          ip: null,
          userAgent: null,
          criadoEm: new Date('2026-05-09T10:00:00Z'),
        },
      ]);
      mockPrisma.auditoria.count.mockResolvedValue(1);

      // Act
      const result = await service.listar(TENANT_ID, {
        acao: 'PERFIL_CRIADO',
        severidade: 'INFO',
      });

      // Assert
      expect(mockPrisma.auditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            acao: 'PERFIL_CRIADO',
            severidade: 'INFO',
          }),
          orderBy: { criadoEm: 'desc' },
          take: 50,
          skip: 0,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.totalPages).toBe(1);
    });

    it('limita perPage a 200 quando excede o teto', async () => {
      // Arrange / Act
      await service.listar(TENANT_ID, { perPage: 1000 });

      // Assert
      expect(mockPrisma.auditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });
});
