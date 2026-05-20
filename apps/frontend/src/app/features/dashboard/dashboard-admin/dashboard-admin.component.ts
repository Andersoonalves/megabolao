import { Component, signal, computed, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe, SlicePipe, NgClass } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  formatarProximoSorteioDataCurta,
  formatarProximoSorteioDiaHora,
  resolverProximoSorteioMega,
} from '@nossobolao/shared-utils';
import { ApiService } from '../../../core/services/api.service';
import { MegaSenaAlertComponent } from '../../../shared/components/mega-sena-alert/mega-sena-alert.component';

interface BolaoItem {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  dataInicio: string | null;
  dataTermino: string | null;
  criadoEm: string;
}

interface SorteioRecente {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

interface AuditoriaItem {
  id: string;
  acao: string;
  recurso: string;
  userEmail: string | null;
  criadoEm: string;
  detalhes: Record<string, unknown>;
}

interface CrmEtapa {
  id: string;
  nome: string;
  ordem: number;
}

interface ProximoConcurso {
  numero: number | null;
  data: string | null;
}

interface ChartPoint { x: number; y: number }

interface ArrecPaths {
  W: number; H: number;
  padL: number; padT: number; innerH: number;
  aLine: string; aArea: string; cLine: string;
  aPts: ChartPoint[]; cPts: ChartPoint[];
  yLabels: { y: number; label: string }[];
  data: { m: string; arrec: number; cotas: number }[];
  stepX: number;
}

interface DonutSeg {
  d: string; color: string; lab: string; n: number; pct: string;
}

interface HeatmapCell {
  n: number; v: number; alpha: string; isTop: boolean; textDark: boolean;
}

interface AcaoPendente {
  icon: string; title: string; desc: string; cta: string;
  link: string; prio: 'alta' | 'media';
  color: 'gold' | 'red' | 'green' | 'blue' | 'orange';
}

interface AuditoriaLabel {
  id: string; icon: string; label: string; who: string; ago: string;
}

@Component({
  selector: 'nb-dashboard-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, CurrencyPipe, DatePipe, SlicePipe, NgClass, TranslatePipe, MegaSenaAlertComponent],
  templateUrl: './dashboard-admin.component.html',
})
export class DashboardAdminComponent implements OnInit {
  private readonly api       = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── Primary signals ────────────────────────────────────────────────────────
  loading            = signal(true);
  error              = signal('');
  bolaoes            = signal<BolaoItem[]>([]);
  totalParticipantes = signal(0);

  // ── Secondary signals (graceful fallback) ─────────────────────────────────
  sorteiosRecentes = signal<SorteioRecente[]>([]);
  auditoriaItems   = signal<AuditoriaItem[]>([]);
  crmEtapas        = signal<CrmEtapa[]>([]);
  crmCountByEtapa  = signal<Record<string, number>>({});
  proximoConcurso  = signal<ProximoConcurso | null>(null);

  // ── Computed ───────────────────────────────────────────────────────────────
  emAndamento     = computed(() => this.bolaoes().filter(b => b.status === 'EM_ANDAMENTO').length);
  aIniciar        = computed(() => this.bolaoes().filter(b => b.status === 'A_SER_INICIADO').length);
  finalizados     = computed(() => this.bolaoes().filter(b => b.status === 'FINALIZADO').length);
  totalCotas      = computed(() => this.bolaoes().reduce((s, b) => s + b.totalCotasAtivas, 0));
  totalArrecadado = computed(() => this.bolaoes().reduce((s, b) => s + b.valorBrutoArrecadado, 0));
  ticketMedio     = computed(() => {
    const c = this.totalCotas();
    return c > 0 ? this.totalArrecadado() / c : 0;
  });

  /** Mesma lógica da lista de bolões (data Caixa dd/mm/yyyy + calendário ter/qui/sáb). */
  proximoSorteioInstante = computed(() => {
    const prox = this.proximoConcurso();
    if (!prox) return null;
    return resolverProximoSorteioMega({
      referencia: new Date(),
      dataOficialBr: prox.data,
    });
  });

  temProximoSorteio = computed(() => this.proximoSorteioInstante() !== null);

  proximoSorteioDataLabel = computed(() => {
    const i = this.proximoSorteioInstante();
    if (!i) return '—';
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    return formatarProximoSorteioDataCurta(i, loc);
  });

  proximoSorteioDiaMes = computed(() => {
    const i = this.proximoSorteioInstante();
    if (!i) return '—';
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    return i.toLocaleDateString(loc, { day: '2-digit', timeZone: 'America/Sao_Paulo' });
  });

  proximoSorteioDiaHoraLabel = computed(() => {
    const i = this.proximoSorteioInstante();
    if (!i) return '';
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    return formatarProximoSorteioDiaHora(i, loc);
  });

  proximoSorteioDias = computed(() => {
    const i = this.proximoSorteioInstante();
    if (!i) return -1;
    return Math.ceil((i.getTime() - Date.now()) / 86_400_000);
  });

  statusDist = computed(() => [
    { lab: 'Em andamento', n: this.emAndamento(), color: '#047857' },
    { lab: 'A iniciar',    n: this.aIniciar(),    color: '#3b82f6' },
    { lab: 'Finalizados',  n: this.finalizados(), color: '#cbd5e1' },
  ]);

  donutSegs = computed((): DonutSeg[] => {
    const data  = this.statusDist();
    const total = data.reduce((s, d) => s + d.n, 0);
    if (!total) return [];
    const R = 80, thickness = 24, innerR = R - thickness;
    let acc = 0;
    return data.map(d => {
      const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
      acc += d.n;
      const end   = (acc / total) * Math.PI * 2 - Math.PI / 2;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = R + R * Math.cos(start),      y1 = R + R * Math.sin(start);
      const x2 = R + R * Math.cos(end),        y2 = R + R * Math.sin(end);
      const x3 = R + innerR * Math.cos(end),   y3 = R + innerR * Math.sin(end);
      const x4 = R + innerR * Math.cos(start), y4 = R + innerR * Math.sin(start);
      return {
        d: `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${large},0 ${x4},${y4}Z`,
        color: d.color, lab: d.lab, n: d.n,
        pct: ((d.n / total) * 100).toFixed(0),
      };
    });
  });

  arrecMensal = computed(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        m:   d.toLocaleString('pt-BR', { month: 'short' }),
        arrec: 0, cotas: 0,
      };
    });
    for (const b of this.bolaoes()) {
      const dateRef = b.dataInicio ?? b.criadoEm;
      const key     = dateRef.slice(0, 7);
      const month   = months.find(m => m.key === key);
      if (month) { month.arrec += b.valorBrutoArrecadado; month.cotas += b.totalCotasAtivas; }
    }
    return months;
  });

  arrecPaths = computed((): ArrecPaths | null => {
    const data = this.arrecMensal();
    if (data.every(d => d.arrec === 0 && d.cotas === 0)) return null;
    const W = 640, H = 180;
    const padL = 52, padT = 10, padR = 16, padB = 24;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxA   = Math.max(...data.map(d => d.arrec), 1);
    const maxC   = Math.max(...data.map(d => d.cotas), 1);
    const stepX  = innerW / Math.max(data.length - 1, 1);

    const aPts = data.map((d, i) => ({ x: padL + i * stepX, y: padT + (1 - d.arrec / maxA) * innerH }));
    const cPts = data.map((d, i) => ({ x: padL + i * stepX, y: padT + (1 - d.cotas / maxC) * innerH }));

    const smooth = (pts: ChartPoint[]) => {
      if (pts.length < 2) return '';
      let p = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const cx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 2;
        p += ` C${cx},${pts[i - 1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
      }
      return p;
    };

    const aLine = smooth(aPts);
    const last  = aPts[aPts.length - 1];
    const aArea = `${aLine} L${last.x},${padT + innerH} L${padL},${padT + innerH}Z`;

    const fmtLabel = (v: number): string => {
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '') + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'k';
      return Math.round(v).toString();
    };
    const yLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      y:     padT + t * innerH,
      label: fmtLabel((1 - t) * maxA),
    }));

    return { W, H, padL, padT, innerH, aLine, aArea, cLine: smooth(cPts), aPts, cPts, yLabels, data, stepX };
  });

  frequenciaNumeros = computed(() => {
    const freq: Record<number, number> = {};
    for (const s of this.sorteiosRecentes()) {
      for (const n of s.bolasSorteadas) { freq[n] = (freq[n] ?? 0) + 1; }
    }
    return freq;
  });

  heatmapCells = computed((): { cells: HeatmapCell[]; topNum: string; totalSorteios: number } => {
    const freq  = this.frequenciaNumeros();
    const vals  = Object.values(freq);
    const max   = vals.length ? Math.max(...vals) : 1;
    const min   = vals.length ? Math.min(...vals) : 0;
    const range = Math.max(max - min, 1);
    const topEntry = vals.length
      ? Object.entries(freq).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
      : null;
    return {
      totalSorteios: this.sorteiosRecentes().length,
      topNum: topEntry ? `${topEntry[0]} · ${topEntry[1]}x` : '—',
      cells: Array.from({ length: 60 }, (_, i) => {
        const n = i + 1;
        const v = freq[n] ?? 0;
        const t = vals.length ? (v - min) / range : 0;
        return { n, v, alpha: (0.12 + t * 0.85).toFixed(2), isTop: v > 0 && v >= max * 0.85, textDark: t <= 0.45 };
      }),
    };
  });

  crmFunilData = computed(() => {
    const etapas = this.crmEtapas();
    const counts = this.crmCountByEtapa();
    const maxN   = etapas.length ? Math.max(...etapas.map(e => counts[e.id] ?? 0), 1) : 1;
    const total  = Object.values(counts).reduce((s, n) => s + n, 0);
    const items  = etapas.map((e, i, arr) => {
      const n    = counts[e.id] ?? 0;
      const prev = i > 0 ? (counts[arr[i - 1].id] ?? 0) : n;
      return {
        id: e.id, nome: e.nome, n,
        w:    maxN > 0 ? (n / maxN) * 100 : 0,
        conv: i > 0 && prev > 0 ? Math.round((n / prev) * 100) : null,
      };
    });
    return { items, total };
  });

  auditoriaLabels = computed((): AuditoriaLabel[] =>
    this.auditoriaItems().map(a => ({
      id:    a.id,
      icon:  this.auditoriaIcon(a.acao),
      label: this.auditoriaLabel(a),
      who:   a.userEmail?.split('@')[0] ?? 'Sistema',
      ago:   this.timeAgo(a.criadoEm),
    }))
  );

  acoesPendentes = computed((): AcaoPendente[] => {
    const items: AcaoPendente[] = [];
    const ativos = this.bolaoes().filter(b => b.status === 'EM_ANDAMENTO');
    const prox   = this.proximoConcurso();

    const instante = this.proximoSorteioInstante();
    if (prox?.numero && instante) {
      const days = this.proximoSorteioDias();
      if (days >= 0 && days <= 14) {
        const label = days === 0 ? '· Hoje' : days === 1 ? '· Amanhã' : `· Em ${days} dias`;
        items.push({
          icon:  '✦',
          title: `Próximo sorteio · Concurso ${prox.numero}`,
          desc:  `${ativos.length} bolão(ões) ativo(s) · ${this.proximoSorteioDataLabel()} ${label}`,
          cta:   'Revisar',
          link:  '/sorteios',
          prio:  days <= 1 ? 'alta' : 'media',
          color: 'green',
        });
      }
    }

    const crmTotal = this.crmFunilData().total;
    if (crmTotal > 0) {
      items.push({
        icon:  '💬',
        title: `${crmTotal} contato(s) no funil CRM`,
        desc:  'Verificar conversas e leads em andamento',
        cta:   'Abrir CRM',
        link:  '/crm',
        prio:  'media',
        color: 'blue',
      });
    }

    if (ativos.length > 0) {
      items.push({
        icon:  '👥',
        title: `${this.totalCotas().toLocaleString('pt-BR')} cotas ativas`,
        desc:  `${ativos.length} bolão(ões) em andamento · acompanhar confirmações de pagamento`,
        cta:   'Ver cotas',
        link:  '/boloes',
        prio:  'media',
        color: 'orange',
      });
    }

    return items;
  });

  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    try {
      const [bolaoRes, partRes] = await Promise.all([
        firstValueFrom(this.api.get<{ data: BolaoItem[] }>('/boloes?perPage=100')),
        firstValueFrom(this.api.get<{ total: number }>('/participantes?perPage=1')).catch(() => ({ total: 0 })),
      ]);
      this.bolaoes.set(bolaoRes.data);
      this.totalParticipantes.set(partRes.total);
    } catch {
      this.error.set(this.translate.instant('dashboardAdmin.errorLoad'));
    } finally {
      this.loading.set(false);
    }
    void this.loadSecondary();
  }

  private async loadSecondary(): Promise<void> {
    await Promise.allSettled([
      firstValueFrom(this.api.get<SorteioRecente[]>('/sorteios/recentes?limit=30'))
        .then(r => this.sorteiosRecentes.set(r))
        .catch(() => {}),

      firstValueFrom(this.api.get<{ data: AuditoriaItem[] }>('/auditoria?perPage=8'))
        .then(r => this.auditoriaItems.set(r.data))
        .catch(() => {}),

      firstValueFrom(this.api.get<{ etapas: CrmEtapa[]; contatos: { etapaId: string | null }[] }>('/crm/contatos/kanban'))
        .then(r => {
          this.crmEtapas.set(r.etapas);
          const counts: Record<string, number> = {};
          for (const c of r.contatos) {
            if (c.etapaId) counts[c.etapaId] = (counts[c.etapaId] ?? 0) + 1;
          }
          this.crmCountByEtapa.set(counts);
        })
        .catch(() => {}),

      firstValueFrom(this.api.get<{ proximo: ProximoConcurso }>('/sorteios/mega-sena?painel=1'))
        .then(r => this.proximoConcurso.set(r.proximo))
        .catch(() => {}),
    ]);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private auditoriaIcon(acao: string): string {
    if (acao.includes('SORTEIO'))                   return '✦';
    if (acao.includes('PREMIO') || acao.includes('PAGAR')) return '🏆';
    if (acao.includes('PAGAMENTO') || acao.includes('CONFIRMAR')) return '✓';
    if (acao.includes('WHATSAPP'))                  return '💬';
    if (acao.includes('CRIAR') || acao.includes('CREATE')) return '+';
    if (acao.includes('FINALIZ'))                   return '🔒';
    return '○';
  }

  private auditoriaLabel(a: AuditoriaItem): string {
    const recurso = (a.recurso ?? '').toLowerCase().replace(/_/g, ' ');
    return `${a.acao.toLowerCase().replace(/_/g, ' ')} · ${recurso}`;
  }

  private timeAgo(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 60)   return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)  return `há ${hours}h`;
    const days  = Math.floor(hours / 24);
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }

  acaoColorClass(color: AcaoPendente['color']): string {
    const map: Record<AcaoPendente['color'], string> = {
      gold:   'bg-amber-50 text-amber-700',
      red:    'bg-red-50 text-red-600',
      green:  'bg-green-50 text-green-700',
      blue:   'bg-blue-50 text-blue-600',
      orange: 'bg-orange-50 text-orange-600',
    };
    return map[color];
  }
}
