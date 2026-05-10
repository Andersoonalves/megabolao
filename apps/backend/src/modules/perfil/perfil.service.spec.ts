import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissaoService } from '../permissao/permissao.service';
import { PrismaService } from '../prisma/prisma.service';
import { PerfilService } from './perfil.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const ADMIN_USER: AuthenticatedUser = {
  id: 'user-admin-1',
  email: 'admin@test.com',
  papel: 'ADMIN',
  tenantId: TENANT_ID,
  celular: null,
  permissoes: ['perfil.criar', 'perfil.editar', 'bolao.ler', 'bolao.criar', 'relatorio.gerar'],
};

const MASTER_USER: AuthenticatedUser = {
  id: 'user-master-1',
  email: 'master@test.com',
  papel: 'MASTER',
  tenantId: null,
  celular: null,
  permissoes: ['*'],
};

const makePerfilDb = (overrides: Record<string, unknown> = {}) => ({
  id: 'perfil-1',
  tenantId: TENANT_ID,
  nome: 'Financeiro',
  descricao: null,
  prioridade: 100,
  ativo: true,
  sistema: false,
  permissoes: [
    { perfilId: 'perfil-1', permissaoCodigo: 'bolao.ler' },
    { perfilId: 'perfil-1', permissaoCodigo: 'relatorio.gerar' },
  ],
  _count: { usuarios: 0 },
  criadoEm: new Date('2026-05-09T00:00:00Z'),
  atualizadoEm: new Date('2026-05-09T00:00:00Z'),
  ...overrides,
});

describe('PerfilService', () => {
  let service: PerfilService;
  let mockPrisma: {
    perfil: {
      findFirst: jest.Mock; findFirstOrThrow: jest.Mock; findMany: jest.Mock;
      create: jest.Mock; update: jest.Mock; delete: jest.Mock;
    };
    perfilPermissao: { createMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mockAuth: { syncPerfilPermissions: jest.Mock };
  let mockAuditoria: { registrar: jest.Mock };
  let mockPermissoes: { listarCodigosValidos: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      perfil: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      perfilPermissao: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn) =>
        typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn),
      ),
    };

    mockAuth = { syncPerfilPermissions: jest.fn().mockResolvedValue(0) };
    mockAuditoria = { registrar: jest.fn().mockResolvedValue(undefined) };
    mockPermissoes = {
      listarCodigosValidos: jest.fn().mockResolvedValue([
        'bolao.ler', 'bolao.criar', 'relatorio.gerar', 'perfil.criar',
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerfilService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuth },
        { provide: AuditoriaService, useValue: mockAuditoria },
        { provide: PermissaoService, useValue: mockPermissoes },
      ],
    }).compile();

    service = module.get(PerfilService);
  });

  describe('findAll', () => {
    it('lança ForbiddenException quando tenantId é null', async () => {
      // Arrange / Act / Assert
      await expect(service.findAll(null)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retorna perfis ordenados por prioridade desc', async () => {
      // Arrange
      mockPrisma.perfil.findMany.mockResolvedValue([makePerfilDb()]);

      // Act
      const result = await service.findAll(TENANT_ID);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].permissoes).toEqual(['bolao.ler', 'relatorio.gerar']);
      expect(mockPrisma.perfil.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: [{ prioridade: 'desc' }, { nome: 'asc' }],
        }),
      );
    });
  });

  describe('create', () => {
    it('cria perfil + atribui permissões + auditoria', async () => {
      // Arrange
      mockPrisma.perfil.create.mockResolvedValue({ id: 'perfil-novo' });
      mockPrisma.perfil.findFirstOrThrow.mockResolvedValue(makePerfilDb({ id: 'perfil-novo' }));

      // Act
      const result = await service.create(ADMIN_USER, TENANT_ID, {
        nome: 'Financeiro',
        permissoes: ['bolao.ler', 'relatorio.gerar'],
        prioridade: 100,
      });

      // Assert
      expect(mockPrisma.perfilPermissao.createMany).toHaveBeenCalledWith({
        data: [
          { perfilId: 'perfil-novo', permissaoCodigo: 'bolao.ler' },
          { perfilId: 'perfil-novo', permissaoCodigo: 'relatorio.gerar' },
        ],
      });
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'PERFIL_CRIADO' }),
      );
      expect(result.permissoes).toEqual(['bolao.ler', 'relatorio.gerar']);
    });

    it('rejeita permissões inexistentes no catálogo', async () => {
      // Arrange / Act / Assert
      await expect(
        service.create(ADMIN_USER, TENANT_ID, {
          nome: 'Bug',
          permissoes: ['bolao.ler', 'permissao.invalida'],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('ADMIN não pode delegar permissões que ele próprio não tem (anti-escalada)', async () => {
      // Arrange — admin não tem 'tenant.criar' (apenas MASTER tem)
      mockPermissoes.listarCodigosValidos.mockResolvedValue([
        'bolao.ler', 'tenant.criar',
      ]);

      // Act / Assert
      await expect(
        service.create(ADMIN_USER, TENANT_ID, {
          nome: 'Bug',
          permissoes: ['bolao.ler', 'tenant.criar'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('MASTER pode delegar qualquer permissão', async () => {
      // Arrange
      mockPermissoes.listarCodigosValidos.mockResolvedValue([
        'tenant.criar', 'tenant.editar',
      ]);
      mockPrisma.perfil.create.mockResolvedValue({ id: 'p1' });
      mockPrisma.perfil.findFirstOrThrow.mockResolvedValue(makePerfilDb({
        permissoes: [{ perfilId: 'p1', permissaoCodigo: 'tenant.criar' }],
      }));

      // Act
      const result = await service.create(MASTER_USER, TENANT_ID, {
        nome: 'Plataforma',
        permissoes: ['tenant.criar'],
      });

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('blinda perfis-sistema contra mudança de nome ou permissões', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb({ sistema: true, nome: 'Administrador' }));

      // Act / Assert — mudança de nome
      await expect(
        service.update(ADMIN_USER, TENANT_ID, 'perfil-1', { nome: 'Novo' }),
      ).rejects.toBeInstanceOf(BusinessException);

      // Act / Assert — mudança de permissões
      await expect(
        service.update(ADMIN_USER, TENANT_ID, 'perfil-1', { permissoes: ['bolao.ler'] }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('permite alterar prioridade/descrição/ativo de perfis-sistema', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb({ sistema: true }));
      mockPrisma.perfil.findFirstOrThrow.mockResolvedValue(makePerfilDb({ sistema: true, prioridade: 999 }));

      // Act
      const result = await service.update(ADMIN_USER, TENANT_ID, 'perfil-1', {
        prioridade: 999,
      });

      // Assert
      expect(result.prioridade).toBe(999);
    });

    it('chama syncPerfilPermissions quando as permissões são alteradas', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb());
      mockPrisma.perfil.findFirstOrThrow.mockResolvedValue(makePerfilDb({
        permissoes: [{ perfilId: 'perfil-1', permissaoCodigo: 'bolao.criar' }],
      }));

      // Act
      await service.update(ADMIN_USER, TENANT_ID, 'perfil-1', {
        permissoes: ['bolao.criar'],
      });

      // Assert
      expect(mockAuth.syncPerfilPermissions).toHaveBeenCalledWith('perfil-1');
    });
  });

  describe('delete', () => {
    it('lança NotFoundException quando perfil não existe', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(
        service.delete(ADMIN_USER, TENANT_ID, 'perfil-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blinda perfis-sistema contra exclusão', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb({ sistema: true }));

      // Act / Assert
      await expect(
        service.delete(ADMIN_USER, TENANT_ID, 'perfil-1'),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('rejeita exclusão de perfil em uso', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb({ _count: { usuarios: 3 } }));

      // Act / Assert
      await expect(
        service.delete(ADMIN_USER, TENANT_ID, 'perfil-1'),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('exclui perfil sem usuários atribuídos e registra auditoria AVISO', async () => {
      // Arrange
      mockPrisma.perfil.findFirst.mockResolvedValue(makePerfilDb());

      // Act
      await service.delete(ADMIN_USER, TENANT_ID, 'perfil-1');

      // Assert
      expect(mockPrisma.perfil.delete).toHaveBeenCalledWith({ where: { id: 'perfil-1' } });
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'PERFIL_EXCLUIDO', severidade: 'AVISO' }),
      );
    });
  });
});
