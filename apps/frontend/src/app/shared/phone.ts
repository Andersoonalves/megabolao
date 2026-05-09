import {
  Directive, ElementRef, HostListener, forwardRef,
  Pipe, PipeTransform,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// ── Formatter (dígitos → máscara) ─────────────────────────────────────────────

export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ── Pipe: {{ numeroCelular | phone }} ─────────────────────────────────────────

@Pipe({ name: 'phone', standalone: true, pure: true })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    return formatPhone(value);
  }
}

// ── Diretiva: <input phoneMask> ────────────────────────────────────────────────
// Substitui DefaultValueAccessor — emite valor formatado para ngModel,
// portanto os componentes devem chamar .replace(/\D/g,'') antes de enviar à API.

@Directive({
  selector: 'input[phoneMask]',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PhoneMaskDirective),
    multi: true,
  }],
})
export class PhoneMaskDirective implements ControlValueAccessor {
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLInputElement>) {}

  writeValue(val: string | null): void {
    this.host.nativeElement.value = val ? formatPhone(val) : '';
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const formatted = formatPhone(raw);
    this.host.nativeElement.value = formatted;
    this.onChange(formatted);
  }

  @HostListener('blur')
  onBlur(): void { this.onTouched(); }
}
