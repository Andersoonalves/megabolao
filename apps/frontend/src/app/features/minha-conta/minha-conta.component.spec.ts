import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { of } from 'rxjs';
import { MinhaContaComponent } from './minha-conta.component';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MasterTenantService } from '../../core/services/master-tenant.service';

describe('MinhaContaComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MinhaContaComponent],
      providers: [
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 'u1',
              email: 'a@b.c',
              role: 'ADMIN',
              tenantId: 't1',
              celular: null,
              nomeCompleto: null,
              permissoes: [],
            }),
            isMaster: () => false,
            updateUserMetadata: jest.fn().mockResolvedValue(undefined),
            updatePassword: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ApiService,
          useValue: {
            get: jest.fn().mockReturnValue(
              of({
                id: 't1',
                nome: 'Tenant X',
                slug: 'tx',
                status: 'ATIVO',
                taxaAdministrativaPct: 15,
                branding: {},
                criadoEm: '',
                atualizadoEm: '',
              }),
            ),
          },
        },
        {
          provide: MasterTenantService,
          useValue: {
            tenant: () => null,
            temTenant: () => false,
          },
        },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(MinhaContaComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
