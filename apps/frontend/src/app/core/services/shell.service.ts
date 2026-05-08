import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellService {
  readonly drawerOpen = signal(false);

  openDrawer():  void { this.drawerOpen.set(true);  }
  closeDrawer(): void { this.drawerOpen.set(false); }
  toggleDrawer(): void { this.drawerOpen.update(v => !v); }
}
