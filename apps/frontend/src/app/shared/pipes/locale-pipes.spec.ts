import { TestBed } from '@angular/core/testing';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateNoOpLoader,
  TranslateService,
} from '@ngx-translate/core';
import { BrlPipe, LocalNumPipe } from './locale-pipes';

describe('LocalePipes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTranslateService({ fallbackLang: 'pt', lang: 'pt' }),
        provideTranslateLoader(TranslateNoOpLoader),
        LocalNumPipe,
        BrlPipe,
      ],
    });
  });

  it('LocalNumPipe usa separadores pt-BR quando lang é pt', () => {
    const pipe = TestBed.inject(LocalNumPipe);
    expect(pipe.transform(9244)).toBe('9.244');
  });

  it('LocalNumPipe usa separadores en-US quando lang é en', () => {
    const translate = TestBed.inject(TranslateService);
    translate.use('en');
    const pipe = TestBed.inject(LocalNumPipe);
    expect(pipe.transform(9244)).toBe('9,244');
  });

  it('BrlPipe modo full formata moeda BRL', () => {
    const pipe = TestBed.inject(BrlPipe);
    const s = pipe.transform(100, 'full');
    expect(s).toContain('100');
    expect(s).toMatch(/R\$\s*100|100.*R\$/);
  });

  it('BrlPipe modo compact usa atalho k acima de 999', () => {
    const pipe = TestBed.inject(BrlPipe);
    expect(pipe.transform(184880, 'compact')).toMatch(/R\$.*185k|R\$.*184k/);
  });
});
