import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SorteioService } from './sorteio.service';
import { CALC_ACERTOS_QUEUE } from './jobs/calc-acertos.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const BOLAO_ID  = 'bolao-uuid-1';
const SORTEIO_ID = 'sorteio-uuid-1';

const BOLAS_VALIDAS = [1, 10, 23, 31, 40, 55];

const makeBolao = (status = 'EM_ANDAMENTO') => ({
  id: BOLAO_ID, tenantId: TENANT_ID, nome: 'Bolão', status,
});

const makeSorteio = (overrides: Record<string, unknown> = {}) => ({
  id: SORTEIO_ID,
  tenantId: TENANT_ID,
  bolaoId: BOLAO_ID,
  numeroConcurso: 2994,
  dataSorteio: new Date('2026-04-09'),
  bolasSorteadas: BOLAS_VALIDAS,
  sequenciaNoBolao: 1,
  ehPrimeiro: true,
  processado: false,
  criadoEm: new Date('2026-04-09T00:00:00Z'),
  ...overrides,
});

const mockPrisma = {
  bolao: { findFirst: jest.fn() },
  sorteio: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockQueue = { add: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SorteioService', () => {
  let service: SorteioService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorteioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CALC_ACERTOS_QUEUE, useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SorteioService>(SorteioService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('registra sorteio válido e dispara job BullMQ', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.sorteio.aggregate.mockResolvedValue({ _max: { sequenciaNoBolao: 0 } });
      mockPrisma.sorteio.create.mockResolvedValue(makeSorteio());
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      // Act
      const result = await service.create(TENANT_ID, BOLAO_ID, {
        numeroConcurso: 2994,
        dataSorteio: '2026-04-09',
        bolasSorteadas: BOLAS_VALIDAS,
      });

      // Assert
      expect(result.sequenciaNoBolao).toBe(1);
      expect(result.ehPrimeiro).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'calc-acertos',
        expect.objectContaining({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID }),
        expect.objectContaining({ jobId: SORTEIO_ID }),
      );
    });

    it('primeiro sorteio tem sequenciaNoBolao=1 e ehPrimeiro=true', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.sorteio.aggregate.mockResolvedValue({ _max: { sequenciaNoBolao: null } });
      mockPrisma.sorteio.create.mockResolvedValue(makeSorteio({ sequenciaNoBolao: 1, ehPrimeiro: true }));
      mockQueue.add.mockResolvedValue({});

      // Act
      await service.create(TENANT_ID, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: BOLAS_VALIDAS });

      // Assert — nextSeq = (null ?? 0) + 1 = 1
      expect(mockPrisma.sorteio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequenciaNoBolao: 1, ehPrimeiro: true }),
        }),
      );
    });

    it('lança BusinessException quando bolão não está EM_ANDAMENTO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao('A_SER_INICIADO'));

      // Act / Assert
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: BOLAS_VALIDAS }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('lança BusinessException quando bolas sorteadas são inválidas (repetidas)', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());

      // Act / Assert — número 1 repetido
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: [1,1,23,31,40,55] }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando bolas sorteadas têm número > 60', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());

      // Act / Assert
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: [1,10,23,31,40,61] }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando concurso já registrado (P2002)', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.$transaction.mockRejectedValue({ code: 'P2002' });

      // Act / Assert
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: BOLAS_VALIDAS }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(
        service.create(null, BOLAO_ID, { numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: BOLAS_VALIDAS }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retorna sorteios ordenados por sequenciaNoBolao', async () => {
      // Arrange
      mockPrisma.sorteio.findMany.mockResolvedValue([
        makeSorteio({ sequenciaNoBolao: 1 }),
        makeSorteio({ id: 'sorteio-2', sequenciaNoBolao: 2 }),
      ]);

      // Act
      const result = await service.findAll(TENANT_ID, BOLAO_ID);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockPrisma.sorteio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sequenciaNoBolao: 'asc' } }),
      );
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retorna sorteio existente com bolas sorteadas', async () => {
      // Arrange
      mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio());

      // Act
      const result = await service.findById(TENANT_ID, BOLAO_ID, SORTEIO_ID);

      // Assert
      expect(result.bolasSorteadas).toEqual(BOLAS_VALIDAS);
      expect(result.dataSorteio).toBe('2026-04-09');
    });

    it('lança NotFoundException quando sorteio não existe', async () => {
      // Arrange
      mockPrisma.sorteio.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findById(TENANT_ID, BOLAO_ID, 'inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── reprocessar ────────────────────────────────────────────────────────────

  describe('reprocessar', () => {
    it('reseta processado=false e dispara novo job com jobId único', async () => {
      // Arrange
      mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio({ processado: true }));
      mockPrisma.sorteio.update.mockResolvedValue(makeSorteio({ processado: false }));
      mockQueue.add.mockResolvedValue({ id: 'retry-job' });

      // Act
      const result = await service.reprocessar(TENANT_ID, BOLAO_ID, SORTEIO_ID);

      // Assert
      expect(result.processado).toBe(false);
      expect(mockPrisma.sorteio.update).toHaveBeenCalledWith({
        where: { id: SORTEIO_ID },
        data: { processado: false },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'calc-acertos',
        expect.any(Object),
        expect.objectContaining({ jobId: expect.stringContaining('retry-') }),
      );
    });
  });
});
