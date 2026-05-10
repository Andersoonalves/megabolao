import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PermissaoService } from './permissao.service';

describe('PermissaoService', () => {
  let service: PermissaoService;
  let mockPrisma: {
    modulo: { findMany: jest.Mock };
    permissao: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      modulo: { findMany: jest.fn() },
      permissao: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissaoService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(PermissaoService);
  });

  describe('listarCatalogo', () => {
    it('exclui módulos apenas_master por padrão (uso ADMIN)', async () => {
      // Arrange
      mockPrisma.modulo.findMany.mockResolvedValue([]);

      // Act
      await service.listarCatalogo();

      // Assert
      expect(mockPrisma.modulo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ativo: true, apenasMaster: false },
        }),
      );
    });

    it('inclui módulos apenas_master quando incluirMaster=true', async () => {
      // Arrange
      mockPrisma.modulo.findMany.mockResolvedValue([]);

      // Act
      await service.listarCatalogo(true);

      // Assert
      expect(mockPrisma.modulo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ativo: true } }),
      );
    });

    it('mapeia campos do Prisma para o formato shared-types', async () => {
      // Arrange
      mockPrisma.modulo.findMany.mockResolvedValue([
        {
          codigo: 'BOLAO',
          nome: 'Bolões',
          descricao: 'Gestão',
          ordem: 10,
          apenasMaster: false,
          ativo: true,
          permissoes: [
            {
              codigo: 'bolao.criar',
              moduloCodigo: 'BOLAO',
              nome: 'Criar bolão',
              descricao: null,
              apenasMaster: false,
            },
          ],
        },
      ]);

      // Act
      const result = await service.listarCatalogo();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].permissoes[0]).toEqual({
        codigo: 'bolao.criar',
        moduloCodigo: 'BOLAO',
        nome: 'Criar bolão',
        descricao: undefined,
        apenasMaster: false,
      });
    });
  });

  describe('listarCodigosValidos', () => {
    it('retorna apenas códigos não-master por padrão', async () => {
      // Arrange
      mockPrisma.permissao.findMany.mockResolvedValue([
        { codigo: 'bolao.criar' },
        { codigo: 'bolao.ler' },
      ]);

      // Act
      const result = await service.listarCodigosValidos();

      // Assert
      expect(result).toEqual(['bolao.criar', 'bolao.ler']);
      expect(mockPrisma.permissao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { apenasMaster: false } }),
      );
    });
  });
});
