import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { WhatsappEnvioMensagemComponent } from './whatsapp-envio-mensagem.component';
import { ApiService } from '../../../core/services/api.service';

describe('WhatsappEnvioMensagemComponent', () => {
  beforeEach(() => {
    const apiGet = jest.fn((url: string) => {
      if (url.includes('/whatsapp/sessao/status')) return of({ status: 'CONECTADO', numero: '11999999999' });
      if (url.includes('/whatsapp/sessao/grupos')) return of([]);
      if (url.includes('/whatsapp/templates')) return of([]);
      if (url.startsWith('/boloes?')) return of({ data: [] });
      if (/\/boloes\/[^/]+\/whatsapp$/.test(url)) {
        return of({ bolaoId: 'b1', bolaoNome: 'Bolão teste', grupos: [], configurado: false });
      }
      return of([]);
    });
    TestBed.configureTestingModule({
      imports: [WhatsappEnvioMensagemComponent],
      providers: [
        provideRouter([]),
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        {
          provide: ApiService,
          useValue: {
            get: apiGet,
            post: jest.fn(() => of({})),
          },
        },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(WhatsappEnvioMensagemComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
