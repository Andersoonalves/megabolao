import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface PortalPremio {
  id: string;
  categoriaNome: string;
  valorPorGanhador: number;
  statusPagamento: string;
  dataPagamento: string | null;
}

export interface PortalCota {
  id: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: string;
  dataConfirmacaoPagamento: string | null;
  totalAcertosAcumulados: number;
  statusResultado: string;
  premios: PortalPremio[];
}

export interface PortalSorteio {
  id: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  sequenciaNoBolao: number;
  processado: boolean;
}

export interface PortalBolao {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  dataInicio: string | null;
  dataTermino: string | null;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  /** URL `https://wa.me/...` para contato com o organizador; `null` se não configurado. */
  linkWhatsappOrganizador: string | null;
  cotas: PortalCota[];
  sorteios: PortalSorteio[];
}

export interface PortalResumo {
  participante: { nome: string; celular: string };
  resumo: {
    totalBoloes: number;
    totalCotas: number;
    melhorAcertos: number;
    totalPremios: number;
  };
  boloes: PortalBolao[];
}

export interface PortalRankingItem {
  posicao: number;
  cotaId: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  totalAcertosAcumulados: number;
  statusPagamento: string;
  maxPalpites: number;
}

@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly storageKey = 'nb-portal-celular';
  private readonly api = inject(ApiService);

  // ── Cache de resumo (TTL 30s) para evitar múltiplas chamadas simultâneas ──
  private _resumoCache: PortalResumo | null = null;
  private _resumoCacheAt = 0;
  private _resumoInflight: Promise<PortalResumo> | null = null;
  private readonly CACHE_TTL_MS = 30_000;

  async loginDireto(celular: string): Promise<void> {
    const digits = this.normalizePhone(celular);
    await firstValueFrom(this.api.post<{ ok: true }>('/portal/acesso/login-direto', { celular: digits }));
    localStorage.setItem(this.storageKey, digits);
    this.clearResumoCache();
  }

  clearLogin(): void {
    localStorage.removeItem(this.storageKey);
    this.clearResumoCache();
  }

  clearResumoCache(): void {
    this._resumoCache   = null;
    this._resumoCacheAt = 0;
    this._resumoInflight = null;
  }

  /** Celular guardado no login direto (para exibição quando o resumo ainda não carregou). */
  storedPortalCelular(): string | null {
    return this.portalCelular();
  }

  resumo(): Promise<PortalResumo> {
    // Retorna cache se ainda válido
    if (this._resumoCache && Date.now() - this._resumoCacheAt < this.CACHE_TTL_MS) {
      return Promise.resolve(this._resumoCache);
    }
    // Deduplica chamadas simultâneas (navegação shell + cotas + detalhe)
    if (this._resumoInflight) return this._resumoInflight;

    const celular = this.portalCelular();
    const req: Promise<PortalResumo> = celular
      ? firstValueFrom(this.api.post<PortalResumo>('/portal/resumo-direto', { celular }))
      : firstValueFrom(this.api.get<PortalResumo>('/portal/resumo'));

    this._resumoInflight = req.then(data => {
      this._resumoCache    = data;
      this._resumoCacheAt  = Date.now();
      this._resumoInflight = null;
      return data;
    }).catch(err => {
      this._resumoInflight = null;
      throw err;
    });

    return this._resumoInflight;
  }

  ranking(bolaoId: string): Promise<PortalRankingItem[]> {
    const celular = this.portalCelular();
    if (celular) {
      return firstValueFrom(
        this.api.post<PortalRankingItem[]>(`/portal/boloes/${bolaoId}/ranking-direto`, { celular }),
      );
    }
    return firstValueFrom(this.api.get<PortalRankingItem[]>(`/portal/boloes/${bolaoId}/ranking`));
  }

  private portalCelular(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  }
}
