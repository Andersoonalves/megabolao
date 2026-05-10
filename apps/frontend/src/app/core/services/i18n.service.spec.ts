import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let translate: jest.Mocked<Pick<TranslateService, 'use' | 'getBrowserLang'>>;

  beforeEach(() => {
    translate = {
      use: jest.fn().mockReturnValue(of({})),
      getBrowserLang: jest.fn().mockReturnValue('pt-BR'),
    };
    TestBed.configureTestingModule({
      providers: [
        I18nService,
        { provide: TranslateService, useValue: translate },
      ],
    });
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
  });

  it('init aplica idioma pt quando navegador é pt', async () => {
    translate.getBrowserLang.mockReturnValue('pt-BR');
    const svc = TestBed.inject(I18nService);
    await svc.init();
    expect(translate.use).toHaveBeenCalledWith('pt');
  });

  it('setLang persiste en e chama translate.use', async () => {
    const svc = TestBed.inject(I18nService);
    await svc.setLang('en');
    expect(translate.use).toHaveBeenCalledWith('en');
    expect(localStorage.setItem).toHaveBeenCalledWith('nb-lang', 'en');
  });
});
