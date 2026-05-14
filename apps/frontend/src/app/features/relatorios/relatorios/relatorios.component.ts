import {
  Component, signal, ChangeDetectionStrategy, inject,
  Pipe, PipeTransform,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

@Pipe({ name: 'rBrl', standalone: true, pure: true })
export class RBrlPipe implements PipeTransform {
  transform(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}

interface RelatorioResult { url: string; caminho: string; geradoEm: string; }

// Demo bolão — substituir por seletor quando multi-bolão
const DEMO_BOLAO_ID = '00000000-0000-0000-0000-000000000002';

@Component({
  selector: 'nb-relatorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RBrlPipe, TranslatePipe],
  templateUrl: './relatorios.component.html',
})
export class RelatoriosComponent {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  gerandoXlsx = signal(false);
  gerandoPdf  = signal(false);
  urlXlsx     = signal('');
  urlPdf      = signal('');
  error       = signal('');

  async gerarXlsx(): Promise<void> {
    this.gerandoXlsx.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.post<RelatorioResult>(`/boloes/${DEMO_BOLAO_ID}/relatorios/xlsx`, {}));
      this.urlXlsx.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.error.set(this.translate.instant('relatorios.errXlsx')); }
    finally { this.gerandoXlsx.set(false); }
  }

  async gerarPdf(): Promise<void> {
    this.gerandoPdf.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.post<RelatorioResult>(`/boloes/${DEMO_BOLAO_ID}/relatorios/pdf`, {}));
      this.urlPdf.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.error.set(this.translate.instant('relatorios.errPdf')); }
    finally { this.gerandoPdf.set(false); }
  }

  readonly distribuicao = [
    { cat: '09 acertos — Mais Pontos', v: 18488,  p: 10, n: 22,   color: '#f59e0b' },
    { cat: '08 acertos',               v: 56400,  p: 28, n: 47,   color: '#fbbf24' },
    { cat: '07 acertos',               v: 64200,  p: 30, n: 312,  color: '#2563eb' },
    { cat: '06 acertos',               v: 35536,  p: 18, n: 1240, color: '#94a3b8' },
    { cat: 'Acumulado p/ próximo',     v: 2256,   p:  2, n: 0,    color: '#cbd5e1' },
    { cat: 'Taxa administrativa',      v: 27732,  p: 15, n: 0,    color: '#f1f5f9' },
  ];

  readonly sorteiosBars = [
    { c: 2989, h: 1.2, l: '1,2k' }, { c: 2990, h: 2.6, l: '2,6k' },
    { c: 2991, h: 3.4, l: '3,4k' }, { c: 2992, h: 4.1, l: '4,1k' },
    { c: 2993, h: 5.5, l: '5,5k' }, { c: 2994, h: 7.2, l: '7,2k' },
  ];

  readonly ranking = [
    { p: 1, n: 'Maria L. Souza',       c: '#4164', a: 9, cat: '09 pts',   v: 840.36,  s: 'PAGO'    },
    { p: 2, n: 'João R. Oliveira',     c: '#2871', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 3, n: 'Ana P. Carvalho',      c: '#0931', a: 8, cat: '08 acertos', v: 1200.00, s: 'A_PAGAR' },
    { p: 4, n: 'Carlos H. Lima',       c: '#5502', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 5, n: 'Roberto F. Andrade',   c: '#1148', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 6, n: 'Fernanda K. Yamada',   c: '#7723', a: 8, cat: '08 acertos', v: 1200.00, s: 'A_PAGAR' },
    { p: 7, n: 'Lucas M. Pereira',     c: '#3290', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 8, n: 'Beatriz N. Costa',     c: '#6601', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
  ];
}
