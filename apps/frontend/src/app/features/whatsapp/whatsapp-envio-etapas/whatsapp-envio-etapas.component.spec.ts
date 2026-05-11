import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { WhatsappEnvioEtapasComponent } from './whatsapp-envio-etapas.component';
import { ApiService } from '../../../core/services/api.service';

describe('WhatsappEnvioEtapasComponent', () => {
  beforeEach(() => {
    const apiGet = jest.fn((url: string) => {
      if (url.includes('/whatsapp/sessao/status')) return of({ status: 'CONECTADO', numero: '11999999999' });
      if (url.startsWith('/boloes?')) return of({ data: [] });
      if (/\/boloes\/[^/]+\/whatsapp$/.test(url)) {
        return of({ bolaoId: 'b1', bolaoNome: 'B', grupos: [], configurado: false });
      }
      if (url.includes('/whatsapp/templates')) return of([]);
      return of([]);
    });
    TestBed.configureTestingModule({
      imports: [WhatsappEnvioEtapasComponent],
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
    const fixture = TestBed.createComponent(WhatsappEnvioEtapasComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
