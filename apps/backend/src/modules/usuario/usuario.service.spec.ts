import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { UsuarioService } from './usuario.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PERFIL_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_USER = '22222222-2222-2222-2222-222222222222';

const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  papel: 'ADMIN',
  tenantId: TENANT_ID,
  celular: null,
      mfaEnrolled: false,
  permissoes: ['usuario.criar', 'usuario.editar'],
};

describe('UsuarioService', () => {
  let service: UsuarioService;
  let mockPrisma: {
    userProfile: {
      findFirst: jest.Mock; findMany: jest.Mock; upsert: jest.Mock;
    };
    perfil: { findMany: jest.Mock };
    usuarioPerfil: {
      findMany: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mockSupabase: {
    admin: {
      auth: {
        admin: {
          inviteUserByEmail: jest.Mock;
          deleteUser: jest.Mock;
          getUserById: jest.Mock;
        };
      };
    };
  };
  let mockAuth: { syncUserPermissions: jest.Mock };
  let mockAuditoria: { registrar: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      userProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      perfil: { findMany: jest.fn().mockResolvedValue([{ id: PERFIL_ID }]) },
      usuarioPerfil: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn) =>
        typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn),
      ),
    };

    mockSupabase = {
      admin: {
        auth: {
          admin: {
            inviteUserByEmail: jest.fn().mockResolvedValue({
              data: { user: { id: TARGET_USER, email: 'novo@test.com' } },
              error: null,
            }),
            deleteUser: jest.fn().mockResolvedValue({ error: null }),
            getUserById: jest.fn().mockResolvedValue({
              data: { user: { id: TARGET_USER, email: 'novo@test.com' } },
            }),
          },
        },
      },
    };

    mockAuth = { syncUserPermissions: jest.fn().mockResolvedValue([]) };
    mockAuditoria = { registrar: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuarioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: AuthService, useValue: mockAuth },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = module.get(UsuarioService);
  });

  describe('create', () => {
    it('rejeita perfis que não pertencem ao tenant', async () => {
      // Arrange — Prisma retorna nenhum perfil válido
      mockPrisma.perfil.findMany.mockResolvedValue([]);

      // Act / Assert
      await expect(
        service.create(ADMIN, TENANT_ID, {
          email: 'novo@test.com',
          perfilIds: [PERFIL_ID],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('convida usuário, cria user_profile, atribui perfis e sincroniza permissões', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue({
        id: TARGET_USER, tenantId: TENANT_ID, papel: 'ADMIN', celular: null,
      mfaEnrolled: false,
        criadoEm: new Date(), atualizadoEm: new Date(),
      });

      // Act
      const result = await service.create(ADMIN, TENANT_ID, {
        email: 'novo@test.com',
        celular: '83999998888',
        perfilIds: [PERFIL_ID],
      });

      // Assert
      expect(mockSupabase.admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        'novo@test.com',
        expect.objectContaining({
          data: expect.objectContaining({ tenant_id: TENANT_ID, papel: 'ADMIN' }),
        }),
      );
      expect(mockPrisma.userProfile.upsert).toHaveBeenCalled();
      expect(mockPrisma.usuarioPerfil.createMany).toHaveBeenCalledWith({
        data: [{ userId: TARGET_USER, perfilId: PERFIL_ID, atribuidoPor: ADMIN.id }],
        skipDuplicates: true,
      });
      expect(mockAuth.syncUserPermissions).toHaveBeenCalledWith(TARGET_USER);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'USUARIO_CRIADO' }),
      );
      expect(result).toBeDefined();
    });

    it('lança BusinessException quando Supabase Admin retorna erro', async () => {
      // Arrange
      mockSupabase.admin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: null,
        error: { message: 'rate limit exceeded' },
      });

      // Act / Assert
      await expect(
        service.create(ADMIN, TENANT_ID, {
          email: 'x@test.com',
          perfilIds: [PERFIL_ID],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  describe('atribuirPerfis', () => {
    it('lança NotFoundException quando o usuário não está no tenant', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(
        service.atribuirPerfis(ADMIN, TENANT_ID, TARGET_USER, { perfilIds: [PERFIL_ID] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('faz delta: remove perfis ausentes e adiciona novos', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue({
        id: TARGET_USER, tenantId: TENANT_ID, papel: 'ADMIN', celular: null,
      mfaEnrolled: false,
        criadoEm: new Date(), atualizadoEm: new Date(),
      });
      // Atribuição atual: [perfil-A]; nova: [perfil-B]
      const PERFIL_A = '33333333-3333-3333-3333-333333333333';
      const PERFIL_B = PERFIL_ID;

      // 1ª chamada (diff dentro de atribuirPerfis): apenas IDs.
      // 2ª chamada (findById no retorno): inclui `perfil` aninhado.
      mockPrisma.usuarioPerfil.findMany
        .mockResolvedValueOnce([{ perfilId: PERFIL_A }])
        .mockResolvedValueOnce([
          {
            userId: TARGET_USER,
            perfilId: PERFIL_B,
            perfil: { id: PERFIL_B, nome: 'Financeiro', sistema: false, permissoes: [] },
          },
        ]);
      mockPrisma.perfil.findMany.mockResolvedValue([{ id: PERFIL_B }]);

      // Act
      await service.atribuirPerfis(ADMIN, TENANT_ID, TARGET_USER, {
        perfilIds: [PERFIL_B],
      });

      // Assert
      expect(mockPrisma.usuarioPerfil.deleteMany).toHaveBeenCalledWith({
        where: { userId: TARGET_USER, perfilId: { in: [PERFIL_A] } },
      });
      expect(mockPrisma.usuarioPerfil.createMany).toHaveBeenCalledWith({
        data: [{ userId: TARGET_USER, perfilId: PERFIL_B, atribuidoPor: ADMIN.id }],
        skipDuplicates: true,
      });
      expect(mockAuth.syncUserPermissions).toHaveBeenCalledWith(TARGET_USER);
    });
  });

  describe('delete', () => {
    it('bloqueia auto-exclusão', async () => {
      // Arrange / Act / Assert
      await expect(
        service.delete(ADMIN, TENANT_ID, ADMIN.id),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança NotFoundException quando o usuário não está no tenant', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(
        service.delete(ADMIN, TENANT_ID, TARGET_USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Arrange / Act / Assert
      await expect(
        service.delete(ADMIN, null, TARGET_USER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('exclui via Supabase Admin e registra auditoria AVISO', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue({
        id: TARGET_USER, tenantId: TENANT_ID, papel: 'ADMIN', celular: null,
      mfaEnrolled: false,
        criadoEm: new Date(), atualizadoEm: new Date(),
      });

      // Act
      await service.delete(ADMIN, TENANT_ID, TARGET_USER);

      // Assert
      expect(mockSupabase.admin.auth.admin.deleteUser).toHaveBeenCalledWith(TARGET_USER);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'USUARIO_EXCLUIDO', severidade: 'AVISO' }),
      );
    });
  });
});
