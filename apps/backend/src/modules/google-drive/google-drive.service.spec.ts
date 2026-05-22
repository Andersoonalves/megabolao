import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { GoogleDriveService } from './google-drive.service';

// jest.mock é hoisted — factory NÃO pode referenciar variáveis do escopo do módulo
jest.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: jest.fn() },
    sheets: jest.fn(),
  },
}));

import { google } from 'googleapis';

const TENANT_ID = 'tenant-uuid-1';
const BOLAO_ID  = 'bolao-uuid-1';
const SHEET_ID  = 'sheet-id-abc';

const makeBolao = (status = 'EM_ANDAMENTO') => ({
  id: BOLAO_ID, tenantId: TENANT_ID, nome: 'Bolão', status, valorCota: 30, qtdNumerosCota: 10,
});

const makeRowValida = (nome = 'JOÃO', offset = 0): (string | number)[] => [
  nome, '83999990000',
  ...Array.from({ length: 10 }, (_, i) => i + 1 + offset),
];

const mockPrisma = {
  bolao: { findFirst: jest.fn() },
  cota: { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};

const mockTenantService = {
  assertTenantPermiteCadastros: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('val'),
};

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let mockValuesGet: jest.Mock;
  let mockValuesUpdate: jest.Mock;
  let mockValuesClear: jest.Mock;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockTenantService.assertTenantPermiteCadastros.mockResolvedValue(undefined);
    mockConfig.getOrThrow.mockReturnValue('val');

    mockValuesGet    = jest.fn();
    mockValuesUpdate = jest.fn();
    mockValuesClear  = jest.fn();

    jest.mocked(google.auth.GoogleAuth).mockImplementation(() => ({}) as never);
    jest.mocked(google.sheets).mockReturnValue({
      spreadsheets: { values: { get: mockValuesGet, update: mockValuesUpdate, clear: mockValuesClear } },
    } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleDriveService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<GoogleDriveService>(GoogleDriveService);
    jest.spyOn(service as unknown as { getAuth: () => unknown }, 'getAuth').mockReturnValue({});
  });

  // ── importarCotas ──────────────────────────────────────────────────────────

  describe('importarCotas', () => {
    it('importa cotas válidas da planilha', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockValuesGet.mockResolvedValue({ data: { values: [makeRowValida('MARIA'), makeRowValida('PEDRO', 10)] } });
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.cota.aggregate.mockResolvedValue({ _max: { numeroSequencial: 0 } });
      mockPrisma.cota.create.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce({ id: 'c2' });

      // Act
      const result = await service.importarCotas(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID });

      // Assert
      expect(result.criadas).toBe(2);
      expect(result.erros).toHaveLength(0);
      expect(mockPrisma.cota.create).toHaveBeenCalledTimes(2);
      expect(mockTenantService.assertTenantPermiteCadastros).toHaveBeenCalledWith(TENANT_ID);
    });

    it('lança BusinessException quando tenant não permite cadastros', async () => {
      mockTenantService.assertTenantPermiteCadastros.mockRejectedValueOnce(
        new BusinessException('TENANT_CADASTROS_BLOQUEADOS', 'Tenant suspenso'),
      );

      await expect(
        service.importarCotas(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(mockValuesGet).not.toHaveBeenCalled();
    });

    it('pula linhas vazias (sem nome)', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockValuesGet.mockResolvedValue({ data: { values: [['', '', ...Array(10).fill(1)]] } });

      // Act
      const result = await service.importarCotas(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID });

      // Assert
      expect(result.criadas).toBe(0);
      expect(mockPrisma.cota.create).not.toHaveBeenCalled();
    });

    it('registra erro para palpites inválidos e continua (ignorarErros=true)', async () => {
      // Arrange
      const linhaInvalida = ['CARLOS', '83111111111', 1, 1, 3, 4, 5, 6, 7, 8, 9, 10]; // 1 repetido
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockValuesGet.mockResolvedValue({ data: { values: [makeRowValida('MARIA'), linhaInvalida] } });
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.cota.aggregate.mockResolvedValue({ _max: { numeroSequencial: 0 } });
      mockPrisma.cota.create.mockResolvedValue({ id: 'c1' });

      // Act
      const result = await service.importarCotas(TENANT_ID, BOLAO_ID, {
        spreadsheetId: SHEET_ID, ignorarErros: true,
      });

      // Assert
      expect(result.criadas).toBe(1);
      expect(result.erros).toHaveLength(1);
      expect(result.erros[0].linha).toBe(3);
    });

    it('aborta na primeira linha inválida quando ignorarErros=false', async () => {
      // Arrange
      const linhaInvalida = ['CARLOS', '', 1, 1, 3, 4, 5, 6, 7, 8, 9, 10];
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockValuesGet.mockResolvedValue({ data: { values: [linhaInvalida, makeRowValida('VALIDA')] } });

      // Act
      const result = await service.importarCotas(TENANT_ID, BOLAO_ID, {
        spreadsheetId: SHEET_ID, ignorarErros: false,
      });

      // Assert
      expect(result.criadas).toBe(0);
      expect(result.erros).toHaveLength(1);
    });

    it('lança BusinessException quando bolão está FINALIZADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao('FINALIZADO'));

      // Act / Assert
      await expect(
        service.importarCotas(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança NotFoundException quando bolão não existe', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(
        service.importarCotas(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(
        service.importarCotas(null, BOLAO_ID, { spreadsheetId: SHEET_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── exportarResultados ─────────────────────────────────────────────────────

  describe('exportarResultados', () => {
    it('limpa aba e escreve ranking com header + dados', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makeBolao());
      mockPrisma.cota.findMany.mockResolvedValue([
        { id: 'c1', numeroSequencial: 213, nomeIdentificacao: 'ADERSON', numeroCelular: null, totalAcertosAcumulados: 10 },
      ]);
      mockValuesClear.mockResolvedValue({});
      mockValuesUpdate.mockResolvedValue({});

      // Act
      await service.exportarResultados(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID });

      // Assert
      expect(mockValuesClear).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: SHEET_ID }));
      expect(mockValuesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            values: expect.arrayContaining([
              ['Posição', 'Nº Cota', 'Nome', 'Celular', 'Acertos'],
              [1, 213, 'ADERSON', '', 10],
            ]),
          }),
        }),
      );
    });

    it('lança NotFoundException quando bolão não existe', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(
        service.exportarResultados(TENANT_ID, BOLAO_ID, { spreadsheetId: SHEET_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
