import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UsuarioRBAC } from '@nossobolao/shared-types';
import { ApiService } from './api.service';

export interface CreateUsuarioInput {
  email: string;
  nome?: string;
  celular?: string;
  perfilIds: string[];
}

export interface AtribuirPerfisInput {
  perfilIds: string[];
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly api = inject(ApiService);

  findAll(): Observable<UsuarioRBAC[]> {
    return this.api.get<UsuarioRBAC[]>('/usuarios');
  }

  findById(id: string): Observable<UsuarioRBAC> {
    return this.api.get<UsuarioRBAC>(`/usuarios/${id}`);
  }

  create(input: CreateUsuarioInput): Observable<UsuarioRBAC> {
    return this.api.post<UsuarioRBAC>('/usuarios', input);
  }

  atribuirPerfis(id: string, input: AtribuirPerfisInput): Observable<UsuarioRBAC> {
    return this.api.patch<UsuarioRBAC>(`/usuarios/${id}/perfis`, input);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/usuarios/${id}`);
  }
}
