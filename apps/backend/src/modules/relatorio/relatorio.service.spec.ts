import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RelatorioService } from './relatorio.service';

// ── Mocks de libs pesadas ─────────────────────────────────────────────────────

// `import * as ExcelJS` → mock exporta Workbook diretamente (não via default)
jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    creator: '',
    created: null,
    addWorksheet: jest.fn().mockReturnValue({
      columns: [],
      addRow: jest.fn(),
      getRow: jest.fn().mockReturnValue({ font: {} }),
    }),
    xlsx: { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('xlsx')) },
  })),
}));

// pdfkit é CommonJS — factory retorna o constructor diretamente
jest.mock('pdfkit', () => {
  class MockPDF {
    private _listeners: Record<string, ((arg?: unknown) => void)[]> = {};

    page = {
      margins: { left: 40, right: 40, top: 40, bottom: 40 },
      width: 595.28,
      height: 841.89,
    };
    y = 40;

    fontSize      = jest.fn().mockReturnThis();
    font          = jest.fn().mockReturnThis();
    text          = jest.fn().mockReturnThis();
    moveDown      = jest.fn().mockReturnThis();
    rect          = jest.fn().mockReturnThis();
    roundedRect   = jest.fn().mockReturnThis();
    fill          = jest.fn().mockReturnThis();
    fillColor     = jest.fn().mockReturnThis();
    stroke        = jest.fn().mockReturnThis();
    fillAndStroke = jest.fn().mockReturnThis();
    lineWidth     = jest.fn().mockReturnThis();
    strokeColor   = jest.fn().mockReturnThis();
    circle        = jest.fn().mockReturnThis();
    moveTo        = jest.fn().mockReturnThis();
    lineTo        = jest.fn().mockReturnThis();
    addPage       = jest.fn().mockReturnThis();
    switchToPage  = jest.fn().mockReturnThis();
    bufferedPageRange = jest.fn().mockReturnValue({ start: 0, count: 1 });

    on(event: string, cb: (arg?: unknown) => void) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(cb);
      return this;
    }
    end() {
      process.nextTick(() => {
        (this._listeners['data'] ?? []).forEach((cb) => cb(Buffer.from('pdf')));
        (this._listeners['end']  ?? []).forEach((cb) => cb());
      });
    }
  }
  return MockPDF;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const BOLAO_ID  = 'bolao-uuid-1';

const makeDecimal = (n: number) => ({ toNumber: jest.fn().mockReturnValue(n) });

const makeBolao = () => ({
  id: BOLAO_ID,
  tenantId: TENANT_ID,
  nome: 'Bolão Teste',
  status: 'ENCERRADO',
  dataInicio: new Date('2026-01-01'),
  dataTermino: new Date('2026-04-23'),
  qtdNumerosCota: 10,
  valorCota: 30,
});

const mockPrisma = {
  bolao: { findFirst: jest.fn() },
  cota: { findMany: jest.fn() },
  premio: { findMany: jest.fn() },
  categoriaPremiacao: { findMany: jest.fn().mockResolvedValue([]) },
  sorteio: { findMany: jest.fn().mockResolvedValue([]) },
  acertoSorteio: { groupBy: jest.fn().mockResolvedValue([]) },
};

const mockStorage = {
  from: jest.fn().mockReturnValue({
    upload: jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://supabase.co/signed-url' } }),
  }),
};

const mockSupabase = { admin: { storage: mockStorage } };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RelatorioService', () => {
  let service: RelatorioService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Re-setup ExcelJS.Workbook após resetAllMocks (limpa implementação)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs') as { Workbook: jest.Mock };
    ExcelJS.Workbook.mockImplementation(() => ({
      creator: '',
      created: null,
      addWorksheet: jest.fn().mockReturnValue({
        columns: [],
        addRow: jest.fn(),
        getRow: jest.fn().mockReturnValue({ font: {} }),
      }),
      xlsx: { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('xlsx')) },
    }));

    mockStorage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
      createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://supabase.co/signed-url' } }),
    });

    // Reaplica defaults dos mocks Prisma após resetAllMocks
    mockPrisma.categoriaPremiacao.findMany.mockResolvedValue([]);
    mockPrisma.sorteio.findMany.mockResolvedValue([]);
    mockPrisma.acertoSorteio.groupBy.mockResolvedValue([]);
    mockPrisma.cota.findMany.mockResolvedValue([]);
    mockPrisma.premio.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelatorioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<RelatorioService>(RelatorioService);
  });

  // ── gerarXlsx ──────────────────────────────────────────────────────────────

  describe('gerarXlsx', () => {
    it('gera XLSX, faz upload e retorna URL assinada', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.cota.findMany.mockResolvedValue([
        { id: 'c1', numeroSequencial: 213, nomeIdentificacao: 'ADERSON', numeroCelular: null, totalAcertosAcumulados: 10 },
      ]);
      mockPrisma.premio.findMany.mockResolvedValue([
        {
          cota: { nomeIdentificacao: 'ADERSON', numeroSequencial: 213 },
          categoriaPremiacao: { nome: 'Premio Principal' },
          valorPorGanhador: makeDecimal(152526),
          statusPagamento: 'PENDENTE',
        },
      ]);

      // Act
      const result = await service.gerarXlsx(TENANT_ID, BOLAO_ID);

      // Assert
      expect(result.url).toContain('https://');
      expect(result.caminho).toContain(TENANT_ID);
      expect(result.caminho).toContain('.xlsx');
      expect(mockStorage.from).toHaveBeenCalledWith('relatorios');
    });

    it('lança NotFoundException quando bolão não existe', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.gerarXlsx(TENANT_ID, BOLAO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(service.gerarXlsx(null, BOLAO_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── gerarPdf ───────────────────────────────────────────────────────────────

  describe('gerarPdfBuffer', () => {
    it('gera PDF, faz upload com content-type correto e retorna URL', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.cota.findMany.mockResolvedValue([
        { id: 'c1', numeroSequencial: 213, nomeIdentificacao: 'ADERSON', numeroCelular: null, totalAcertosAcumulados: 10, statusPagamento: 'PAGO', palpites: [1,7,8,14,15,23,26,32,42,55] },
      ]);
      mockPrisma.premio.findMany.mockResolvedValue([]);

      // Act
      const result = await service.gerarPdfBuffer(TENANT_ID, BOLAO_ID);

      // Assert
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('.pdf');
    });

    it('lança NotFoundException quando bolão não existe', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.gerarPdfBuffer(TENANT_ID, BOLAO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
