import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CodigoPermissao, Perfil } from '@nossobolao/shared-types';
import { ApiService } from './api.service';

export interface CreatePerfilInput {
  nome: string;
  descricao?: string;
  prioridade?: number;
  permissoes: CodigoPermissao[];
  ativo?: boolean;
}

export type UpdatePerfilInput = Partial<CreatePerfilInput>;

@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly api = inject(ApiService);

  findAll(): Observable<Perfil[]> {
    return this.api.get<Perfil[]>('/perfis');
  }

  findById(id: string): Observable<Perfil> {
    return this.api.get<Perfil>(`/perfis/${id}`);
  }

  create(input: CreatePerfilInput): Observable<Perfil> {
    return this.api.post<Perfil>('/perfis', input);
  }

  update(id: string, input: UpdatePerfilInput): Observable<Perfil> {
    return this.api.patch<Perfil>(`/perfis/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/perfis/${id}`);
  }
}
