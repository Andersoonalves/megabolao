import { Component, signal, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';

interface Etapa { id: string; nome: string; cor: string; ordem: number; isSistema: boolean; }

const CORES_PRESET = ['#64748b','#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#ec4899','#14b8a6','#f97316'];

@Component({
  selector: 'nb-crm-configurar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, DragDropModule, TranslatePipe, ConfirmModalComponent],
  templateUrl: './crm-configurar.component.html',
})
export class CrmConfigurarComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  etapas    = signal<Etapa[]>([]);
  loading   = signal(true);
  saving    = signal(false);
  error     = signal('');
  sucesso   = signal('');

  novoNome  = '';
  novaCor   = '#3b82f6';
  adicionando      = signal(false);
  confirmOpen      = signal(false);
  confirmEtapaId   = signal<string | null>(null);

  readonly coresPreset = CORES_PRESET;

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const e = await firstValueFrom(this.api.get<Etapa[]>('/crm/etapas'));
      this.etapas.set(e);
    } catch {
      this.error.set(this.translate.instant('crm.errLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  onDrop(event: CdkDragDrop<Etapa[]>): void {
    const arr = [...this.etapas()];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.etapas.set(arr);
    this.reorder();
  }

  async reorder(): Promise<void> {
    try {
      await firstValueFrom(
        this.api.put('/crm/etapas/reorder', { ids: this.etapas().map(e => e.id) }),
      );
    } catch { /* silencioso */ }
  }

  async adicionarEtapa(): Promise<void> {
    if (!this.novoNome.trim() || this.adicionando()) return;
    this.adicionando.set(true);
    try {
      const e = await firstValueFrom(
        this.api.post<Etapa>('/crm/etapas', { nome: this.novoNome.trim(), cor: this.novaCor }),
      );
      this.etapas.update(arr => [...arr, e]);
      this.novoNome = '';
      this.novaCor  = '#3b82f6';
      this.sucesso.set(this.translate.instant('crm.etapaAdded'));
      setTimeout(() => this.sucesso.set(''), 3000);
    } catch (err: unknown) {
      const e2 = err as { error?: { message?: string } };
      this.error.set(e2.error?.message ?? this.translate.instant('crm.errSave'));
    } finally {
      this.adicionando.set(false);
    }
  }

  async atualizarEtapa(etapa: Etapa): Promise<void> {
    try {
      await firstValueFrom(
        this.api.patch(`/crm/etapas/${etapa.id}`, { nome: etapa.nome, cor: etapa.cor }),
      );
    } catch { /* inline error handled elsewhere */ }
  }

  pedirConfirmacaoRemover(id: string): void {
    this.confirmEtapaId.set(id);
    this.confirmOpen.set(true);
  }

  cancelarRemover(): void {
    this.confirmOpen.set(false);
    this.confirmEtapaId.set(null);
  }

  async removerEtapa(): Promise<void> {
    const id = this.confirmEtapaId();
    this.confirmOpen.set(false);
    this.confirmEtapaId.set(null);
    if (!id) return;
    try {
      await firstValueFrom(this.api.delete(`/crm/etapas/${id}`));
      this.etapas.update(arr => arr.filter(e => e.id !== id));
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.error.set(e.error?.message ?? this.translate.instant('crm.errSave'));
    }
  }

  updateNome(etapa: Etapa, nome: string): void {
    this.etapas.update(arr => arr.map(e => e.id === etapa.id ? { ...e, nome } : e));
  }

  updateCor(etapa: Etapa, cor: string): void {
    this.etapas.update(arr => arr.map(e => e.id === etapa.id ? { ...e, cor } : e));
  }
}
