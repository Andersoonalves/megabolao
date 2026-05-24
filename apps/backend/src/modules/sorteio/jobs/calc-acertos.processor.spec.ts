import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CalcAcertosProcessor } from './calc-acertos.processor';
import { CalcAcertosJobData } from './calc-acertos.types';

// Mocka bullmq para não tentar conectar ao Redis nos testes
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-uuid-1';
const BOLAO_ID   = 'bolao-uuid-1';
const SORTEIO_ID = 'sorteio-uuid-1';

const makeJob = (data: CalcAcertosJobData): Partial<Job<CalcAcertosJobData>> => ({ id: 'job-1', data });

const makeSorteio = (processado = false) => ({
  id: SORTEIO_ID,
  tenantId: TENANT_ID,
  bolaoId: BOLAO_ID,
  numeroConcurso: 2994,
  bolasSorteadas: [1, 10, 23, 31, 40, 55],
  sequenciaNoBolao: 1,
  processado,
});

const makeCotas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `cota-${i}`,
    palpites: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10 + i],
  }));

const mockPrisma = {
  sorteio: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  bolao: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  cota: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  acertoSorteio: { createMany: jest.fn() },
  $executeRaw: jest.fn(),
};

// Bolão padrão sem ganhador (verificarPremiacaoPrincipal retorna cedo)
const makeBolaoAtivo = () => ({
  status: 'EM_ANDAMENTO',
  whatsappGrupos: [],
  qtdNumerosCota: 10,
});

const mockConfig = { get: jest.fn().mockReturnValue('redis://localhost:6379') };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CalcAcertosProcessor', () => {
  let processor: CalcAcertosProcessor;

  beforeEach(async () => {
    // resetAllMocks limpa filas de mockResolvedValueOnce (evita vazamento entre testes)
    // clearAllMocks NÃO limpa essas filas — resetAllMocks sim
    jest.resetAllMocks();

    // Re-setup do Worker mock (resetAllMocks remove a implementação)
    (Worker as unknown as jest.Mock).mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalcAcertosProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    processor = module.get<CalcAcertosProcessor>(CalcAcertosProcessor);
    processor.onModuleInit();
    expect(Worker as unknown as jest.Mock).toHaveBeenCalledTimes(1);
  });

  // ── Idempotência ───────────────────────────────────────────────────────────

  it('ignora sorteio já processado (idempotência)', async () => {
    // Arrange
    mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio(true));

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert — não processa nada
    expect(mockPrisma.cota.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.acertoSorteio.createMany).not.toHaveBeenCalled();
  });

  it('ignora job se sorteio não existe', async () => {
    // Arrange
    mockPrisma.sorteio.findFirst.mockResolvedValue(null);

    // Act
    await processor.processJob(makeJob({ sorteioId: 'inexistente', tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert — sem crash, sem processamento
    expect(mockPrisma.cota.findMany).not.toHaveBeenCalled();
  });

  // ── Processamento em lote ──────────────────────────────────────────────────

  it('processa cotas em batch de 500 e marca sorteio como processado', async () => {
    // Arrange — 3 cotas (< 1 batch)
    const cotas = makeCotas(3);
    mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio(false));
    mockPrisma.cota.findMany.mockResolvedValueOnce(cotas).mockResolvedValueOnce([]);
    mockPrisma.acertoSorteio.createMany.mockResolvedValue({ count: 3 });
    mockPrisma.$executeRaw.mockResolvedValue(3);
    mockPrisma.sorteio.update.mockResolvedValue(makeSorteio(true));
    mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoAtivo());
    mockPrisma.cota.findFirst.mockResolvedValue(null); // sem ganhador

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert
    expect(mockPrisma.acertoSorteio.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(mockPrisma.sorteio.update).toHaveBeenCalledWith({
      where: { id: SORTEIO_ID },
      data: { processado: true },
    });
  });

  it('usa skipDuplicates=true para garantir idempotência no createMany', async () => {
    // Arrange
    mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio(false));
    mockPrisma.cota.findMany.mockResolvedValueOnce(makeCotas(2)).mockResolvedValueOnce([]);
    mockPrisma.acertoSorteio.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.$executeRaw.mockResolvedValue(2);
    mockPrisma.sorteio.update.mockResolvedValue({});
    mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoAtivo());
    mockPrisma.cota.findFirst.mockResolvedValue(null); // sem ganhador

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert
    const createManyCall = mockPrisma.acertoSorteio.createMany.mock.calls[0][0] as { skipDuplicates: boolean };
    expect(createManyCall.skipDuplicates).toBe(true);
  });

  it('calcula acertos corretamente para o bolão de referência', async () => {
    // Arrange — cota com palpites [1,7,8,14,15,23,26,32,42,55]
    // Bolas sorteadas: [1,10,23,31,40,55] → acertos: 1,23,55 = 3
    const cotaRef = { id: 'cota-213', palpites: [1, 7, 8, 14, 15, 23, 26, 32, 42, 55] };
    const sorteioRef = { ...makeSorteio(false), bolasSorteadas: [1, 10, 23, 31, 40, 55] };

    mockPrisma.sorteio.findFirst.mockResolvedValue(sorteioRef);
    mockPrisma.cota.findMany.mockResolvedValueOnce([cotaRef]).mockResolvedValueOnce([]);
    mockPrisma.acertoSorteio.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.sorteio.update.mockResolvedValue({});
    mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoAtivo());
    mockPrisma.cota.findFirst.mockResolvedValue(null); // sem ganhador

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert — acertos = 3 (bolas 1, 23, 55)
    const createManyData = (mockPrisma.acertoSorteio.createMany.mock.calls[0][0] as { data: { acertos: number }[] }).data;
    expect(createManyData[0].acertos).toBe(3);
  });

  // ── Premiação principal ────────────────────────────────────────────────────

  it('marca bolão como PREMIADO quando cota atinge qtdNumerosCota acertos', async () => {
    // Arrange
    mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio(false));
    mockPrisma.cota.findMany.mockResolvedValueOnce(makeCotas(1)).mockResolvedValueOnce([]);
    mockPrisma.acertoSorteio.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.sorteio.update.mockResolvedValue({});
    mockPrisma.bolao.findFirst.mockResolvedValue(makeBolaoAtivo());
    mockPrisma.cota.findFirst.mockResolvedValue({ id: 'cota-ganhador' }); // ganhador detectado
    mockPrisma.bolao.update.mockResolvedValue({});

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert — bolão atualizado para PREMIADO
    expect(mockPrisma.bolao.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PREMIADO' }) }),
    );
  });

  it('não marca PREMIADO se bolão já está PREMIADO (idempotência)', async () => {
    // Arrange
    mockPrisma.sorteio.findFirst.mockResolvedValue(makeSorteio(false));
    mockPrisma.cota.findMany.mockResolvedValueOnce(makeCotas(1)).mockResolvedValueOnce([]);
    mockPrisma.acertoSorteio.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.sorteio.update.mockResolvedValue({});
    mockPrisma.bolao.findFirst.mockResolvedValue({ ...makeBolaoAtivo(), status: 'PREMIADO' });

    // Act
    await processor.processJob(makeJob({ sorteioId: SORTEIO_ID, tenantId: TENANT_ID, bolaoId: BOLAO_ID }) as Job<CalcAcertosJobData>);

    // Assert — bolão.update NÃO chamado
    expect(mockPrisma.bolao.update).not.toHaveBeenCalled();
  });
});
