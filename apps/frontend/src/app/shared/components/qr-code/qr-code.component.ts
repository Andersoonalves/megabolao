import {
  Component, input, OnChanges, ElementRef, ViewChild,
  ChangeDetectionStrategy, afterNextRender,
} from '@angular/core';
import * as QRCode from 'qrcode';

@Component({
  selector: 'nb-qr-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas class="rounded-xl"></canvas>`,
})
export class QrCodeComponent implements OnChanges {
  readonly data  = input.required<string>();
  readonly size  = input<number>(220);

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor() {
    afterNextRender(() => this.render());
  }

  ngOnChanges(): void { this.render(); }

  private render(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.data()) return;
    QRCode.toCanvas(canvas, this.data(), {
      width:  this.size(),
      margin: 1,
      color:  { dark: '#1a1a1a', light: '#ffffff' },
    }).catch(() => {});
  }
}
