import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { WaTemplatesComponent } from './wa-templates.component';
import { ApiService } from '../../../core/services/api.service';

describe('WaTemplatesComponent', () => {
  beforeEach(() => {
    const apiGet = jest.fn((url: string) => {
      if (url.includes('/whatsapp/sessao/grupos')) return of([{ id: '1' }, { id: '2' }]);
      if (url.includes('/whatsapp/templates')) return of([]);
      return of([]);
    });
    TestBed.configureTestingModule({
      imports: [WaTemplatesComponent],
      providers: [
        provideRouter([]),
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        {
          provide: ApiService,
          useValue: {
            get: apiGet,
            post: jest.fn(() => of({ id: 'new-id', nome: 'x', conteudo: 'y', tipo: 'MANUAL', ativo: true, criadoEm: '' })),
            patch: jest.fn(() => of({})),
            delete: jest.fn(() => of({})),
          },
        },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(WaTemplatesComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
