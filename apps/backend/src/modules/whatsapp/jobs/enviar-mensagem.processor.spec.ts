import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppClientManager } from '../whatsapp-client-manager.service';
import { EnviarMensagemProcessor } from './enviar-mensagem.processor';
import { EnviarMensagemJobData } from './enviar-mensagem.types';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID   = 'tenant-uuid-1';
const MENSAGEM_ID = 'msg-uuid-1';

const makeJob = (data: EnviarMensagemJobData) => ({ id: 'job-1', data }) as Job<EnviarMensagemJobData>;

const makeMensagem = (overrides: Record<string, unknown> = {}) => ({
  id: MENSAGEM_ID,
  tenantId: TENANT_ID,
  grupoId: 'grupo1@g.us',
  conteudo: 'Resultado do Sorteio!',
  status: 'PENDENTE',
  ...overrides,
});

const mockPrisma = {
  mensagemWhatsapp: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockClientManager = { enviarParaGrupo: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue('redis://localhost:6379') };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('EnviarMensagemProcessor', () => {
  let processor: EnviarMensagemProcessor;

  beforeEach(async () => {
    jest.resetAllMocks();

    (Worker as unknown as jest.Mock).mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    }));
    mockConfig.get.mockReturnValue('redis://localhost:6379');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnviarMensagemProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppClientManager, useValue: mockClientManager },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    processor = module.get<EnviarMensagemProcessor>(EnviarMensagemProcessor);
    processor.onModuleInit();

    // Bypass anti-ban jitter so tests don't time out
    jest.spyOn(processor as unknown as { sleep(ms: number): Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);
  });

  it('envia mensagem e atualiza status para ENVIADO', async () => {
    // Arrange
    mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(makeMensagem());
    mockClientManager.enviarParaGrupo.mockResolvedValue(undefined);
    mockPrisma.mensagemWhatsapp.update.mockResolvedValue(makeMensagem({ status: 'ENVIADO' }));

    // Act
    await processor.processJob(makeJob({ mensagemId: MENSAGEM_ID, tenantId: TENANT_ID }));

    // Assert
    expect(mockClientManager.enviarParaGrupo).toHaveBeenCalledWith(
      TENANT_ID,
      'grupo1@g.us',
      'Resultado do Sorteio!',
    );
    expect(mockPrisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ENVIADO' }) }),
    );
  });

  it('ignora mensagem já ENVIADA (idempotência)', async () => {
    // Arrange
    mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(makeMensagem({ status: 'ENVIADO' }));

    // Act
    await processor.processJob(makeJob({ mensagemId: MENSAGEM_ID, tenantId: TENANT_ID }));

    // Assert
    expect(mockClientManager.enviarParaGrupo).not.toHaveBeenCalled();
  });

  it('ignora mensagem não encontrada sem lançar erro', async () => {
    // Arrange
    mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(null);

    // Act / Assert — não lança
    await expect(
      processor.processJob(makeJob({ mensagemId: 'inexistente', tenantId: TENANT_ID })),
    ).resolves.not.toThrow();
  });

  it('atualiza status para FALHA e re-lança erro para BullMQ retry', async () => {
    // Arrange
    mockPrisma.mensagemWhatsapp.findFirst.mockResolvedValue(makeMensagem());
    mockClientManager.enviarParaGrupo.mockRejectedValue(new Error('WhatsApp error'));
    mockPrisma.mensagemWhatsapp.update.mockResolvedValue({});

    // Act / Assert
    await expect(
      processor.processJob(makeJob({ mensagemId: MENSAGEM_ID, tenantId: TENANT_ID })),
    ).rejects.toThrow('WhatsApp error');

    expect(mockPrisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FALHA',
          tentativas: { increment: 1 },
          erro: 'WhatsApp error',
        }),
      }),
    );
  });
});
