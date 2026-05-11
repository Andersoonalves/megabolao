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
}

@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly storageKey = 'nb-portal-celular';
  private readonly api = inject(ApiService);

  async loginDireto(celular: string): Promise<void> {
    const digits = this.normalizePhone(celular);
    await firstValueFrom(this.api.post<{ ok: true }>('/portal/acesso/login-direto', { celular: digits }));
    localStorage.setItem(this.storageKey, digits);
  }

  clearLogin(): void {
    localStorage.removeItem(this.storageKey);
  }

  /** Celular guardado no login direto (para exibição quando o resumo ainda não carregou). */
  storedPortalCelular(): string | null {
    return this.portalCelular();
  }

  resumo(): Promise<PortalResumo> {
    const celular = this.portalCelular();
    if (celular) {
      return firstValueFrom(this.api.post<PortalResumo>('/portal/resumo-direto', { celular }));
    }
    return firstValueFrom(this.api.get<PortalResumo>('/portal/resumo'));
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
