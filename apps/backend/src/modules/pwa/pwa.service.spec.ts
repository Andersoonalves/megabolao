import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PwaService } from './pwa.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';

const makeTenant = (overrides: Record<string, unknown> = {}) => ({
  id: TENANT_ID,
  nome: 'Bolão Principal',
  slug: 'bolao-principal',
  branding: { corPrimaria: '#1F4E79', nomeCustomizado: 'Meu Bolão', logoUrl: 'https://cdn.ex.com/logo.png' },
  ...overrides,
});

const mockPrisma = { tenant: { findFirst: jest.fn() } };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PwaService', () => {
  let service: PwaService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PwaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PwaService>(PwaService);
  });

  // ── getManifest ────────────────────────────────────────────────────────────

  describe('getManifest', () => {
    it('retorna manifest com branding do tenant quando tenantId informado', async () => {
      // Arrange
      mockPrisma.tenant.findFirst.mockResolvedValue(makeTenant());

      // Act
      const result = await service.getManifest(TENANT_ID);

      // Assert
      expect(result.name).toBe('Meu Bolão');
      expect(result.theme_color).toBe('#1F4E79');
      expect(result.display).toBe('standalone');
      expect(result.lang).toBe('pt-BR');
    });

    it('retorna manifest padrão quando tenantId não informado', async () => {
      // Act
      const result = await service.getManifest(null);

      // Assert
      expect(result.name).toBe('NossoBolão');
      expect(result.theme_color).toBe('#1F4E79');
      expect(mockPrisma.tenant.findFirst).not.toHaveBeenCalled();
    });

    it('retorna manifest padrão quando tenant não existe', async () => {
      // Arrange
      mockPrisma.tenant.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.getManifest('tenant-inexistente');

      // Assert
      expect(result.name).toBe('NossoBolão');
    });

    it('usa nome do tenant quando nomeCustomizado não está definido', async () => {
      // Arrange
      mockPrisma.tenant.findFirst.mockResolvedValue(makeTenant({ branding: { corPrimaria: '#2E75B6' } }));

      // Act
      const result = await service.getManifest(TENANT_ID);

      // Assert
      expect(result.name).toBe('Bolão Principal');
      expect(result.theme_color).toBe('#2E75B6');
    });
  });

  // ── getTenantConfig ────────────────────────────────────────────────────────

  describe('getTenantConfig', () => {
    it('retorna config de branding do tenant', async () => {
      // Arrange
      mockPrisma.tenant.findFirst.mockResolvedValue(makeTenant());

      // Act
      const result = await service.getTenantConfig(TENANT_ID);

      // Assert
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.slug).toBe('bolao-principal');
      expect(result.logoUrl).toBe('https://cdn.ex.com/logo.png');
    });

    it('retorna config padrão quando tenantId é null', async () => {
      // Act
      const result = await service.getTenantConfig(null);

      // Assert
      expect(result.corPrimaria).toBe('#1F4E79');
      expect(result.nome).toBe('NossoBolão');
    });
  });
});
