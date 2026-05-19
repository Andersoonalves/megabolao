import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';

const TENANT_ID = '90f87ebf-5c73-43e0-b917-50224742be0e';

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response;
}

describe('WhatsAppClientManager (Evolution API)', () => {
  let manager: WhatsAppClientManager;
  let fetchMock: jest.MockedFunction<FetchHandler>;

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppClientManager,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) => {
              if (key === 'EVOLUTION_API_URL') return 'http://localhost:8080';
              if (key === 'EVOLUTION_API_KEY') return 'test-key';
              if (key === 'APP_BASE_URL') return 'http://host.docker.internal:3000';
              return def;
            },
          },
        },
      ],
    }).compile();

    manager = module.get(WhatsAppClientManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reutiliza instância existente (connectionState) e retorna QR do connect', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url.includes('/connectionState/')) {
        return jsonResponse({ instance: { state: 'close' } });
      }
      if (url.includes('/instance/connect/')) {
        return jsonResponse({ code: '2@pairing-token-example' });
      }
      if (url.includes('/webhook/set/') && m === 'POST') {
        const body = JSON.parse(String(init?.body)) as { webhook: { webhookByEvents: boolean } };
        expect(body.webhook.webhookByEvents).toBe(false);
        return jsonResponse({ ok: true });
      }
      if (url.includes('/instance/create')) {
        return jsonResponse({});
      }
      return jsonResponse({});
    });

    const result = await manager.iniciar(TENANT_ID);

    expect(result.status).toBe('AGUARDANDO_QR');
    expect(result.qrCode).toBe('2@pairing-token-example');
    const createCalls = fetchMock.mock.calls.filter(([u]) => u.includes('/instance/create'));
    expect(createCalls).toHaveLength(0);
  });

  it('prossegue com connect quando create retorna 403 already in use', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url.includes('/connectionState/')) {
        return jsonResponse({ instance: { state: 'connecting' } });
      }
      if (url.includes('/instance/fetchInstances')) {
        return jsonResponse([]);
      }
      if (url.includes('/instance/create') && m === 'POST') {
        return errorResponse(
          403,
          JSON.stringify({
            status: 403,
            response: { message: [`This name "${TENANT_ID}" is already in use.`] },
          }),
        );
      }
      if (url.includes('/instance/connect/')) {
        return jsonResponse({ code: 'qr-wa-string' });
      }
      if (url.includes('/webhook/set/')) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    });

    const result = await manager.iniciar(TENANT_ID);

    expect(result.status).toBe('AGUARDANDO_QR');
    expect(result.qrCode).toBe('qr-wa-string');
  });

  it('refreshStatus não chama setWebhook e preserva QR do cache', async () => {
    manager.onQrUpdated(TENANT_ID, 'cached-qr-payload');

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/connectionState/')) {
        return jsonResponse({ instance: { state: 'connecting' } });
      }
      if (url.includes('/webhook/set/')) {
        throw new Error('setWebhook não deveria ser chamado no poll');
      }
      return jsonResponse({});
    });

    const result = await manager.refreshStatus(TENANT_ID);

    expect(result.status).toBe('AGUARDANDO_QR');
    expect(result.qrCode).toBe('cached-qr-payload');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/webhook/set/'))).toBe(false);
  });

  it('syncConnection com connecting sem QR retorna AGUARDANDO_QR', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/connectionState/')) {
        return jsonResponse({ instance: { state: 'connecting' } });
      }
      return jsonResponse({ count: 0 });
    });

    const result = await manager.refreshStatus(TENANT_ID);

    expect(result.status).toBe('AGUARDANDO_QR');
    expect(result.qrCode).toBeUndefined();
  });

  it('onQrUpdated preserva data URL e normaliza base64 longo', () => {
    manager.onQrUpdated(TENANT_ID, 'data:image/png;base64,abc');
    expect(manager.getStatus(TENANT_ID).qrCode).toBe('data:image/png;base64,abc');

    const longB64 = 'A'.repeat(220);
    manager.onQrUpdated(TENANT_ID, longB64);
    expect(manager.getStatus(TENANT_ID).qrCode).toMatch(/^data:image\/png;base64,/);
  });

  it('renovarQr rejeita quando já está CONECTADO', async () => {
    manager.onConnectionUpdate(TENANT_ID, 'open', '5511999999999');
    await expect(manager.renovarQr(TENANT_ID)).rejects.toBeInstanceOf(BusinessException);
  });

  it('getGrupos consulta Evolution quando cache está vazio mas sessão está open', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/connectionState/')) {
        return jsonResponse({ instance: { state: 'open' } });
      }
      if (url.includes('/fetchAllGroups/')) {
        return jsonResponse([
          { id: '120363@g.us', subject: 'Grupo Teste', size: 3 },
        ]);
      }
      if (url.includes('/fetchInstances')) {
        return jsonResponse([{ instance: { instanceName: TENANT_ID, ownerJid: '5511999999999@s.whatsapp.net' } }]);
      }
      return jsonResponse({});
    });

    const grupos = await manager.getGrupos(TENANT_ID);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.nome).toBe('Grupo Teste');
    expect(manager.getStatus(TENANT_ID).status).toBe('CONECTADO');
  });

  it('renovarQr apaga e recria instância quando connectionState retorna absent', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url.includes('/instance/delete/') && m === 'DELETE') {
        return jsonResponse({}, 200);
      }
      if (url.includes('/connectionState/')) {
        return errorResponse(404, JSON.stringify({ status: 404, response: { message: ['does not exist'] } }));
      }
      if (url.includes('/instance/create') && m === 'POST') {
        return jsonResponse({
          qrcode: { code: '2@novo-qr', base64: 'data:image/png;base64,abc' },
        });
      }
      return jsonResponse({});
    });

    const promise = manager.renovarQr(TENANT_ID);
    await jest.advanceTimersByTimeAsync(500);
    const result = await promise;
    jest.useRealTimers();

    expect(result.status).toBe('AGUARDANDO_QR');
    expect(result.qrCode).toBe('data:image/png;base64,abc');
    const creates = fetchMock.mock.calls.filter(([u]) => String(u).includes('/instance/create'));
    expect(creates.length).toBeGreaterThanOrEqual(1);
  });
});
