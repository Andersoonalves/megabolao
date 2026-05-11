import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PortalService } from './portal.service';

const TENANT_ID = 'tenant-uuid-1';
const BOLAO_ID = 'bolao-uuid-1';
const CELULAR = '83999990000';

const decimal = (n: number) => ({ toNumber: () => n });

const mockPrisma = {
  cota: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  bolao: {
    findMany: jest.fn(),
  },
  userProfile: {
    findFirst: jest.fn(),
  },
};

describe('PortalService', () => {
  let service: PortalService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
  });

  describe('solicitarOtp', () => {
    it('retorna ok quando celular possui cotas em um tenant', async () => {
      // Arrange
      mockPrisma.cota.findMany.mockResolvedValue([{ tenantId: TENANT_ID }]);

      // Act
      const result = await service.solicitarOtp(CELULAR);

      // Assert
      expect(result).toEqual({ ok: true });
    });

    it('lança NotFoundException quando celular não possui cotas', async () => {
      // Arrange
      mockPrisma.cota.findMany.mockResolvedValue([]);

      // Act / Assert
      await expect(service.solicitarOtp(CELULAR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ConflictException quando celular aparece em múltiplos tenants', async () => {
      // Arrange
      mockPrisma.cota.findMany.mockResolvedValue([{ tenantId: TENANT_ID }, { tenantId: 'tenant-2' }]);

      // Act / Assert
      await expect(service.solicitarOtp(CELULAR)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resumo', () => {
    it('carrega bolões, cotas, sorteios e prêmios do celular autenticado', async () => {
      // Arrange
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      mockPrisma.bolao.findMany.mockResolvedValue([
        {
          id: BOLAO_ID,
          nome: 'Bolão Teste',
          status: 'FINALIZADO',
          valorCota: decimal(30),
          dataInicio: new Date('2026-04-01T00:00:00Z'),
          dataTermino: new Date('2026-04-23T00:00:00Z'),
          _count: { cotas: 1 },
          sorteios: [
            {
              id: 's1',
              numeroConcurso: 2994,
              dataSorteio: new Date('2026-04-09T00:00:00Z'),
              bolasSorteadas: [1, 10, 23, 31, 40, 55],
              sequenciaNoBolao: 1,
              processado: true,
            },
          ],
          cotas: [
            {
              id: 'c1',
              nomeIdentificacao: 'JOÃO DA SILVA',
              numeroSequencial: 213,
              palpites: [1, 7, 8, 14, 15, 23, 26, 32, 42, 55],
              statusPagamento: 'PAGO',
              dataConfirmacaoPagamento: null,
              totalAcertosAcumulados: 10,
              statusResultado: 'PREMIADO',
              premios: [
                {
                  id: 'p1',
                  categoriaPremiacao: { nome: 'Prêmio Principal' },
                  valorPorGanhador: decimal(1000),
                  statusPagamento: 'PENDENTE',
                  dataPagamento: null,
                },
              ],
            },
          ],
        },
      ]);

      // Act
      const result = await service.resumo({
        id: 'u1',
        email: '',
        papel: 'ADMIN',
        tenantId: TENANT_ID,
        celular: CELULAR,
        permissoes: [],
      });

      // Assert
      expect(result.participante.nome).toBe('JOÃO DA SILVA');
      expect(result.resumo.totalCotas).toBe(1);
      expect(result.resumo.totalPremios).toBe(1000);
      expect(result.boloes[0].valorBrutoArrecadado).toBe(30);
      expect(result.boloes[0].linkWhatsappOrganizador).toBeNull();
    });

    it('inclui link do WhatsApp do organizador quando o admin tem celular', async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValue({ celular: '(83) 9 8888-7777' });
      mockPrisma.bolao.findMany.mockResolvedValue([
        {
          id: BOLAO_ID,
          nome: 'Bolão Zap',
          status: 'EM_ANDAMENTO',
          valorCota: decimal(30),
          dataInicio: null,
          dataTermino: null,
          _count: { cotas: 1 },
          sorteios: [],
          cotas: [
            {
              id: 'c1',
              nomeIdentificacao: 'ANA',
              numeroSequencial: 1,
              palpites: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              statusPagamento: 'PAGO',
              dataConfirmacaoPagamento: null,
              totalAcertosAcumulados: 0,
              statusResultado: 'EM_ANDAMENTO',
              premios: [],
            },
          ],
        },
      ]);

      const result = await service.resumo({
        id: 'u1',
        email: '',
        papel: 'ADMIN',
        tenantId: TENANT_ID,
        celular: CELULAR,
        permissoes: [],
      });

      expect(result.boloes[0].linkWhatsappOrganizador).toContain('https://wa.me/5583988887777');
      expect(result.boloes[0].linkWhatsappOrganizador).toContain(encodeURIComponent('Bolão Zap'));
    });
  });

  describe('resumoPorCelular', () => {
    it('resolve o tenant pelo celular e carrega o resumo sem sessão OTP', async () => {
      // Arrange
      mockPrisma.cota.findMany.mockResolvedValue([{ tenantId: TENANT_ID }]);
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      mockPrisma.bolao.findMany.mockResolvedValue([
        {
          id: BOLAO_ID,
          nome: 'Bolão Direto',
          status: 'EM_ANDAMENTO',
          valorCota: decimal(30),
          dataInicio: null,
          dataTermino: null,
          _count: { cotas: 1 },
          sorteios: [],
          cotas: [
            {
              id: 'c1',
              nomeIdentificacao: 'MARIA',
              numeroSequencial: 10,
              palpites: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              statusPagamento: 'PAGO',
              dataConfirmacaoPagamento: null,
              totalAcertosAcumulados: 0,
              statusResultado: 'EM_ANDAMENTO',
              premios: [],
            },
          ],
        },
      ]);

      // Act
      const result = await service.resumoPorCelular(CELULAR);

      // Assert
      expect(result.participante.celular).toBe(CELULAR);
      expect(result.boloes[0].nome).toBe('Bolão Direto');
    });
  });

  describe('ranking', () => {
    it('bloqueia ranking de bolão sem cota do participante', async () => {
      // Arrange
      mockPrisma.cota.count.mockResolvedValue(0);

      // Act / Assert
      await expect(
        service.ranking({
          id: 'u1',
          email: '',
          papel: 'ADMIN',
          tenantId: TENANT_ID,
          celular: CELULAR,
          permissoes: [],
        }, BOLAO_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
