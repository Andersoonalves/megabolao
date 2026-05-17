import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { WhatsAppClientManager } from '../whatsapp/whatsapp-client-manager.service';
import { BolaoService } from './bolao.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';

const makeDecimal = (n: number) => ({ toNumber: jest.fn().mockReturnValue(n) });

const makeCat = (overrides: Partial<CreateCategoriaDto> = {}): CreateCategoriaDto => ({
  nome: 'Taxa Admin',
  tipo: 'TAXA_ADMINISTRATIVA',
  percentual: 15,
  ...overrides,
} as CreateCategoriaDto);

const makeCategoriasValidas = (): CreateCategoriaDto[] => [
  makeCat({ nome: 'Taxa Admin', tipo: 'TAXA_ADMINISTRATIVA', percentual: 15 }),
  makeCat({ nome: 'Premio', tipo: 'ACERTOS_EXATOS', acertosAlvo: 10, percentual: 85 }),
];

const makePrismaBolao = (overrides: Record<string, unknown> = {}) => ({
  id: 'bolao-uuid-1',
  tenantId: TENANT_ID,
  nome: 'Bolão Teste',
  status: 'A_SER_INICIADO',
  valorCota: makeDecimal(30),
  dataInicio: null,
  dataTermino: null,
  criadoEm: new Date('2026-01-01T00:00:00Z'),
  atualizadoEm: new Date('2026-01-01T00:00:00Z'),
  _count: { cotas: 0, sorteios: 0 },
  categoriasPremiacao: [
    {
      id: 'cat-1',
      nome: 'Taxa Admin',
      tipo: 'TAXA_ADMINISTRATIVA',
      acertosAlvo: null,
      sorteioReferencia: null,
      percentual: makeDecimal(15),
      acumulaSemGanhador: false,
      valorAcumuladoAnterior: makeDecimal(0),
      ordem: 1,
    },
    {
      id: 'cat-2',
      nome: 'Premio',
      tipo: 'ACERTOS_EXATOS',
      acertosAlvo: 10,
      sorteioReferencia: null,
      percentual: makeDecimal(85),
      acumulaSemGanhador: false,
      valorAcumuladoAnterior: makeDecimal(0),
      ordem: 2,
    },
  ],
  ...overrides,
});

const mockWaClient = {
  getGrupos: jest.fn().mockRejectedValue(new Error('WA off')),
};

const mockTenantService = {
  assertTenantPermiteCadastros: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  bolao: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  categoriaPremiacao: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('BolaoService', () => {
  let service: BolaoService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BolaoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppClientManager, useValue: mockWaClient },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<BolaoService>(BolaoService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('cria bolão com categorias válidas (soma=100%)', async () => {
      // Arrange
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
        fn(mockPrisma),
      );
      mockPrisma.bolao.create.mockResolvedValue({ id: 'bolao-uuid-1' });
      mockPrisma.categoriaPremiacao.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.bolao.findFirstOrThrow.mockResolvedValue(makePrismaBolao());

      // Act
      const result = await service.create(TENANT_ID, {
        nome: 'Bolão Teste',
        valorCota: 30,
        categorias: makeCategoriasValidas(),
      });

      // Assert
      expect(result.categorias).toHaveLength(2);
      expect(result.sorteiosRegistrados).toBe(0);
      expect(result.bolasJaSorteadas).toEqual([]);
      expect(result.valorCota).toBe(30);
      expect(result.status).toBe('A_SER_INICIADO');
      expect(mockTenantService.assertTenantPermiteCadastros).toHaveBeenCalledWith(TENANT_ID);
    });

    it('lança BusinessException quando tenant não permite cadastros (suspenso/inativo)', async () => {
      // Arrange
      mockTenantService.assertTenantPermiteCadastros.mockRejectedValueOnce(
        new BusinessException('TENANT_CADASTROS_BLOQUEADOS', 'Tenant suspenso'),
      );

      // Act / Assert
      await expect(
        service.create(TENANT_ID, { nome: 'X', valorCota: 10, categorias: makeCategoriasValidas() }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança BusinessException quando soma dos percentuais ≠ 100%', async () => {
      // Arrange — soma = 90
      const categorias: CreateCategoriaDto[] = [
        makeCat({ tipo: 'TAXA_ADMINISTRATIVA', percentual: 15 }),
        makeCat({ tipo: 'ACERTOS_EXATOS', acertosAlvo: 10, percentual: 75 }),
      ];

      // Act / Assert
      await expect(
        service.create(TENANT_ID, { nome: 'X', valorCota: 10, categorias }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando ACERTOS_EXATOS sem acertosAlvo', async () => {
      // Arrange — soma=100 mas sem acertosAlvo
      const categorias: CreateCategoriaDto[] = [
        makeCat({ tipo: 'TAXA_ADMINISTRATIVA', percentual: 15 }),
        makeCat({ tipo: 'ACERTOS_EXATOS', percentual: 85 }), // falta acertosAlvo
      ];

      // Act / Assert
      await expect(
        service.create(TENANT_ID, { nome: 'X', valorCota: 10, categorias }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando MAIOR_PONTUACAO_SORTEIO sem sorteioReferencia', async () => {
      // Arrange
      const categorias: CreateCategoriaDto[] = [
        makeCat({ tipo: 'TAXA_ADMINISTRATIVA', percentual: 15 }),
        makeCat({ tipo: 'MAIOR_PONTUACAO_SORTEIO', percentual: 85 }), // falta sorteioReferencia
      ];

      // Act / Assert
      await expect(
        service.create(TENANT_ID, { nome: 'X', valorCota: 10, categorias }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(
        service.create(null, { nome: 'X', valorCota: 10, categorias: makeCategoriasValidas() }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('filtra por tenantId e retorna paginado com categorias e sorteiosRegistrados', async () => {
      // Arrange
      mockPrisma.$transaction.mockResolvedValue([
        [
          makePrismaBolao({
            _count: { cotas: 12, sorteios: 3 },
            sorteios: [
              { bolasSorteadas: [4, 7, 12] },
              { bolasSorteadas: [7, 18, 23] },
            ],
          }),
        ],
        1,
      ]);

      // Act
      const result = await service.findAll(TENANT_ID, { page: 1, perPage: 20 });

      // Assert
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(20);
      expect(result.data[0].tenantId).toBe(TENANT_ID);
      expect(result.data[0].categorias).toHaveLength(2);
      expect(result.data[0].categorias[0].nome).toBe('Taxa Admin');
      expect(result.data[0].totalCotasAtivas).toBe(12);
      expect(result.data[0].valorBrutoArrecadado).toBe(360);
      expect(result.data[0].sorteiosRegistrados).toBe(3);
      expect(result.data[0].bolasJaSorteadas).toEqual([4, 7, 12, 18, 23]);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retorna bolão com categorias quando encontrado', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act
      const result = await service.findById(TENANT_ID, 'bolao-uuid-1');

      // Assert
      expect(result.id).toBe('bolao-uuid-1');
      expect(result.categorias).toHaveLength(2);
      expect(result.sorteiosRegistrados).toBe(0);
      expect(result.bolasJaSorteadas).toEqual([]);
    });

    it('mapeia sorteiosRegistrados a partir de _count.sorteios', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(
        makePrismaBolao({ _count: { cotas: 5, sorteios: 7 } }),
      );

      // Act
      const result = await service.findById(TENANT_ID, 'bolao-uuid-1');

      // Assert
      expect(result.sorteiosRegistrados).toBe(7);
      expect(result.totalCotasAtivas).toBe(5);
    });

    it('lança NotFoundException quando bolão não pertence ao tenant', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findById(TENANT_ID, 'outro-bolao')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('atualiza nome e valor quando status é A_SER_INICIADO', async () => {
      // Arrange
      const updated = makePrismaBolao({ nome: 'Novo Nome' });
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.bolao.update.mockResolvedValue(updated);

      // Act
      const result = await service.update(TENANT_ID, 'bolao-uuid-1', { nome: 'Novo Nome' });

      // Assert
      expect(mockPrisma.bolao.update).toHaveBeenCalled();
      expect(result.nome).toBe('Novo Nome');
    });

    it('lança BusinessException quando status não é A_SER_INICIADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'EM_ANDAMENTO' }));

      // Act / Assert
      await expect(
        service.update(TENANT_ID, 'bolao-uuid-1', { nome: 'X' }),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── updateCategorias ───────────────────────────────────────────────────────

  describe('updateCategorias', () => {
    it('substitui categorias quando soma=100% e bolão A_SER_INICIADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
        fn(mockPrisma),
      );
      mockPrisma.categoriaPremiacao.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.categoriaPremiacao.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.bolao.findFirstOrThrow.mockResolvedValue(makePrismaBolao());

      // Act
      const result = await service.updateCategorias(TENANT_ID, 'bolao-uuid-1', {
        categorias: makeCategoriasValidas(),
      });

      // Assert
      expect(mockPrisma.categoriaPremiacao.deleteMany).toHaveBeenCalledWith({
        where: { bolaoId: 'bolao-uuid-1', tenantId: TENANT_ID },
      });
      expect(result.categorias).toHaveLength(2);
    });

    it('lança BusinessException quando soma ≠ 100%', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act / Assert
      await expect(
        service.updateCategorias(TENANT_ID, 'bolao-uuid-1', {
          categorias: [makeCat({ percentual: 50 })],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── iniciar ────────────────────────────────────────────────────────────────

  describe('iniciar', () => {
    it('transiciona para EM_ANDAMENTO quando A_SER_INICIADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.bolao.update.mockResolvedValue(makePrismaBolao({ status: 'EM_ANDAMENTO' }));

      // Act
      const result = await service.iniciar(TENANT_ID, 'bolao-uuid-1');

      // Assert
      expect(mockPrisma.bolao.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EM_ANDAMENTO' } }),
      );
      expect(result.status).toBe('EM_ANDAMENTO');
    });

    it('lança BusinessException quando já está EM_ANDAMENTO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'EM_ANDAMENTO' }));

      // Act / Assert
      await expect(service.iniciar(TENANT_ID, 'bolao-uuid-1')).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando já está FINALIZADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'FINALIZADO' }));

      // Act / Assert
      await expect(service.iniciar(TENANT_ID, 'bolao-uuid-1')).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── finalizar ──────────────────────────────────────────────────────────────

  describe('finalizar', () => {
    it('transiciona para FINALIZADO quando EM_ANDAMENTO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'EM_ANDAMENTO' }));
      mockPrisma.bolao.update.mockResolvedValue(makePrismaBolao({ status: 'FINALIZADO' }));

      // Act
      const result = await service.finalizar(TENANT_ID, 'bolao-uuid-1');

      // Assert
      expect(result.status).toBe('FINALIZADO');
    });

    it('lança BusinessException quando não está EM_ANDAMENTO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'A_SER_INICIADO' }));

      // Act / Assert
      await expect(service.finalizar(TENANT_ID, 'bolao-uuid-1')).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('exclui bolão quando A_SER_INICIADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.bolao.delete.mockResolvedValue({});

      // Act
      await service.delete(TENANT_ID, 'bolao-uuid-1');

      // Assert
      expect(mockPrisma.bolao.delete).toHaveBeenCalledWith({ where: { id: 'bolao-uuid-1' } });
    });

    it('lança BusinessException quando status não é A_SER_INICIADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao({ status: 'EM_ANDAMENTO' }));

      // Act / Assert
      await expect(service.delete(TENANT_ID, 'bolao-uuid-1')).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.bolao.delete).not.toHaveBeenCalled();
    });
  });
});
