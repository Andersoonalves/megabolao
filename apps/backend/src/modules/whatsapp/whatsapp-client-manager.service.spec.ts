import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException } from '../../common/exceptions/business.exception';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';

// Mock whatsapp-web.js — evita Puppeteer nos testes
jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn(),
  LocalAuth: jest.fn(),
}));

import { Client, LocalAuth } from 'whatsapp-web.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';

const makeMockClient = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  destroy: jest.fn().mockResolvedValue(undefined),
  getChats: jest.fn().mockResolvedValue([
    {
      isGroup: true,
      id: { _serialized: 'grupo1@g.us' },
      name: 'Grupo Bolão',
      groupMetadata: { participants: [{}, {}, {}] },
    },
    { isGroup: false, id: { _serialized: 'contato@c.us' }, name: 'Contato' },
  ]),
  sendMessage: jest.fn().mockResolvedValue({}),
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('WhatsAppClientManager', () => {
  let manager: WhatsAppClientManager;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockClient = makeMockClient();

    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
    (LocalAuth as unknown as jest.Mock).mockImplementation(() => ({}));

    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppClientManager],
    }).compile();

    manager = module.get<WhatsAppClientManager>(WhatsAppClientManager);
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await manager.encerrar(TENANT_ID);
  });

  // ── iniciar ────────────────────────────────────────────────────────────────

  describe('iniciar', () => {
    it('cria novo cliente e retorna status CARREGANDO', async () => {
      jest.useFakeTimers();
      try {
        // Act
        const result = await manager.iniciar(TENANT_ID);

        // Assert — retorno imediato; initialize entra na fila (+2s)
        expect(result.status).toBe('CARREGANDO');
        expect(Client).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(2500);
        expect(mockClient.initialize).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('retorna status AGUARDANDO_QR quando QR já foi emitido', async () => {
      // Arrange — inicia e simula evento QR
      await manager.iniciar(TENANT_ID);

      // Simulate QR event
      const onCalls = mockClient.on.mock.calls;
      const qrHandler = onCalls.find(([event]: [string]) => event === 'qr')?.[1] as (qr: string) => void;
      qrHandler?.('qr-code-string');

      // Act — second call should return QR code
      const result = await manager.iniciar(TENANT_ID);

      // Assert
      expect(result.status).toBe('AGUARDANDO_QR');
      expect(result.qrCode).toBe('qr-code-string');
      expect(Client).toHaveBeenCalledTimes(1); // não cria novo cliente
    });

    it('retorna CONECTADO quando sessão já está pronta', async () => {
      // Arrange — inicia e simula evento ready
      await manager.iniciar(TENANT_ID);

      const onCalls = mockClient.on.mock.calls;
      const readyHandler = onCalls.find(([event]: [string]) => event === 'ready')?.[1] as () => void;
      readyHandler?.();

      // Act
      const result = await manager.iniciar(TENANT_ID);

      // Assert
      expect(result.status).toBe('CONECTADO');
      expect(Client).toHaveBeenCalledTimes(1);
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('retorna DESCONECTADO quando não há sessão', () => {
      // Act
      const result = manager.getStatus('tenant-sem-sessao');

      // Assert
      expect(result.status).toBe('DESCONECTADO');
    });

    it('limpa sessão quando evento disconnected é emitido', async () => {
      // Arrange
      await manager.iniciar(TENANT_ID);
      const onCalls = mockClient.on.mock.calls;
      const disconnHandler = onCalls.find(([event]: [string]) => event === 'disconnected')?.[1] as () => void;

      // Act
      disconnHandler?.();

      // Assert
      expect(manager.getStatus(TENANT_ID).status).toBe('DESCONECTADO');
    });
  });

  // ── encerrar ───────────────────────────────────────────────────────────────

  describe('encerrar', () => {
    it('chama destroy no cliente e remove sessão', async () => {
      // Arrange
      await manager.iniciar(TENANT_ID);

      // Act
      await manager.encerrar(TENANT_ID);

      // Assert
      expect(mockClient.destroy).toHaveBeenCalledTimes(1);
      expect(manager.getStatus(TENANT_ID).status).toBe('DESCONECTADO');
    });

    it('não lança erro ao encerrar sessão inexistente', async () => {
      // Act / Assert — não deve lançar
      await expect(manager.encerrar('tenant-sem-sessao')).resolves.not.toThrow();
    });
  });

  // ── getGrupos ──────────────────────────────────────────────────────────────

  describe('getGrupos', () => {
    it('retorna apenas grupos (isGroup=true)', async () => {
      // Arrange — simula sessão CONECTADA
      await manager.iniciar(TENANT_ID);
      const onCalls = mockClient.on.mock.calls;
      const readyHandler = onCalls.find(([event]: [string]) => event === 'ready')?.[1] as () => void;
      readyHandler?.();

      // Act
      const result = await manager.getGrupos(TENANT_ID);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 'grupo1@g.us', nome: 'Grupo Bolão', qtdParticipantes: 3 });
    });

    it('lança BusinessException quando não está CONECTADO', async () => {
      // Act / Assert — sessão não iniciada
      await expect(manager.getGrupos(TENANT_ID)).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── enviarParaGrupo ────────────────────────────────────────────────────────

  describe('enviarParaGrupo', () => {
    it('chama sendMessage com grupoId e conteúdo', async () => {
      // Arrange
      await manager.iniciar(TENANT_ID);
      const readyHandler = mockClient.on.mock.calls.find(([e]: [string]) => e === 'ready')?.[1] as () => void;
      readyHandler?.();

      // Act
      await manager.enviarParaGrupo(TENANT_ID, 'grupo1@g.us', 'Olá!');

      // Assert
      expect(mockClient.sendMessage).toHaveBeenCalledWith('grupo1@g.us', 'Olá!');
    });

    it('lança BusinessException quando não está CONECTADO', async () => {
      // Act / Assert
      await expect(manager.enviarParaGrupo(TENANT_ID, 'g@g.us', 'msg')).rejects.toBeInstanceOf(BusinessException);
    });
  });

  describe('renovarQr', () => {
    it('rejeita quando a sessão já está CONECTADA', async () => {
      await manager.iniciar(TENANT_ID);
      const readyHandler = mockClient.on.mock.calls.find(([e]: [string]) => e === 'ready')?.[1] as () => void;
      readyHandler?.();
      await expect(manager.renovarQr(TENANT_ID)).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
