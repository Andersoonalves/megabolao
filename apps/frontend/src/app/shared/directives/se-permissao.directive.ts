import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CodigoPermissao } from '@nossobolao/shared-types';
import { AuthService } from '../../core/services/auth.service';

type Modo = 'qualquer' | 'todas';

/**
 * Renderiza o template apenas se o usuário tiver a(s) permissão(ões).
 *
 * Uso:
 *   <button *nbSe="'bolao.criar'">Novo</button>
 *   <div *nbSe="['perfil.editar','perfil.criar']; modo: 'qualquer'"></div>
 *   <div *nbSe="['usuario.criar','usuario.atribuir_perfil']; modo: 'todas'"></div>
 *
 * Reage a mudanças no AuthService via `effect`.
 */
@Directive({
  selector: '[nbSe]',
  standalone: true,
})
export class SePermissaoDirective {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  private readonly _codigos = signal<CodigoPermissao[]>([]);
  private readonly _modo = signal<Modo>('qualquer');
  private renderizado = false;

  @Input({ required: true })
  set nbSe(value: CodigoPermissao | CodigoPermissao[] | null | undefined) {
    if (value == null) this._codigos.set([]);
    else if (Array.isArray(value)) this._codigos.set(value);
    else this._codigos.set([value]);
  }

  @Input()
  set nbSeModo(modo: Modo) {
    this._modo.set(modo);
  }

  constructor() {
    effect(() => {
      const codigos = this._codigos();
      const modo = this._modo();
      // Acessa user() para reagir a login/logout/refresh
      this.auth.user();

      const permitido = codigos.length === 0
        ? true
        : modo === 'todas'
          ? this.auth.temTodasPermissoes(codigos)
          : this.auth.temAlgumaPermissao(codigos);

      if (permitido && !this.renderizado) {
        this.vcr.createEmbeddedView(this.tpl);
        this.renderizado = true;
      } else if (!permitido && this.renderizado) {
        this.vcr.clear();
        this.renderizado = false;
      }
    });
  }
}
