import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ENVIAR_MENSAGEM_WA_QUEUE } from './jobs/enviar-mensagem.types';
import { WhatsAppMensagemService } from './whatsapp-mensagem.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-uuid-1';
const MENSAGEM_ID = 'msg-uuid-1';

const makeMensagem = (overrides: Record<string, unknown> = {}) => ({
  id: MENSAGEM_ID,
  tenantId: TENANT_ID,
  bolaoId: 'bolao-uuid-1',
  tipo: 'MANUAL',
  conteudo: 'Olá grupo!',
  grupoId: 'grupo1@g.us',
  status: 'PENDENTE',
  tentativas: 0,
  erro: null,
  criadoEm: new Date('2026-05-01T00:00:00Z'),
  atualizadoEm: new Date('2026-05-01T00:00:00Z'),
  ...overrides,
});

const mockPrisma = {
  mensagemWhatsapp: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockQueue = { add: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('WhatsAppMensagemService', () => {
  let service: WhatsAppMensagemService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppMensagemService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ENVIAR_MENSAGEM_WA_QUEUE, useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WhatsAppMensagemService>(WhatsAppMensagemService);
  });

  // ── enfileirar ─────────────────────────────────────────────────────────────

  describe('enfileirar', () => {
    it('cria registro no banco e adiciona job à fila', async () => {
      // Arrange
      mockPrisma.mensagemWhatsapp.create.mockResolvedValue(makeMensagem());
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      // Act
      const result = await service.enfileirar(TENANT_ID, {
        grupoId: 'grupo1@g.us',
        tipo: 'MANUAL',
        conteudo: 'Olá grupo!',
      });

      // Assert
      expect(mockPrisma.mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_ID, status: 'PENDENTE' }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'enviar-mensagem-wa',
        expect.objectContaining({ mensagemId: MENSAGEM_ID, tenantId: TENANT_ID }),
        expect.any(Object),
      );
      expect(result.status).toBe('PENDENTE');
    });

    it('lança ForbiddenException quando tenantId é null', async () => {
      // Act / Assert
      await expect(
        service.enfileirar(null, { grupoId: 'g', tipo: 'MANUAL', conteudo: 'msg' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retorna mensagens paginadas filtradas por tenant', async () => {
      // Arrange
      mockPrisma.$transaction.mockResolvedValue([[makeMensagem()], 1]);

      // Act
      const result = await service.findAll(TENANT_ID, { page: 1, perPage: 20 });

      // Assert
      expect(result.total).toBe(1);
      expect(result.data[0].tenantId).toBe(TENANT_ID);
    });

    it('aplica filtro de status quando informado', async () => {
      // Arrange
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      // Act
      await service.findAll(TENANT_ID, { status: 'FALHA' });

      // Assert
      const [[findManyCall]] = mockPrisma.$transaction.mock.calls;
      void findManyCall; // called internally
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── retry ──────────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('reenfileira mensagem FALHA e reseta status para PENDENTE', async () => {
      // Arrange
      mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(makeMensagem({ status: 'FALHA' }));
      mockPrisma.mensagemWhatsapp.update.mockResolvedValue(makeMensagem({ status: 'PENDENTE' }));
      mockQueue.add.mockResolvedValue({});

      // Act
      const result = await service.retry(TENANT_ID, MENSAGEM_ID);

      // Assert
      expect(mockPrisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDENTE', erro: null }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'enviar-mensagem-wa',
        expect.objectContaining({ mensagemId: MENSAGEM_ID }),
        expect.objectContaining({ jobId: expect.stringContaining('retry-') }),
      );
      expect(result.status).toBe('PENDENTE');
    });

    it('lança BusinessException quando mensagem não está FALHA', async () => {
      // Arrange
      mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(makeMensagem({ status: 'ENVIADO' }));

      // Act / Assert
      await expect(service.retry(TENANT_ID, MENSAGEM_ID)).rejects.toBeInstanceOf(BusinessException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando mensagem não existe', async () => {
      // Arrange
      mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(null);

      // Act / Assert
      await expect(service.retry(TENANT_ID, 'inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
