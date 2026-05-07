import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PremioService } from './premio.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-uuid-1';
const BOLAO_ID   = 'bolao-uuid-1';
const PREMIO_ID  = 'premio-uuid-1';

const makeDecimal = (n: number) => ({ toNumber: jest.fn().mockReturnValue(n) });

const makeCat = (overrides: Record<string, unknown> = {}) => ({
  id: 'cat-uuid-1',
  tenantId: TENANT_ID,
  bolaoId: BOLAO_ID,
  nome: 'Taxa Admin',
  tipo: 'TAXA_ADMINISTRATIVA',
  acertosAlvo: null,
  sorteioReferencia: null,
  percentual: makeDecimal(15),
  acumulaSemGanhador: false,
  valorAcumuladoAnterior: makeDecimal(0),
  ordem: 1,
  ...overrides,
});

const makeBolaoComCategorias = (statusBolao = 'FINALIZADO', categorias?: ReturnType<typeof makeCat>[]) => ({
  id: BOLAO_ID,
  tenantId: TENANT_ID,
  status: statusBolao,
  valorCota: makeDecimal(30),
  categoriasPremiacao: categorias ?? [
    makeCat({ tipo: 'TAXA_ADMINISTRATIVA', percentual: makeDecimal(15), ordem: 1 }),
    makeCat({ id: 'cat-uuid-2', tipo: 'ACERTOS_EXATOS', acertosAlvo: 10, percentual: makeDecimal(55), ordem: 2 }),
  ],
});

const makePrismaPremio = (overrides: Record<string, unknown> = {}) => ({
  id: PREMIO_ID,
  tenantId: TENANT_ID,
  bolaoId: BOLAO_ID,
  cotaId: 'cota-uuid-213',
  categoriaPremiacaoId: 'cat-uuid-2',
  valorTotalCategoria: makeDecimal(152526),
  valorPorGanhador: makeDecimal(152526),
  statusPagamento: 'PENDENTE',
  dataPagamento: null,
  criadoEm: new Date('2026-04-23T00:00:00Z'),
  atualizadoEm: new Date('2026-04-23T00:00:00Z'),
  cota: { nomeIdentificacao: 'ADERSON AMORIM RODOVIARIA', numeroSequencial: 213 },
  categoriaPremiacao: { nome: 'Premio Principal', tipo: 'ACERTOS_EXATOS', ordem: 2 },
  ...overrides,
});

const mockPrisma = {
  bolao: { findFirst: jest.fn() },
  sorteio: { count: jest.fn(), findFirst: jest.fn() },
  cota: { count: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  acertoSorteio: { aggregate: jest.fn(), findMany: jest.fn() },
  categoriaPremiacao: { update: jest.fn() },
  premio: { createMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PremioService', () => {
  let service: PremioService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PremioService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PremioService>(PremioService);
  });

  // ── calcular ───────────────────────────────────────────────────────────────

  describe('calcular', () => {
    it('lança BusinessException quando bolão não está FINALIZADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias('EM_ANDAMENTO'));

      // Act / Assert
      await expect(service.calcular(TENANT_ID, BOLAO_ID)).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando há sorteios não processados', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias());
      mockPrisma.sorteio.count
        .mockResolvedValueOnce(6)  // total
        .mockResolvedValueOnce(2); // pendentes

      // Act / Assert
      await expect(service.calcular(TENANT_ID, BOLAO_ID)).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando bolão não tem sorteios', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias());
      mockPrisma.sorteio.count
        .mockResolvedValueOnce(0)  // total = 0
        .mockResolvedValueOnce(0); // pendentes

      // Act / Assert
      await expect(service.calcular(TENANT_ID, BOLAO_ID)).rejects.toBeInstanceOf(BusinessException);
    });

    it('retorna prêmios existentes sem recalcular (idempotência)', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias());
      // Promise.all chama count duas vezes: total e pendentes
      mockPrisma.sorteio.count
        .mockResolvedValueOnce(6)  // total
        .mockResolvedValueOnce(0); // pendentes
      mockPrisma.premio.findMany.mockResolvedValue([makePrismaPremio()]);

      // Act
      const result = await service.calcular(TENANT_ID, BOLAO_ID);

      // Assert — retornou sem chamar createMany
      expect(result).toHaveLength(1);
      expect(mockPrisma.premio.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.cota.count).not.toHaveBeenCalled();
    });

    it('calcula ACERTOS_EXATOS e cria prêmios para vencedores', async () => {
      // Arrange — 1 vencedor com 10 acertos (cota 213)
      const categorias = [
        makeCat({ id: 'cat-tax', tipo: 'TAXA_ADMINISTRATIVA', percentual: makeDecimal(15), ordem: 1 }),
        makeCat({ id: 'cat-pri', tipo: 'ACERTOS_EXATOS', acertosAlvo: 10, percentual: makeDecimal(85), ordem: 2 }),
      ];
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias('FINALIZADO', categorias));
      mockPrisma.sorteio.count.mockResolvedValueOnce(6).mockResolvedValueOnce(0);
      mockPrisma.premio.findMany
        .mockResolvedValueOnce([]) // check idempotência: vazio
        .mockResolvedValueOnce([makePrismaPremio()]); // retorno final
      mockPrisma.cota.count.mockResolvedValue(1); // 1 cota PAGO
      mockPrisma.cota.findMany.mockResolvedValue([{ id: 'cota-uuid-213' }]); // 1 vencedor
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.premio.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await service.calcular(TENANT_ID, BOLAO_ID);

      // Assert
      expect(mockPrisma.premio.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              cotaId: 'cota-uuid-213',
              categoriaPremiacaoId: 'cat-pri',
            }),
          ]),
        }),
      );
      expect(result).toHaveLength(1);
    });

    // ── Caso crítico do CLAUDE.md: arredondamento ───────────────────────────

    it('arredonda valorPorGanhador: R$27.732 ÷ 22 = R$1.260,55', async () => {
      // Arrange — categoria 09 Pontos: 10% de 277.320 = 27.732 ; 22 vencedores
      // Math: 27732 / 22 = 1260,5454... → arredondar → 1260,55
      const categorias = [
        makeCat({ id: 'cat-9pts', tipo: 'ACERTOS_EXATOS', acertosAlvo: 9, percentual: makeDecimal(10), ordem: 1 }),
      ];
      const vencedores = Array.from({ length: 22 }, (_, i) => ({ id: `cota-${i}` }));
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias('FINALIZADO', categorias));
      mockPrisma.sorteio.count.mockResolvedValueOnce(6).mockResolvedValueOnce(0);
      mockPrisma.premio.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.cota.count.mockResolvedValue(9244); // 9244 cotas × R$30 = R$277.320
      mockPrisma.cota.findMany.mockResolvedValue(vencedores);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.premio.createMany.mockResolvedValue({ count: 22 });

      // Act
      await service.calcular(TENANT_ID, BOLAO_ID);

      // Assert
      const createCall = mockPrisma.premio.createMany.mock.calls[0][0] as {
        data: { valorTotalCategoria: number; valorPorGanhador: number }[];
      };
      expect(createCall.data[0].valorTotalCategoria).toBe(27732);
      expect(createCall.data[0].valorPorGanhador).toBe(1260.55);
    });

    it('acumula prêmio quando categoria tem acumulaSemGanhador=true e não há vencedor', async () => {
      // Arrange — categoria "09 Pontos" com acumula=true, nenhum vencedor
      const categorias = [
        makeCat({
          id: 'cat-acumula',
          tipo: 'ACERTOS_EXATOS',
          acertosAlvo: 9,
          percentual: makeDecimal(10),
          acumulaSemGanhador: true,
          ordem: 1,
        }),
      ];
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoComCategorias('FINALIZADO', categorias));
      mockPrisma.sorteio.count.mockResolvedValueOnce(6).mockResolvedValueOnce(0);
      mockPrisma.premio.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.cota.count.mockResolvedValue(100);
      mockPrisma.cota.findMany.mockResolvedValue([]); // nenhum vencedor
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.categoriaPremiacao.update.mockResolvedValue({});
      mockPrisma.premio.createMany.mockResolvedValue({ count: 0 });

      // Act
      await service.calcular(TENANT_ID, BOLAO_ID);

      // Assert — não cria prêmio, mas atualiza valorAcumuladoAnterior
      expect(mockPrisma.categoriaPremiacao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-acumula' },
          data: expect.objectContaining({ valorAcumuladoAnterior: 300 }), // 100 cotas × 30 × 10%
        }),
      );
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(service.calcular(null, BOLAO_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retorna lista de prêmios filtrada por tenant e bolão', async () => {
      // Arrange
      mockPrisma.premio.findMany.mockResolvedValue([makePrismaPremio()]);

      // Act
      const result = await service.findAll(TENANT_ID, BOLAO_ID);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].cotaNome).toBe('ADERSON AMORIM RODOVIARIA');
      expect(result[0].valorPorGanhador).toBe(152526);
      // Isolamento de tenant: query sempre inclui tenantId
      expect(mockPrisma.premio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_ID }) }),
      );
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retorna prêmio quando encontrado', async () => {
      // Arrange
      mockPrisma.premio.findFirst.mockResolvedValue(makePrismaPremio());

      // Act
      const result = await service.findById(TENANT_ID, BOLAO_ID, PREMIO_ID);

      // Assert
      expect(result.id).toBe(PREMIO_ID);
    });

    it('lança NotFoundException quando prêmio não existe', async () => {
      // Arrange
      mockPrisma.premio.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findById(TENANT_ID, BOLAO_ID, 'inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── pagar ──────────────────────────────────────────────────────────────────

  describe('pagar', () => {
    it('transiciona PENDENTE → PAGO e seta dataPagamento', async () => {
      // Arrange
      mockPrisma.premio.findFirst.mockResolvedValue(makePrismaPremio());
      mockPrisma.premio.update.mockResolvedValue(
        makePrismaPremio({ statusPagamento: 'PAGO', dataPagamento: new Date() }),
      );

      // Act
      const result = await service.pagar(TENANT_ID, BOLAO_ID, PREMIO_ID);

      // Assert
      expect(mockPrisma.premio.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusPagamento: 'PAGO',
            dataPagamento: expect.any(Date),
          }),
        }),
      );
      expect(result.statusPagamento).toBe('PAGO');
    });

    it('lança BusinessException quando prêmio já está PAGO', async () => {
      // Arrange
      mockPrisma.premio.findFirst.mockResolvedValue(makePrismaPremio({ statusPagamento: 'PAGO' }));

      // Act / Assert
      await expect(service.pagar(TENANT_ID, BOLAO_ID, PREMIO_ID)).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.premio.update).not.toHaveBeenCalled();
    });
  });

  // ── getRanking ─────────────────────────────────────────────────────────────

  describe('getRanking', () => {
    it('retorna ranking ordenado por total_acertos_acumulados DESC', async () => {
      // Arrange
      const cotas = [
        { id: 'c1', nomeIdentificacao: 'PRIMEIRO', numeroSequencial: 213, totalAcertosAcumulados: 10, statusPagamento: 'PAGO' },
        { id: 'c2', nomeIdentificacao: 'SEGUNDO',  numeroSequencial: 100, totalAcertosAcumulados: 8,  statusPagamento: 'PAGO' },
      ];
      mockPrisma.$transaction.mockResolvedValue([cotas, 2]);

      // Act
      const result = await service.getRanking(TENANT_ID, BOLAO_ID, { page: 1, perPage: 50 });

      // Assert
      expect(result.data[0].posicao).toBe(1);
      expect(result.data[0].totalAcertosAcumulados).toBe(10);
      expect(result.data[1].posicao).toBe(2);
      expect(result.total).toBe(2);
    });
  });
});
