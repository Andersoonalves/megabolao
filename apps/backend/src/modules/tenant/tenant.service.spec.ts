import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantService } from './tenant.service';

const ADMIN_CREATE = { adminEmail: 'admin@test.com', adminSenha: 'Senha@1234' } as const;

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
    delete: jest.fn().mockResolvedValue({}),
  },
  modulo: { findMany: jest.fn().mockResolvedValue([]) },
  moduloTenant: { createMany: jest.fn().mockResolvedValue({}) },
  perfil: {
    upsert: jest.fn().mockResolvedValue({ id: 'perfil-1', tenantId: 'tenant-uuid-1', nome: 'Administrador' }),
  },
  permissao: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  perfilPermissao: { createMany: jest.fn().mockResolvedValue({}) },
  userProfile: {
    create: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
  usuarioPerfil: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn(),
};

const mockSupabase = {
  admin: {
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin-user-1' } }, error: null }),
        updateUserById: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-apply defaults cleared by clearAllMocks
    mockPrisma.tenant.delete.mockResolvedValue({});
    mockPrisma.modulo.findMany.mockResolvedValue([]);
    mockPrisma.moduloTenant.createMany.mockResolvedValue({});
    mockPrisma.perfil.upsert.mockResolvedValue({ id: 'perfil-1', tenantId: 'tenant-uuid-1', nome: 'Administrador' });
    mockPrisma.permissao.findMany.mockResolvedValue([]);
    mockPrisma.permissao.createMany.mockResolvedValue({});
    mockPrisma.perfilPermissao.createMany.mockResolvedValue({});
    mockPrisma.userProfile.create.mockResolvedValue({});
    mockPrisma.userProfile.findFirst.mockResolvedValue(null);
    mockPrisma.userProfile.update.mockResolvedValue({});
    mockPrisma.usuarioPerfil.create.mockResolvedValue({});
    mockSupabase.admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'admin-user-1' } }, error: null });
    mockSupabase.admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseService, useValue: mockSupabase },
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
      const result = await service.create({ nome: 'Bolão Teste', slug: 'bolao-teste', ...ADMIN_CREATE });

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
      await expect(service.create({ nome: 'Outro', slug: 'bolao-teste', ...ADMIN_CREATE })).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });

    it('usa taxa administrativa padrão 15% quando não informada', async () => {
      // Arrange
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(makePrismaTenant());

      // Act
      await service.create({ nome: 'Bolão', slug: 'bolao', ...ADMIN_CREATE });

      // Assert
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxaAdministrativaPct: 15 }),
        }),
      );
    });
  });

  // ── assertTenantPermiteCadastros ───────────────────────────────────────────

  describe('assertTenantPermiteCadastros', () => {
    it('não lança quando tenant está ATIVO', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant({ status: 'ATIVO' }));

      await expect(service.assertTenantPermiteCadastros('tenant-uuid-1')).resolves.toBeUndefined();
    });

    it('lança BusinessException quando tenant está SUSPENSO', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant({ status: 'SUSPENSO' }));

      await expect(service.assertTenantPermiteCadastros('tenant-uuid-1')).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('lança BusinessException quando tenant está INATIVO', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant({ status: 'INATIVO' }));

      await expect(service.assertTenantPermiteCadastros('tenant-uuid-1')).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('lança NotFoundException quando tenant não existe', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.assertTenantPermiteCadastros('id-inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
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
    it('atualiza status do tenant (ATIVO → SUSPENSO)', async () => {
      // Arrange
      const updated = makePrismaTenant({ status: 'SUSPENSO' });
      mockPrisma.tenant.findUnique.mockResolvedValue(makePrismaTenant());
      mockPrisma.tenant.update.mockResolvedValue(updated);

      // Act
      await service.update('tenant-uuid-1', { status: 'SUSPENSO' });

      // Assert
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUSPENSO' }) }),
      );
    });

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
