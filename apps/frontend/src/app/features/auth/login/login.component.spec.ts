import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
} from '@ngx-translate/core';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';

describe('LoginComponent', () => {
  let auth: { signInWithEmail: jest.Mock };

  beforeEach(() => {
    auth = { signInWithEmail: jest.fn() };
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('deve criar', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('submit exibe mensagem quando signIn rejeita com Error', async () => {
    auth.signInWithEmail.mockRejectedValue(new Error('Credenciais inválidas'));
    const fixture = TestBed.createComponent(LoginComponent);
    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.c';
    cmp.password = 'secret';
    await cmp.submit();
    expect(cmp.error()).toBe('Credenciais inválidas');
  });

  it('submit usa auth.loginError quando rejeição não é Error', async () => {
    auth.signInWithEmail.mockRejectedValue('falha');
    const fixture = TestBed.createComponent(LoginComponent);
    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.c';
    cmp.password = 'secret';
    await cmp.submit();
    expect(cmp.error()).toBe('auth.loginError');
  });
});
