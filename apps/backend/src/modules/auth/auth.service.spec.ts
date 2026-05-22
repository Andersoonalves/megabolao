import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeSupabaseUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-uuid-123',
  email: 'admin@test.com',
  user_metadata: {
    papel: 'ADMIN',
    tenant_id: 'tenant-uuid-456',
    permissoes: ['bolao.ler', 'bolao.criar'],
    permissoes_rev: '2026-05-09T00:00:00Z',
    ...overrides,
  },
});

const mockSupabaseService = {
  admin: {
    auth: {
      getUser: jest.fn(),
      admin: {
        getUserById: jest.fn(),
        updateUserById: jest.fn(),
      },
    },
  },
};

const mockPrismaService = {
  usuarioPerfil: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── validateToken ──────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('retorna AuthenticatedUser para token válido de Admin', async () => {
      // Arrange
      const supabaseUser = makeSupabaseUser();
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: supabaseUser },
        error: null,
      });

      // Act
      const result = await service.validateToken('valid-token');

      // Assert
      expect(result).toMatchObject<AuthenticatedUser>({
        id: 'user-uuid-123',
        email: 'admin@test.com',
        papel: 'ADMIN',
        tenantId: 'tenant-uuid-456',
        celular: null,
      mfaEnrolled: false,
        permissoes: ['bolao.ler', 'bolao.criar'],
      });
    });

    it('atribui curinga * para MASTER independentemente do user_metadata', async () => {
      // Arrange
      const supabaseUser = makeSupabaseUser({ papel: 'MASTER', tenant_id: undefined, permissoes: undefined });
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: supabaseUser },
        error: null,
      });

      // Act
      const result = await service.validateToken('master-token');

      // Assert
      expect(result?.permissoes).toEqual(['*']);
    });

    it('retorna AuthenticatedUser para token válido de Master (tenantId null)', async () => {
      // Arrange
      const supabaseUser = makeSupabaseUser({ papel: 'MASTER', tenant_id: undefined });
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: supabaseUser },
        error: null,
      });

      // Act
      const result = await service.validateToken('master-token');

      // Assert
      expect(result?.papel).toBe('MASTER');
      expect(result?.tenantId).toBeNull();
    });

    it('retorna null quando Supabase retorna erro', async () => {
      // Arrange
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      // Act
      const result = await service.validateToken('expired-token');

      // Assert
      expect(result).toBeNull();
    });

    it('retorna null quando o usuário não existe no Supabase', async () => {
      // Arrange
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // Act
      const result = await service.validateToken('unknown-token');

      // Assert
      expect(result).toBeNull();
    });

    it('retorna null e não lança exceção quando Supabase lança erro inesperado', async () => {
      // Arrange
      mockSupabaseService.admin.auth.getUser.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.validateToken('any-token');

      // Assert — guard transforma null em UnauthorizedException; service apenas retorna null
      expect(result).toBeNull();
    });

    it('trata sessão OTP do portal (sem papel) como participante', async () => {
      // Arrange — usuário OTP não tem campo "papel" no user_metadata
      const supabaseUser = makeSupabaseUser({ papel: undefined, celular: '83999998888' });
      mockSupabaseService.admin.auth.getUser.mockResolvedValue({
        data: { user: supabaseUser },
        error: null,
      });

      // Act
      const result = await service.validateToken('otp-token');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.celular).toBe('83999998888');
    });
  });

  // ── resolveTenantId ────────────────────────────────────────────────────────

  describe('resolveTenantId', () => {
    const adminUser: AuthenticatedUser = {
      id: 'u1',
      email: 'a@b.com',
      papel: 'ADMIN',
      tenantId: 'tenant-abc',
      celular: null,
      mfaEnrolled: false,
      permissoes: [],
    };

    const masterUser: AuthenticatedUser = {
      id: 'u2',
      email: 'm@b.com',
      papel: 'MASTER',
      tenantId: null,
      celular: null,
      mfaEnrolled: false,
      permissoes: ['*'],
    };

    it('retorna tenant_id do JWT para Admin, ignorando header', () => {
      // Arrange / Act
      const result = service.resolveTenantId(adminUser, 'outro-tenant-id');

      // Assert — ADMIN não pode mudar de tenant via header
      expect(result).toBe('tenant-abc');
    });

    it('retorna o header tenant_id para Master quando informado', () => {
      // Arrange / Act
      const result = service.resolveTenantId(masterUser, 'tenant-xyz');

      // Assert — Master opera no tenant que escolher via header
      expect(result).toBe('tenant-xyz');
    });

    it('retorna null para Master quando nenhum header informado', () => {
      // Arrange / Act
      const result = service.resolveTenantId(masterUser, undefined);

      // Assert
      expect(result).toBeNull();
    });
  });
});
