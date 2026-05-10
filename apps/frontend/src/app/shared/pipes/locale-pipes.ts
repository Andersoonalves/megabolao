import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

function resolveLocale(translate: TranslateService): string {
  return translate.currentLang?.toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
}

/** Números inteiros/decimais conforme idioma ativo (ngx-translate). `pure: false` para reagir a mudanças de idioma. */
@Pipe({ name: 'localNum', standalone: true, pure: false })
export class LocalNumPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(n: number): string {
    return n.toLocaleString(resolveLocale(this.translate));
  }
}

/**
 * Valores em BRL. Segundo argumento opcional `'compact'`: atalhos tipo R$ 1,0M / R$ 184k no dashboard master.
 */
@Pipe({ name: 'brl', standalone: true, pure: false })
export class BrlPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(n: number, mode: 'full' | 'compact' = 'full'): string {
    const loc = resolveLocale(this.translate);
    if (mode === 'compact' && n >= 1_000_000) {
      return `R$ ${(n / 1_000_000).toFixed(1)}M`;
    }
    if (mode === 'compact' && n >= 1_000) {
      return `R$ ${(n / 1_000).toFixed(0)}k`;
    }
    return new Intl.NumberFormat(loc, { style: 'currency', currency: 'BRL' }).format(n);
  }
}
