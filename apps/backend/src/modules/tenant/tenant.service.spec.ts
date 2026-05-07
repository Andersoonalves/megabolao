import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePrismaTenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-uuid-1',
  nome: 'Bolão Teste',
  slug: 'bolao-teste',
  status: 'ATIVO',
  taxaAdministrativaPct: { toNumber: jest.fn().mockReturnValue(15) },
  branding: { corPrimaria: '#1F4E79' },
  criadoEm: new Date('2026-01-01T00:00:00Z'),
  atualizadoEm: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const mockPrisma = {
  tenant: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('cria tenant com sucesso', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(makePrismaTenant());

      // Act
      const result = await service.create({ nome: 'Bolão Teste', slug: 'bolao-teste' });

      // Assert
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'bolao-teste' }) }),
      );
      expect(result.taxaAdministrativaPct).toBe(15);
      expect(result.criadoEm).toBe('2026-01-01T00:00:00.000Z');
    });

    it('lança BusinessException quando slug já existe', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());

      // Act / Assert
      await expect(service.create({ nome: 'Outro', slug: 'bolao-teste' })).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });

    it('usa taxa administrativa padrão 15% quando não informada', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(makePrismaTenant());

      // Act
      await service.create({ nome: 'Bolão', slug: 'bolao' });

      // Assert
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxaAdministrativaPct: 15 }),
        }),
      );
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retorna lista paginada de tenants', async () => {
      // Arrange
      const tenants = [makePrismaTenant(), makePrismaTenant({ id: 'tenant-uuid-2' })];
      mockPrisma.$transaction.mockResolvedValue([tenants, 2]);

      // Act
      const result = await service.findAll({ page: 1, perPage: 20 });

      // Assert
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].taxaAdministrativaPct).toBe(15);
    });

    it('usa valores padrão de paginação quando não informados', async () => {
      // Arrange
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      // Act
      const result = await service.findAll({});

      // Assert
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(20);
      expect(result.totalPages).toBe(0);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retorna tenant existente', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());

      // Act
      const result = await service.findById('tenant-uuid-1');

      // Assert
      expect(result.id).toBe('tenant-uuid-1');
      expect(result.branding).toEqual({ corPrimaria: '#1F4E79' });
    });

    it('lança NotFoundException para tenant inexistente', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findById('id-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('atualiza tenant com sucesso', async () => {
      // Arrange
      const updated = makePrismaTenant({ nome: 'Novo Nome' });
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());
      mockPrisma.tenant.update.mockResolvedValue(updated);

      // Act
      const result = await service.update('tenant-uuid-1', { nome: 'Novo Nome' });

      // Assert
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-uuid-1' },
          data: expect.objectContaining({ nome: 'Novo Nome' }),
        }),
      );
      expect(result.nome).toBe('Novo Nome');
    });

    it('lança NotFoundException quando tenant não existe', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      // Act / Assert
      await expect(service.update('id-inexistente', { nome: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });

    it('lança BusinessException quando novo slug já está em uso por outro tenant', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());
      mockPrisma.tenant.findFirst.mockResolvedValue(makePrismaTenant({ id: 'outro-tenant' }));

      // Act / Assert
      await expect(
        service.update('tenant-uuid-1', { slug: 'slug-existente' }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });
  });

  // ── updateOwn ──────────────────────────────────────────────────────────────

  describe('updateOwn', () => {
    it('lança ForbiddenException quando tenantId é null', async () => {
      // Arrange / Act / Assert
      await expect(service.updateOwn(null, { nome: 'Novo' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ── deactivate ─────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('desativa tenant com sucesso', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());
      mockPrisma.tenant.update.mockResolvedValue(makePrismaTenant({ status: 'INATIVO' }));

      // Act
      await service.deactivate('tenant-uuid-1');

      // Assert
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-uuid-1' },
        data: { status: 'INATIVO' },
      });
    });

    it('lança NotFoundException para tenant inexistente', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      // Act / Assert
      await expect(service.deactivate('id-inexistente')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });
  });
});
