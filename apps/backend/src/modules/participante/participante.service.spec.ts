import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipanteService } from './participante.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const BOLAO_ID  = 'bolao-uuid-1';
const COTA_ID   = 'cota-uuid-1';

const PALPITES_VALIDOS = [1, 7, 8, 14, 15, 23, 26, 32, 42, 55]; // 10 únicos, 1–60

const makePrismaBolao = (status = 'EM_ANDAMENTO') => ({
  id: BOLAO_ID,
  tenantId: TENANT_ID,
  nome: 'Bolão Teste',
  status,
});

const makePrismaCota = (overrides: Record<string, unknown> = {}) => ({
  id: COTA_ID,
  tenantId: TENANT_ID,
  bolaoId: BOLAO_ID,
  nomeIdentificacao: 'JOÃO DA SILVA',
  numeroCelular: '83999990000',
  numeroSequencial: 1,
  palpites: PALPITES_VALIDOS,
  statusPagamento: 'PENDENTE',
  dataConfirmacaoPagamento: null,
  totalAcertosAcumulados: 0,
  statusResultado: 'EM_ANDAMENTO',
  criadoEm: new Date('2026-01-01T00:00:00Z'),
  atualizadoEm: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const mockPrisma = {
  bolao: { findFirst: jest.fn() },
  cota: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ParticipanteService', () => {
  let service: ParticipanteService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipanteService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParticipanteService>(ParticipanteService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('cria cota com palpites válidos', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.cota.aggregate.mockResolvedValue({ _max: { numeroSequencial: 5 } });
      mockPrisma.cota.create.mockResolvedValue(makePrismaCota({ numeroSequencial: 6 }));

      // Act
      const result = await service.create(TENANT_ID, BOLAO_ID, {
        nomeIdentificacao: 'JOÃO DA SILVA',
        palpites: PALPITES_VALIDOS,
      });

      // Assert
      expect(result.numeroSequencial).toBe(6);
      expect(result.palpites).toEqual(PALPITES_VALIDOS);
    });

    it('primeiro numero_sequencial é 1 quando bolão não tem cotas', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
      mockPrisma.cota.aggregate.mockResolvedValue({ _max: { numeroSequencial: null } });
      mockPrisma.cota.create.mockResolvedValue(makePrismaCota({ numeroSequencial: 1 }));

      // Act
      await service.create(TENANT_ID, BOLAO_ID, {
        nomeIdentificacao: 'PRIMEIRO',
        palpites: PALPITES_VALIDOS,
      });

      // Assert — nextSeq = (null ?? 0) + 1 = 1
      expect(mockPrisma.cota.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numeroSequencial: 1 }) }),
      );
    });

    it('lança BusinessException quando bolão está FINALIZADO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao('FINALIZADO'));

      // Act / Assert
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { nomeIdentificacao: 'X', palpites: PALPITES_VALIDOS }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(
        service.create(null, BOLAO_ID, { nomeIdentificacao: 'X', palpites: PALPITES_VALIDOS }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ── Validações de palpites (casos críticos do CLAUDE.md) ─────────────────

    it('lança BusinessException quando palpites têm menos de 10 números', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act / Assert — apenas 9 números
      await expect(
        service.create(TENANT_ID, BOLAO_ID, { nomeIdentificacao: 'X', palpites: [1,2,3,4,5,6,7,8,9] }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando palpites têm mais de 10 números', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act / Assert — 11 números
      await expect(
        service.create(TENANT_ID, BOLAO_ID, {
          nomeIdentificacao: 'X',
          palpites: [1,2,3,4,5,6,7,8,9,10,11],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando palpite > 60', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act / Assert
      await expect(
        service.create(TENANT_ID, BOLAO_ID, {
          nomeIdentificacao: 'X',
          palpites: [1,2,3,4,5,6,7,8,9,61], // 61 > 60
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando palpites têm número repetido', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());

      // Act / Assert — número 1 repetido
      await expect(
        service.create(TENANT_ID, BOLAO_ID, {
          nomeIdentificacao: 'X',
          palpites: [1,1,3,4,5,6,7,8,9,10], // repetido
        }),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retorna cotas paginadas filtradas por tenant e bolão', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.$transaction.mockResolvedValue([[makePrismaCota()], 1]);

      // Act
      const result = await service.findAll(TENANT_ID, BOLAO_ID, { page: 1, perPage: 50 });

      // Assert
      expect(result.total).toBe(1);
      expect(result.data[0].bolaoId).toBe(BOLAO_ID);
    });

    it('lança NotFoundException quando bolão não pertence ao tenant', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findAll(TENANT_ID, 'bolao-errado', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retorna cota quando encontrada', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());

      // Act
      const result = await service.findById(TENANT_ID, BOLAO_ID, COTA_ID);

      // Assert
      expect(result.id).toBe(COTA_ID);
      expect(result.palpites).toEqual(PALPITES_VALIDOS);
    });

    it('lança NotFoundException quando cota não existe', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.findById(TENANT_ID, BOLAO_ID, 'id-errado')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('atualiza nome e palpites quando cota está PENDENTE', async () => {
      // Arrange
      const novoPalpites = [2,8,9,15,16,24,27,33,43,56];
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());
      mockPrisma.cota.update.mockResolvedValue(makePrismaCota({ nomeIdentificacao: 'NOVO NOME', palpites: novoPalpites }));

      // Act
      const result = await service.update(TENANT_ID, BOLAO_ID, COTA_ID, {
        nomeIdentificacao: 'NOVO NOME',
        palpites: novoPalpites,
      });

      // Assert
      expect(result.nomeIdentificacao).toBe('NOVO NOME');
    });

    it('lança BusinessException ao tentar editar cota PAGO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'PAGO' }));

      // Act / Assert
      await expect(
        service.update(TENANT_ID, BOLAO_ID, COTA_ID, { nomeIdentificacao: 'X' }),
      ).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando novos palpites são inválidos', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());

      // Act / Assert — palpites com repetição
      await expect(
        service.update(TENANT_ID, BOLAO_ID, COTA_ID, { palpites: [1,1,3,4,5,6,7,8,9,10] }),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── confirmarPagamento ─────────────────────────────────────────────────────

  describe('confirmarPagamento', () => {
    it('transiciona PENDENTE → PAGO e seta data de confirmação', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());
      mockPrisma.cota.update.mockResolvedValue(
        makePrismaCota({ statusPagamento: 'PAGO', dataConfirmacaoPagamento: new Date() }),
      );

      // Act
      const result = await service.confirmarPagamento(TENANT_ID, BOLAO_ID, COTA_ID);

      // Assert
      expect(mockPrisma.cota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusPagamento: 'PAGO',
            dataConfirmacaoPagamento: expect.any(Date),
          }),
        }),
      );
      expect(result.statusPagamento).toBe('PAGO');
    });

    it('lança BusinessException quando cota já está PAGO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'PAGO' }));

      // Act / Assert
      await expect(service.confirmarPagamento(TENANT_ID, BOLAO_ID, COTA_ID)).rejects.toBeInstanceOf(BusinessException);
    });

    it('lança BusinessException quando cota está INATIVO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'INATIVO' }));

      // Act / Assert
      await expect(service.confirmarPagamento(TENANT_ID, BOLAO_ID, COTA_ID)).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── inativar ───────────────────────────────────────────────────────────────

  describe('inativar', () => {
    it('inativa cota PAGO com sucesso', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'PAGO' }));
      mockPrisma.cota.update.mockResolvedValue(makePrismaCota({ statusPagamento: 'INATIVO' }));

      // Act
      const result = await service.inativar(TENANT_ID, BOLAO_ID, COTA_ID);

      // Assert
      expect(result.statusPagamento).toBe('INATIVO');
    });

    it('inativa cota PENDENTE com sucesso', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());
      mockPrisma.cota.update.mockResolvedValue(makePrismaCota({ statusPagamento: 'INATIVO' }));

      // Act
      const result = await service.inativar(TENANT_ID, BOLAO_ID, COTA_ID);

      // Assert
      expect(result.statusPagamento).toBe('INATIVO');
    });

    it('lança BusinessException quando cota já está INATIVO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'INATIVO' }));

      // Act / Assert
      await expect(service.inativar(TENANT_ID, BOLAO_ID, COTA_ID)).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('exclui cota PENDENTE com sucesso', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota());
      mockPrisma.cota.delete.mockResolvedValue({});

      // Act
      await service.delete(TENANT_ID, BOLAO_ID, COTA_ID);

      // Assert
      expect(mockPrisma.cota.delete).toHaveBeenCalledWith({ where: { id: COTA_ID } });
    });

    it('lança BusinessException ao tentar excluir cota PAGO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'PAGO' }));

      // Act / Assert
      await expect(service.delete(TENANT_ID, BOLAO_ID, COTA_ID)).rejects.toBeInstanceOf(BusinessException);
      expect(mockPrisma.cota.delete).not.toHaveBeenCalled();
    });

    it('lança BusinessException ao tentar excluir cota INATIVO', async () => {
      // Arrange
      mockPrisma.bolao.findFirst.mockResolvedValue(makePrismaBolao());
      mockPrisma.cota.findFirst.mockResolvedValue(makePrismaCota({ statusPagamento: 'INATIVO' }));

      // Act / Assert
      await expect(service.delete(TENANT_ID, BOLAO_ID, COTA_ID)).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
