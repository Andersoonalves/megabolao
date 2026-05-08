import {
  Component, signal, computed, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'nb-novo-tenant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Plataforma</span>
        <span class="text-slate-300">›</span>
        <a routerLink="/tenants" class="text-slate-400 hover:text-slate-700 no-underline transition-colors">Tenants</a>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Novo</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Novo tenant</span>
      <div class="flex gap-2">
        <a routerLink="/tenants"
           class="inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-700 transition-colors min-h-9">
          Cancelar
        </a>
        <button (click)="submit()" [disabled]="!valido() || loading()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
          {{ loading() ? 'Criando...' : '✓ Criar tenant' }}
        </button>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Novo tenant</h1>
        <p class="text-slate-500 text-[13.5px]">Cada tenant é uma empresa isolada com seus próprios bolões, usuários e branding.</p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        <!-- Formulário -->
        <div class="flex flex-col gap-5">

          <!-- Identificação -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">Identificação</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome do tenant *</label>
                <input [(ngModel)]="nome" name="nome"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                       placeholder="Ex: Bolão da Família Souza" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Slug (URL) *</label>
                <div class="flex items-center border border-slate-200 rounded-[10px] overflow-hidden focus-within:border-green-700 transition-colors">
                  <span class="px-2.5 py-2.5 text-[12px] text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap flex-shrink-0">nossobolao/</span>
                  <input [(ngModel)]="slug" name="slug"
                         class="flex-1 px-2.5 py-2.5 text-sm font-mono focus:outline-none bg-white min-w-0"
                         placeholder="bolao-souza" />
                </div>
                @if (slug && !slugValido()) {
                  <p class="text-[11px] text-red-600 mt-1">Apenas letras minúsculas, números e hífens</p>
                }
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">CNPJ (opcional)</label>
                <input [(ngModel)]="cnpj" name="cnpj"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                       placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Taxa administrativa (%)</label>
                <input [(ngModel)]="taxa" name="taxa" type="number" min="0" max="100" step="0.01" inputmode="decimal"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm tabular focus:outline-none focus:border-green-700" />
              </div>
            </div>
          </div>

          <!-- Admin inicial -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">Administrador inicial</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome completo *</label>
                <input [(ngModel)]="adminNome" name="adminNome"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                       placeholder="Ex: Amanda Andrade" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Email *</label>
                <input [(ngModel)]="adminEmail" name="adminEmail" type="email"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                       placeholder="amanda@empresa.com.br" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Celular</label>
                <input [(ngModel)]="adminCelular" name="adminCelular" type="tel" inputmode="numeric"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                       placeholder="(00) 0 0000-0000" />
              </div>
              <div class="flex items-end">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input [(ngModel)]="enviarMagicLink" name="magicLink" type="checkbox"
                         class="mt-0.5 accent-green-700 w-4 h-4 flex-shrink-0" />
                  <span class="text-[13px] text-slate-600 leading-snug">Enviar Magic Link de primeiro acesso por email após criar o tenant</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Branding -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">Branding</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Cor primária</label>
                <div class="flex gap-2">
                  <div class="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer"
                       [style.background]="corPrimaria"
                       (click)="colorPicker.click()">
                  </div>
                  <input #colorPicker type="color" [(ngModel)]="corPrimaria" name="cor"
                         class="sr-only" />
                  <input [(ngModel)]="corPrimaria" name="corHex"
                         class="flex-1 px-2.5 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-green-700"
                         placeholder="#1F4E79" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Logo (URL)</label>
                <input [(ngModel)]="logoUrl" name="logo"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-700"
                       placeholder="https://cdn.empresa.com/logo.png" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome customizado</label>
                <input [(ngModel)]="nomeCustomizado" name="nomeCustom"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-700"
                       placeholder="Meu Bolão" />
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <aside class="flex flex-col gap-4" style="position: sticky; top: 72px; align-self: start">

          <!-- Preview branding -->
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">Preview</h3>
            </div>
            <div class="p-4">
              <!-- Mock logo mark -->
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-[10px] flex items-center justify-center font-display font-bold text-sm text-white"
                     [style.background]="corPrimaria || '#047857'">
                  {{ initials(nomeCustomizado || nome) }}
                </div>
                <div>
                  <div class="font-display font-semibold text-[14px]">{{ nomeCustomizado || nome || 'NossoBolão' }}</div>
                  <div class="text-[11px] text-slate-400">{{ slug || 'tenant-slug' }}.nossobolao.com.br</div>
                </div>
              </div>
              <div class="text-[11.5px] text-slate-400 space-y-1.5">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full" [style.background]="corPrimaria || '#047857'"></div>
                  Cor primária: <span class="font-mono">{{ corPrimaria || '#047857' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-slate-200"></div>
                  Taxa: <span class="font-semibold">{{ taxa }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Recursos provisionados -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">Recursos provisionados</h3>
            </div>
            <div class="p-4 flex flex-col gap-2">
              @for (r of recursos; track r) {
                <div class="flex items-start gap-2 text-[12.5px]">
                  <span class="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                  <span>{{ r }}</span>
                </div>
              }
            </div>
          </div>

          <!-- LGPD notice -->
          <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-lg text-[12px] text-amber-800 leading-relaxed">
            <strong>LGPD:</strong> ao criar o tenant, o admin receberá o Termo de Tratamento de Dados para aceite no primeiro login. O tenant não fica ativo sem o aceite.
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class NovoTenantComponent {
  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);

  // ── Form fields ───────────────────────────────────────────────────────────
  nome           = '';
  slug           = '';
  cnpj           = '';
  taxa           = 15;
  adminNome      = '';
  adminEmail     = '';
  adminCelular   = '';
  enviarMagicLink = true;
  corPrimaria    = '#047857';
  logoUrl        = '';
  nomeCustomizado = '';

  loading = signal(false);
  error   = signal('');

  slugValido = computed(() => /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(this.slug));
  valido     = computed(() =>
    this.nome.trim().length > 0 &&
    this.slug.trim().length > 0 &&
    this.slugValido() &&
    this.adminNome.trim().length > 0 &&
    this.adminEmail.includes('@'),
  );

  readonly recursos = [
    'Schema isolado no Supabase via RLS',
    'Subdomínio próprio (slug.nossobolao.com.br)',
    'Magic Link via email para o admin',
    'Sessão WhatsApp dedicada',
    'PWA com cores e ícones do tenant',
  ];

  // Auto-gera slug a partir do nome (simplificado)
  onNomeChange(): void {
    if (!this.slug) {
      this.slug = this.nome
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    }
  }

  async submit(): Promise<void> {
    if (!this.valido() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.api.post('/tenants', {
          nome: this.nome.trim(),
          slug: this.slug.trim(),
          taxaAdministrativaPct: this.taxa,
          branding: {
            corPrimaria: this.corPrimaria,
            ...(this.logoUrl && { logoUrl: this.logoUrl }),
            ...(this.nomeCustomizado && { nomeCustomizado: this.nomeCustomizado }),
          },
        }),
      );
      await this.router.navigate(['/tenants']);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao criar tenant';
      this.error.set(msg);
    } finally { this.loading.set(false); }
  }

  initials(nome: string): string {
    return (nome || 'NB').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'NB';
  }
}
